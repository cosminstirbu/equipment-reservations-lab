using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Net.Sockets;
using System.Security.Cryptography;
using System.Text.Json;
using Aspire.Hosting;
using Aspire.Hosting.ApplicationModel;
using Aspire.Hosting.JavaScript;
using Aspire.Hosting.Testing;
using Backend.Tests;
using DotNet.Testcontainers.Builders;
using DotNet.Testcontainers.Volumes;
using IdentityBootstrap;
using Inventory;
using Notifications;
using Npgsql;
using RabbitMQ.Client;
using ReservationMessaging;
using Xunit;
using Xunit.Abstractions;

namespace Smoke.Tests;

public sealed class BookingSmokeTests(ITestOutputHelper output)
{
    private static readonly string[] Services = ["inventory", "reservations", "notifications"];
    private static readonly string[] Parameters = ["postgres-password", "inventory-password", "reservations-password", "notifications-password", "broker-password", "reservations-broker-password", "notifications-broker-password", "broker-admin-salt", "reservations-broker-salt", "notifications-broker-salt", "identity-admin-password", "employee-a-password", "employee-b-password", "approver-password", "equipment-staff-password", "reservations-client-secret"];
    private static readonly string[] Users = ["employee-a", "employee-b", "approver", "equipment-staff"];

    [Fact]
    public async Task IsolatedNamedVolumesRetainPendingOutboxQueuedMessagesAndInboxAcrossFreshAppHosts()
    {
        using var deadline = new CancellationTokenSource(TimeSpan.FromMinutes(8));
        CancellationToken token = deadline.Token;
        Environment.SetEnvironmentVariable("ASPIRE_CONTAINER_RUNTIME", "podman");
        string prefix = "booking-smoke-" + Guid.NewGuid().ToString("N");
        await using IVolume postgres = new VolumeBuilder().WithName(prefix + "-postgres").Build();
        await using IVolume rabbit = new VolumeBuilder().WithName(prefix + "-rabbit").Build();
        await using IVolume identity = new VolumeBuilder().WithName(prefix + "-identity").Build();
        await postgres.CreateAsync(token);
        await rabbit.CreateAsync(token);
        await identity.CreateAsync(token);
        int identityPort;
        using (var listener = new TcpListener(IPAddress.Loopback, 0))
        {
            listener.Start();
            identityPort = ((IPEndPoint)listener.LocalEndpoint).Port;
        }

        Dictionary<string, string> secrets = Parameters.ToDictionary(name => name, _ => Guid.NewGuid().ToString("N"));
        var subjects = new Dictionary<string, string>();
        string issuer;
        BookedReservation retained;
        BookedReservation pending;
        BookedReservation confirmed;
        Dictionary<string, Migration> ledger;
        Dictionary<string, string> lifecycles;

        await using (DistributedApplication first = await BuildAsync(postgres.Name, rabbit.Name, identity.Name, identityPort, secrets, false, token))
        {
            await StartReadyAsync(first, token);
            Dictionary<string, ProviderTokens> accounts = await LoginAccountsAsync(first, secrets, subjects, token);
            IdentityProvisioningSettings identitySettings = IdentitySettings(first, secrets);
            issuer = identitySettings.Authority;
            await LegacyBrokerStateAsync(first, seed: true, token);
            lifecycles = ObserveLifecycles(first, "first");
            using HttpClient inventory = first.CreateHttpClient("inventory");
            using HttpClient reservations = first.CreateHttpClient("reservations");
            using HttpClient notifications = first.CreateHttpClient("notifications");
            Authenticate(inventory, accounts["employee-a"]);
            Authenticate(reservations, accounts["employee-a"]);
            Authenticate(notifications, accounts["employee-a"]);
            EquipmentItem[] equipment = (await inventory.GetFromJsonAsync<EquipmentItem[]>("/api/equipment", token))!;
            Assert.Equal(3, equipment.Length);
            Assert.False(Assert.Single(equipment, item => item.Id == "projector-001").Operational);
            await AuditRolesAsync(first, secrets, token);
            retained = await BookAndCancelAsync(reservations, 10, token);
            confirmed = await BookAsync(reservations, 30, token);
            await WaitInboxAsync(notifications, [retained.ConfirmationEventId, retained.CancellationEventId!.Value, confirmed.ConfirmationEventId], token);
            ledger = await ReadLedgerAsync(first, secrets, token);

            await using (NpgsqlDataSource own = await OwnDatabaseAsync(first, "inventory", secrets, token))
            await using (NpgsqlCommand change = own.CreateCommand("UPDATE equipment SET operational=true WHERE id='projector-001'"))
            {
                Assert.Equal(1, await change.ExecuteNonQueryAsync(token));
            }

            await CommandAsync(first, "messaging", KnownResourceCommands.StopCommand, token);
            _ = await first.ResourceNotifications.WaitForResourceAsync("messaging", resource => KnownResourceStates.TerminalStates.Contains(resource.Snapshot.State?.Text ?? ""), token);
            pending = await BookAndCancelAsync(reservations, 20, token);
            await WaitOutboxAsync(first, secrets, pending, false, token);
            await IdentityProviderFixture.LogoutAsync(identitySettings, accounts["employee-a"], token);
            await first.StopAsync(token);
        }

        // Fresh builders reuse only our stable parameters/volumes. Explicit workers
        // allow inspection of durable state before any replay or consumer ACK.
        await using (DistributedApplication second = await BuildAsync(postgres.Name, rabbit.Name, identity.Name, identityPort, secrets, true, token))
        {
            await SmokeStartup.StartAsync(second, token);
            _ = await second.ResourceNotifications.WaitForResourceHealthyAsync("inventory", token);
            _ = await second.ResourceNotifications.WaitForResourceHealthyAsync("messaging", token);
            Assert.Equal(issuer, IdentitySettings(second, secrets).Authority);
            Dictionary<string, ProviderTokens> accounts = await LoginAccountsAsync(second, secrets, subjects, token);
            await AssertOutboxAsync(second, secrets, pending, false, token);
            await AssertInboxRowsAsync(second, secrets, 3, token);
            await LegacyBrokerStateAsync(second, seed: false, token);
            await AuditRolesAsync(second, secrets, token);
            Assert.Equal(ledger.OrderBy(item => item.Key), (await ReadLedgerAsync(second, secrets, token)).OrderBy(item => item.Key));
            using HttpClient inventory = second.CreateHttpClient("inventory");
            Authenticate(inventory, accounts["employee-a"]);
            EquipmentItem[] equipment = (await inventory.GetFromJsonAsync<EquipmentItem[]>("/api/equipment", token))!;
            Assert.Equal(3, equipment.Length);
            Assert.True(Assert.Single(equipment, item => item.Id == "projector-001").Operational);

            await CommandAsync(second, "reservations", KnownResourceCommands.StartCommand, token);
            _ = await second.ResourceNotifications.WaitForResourceHealthyAsync("reservations", token);
            await WaitOutboxAsync(second, secrets, pending, true, token);
            Assert.Equal(2U, await QueuedAsync(second, token));
            await AssertInboxRowsAsync(second, secrets, 3, token);
            await second.StopAsync(token);
        }

        await using (DistributedApplication third = await BuildAsync(postgres.Name, rabbit.Name, identity.Name, identityPort, secrets, true, token))
        {
            await SmokeStartup.StartAsync(third, token);
            _ = await third.ResourceNotifications.WaitForResourceHealthyAsync("inventory", token);
            _ = await third.ResourceNotifications.WaitForResourceHealthyAsync("messaging", token);
            Assert.Equal(issuer, IdentitySettings(third, secrets).Authority);
            Dictionary<string, ProviderTokens> accounts = await LoginAccountsAsync(third, secrets, subjects, token);
            Assert.Equal(2U, await QueuedAsync(third, token));
            await LegacyBrokerStateAsync(third, seed: false, token);
            await AssertInboxRowsAsync(third, secrets, 3, token);
            Assert.Equal(ledger.OrderBy(item => item.Key), (await ReadLedgerAsync(third, secrets, token)).OrderBy(item => item.Key));
            await AssertOutboxAsync(third, secrets, pending, true, token);
            await CommandAsync(third, "notifications", KnownResourceCommands.StartCommand, token);
            _ = await third.ResourceNotifications.WaitForResourceHealthyAsync("notifications", token);
            await CommandAsync(third, "reservations", KnownResourceCommands.StartCommand, token);
            _ = await third.ResourceNotifications.WaitForResourceHealthyAsync("reservations", token);
            using HttpClient reservations = third.CreateHttpClient("reservations");
            using HttpClient notifications = third.CreateHttpClient("notifications");
            Authenticate(reservations, accounts["employee-a"]);
            Authenticate(notifications, accounts["employee-a"]);
            await WaitInboxAsync(notifications, [retained.ConfirmationEventId, retained.CancellationEventId!.Value, confirmed.ConfirmationEventId, pending.ConfirmationEventId, pending.CancellationEventId!.Value], token);
            BookedReservation[] history = (await reservations.GetFromJsonAsync<BookedReservation[]>("/api/reservations", token))!;
            Assert.Equal(3, history.Length);
            Assert.Contains(retained, history);
            Assert.Contains(pending, history);
            Assert.Contains(confirmed, history);
            using HttpClient otherReservations = third.CreateHttpClient("reservations");
            using HttpClient otherNotifications = third.CreateHttpClient("notifications");
            Authenticate(otherReservations, accounts["employee-b"]);
            Authenticate(otherNotifications, accounts["employee-b"]);
            Assert.Empty((await otherReservations.GetFromJsonAsync<BookedReservation[]>("/api/reservations", token))!);
            Assert.Empty((await otherNotifications.GetFromJsonAsync<InboxEntry[]>("/api/notifications", token))!);
            string ownerKey = Key(issuer, subjects["employee-a"]);
            Assert.All(history, reservation => Assert.Equal(ownerKey, reservation.UserKey));
            Assert.All((await notifications.GetFromJsonAsync<InboxEntry[]>("/api/notifications", token))!, entry => Assert.Equal(ownerKey, entry.UserKey));
            foreach ((string service, string started) in ObserveLifecycles(third, "third"))
            {
                Assert.NotEqual(lifecycles[service], started);
            }
            await LegacyBrokerStateAsync(third, seed: false, token);
            await third.StopAsync(token);
        }
    }

    private static async Task<DistributedApplication> BuildAsync(string postgres, string rabbit, string identity, int identityPort, Dictionary<string, string> secrets, bool explicitWorkers, CancellationToken token)
    {
        IDistributedApplicationTestingBuilder builder = await DistributedApplicationTestingBuilder.CreateAsync<Projects.AppHost>(["--environment=Development", "--DcpPublisher:RandomizePorts=false"], token);
        foreach ((string name, string value) in secrets)
        {
            builder.Configuration["Parameters:" + name] = value;
        }

        foreach ((string resource, string volume) in new[] { ("postgres", postgres), ("messaging", rabbit), ("identity", identity) })
        {
            IResource target = Assert.Single(builder.Resources, item => item.Name == resource);
            ContainerMountAnnotation mount = Assert.Single(target.Annotations.OfType<ContainerMountAnnotation>(), item => item.Type == ContainerMountType.Volume);
            _ = target.Annotations.Remove(mount);
            target.Annotations.Add(new ContainerMountAnnotation(volume, mount.Target, mount.Type, mount.IsReadOnly));
            Assert.DoesNotContain(target.Annotations.OfType<ContainerMountAnnotation>(), item => item.Source is "equipment-reservations-postgres" or "equipment-reservations-rabbitmq" or "equipment-reservations-identity");
        }

        KeycloakResource provider = Assert.Single(builder.Resources.OfType<KeycloakResource>());
        provider.Annotations.OfType<EndpointAnnotation>().Single(endpoint => endpoint.Name == "http").Port = identityPort;

        string[] explicitResources = explicitWorkers ? ["reservations", "notifications", "web"] : ["notifications", "web"];
        foreach (string name in explicitResources)
        {
            IResource resource = Assert.Single(builder.Resources, resource => resource.Name == name);
            _ = builder.CreateResourceBuilder(resource).WithExplicitStart();
        }

        // The installer is a separate public resource and does not inherit Web's
        // explicit-start annotation. Persistence checks never launch either.
        JavaScriptInstallerResource installer = Assert.Single(builder.Resources.OfType<JavaScriptInstallerResource>());
        _ = builder.CreateResourceBuilder(installer).WithExplicitStart();

        return await builder.BuildAsync(token);
    }

    private static IdentityProvisioningSettings IdentitySettings(DistributedApplication app, Dictionary<string, string> secrets)
    {
        string authority = app.GetEndpoint("identity", "http").AbsoluteUri.TrimEnd('/') + "/realms/equipment";
        string webRoot = app.GetEndpoint("web", "http").AbsoluteUri.TrimEnd('/') + "/";
        return new IdentityProvisioningSettings(authority, webRoot, "admin", secrets["identity-admin-password"],
            Users.ToDictionary(username => username, username => secrets[username + "-password"]), secrets["reservations-client-secret"]);
    }

    private static async Task<Dictionary<string, ProviderTokens>> LoginAccountsAsync(DistributedApplication app, Dictionary<string, string> secrets, Dictionary<string, string> subjects, CancellationToken token)
    {
        IdentityProvisioningSettings settings = IdentitySettings(app, secrets);
        var accounts = new Dictionary<string, ProviderTokens>();
        foreach (string username in Users)
        {
            ProviderTokens issued = await IdentityProviderFixture.LoginAsync(settings, username, cancellationToken: token);
            using JsonDocument claims = IdentityProviderFixture.Claims(issued.AccessToken);
            JsonElement value = claims.RootElement;
            Assert.Equal(settings.Authority, value.GetProperty("iss").GetString());
            string subject = value.GetProperty("sub").GetString()!;
            if (subjects.TryGetValue(username, out string? existing))
            {
                Assert.True(string.Equals(existing, subject, StringComparison.Ordinal), "Provider subject changed across ordinary restart.");
            }
            else
            {
                subjects.Add(username, subject);
            }

            string expectedRole = username switch
            {
                "approver" => "Approver",
                "equipment-staff" => "EquipmentStaff",
                _ => "Employee"
            };
            Assert.Equal(expectedRole, Assert.Single(value.GetProperty("realm_access").GetProperty("roles").EnumerateArray()).GetString());
            accounts.Add(username, issued);
        }

        return accounts;
    }

    private static void Authenticate(HttpClient client, ProviderTokens tokens)
    {
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", tokens.AccessToken);
    }

    private static string Key(string issuer, string subject)
    {
        return Convert.ToHexStringLower(SHA256.HashData(JsonSerializer.SerializeToUtf8Bytes(new[] { issuer, subject })));
    }

    private Dictionary<string, string> ObserveLifecycles(DistributedApplication app, string scope)
    {
        var result = new Dictionary<string, string>();
        foreach (string service in Services)
        {
            Assert.True(app.ResourceNotifications.TryGetCurrentState(service, out ResourceEvent? resource));
            string started = Assert.NotNull(resource.Snapshot.StartTimeStamp).ToString("O", System.Globalization.CultureInfo.InvariantCulture);
            result[service] = started;
            output.WriteLine($"AppHost scope {scope}, service {service}, process start {started}, state {resource.Snapshot.State?.Text}.");
        }

        return result;
    }

    private static async Task StartReadyAsync(DistributedApplication app, CancellationToken token)
    {
        await SmokeStartup.StartAsync(app, token);
        foreach (string resource in new[] { "inventory", "reservations" })
        {
            _ = await app.ResourceNotifications.WaitForResourceHealthyAsync(resource, token);
        }

        _ = await app.ResourceNotifications.WaitForResourceHealthyAsync("messaging", token);
        await CommandAsync(app, "notifications", KnownResourceCommands.StartCommand, token);
        _ = await app.ResourceNotifications.WaitForResourceHealthyAsync("notifications", token);
        using HttpClient notifications = app.CreateHttpClient("notifications");
        using var readiness = CancellationTokenSource.CreateLinkedTokenSource(token);
        readiness.CancelAfter(TimeSpan.FromSeconds(30));
        while ((await notifications.GetAsync("/health/workers", readiness.Token)).StatusCode != HttpStatusCode.OK)
        {
            await Task.Delay(100, readiness.Token);
        }
    }

    private static async Task CommandAsync(DistributedApplication app, string resource, string command, CancellationToken token)
    {
        ExecuteCommandResult result = await app.ResourceCommands.ExecuteCommandAsync(resource, command, token);
        Assert.True(result.Success, $"Resource command {resource}/{command} failed: {result.Message}");
    }

    private static async Task<NpgsqlDataSource> OwnDatabaseAsync(DistributedApplication app, string service, Dictionary<string, string> secrets, CancellationToken token)
    {
        var settings = new NpgsqlConnectionStringBuilder(await app.GetConnectionStringAsync("postgres", token))
        {
            Database = service,
            Username = service + "_app",
            Password = secrets[service + "-password"],
            IncludeErrorDetail = false,
            LogParameters = false,
            Timeout = 3,
            CommandTimeout = 5
        };
        return NpgsqlDataSource.Create(settings.ConnectionString);
    }

    private static async Task AuditRolesAsync(DistributedApplication app, Dictionary<string, string> secrets, CancellationToken token)
    {
        foreach (string service in Services)
        {
            await using NpgsqlDataSource own = await OwnDatabaseAsync(app, service, secrets, token);
            await using NpgsqlConnection permitted = await own.OpenConnectionAsync(token);
            foreach (string other in Services.Where(other => other != service))
            {
                var settings = new NpgsqlConnectionStringBuilder(own.ConnectionString) { Database = other, Password = secrets[service + "-password"] };
                await using var denied = NpgsqlDataSource.Create(settings.ConnectionString);
                PostgresException exception = await Assert.ThrowsAsync<PostgresException>(() => denied.OpenConnectionAsync(token).AsTask());
                Assert.Equal(PostgresErrorCodes.InsufficientPrivilege, exception.SqlState);
            }
        }
    }

    private static async Task<BookedReservation> BookAndCancelAsync(HttpClient reservations, int days, CancellationToken token)
    {
        BookedReservation reservation = await BookAsync(reservations, days, token);
        HttpResponseMessage response = await reservations.PostAsync($"/api/reservations/{reservation.Id}/cancel", null, token);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<BookedReservation>(token))!;
    }

    private static async Task<BookedReservation> BookAsync(HttpClient reservations, int days, CancellationToken token)
    {
        DateTimeOffset start = DateTimeOffset.UtcNow.AddDays(days);
        HttpResponseMessage response = await reservations.PostAsJsonAsync("/api/reservations", new
        {
            equipmentId = "camera-001",
            startAt = start.ToString("yyyy-MM-dd'T'HH:mm:ss'Z'", System.Globalization.CultureInfo.InvariantCulture),
            endAt = start.AddHours(1).ToString("yyyy-MM-dd'T'HH:mm:ss'Z'", System.Globalization.CultureInfo.InvariantCulture)
        }, token);
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<BookedReservation>(token))!;
    }

    private static async Task<Dictionary<string, Migration>> ReadLedgerAsync(DistributedApplication app, Dictionary<string, string> secrets, CancellationToken token)
    {
        var result = new Dictionary<string, Migration>();
        foreach (string service in Services)
        {
            await using NpgsqlDataSource own = await OwnDatabaseAsync(app, service, secrets, token);
            await using NpgsqlCommand ledger = own.CreateCommand("SELECT version,checksum,applied_at FROM schema_migrations ORDER BY version");
            await using NpgsqlDataReader reader = await ledger.ExecuteReaderAsync(token);
            Assert.True(await reader.ReadAsync(token));
            result[service] = new Migration(reader.GetInt32(0), reader.GetString(1), reader.GetFieldValue<DateTimeOffset>(2));
            Assert.False(await reader.ReadAsync(token));
        }

        return result;
    }

    private static async Task WaitInboxAsync(HttpClient notifications, Guid[] expected, CancellationToken token)
    {
        using var recovery = CancellationTokenSource.CreateLinkedTokenSource(token);
        recovery.CancelAfter(TimeSpan.FromSeconds(60));
        while (true)
        {
            InboxEntry[] entries = (await notifications.GetFromJsonAsync<InboxEntry[]>("/api/notifications", recovery.Token))!;
            if (entries.Length == expected.Length)
            {
                Assert.Equal(expected.Order(), entries.Select(entry => entry.EventId).Order());
                return;
            }

            await Task.Delay(100, recovery.Token);
        }
    }

    private static async Task AssertInboxRowsAsync(DistributedApplication app, Dictionary<string, string> secrets, long rows, CancellationToken token)
    {
        await using NpgsqlDataSource own = await OwnDatabaseAsync(app, "notifications", secrets, token);
        await using NpgsqlCommand count = own.CreateCommand("SELECT count(*) FROM reservation_inbox");
        Assert.Equal(rows, await count.ExecuteScalarAsync(token));
    }

    private static async Task WaitOutboxAsync(DistributedApplication app, Dictionary<string, string> secrets, BookedReservation reservation, bool published, CancellationToken token)
    {
        using var recovery = CancellationTokenSource.CreateLinkedTokenSource(token);
        recovery.CancelAfter(TimeSpan.FromSeconds(60));
        while (!await OutboxMatchesAsync(app, secrets, reservation, published, recovery.Token))
        {
            await Task.Delay(100, recovery.Token);
        }
        await AssertOutboxAsync(app, secrets, reservation, published, recovery.Token);
    }

    private static async Task AssertOutboxAsync(DistributedApplication app, Dictionary<string, string> secrets, BookedReservation reservation, bool published, CancellationToken token)
    {
        Assert.True(await OutboxMatchesAsync(app, secrets, reservation, published, token));
        await using NpgsqlDataSource own = await OwnDatabaseAsync(app, "reservations", secrets, token);
        await using NpgsqlCommand events = own.CreateCommand("SELECT event_id FROM reservation_outbox WHERE reservation_id=$1 ORDER BY event_id");
        _ = events.Parameters.AddWithValue(reservation.Id);
        await using NpgsqlDataReader reader = await events.ExecuteReaderAsync(token);
        var ids = new List<Guid>();
        while (await reader.ReadAsync(token))
        {
            ids.Add(reader.GetGuid(0));
        }

        Assert.Equal(new[] { reservation.ConfirmationEventId, reservation.CancellationEventId!.Value }.Order(), ids.Order());
    }

    private static async Task<bool> OutboxMatchesAsync(DistributedApplication app, Dictionary<string, string> secrets, BookedReservation reservation, bool published, CancellationToken token)
    {
        await using NpgsqlDataSource own = await OwnDatabaseAsync(app, "reservations", secrets, token);
        await using NpgsqlCommand check = own.CreateCommand("SELECT count(*)=2 AND bool_and((published_at IS NOT NULL)=$2 AND attempt_count>0) FROM reservation_outbox WHERE reservation_id=$1");
        _ = check.Parameters.AddWithValue(reservation.Id);
        _ = check.Parameters.AddWithValue(published);
        return (bool)(await check.ExecuteScalarAsync(token))!;
    }

    private static async Task<uint> QueuedAsync(DistributedApplication app, CancellationToken token)
    {
        string? settings = await app.GetConnectionStringAsync("messaging", token);
        ConnectionFactory factory = RabbitConnection.Factory(settings!, TimeSpan.FromSeconds(3));
        factory.VirtualHost = "equipment";
        await using IConnection connection = await factory.CreateConnectionAsync(token);
        await using IChannel channel = await connection.CreateChannelAsync(cancellationToken: token);
        return (await channel.QueueDeclarePassiveAsync(ReservationTopology.Queue, token)).MessageCount;
    }

    private static async Task LegacyBrokerStateAsync(DistributedApplication app, bool seed, CancellationToken token)
    {
        string? settings = await app.GetConnectionStringAsync("messaging", token);
        await using IConnection connection = await RabbitConnection.Factory(settings!, TimeSpan.FromSeconds(3)).CreateConnectionAsync(token);
        await using IChannel channel = await connection.CreateChannelAsync(new CreateChannelOptions(true, true), token);
        if (seed)
        {
            await channel.ExchangeDeclareAsync("hello", ExchangeType.Direct, true, false, cancellationToken: token);
            _ = await channel.QueueDeclareAsync("hello-notifications", true, false, false, cancellationToken: token);
            await channel.QueueBindAsync("hello-notifications", "hello", "hello.requested", cancellationToken: token);
            await channel.BasicPublishAsync("hello", "hello.requested", true,
                new BasicProperties { Persistent = true }, "retained legacy state"u8.ToArray(), token);
        }

        await channel.ExchangeDeclarePassiveAsync("hello", token);
        QueueDeclareOk queue = await channel.QueueDeclarePassiveAsync("hello-notifications", token);
        Assert.Equal(1u, queue.MessageCount);
        Assert.Equal(0u, queue.ConsumerCount);
    }

    private sealed record Migration(int Version, string Checksum, DateTimeOffset AppliedAt);
}
