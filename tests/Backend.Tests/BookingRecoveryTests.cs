using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Inventory;
using Microsoft.AspNetCore.Mvc.Testing;
using Npgsql;
using RabbitMQ.Client;
using ReservationMessaging;
using Xunit;

namespace Backend.Tests;

[Collection("Identity provider")]
public sealed class BookingRecoveryTests(IdentityProviderFixture identity)
{
    private static readonly string[] Services = ["inventory", "reservations", "notifications"];

    [Fact]
    public async Task RecreatedServiceHostsRetainPendingEnvelopesQueuedWorkHistoryAndInbox()
    {
        using var deadline = new CancellationTokenSource(TimeSpan.FromMinutes(3));
        CancellationToken token = deadline.Token;
        await using var fixture = new BookingRecoveryFixture(identity);
        await fixture.InitializeAsync(token);
        ProviderTokens owner = await identity.LoginAsync("employee-a", cancellationToken: token);
        ProviderTokens stranger = await identity.LoginAsync("employee-b", cancellationToken: token);
        using JsonDocument claims = IdentityProviderFixture.Claims(owner.AccessToken);
        string ownerKey = Convert.ToHexStringLower(SHA256.HashData(JsonSerializer.SerializeToUtf8Bytes(new[]
        {
            identity.Settings.Authority, claims.RootElement.GetProperty("sub").GetString()!
        })));
        Dictionary<string, string> ledger = await LedgersAsync(fixture, token);
        BookedReservation retained;
        BookedReservation confirmed;
        BookedReservation pending;
        ObservedNotification[] initialInbox;
        string pendingSnapshot;
        await LegacyAsync(fixture, true, token);

        await using (WebApplicationFactory<Inventory.Program> inventoryHost = fixture.Host<Inventory.Program>("inventory"))
        await using (WebApplicationFactory<Reservations.Program> reservationHost = fixture.Host<Reservations.Program>("reservations", inventoryHost))
        await using (WebApplicationFactory<Notifications.Program> notificationHost = fixture.Host<Notifications.Program>("notifications"))
        {
            using HttpClient inventory = Client(inventoryHost, owner);
            using HttpClient reservations = Client(reservationHost, owner);
            using HttpClient notifications = Client(notificationHost, owner);
            EquipmentItem[] equipment = (await inventory.GetFromJsonAsync<EquipmentItem[]>("/api/equipment", token))!;
            Assert.Equal(3, equipment.Length);
            Assert.False(Assert.Single(equipment, item => item.Id == "projector-001").Operational);
            retained = await BookAsync(reservations, 10, cancel: true, token);
            confirmed = await BookAsync(reservations, 30, cancel: false, token);
            initialInbox = await InboxAsync(notifications, 3, token);
            await using (NpgsqlDataSource database = fixture.Database("inventory"))
            await using (NpgsqlCommand edit = database.CreateCommand("UPDATE equipment SET operational=true WHERE id='projector-001'"))
            {
                Assert.Equal(1, await edit.ExecuteNonQueryAsync(token));
            }

            await fixture.Broker.StopAsync(token);
            pending = await BookAsync(reservations, 20, cancel: true, token);
            await AwaitOutboxAsync(fixture, pending, published: false, token);
            pendingSnapshot = await PendingSnapshotAsync(fixture, pending.Id, token);
        }

        await fixture.ReconcileAsync(token);
        Assert.Equal(ledger.OrderBy(pair => pair.Key), (await LedgersAsync(fixture, token)).OrderBy(pair => pair.Key));
        Assert.Equal(pendingSnapshot, await PendingSnapshotAsync(fixture, pending.Id, token));
        await AssertStoredInboxAsync(fixture, initialInbox, token);

        await fixture.Broker.RestartAsync(token);
        await LegacyAsync(fixture, false, token);
        await using (WebApplicationFactory<Inventory.Program> inventoryHost = fixture.Host<Inventory.Program>("inventory"))
        await using (WebApplicationFactory<Reservations.Program> publisher = fixture.Host<Reservations.Program>("reservations", inventoryHost))
        {
            using HttpClient reservations = Client(publisher, owner);
            Assert.Equal(HttpStatusCode.OK, (await reservations.GetAsync("/api/reservations", token)).StatusCode);
            await AwaitOutboxAsync(fixture, pending, published: true, token);
            Assert.Equal(pendingSnapshot, await PendingSnapshotAsync(fixture, pending.Id, token));
        }

        string[] queued = await QueueSnapshotAsync(fixture, pending, token);
        await AssertStoredInboxAsync(fixture, initialInbox, token);
        await fixture.Broker.StopAsync(token);
        await fixture.Broker.RestartAsync(token);
        Assert.Equal(queued, await QueueSnapshotAsync(fixture, pending, token));
        await AssertStoredInboxAsync(fixture, initialInbox, token);
        await LegacyAsync(fixture, false, token);

        ObservedNotification[] recovered;
        await using (WebApplicationFactory<Inventory.Program> inventoryHost = fixture.Host<Inventory.Program>("inventory"))
        await using (WebApplicationFactory<Reservations.Program> reservationHost = fixture.Host<Reservations.Program>("reservations", inventoryHost))
        await using (WebApplicationFactory<Notifications.Program> notificationHost = fixture.Host<Notifications.Program>("notifications"))
        {
            using HttpClient inventory = Client(inventoryHost, owner);
            using HttpClient reservations = Client(reservationHost, owner);
            using HttpClient notifications = Client(notificationHost, owner);
            recovered = await InboxAsync(notifications, 5, token);
            Assert.Equal(new[] { retained.ConfirmationEventId, retained.CancellationEventId!.Value, confirmed.ConfirmationEventId, pending.ConfirmationEventId, pending.CancellationEventId!.Value }.Order(), recovered.Select(item => item.EventId).Order());
            Assert.All(initialInbox, item => Assert.Contains(item, recovered));
            BookedReservation[] history = (await reservations.GetFromJsonAsync<BookedReservation[]>("/api/reservations", token))!;
            Assert.Equal(new[] { retained, confirmed, pending }.OrderBy(item => item.Id), history.OrderBy(item => item.Id));
            Assert.All(history, item => Assert.Equal(ownerKey, item.UserKey));
            Assert.All(recovered, item => Assert.Equal(ownerKey, item.UserKey));
            using HttpClient otherReservations = Client(reservationHost, stranger);
            using HttpClient otherNotifications = Client(notificationHost, stranger);
            Assert.Empty((await otherReservations.GetFromJsonAsync<BookedReservation[]>("/api/reservations", token))!);
            Assert.Empty((await otherNotifications.GetFromJsonAsync<ObservedNotification[]>("/api/notifications", token))!);
            EquipmentItem[] equipment = (await inventory.GetFromJsonAsync<EquipmentItem[]>("/api/equipment", token))!;
            Assert.Equal(3, equipment.Length);
            Assert.True(Assert.Single(equipment, item => item.Id == "projector-001").Operational);
        }

        await using (WebApplicationFactory<Notifications.Program> recreated = fixture.Host<Notifications.Program>("notifications"))
        {
            using HttpClient notifications = Client(recreated, owner);
            Assert.Equal(recovered.OrderBy(item => item.EventId), (await InboxAsync(notifications, 5, token)).OrderBy(item => item.EventId));
        }

        Assert.Equal(ledger.OrderBy(pair => pair.Key), (await LedgersAsync(fixture, token)).OrderBy(pair => pair.Key));
        await LegacyAsync(fixture, false, token);
    }

    private static HttpClient Client<TProgram>(WebApplicationFactory<TProgram> factory, ProviderTokens tokens) where TProgram : class
    {
        HttpClient client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", tokens.AccessToken);
        return client;
    }

    private static async Task<BookedReservation> BookAsync(HttpClient client, int days, bool cancel, CancellationToken token)
    {
        DateTimeOffset start = DateTimeOffset.UtcNow.AddDays(days);
        using HttpResponseMessage booked = await client.PostAsJsonAsync("/api/reservations", new
        {
            equipmentId = "camera-001",
            startAt = start.ToString("yyyy-MM-dd'T'HH:mm:ss'Z'", System.Globalization.CultureInfo.InvariantCulture),
            endAt = start.AddHours(1).ToString("yyyy-MM-dd'T'HH:mm:ss'Z'", System.Globalization.CultureInfo.InvariantCulture)
        }, token);
        Assert.Equal(HttpStatusCode.Created, booked.StatusCode);
        BookedReservation reservation = (await booked.Content.ReadFromJsonAsync<BookedReservation>(token))!;
        if (!cancel)
        {
            return reservation;
        }

        using HttpResponseMessage cancelled = await client.PostAsync($"/api/reservations/{reservation.Id}/cancel", null, token);
        Assert.Equal(HttpStatusCode.OK, cancelled.StatusCode);
        return (await cancelled.Content.ReadFromJsonAsync<BookedReservation>(token))!;
    }

    private static async Task<ObservedNotification[]> InboxAsync(HttpClient client, int count, CancellationToken token)
    {
        using var recovery = CancellationTokenSource.CreateLinkedTokenSource(token);
        recovery.CancelAfter(TimeSpan.FromSeconds(60));
        ObservedNotification[] result = await ReservationDeliveryFixture.AwaitInboxAsync(client, count, recovery.Token);
        Assert.Equal(count, result.Length);
        return result;
    }

    private static async Task<Dictionary<string, string>> LedgersAsync(BookingRecoveryFixture fixture, CancellationToken token)
    {
        var result = new Dictionary<string, string>();
        foreach (string service in Services)
        {
            await using NpgsqlDataSource database = fixture.Database(service);
            await using NpgsqlCommand command = database.CreateCommand("SELECT jsonb_agg(to_jsonb(m) ORDER BY version)::text FROM schema_migrations m");
            result[service] = Assert.IsType<string>(await command.ExecuteScalarAsync(token));
            Assert.NotEqual("[]", result[service]);
        }

        return result;
    }

    private static async Task<string> PendingSnapshotAsync(BookingRecoveryFixture fixture, Guid reservation, CancellationToken token)
    {
        await using NpgsqlDataSource database = fixture.Database("reservations");
        await using NpgsqlCommand command = database.CreateCommand("SELECT jsonb_agg(to_jsonb(o)-'attempt_count'-'next_attempt_at'-'published_at' ORDER BY event_id)::text FROM reservation_outbox o WHERE reservation_id=$1");
        _ = command.Parameters.AddWithValue(reservation);
        return Assert.IsType<string>(await command.ExecuteScalarAsync(token));
    }

    private static async Task AwaitOutboxAsync(BookingRecoveryFixture fixture, BookedReservation reservation, bool published, CancellationToken token)
    {
        using var recovery = CancellationTokenSource.CreateLinkedTokenSource(token);
        recovery.CancelAfter(TimeSpan.FromSeconds(60));
        await using NpgsqlDataSource database = fixture.Database("reservations");
        while (true)
        {
            await using NpgsqlCommand command = database.CreateCommand("SELECT count(*)=2 AND bool_and((published_at IS NOT NULL)=$2 AND attempt_count>0) FROM reservation_outbox WHERE reservation_id=$1");
            _ = command.Parameters.AddWithValue(reservation.Id);
            _ = command.Parameters.AddWithValue(published);
            if (await command.ExecuteScalarAsync(recovery.Token) is true)
            {
                return;
            }

            await Task.Delay(100, recovery.Token);
        }
    }

    private static async Task AssertStoredInboxAsync(BookingRecoveryFixture fixture, ObservedNotification[] expected, CancellationToken token)
    {
        await using NpgsqlDataSource database = fixture.Database("notifications");
        await using NpgsqlCommand count = database.CreateCommand("SELECT count(*) FROM reservation_inbox");
        Assert.Equal((long)expected.Length, await count.ExecuteScalarAsync(token));
        await using NpgsqlCommand ids = database.CreateCommand("SELECT event_id,reservation_id,user_key,equipment_id,equipment_name,event_type,start_at,end_at,occurred_at,received_at,message FROM reservation_inbox ORDER BY event_id");
        await using NpgsqlDataReader reader = await ids.ExecuteReaderAsync(token);
        var actual = new List<ObservedNotification>();
        while (await reader.ReadAsync(token))
        {
            actual.Add(new ObservedNotification(reader.GetGuid(0), reader.GetGuid(1), reader.GetString(2), reader.GetString(3), reader.GetString(4), reader.GetString(5),
                reader.GetFieldValue<DateTimeOffset>(6), reader.GetFieldValue<DateTimeOffset>(7), reader.GetFieldValue<DateTimeOffset>(8), reader.GetFieldValue<DateTimeOffset>(9), reader.GetString(10)));
        }

        Assert.Equal(expected.OrderBy(item => item.EventId), actual);
    }

    private static async Task<string[]> QueueSnapshotAsync(BookingRecoveryFixture fixture, BookedReservation pending, CancellationToken token)
    {
        await using IConnection connection = await RabbitConnection.Factory(fixture.Broker.Administration, TimeSpan.FromSeconds(3)).CreateConnectionAsync(token);
        await using IChannel channel = await connection.CreateChannelAsync(cancellationToken: token);
        Assert.Equal(2u, (await channel.QueueDeclarePassiveAsync(ReservationTopology.Queue, token)).MessageCount);
        var values = new List<string>();
        var ids = new List<Guid>();
        for (int index = 0; index < 2; index++)
        {
            BasicGetResult? delivery = await channel.BasicGetAsync(ReservationTopology.Queue, false, token);
            Assert.NotNull(delivery);
            Assert.True(delivery.BasicProperties.Persistent);
            string body = Encoding.UTF8.GetString(delivery.Body.Span);
            using var document = JsonDocument.Parse(body);
            Guid id = document.RootElement.GetProperty("eventId").GetGuid();
            Assert.Equal(id.ToString(), delivery.BasicProperties.MessageId);
            ids.Add(id);
            values.Add(delivery.RoutingKey + ":" + delivery.BasicProperties.MessageId + ":" + body);
        }

        Assert.Equal(new[] { pending.ConfirmationEventId, pending.CancellationEventId!.Value }.Order(), ids.Order());
        await channel.CloseAsync(token);
        return [.. values.Order(StringComparer.Ordinal)];
    }

    private static async Task LegacyAsync(BookingRecoveryFixture fixture, bool seed, CancellationToken token)
    {
        await using IConnection connection = await RabbitConnection.Factory(fixture.Broker.Administration, TimeSpan.FromSeconds(3)).CreateConnectionAsync(token);
        await using IChannel channel = await connection.CreateChannelAsync(new CreateChannelOptions(true, true), token);
        if (seed)
        {
            await channel.ExchangeDeclareAsync("hello", ExchangeType.Direct, true, false, cancellationToken: token);
            _ = await channel.QueueDeclareAsync("hello-notifications", true, false, false, cancellationToken: token);
            await channel.QueueBindAsync("hello-notifications", "hello", "hello.requested", cancellationToken: token);
            await channel.BasicPublishAsync("hello", "hello.requested", true, new BasicProperties { Persistent = true }, "retained legacy state"u8.ToArray(), token);
        }

        await channel.ExchangeDeclarePassiveAsync("hello", token);
        QueueDeclareOk queue = await channel.QueueDeclarePassiveAsync("hello-notifications", token);
        Assert.Equal(1u, queue.MessageCount);
        Assert.Equal(0u, queue.ConsumerCount);
        BasicGetResult? retained = await channel.BasicGetAsync("hello-notifications", false, token);
        Assert.NotNull(retained);
        Assert.Equal("retained legacy state", Encoding.UTF8.GetString(retained.Body.Span));
        Assert.True(retained.BasicProperties.Persistent);
    }
}
