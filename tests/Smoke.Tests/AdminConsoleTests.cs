using System.Diagnostics;
using System.Net;
using System.Net.Http.Headers;
using System.Net.NetworkInformation;
using System.Net.Sockets;
using System.Text;
using System.Text.Json;
using Aspire.Hosting;
using Aspire.Hosting.ApplicationModel;
using Aspire.Hosting.Postgres;
using Aspire.Hosting.Testing;
using Npgsql;
using RabbitMQ.Client;
using RabbitMQ.Client.Events;
using ReservationMessaging;
using Xunit;
using Xunit.Abstractions;

namespace Smoke.Tests;

public sealed class AdminConsoleTests(ITestOutputHelper output)
{
    private const string PgAdminImageTag = "9.18.0";

    [Fact]
    public async Task DevelopmentProvidesDynamicLocalRabbitManagementWithExistingStorageAndPassword()
    {
        await using IDistributedApplicationTestingBuilder builder = await CreateAsync("Development");
        RabbitMQServerResource broker = Assert.Single(builder.Resources.OfType<RabbitMQServerResource>());
        AssertLocalConsole(Assert.Single(broker.Annotations.OfType<EndpointAnnotation>(), endpoint => endpoint.UriScheme == "http"));
        Assert.Equal("4.3.6-management", Assert.Single(broker.Annotations.OfType<ContainerImageAnnotation>()).Tag);
        Assert.Equal("broker-password", broker.PasswordParameter.Name);
        AssertVolume(broker, "equipment-reservations-rabbitmq");
        Assert.Equal(5672, broker.PrimaryEndpoint.EndpointAnnotation.TargetPort);
    }

    [Fact]
    public async Task DevelopmentProvidesDisposablePgAdminForExistingPostgresServer()
    {
        await using IDistributedApplicationTestingBuilder builder = await CreateAsync("Development");
        PgAdminContainerResource console = Assert.Single(builder.Resources.OfType<PgAdminContainerResource>());
        Assert.Equal(PgAdminImageTag, Assert.Single(console.Annotations.OfType<ContainerImageAnnotation>()).Tag);
        AssertLocalConsole(Assert.Single(console.Annotations.OfType<EndpointAnnotation>()));
        Assert.DoesNotContain(console.Annotations.OfType<ContainerMountAnnotation>(), mount => mount.Type == ContainerMountType.Volume);
        PostgresServerResource postgres = Assert.Single(builder.Resources.OfType<PostgresServerResource>());
        AssertVolume(postgres, "equipment-reservations-postgres");
        Assert.Equal("postgres-password", postgres.PasswordParameter.Name);
        Assert.Empty(builder.Resources.OfType<PostgresDatabaseResource>());
    }

    [Theory]
    [InlineData("Production", false)]
    [InlineData("Development", true)]
    public async Task OtherEnvironmentsAndPublishingRetainOrdinaryResourcesWithoutConsoles(string environment, bool publish)
    {
        string manifest = Path.Combine(Path.GetTempPath(), "admin-console-model-" + Guid.NewGuid().ToString("N") + ".json");
        string[] arguments = publish
            ? ["--environment=" + environment, "--publisher=manifest", "--output-path=" + manifest]
            : ["--environment=" + environment];
        await using IDistributedApplicationTestingBuilder builder = await DistributedApplicationTestingBuilder.CreateAsync<Projects.AppHost>(arguments);
        Assert.Equal(publish, builder.ExecutionContext.IsPublishMode);
        Assert.DoesNotContain(builder.Resources, resource => resource is PgAdminContainerResource);
        RabbitMQServerResource broker = Assert.Single(builder.Resources.OfType<RabbitMQServerResource>());
        Assert.DoesNotContain(broker.Annotations.OfType<EndpointAnnotation>(), endpoint => endpoint.UriScheme == "http");
        Assert.Equal("4.3.6", Assert.Single(broker.Annotations.OfType<ContainerImageAnnotation>()).Tag);
        PostgresServerResource postgres = Assert.Single(builder.Resources.OfType<PostgresServerResource>());
        EndpointAnnotation[] brokerEndpoints = [.. broker.Annotations.OfType<EndpointAnnotation>()];
        EndpointAnnotation[] postgresEndpoints = [.. postgres.Annotations.OfType<EndpointAnnotation>()];
        ContainerImageAnnotation postgresImage = Assert.Single(postgres.Annotations.OfType<ContainerImageAnnotation>());
        Assert.Equal("18.6", postgresImage.Tag);
        foreach (string name in new[] { "database-bootstrap", "inventory", "reservations", "notifications", "web" })
        {
            Assert.Contains(builder.Resources, resource => resource.Name == name);
        }

        AssertVolume(broker, "equipment-reservations-rabbitmq");

        if (publish)
        {
            foreach (IResource resource in builder.Resources
                .Where(resource => resource.Name is
                    "database-bootstrap" or "inventory" or "reservations" or
                    "notifications" or "web" or "web-installer")
                .ToArray())
            {
                _ = builder.Resources.Remove(resource);
            }

            Assert.Same(broker, Assert.Single(builder.Resources.OfType<RabbitMQServerResource>()));
            Assert.Same(postgres, Assert.Single(builder.Resources.OfType<PostgresServerResource>()));
            Assert.Same(postgresImage, Assert.Single(postgres.Annotations.OfType<ContainerImageAnnotation>()));
            Assert.Equal(brokerEndpoints, broker.Annotations.OfType<EndpointAnnotation>());
            Assert.Equal(postgresEndpoints, postgres.Annotations.OfType<EndpointAnnotation>());
            Assert.Equal("4.3.6", Assert.Single(broker.Annotations.OfType<ContainerImageAnnotation>()).Tag);
            Assert.DoesNotContain(broker.Annotations.OfType<EndpointAnnotation>(), endpoint => endpoint.UriScheme == "http");
            AssertVolume(broker, "equipment-reservations-rabbitmq");
            AssertVolume(postgres, "equipment-reservations-postgres");
            using var deadline = new CancellationTokenSource(TimeSpan.FromSeconds(30));
            try
            {
                await using DistributedApplication app = await builder.BuildAsync(deadline.Token);
                await app.RunAsync(deadline.Token);
                using var document = JsonDocument.Parse(await File.ReadAllTextAsync(manifest, deadline.Token));
                JsonElement resources = document.RootElement.GetProperty("resources");
                Assert.False(resources.TryGetProperty("pgadmin", out _));
                JsonElement messaging = resources.GetProperty("messaging");
                Assert.DoesNotContain("management", messaging.GetProperty("image").GetString(), StringComparison.OrdinalIgnoreCase);
                Assert.False(messaging.GetProperty("bindings").TryGetProperty("management", out _));
                Assert.True(resources.TryGetProperty("postgres", out _));
                output.WriteLine("Full publish graph excludes consoles. Generated infrastructure manifest after removing application projects/web only: ordinary postgres/messaging retained; pgAdmin, management endpoint and management image absent.");
            }
            finally
            {
                File.Delete(manifest);
            }
        }
    }

    [Fact]
    public async Task RabbitManagementRequiresExistingCredentialsAfterRuntimeBindingGate()
    {
        using var deadline = new CancellationTokenSource(TimeSpan.FromMinutes(3));
        await using IDistributedApplicationTestingBuilder builder = await CreateAsync("Development");
        RabbitMQServerResource broker = Assert.Single(builder.Resources.OfType<RabbitMQServerResource>());
        EndpointAnnotation endpoint = Assert.Single(broker.Annotations.OfType<EndpointAnnotation>(), endpoint => endpoint.UriScheme == "http");
        KeepOnly(builder, "messaging", "broker-password");
        string container = "admin-rabbit-" + Guid.NewGuid().ToString("N");
        _ = builder.CreateResourceBuilder(broker).WithContainerName(container);
        SmokeStartup.IsolateStorage(builder);
        await using DistributedApplication app = await builder.BuildAsync(deadline.Token);
        await SmokeStartup.StartAsync(app, deadline.Token);
        _ = await app.ResourceNotifications.WaitForResourceHealthyAsync("messaging", deadline.Token);
        Uri address = app.GetEndpoint("messaging", endpoint.Name);
        await AssertRuntimeBindingsAsync(address.Port, container, endpoint.TargetPort!.Value, deadline.Token);

        using HttpClient client = app.CreateHttpClient("messaging", endpoint.Name);
        client.Timeout = TimeSpan.FromSeconds(10);
        using HttpResponseMessage anonymous = await client.GetAsync("/api/overview", deadline.Token);
        Assert.Equal(HttpStatusCode.Unauthorized, anonymous.StatusCode);
        string username = await broker.UserNameReference.GetValueAsync(deadline.Token) ?? throw new InvalidOperationException("Missing broker username.");
        string password = await broker.PasswordParameter.GetValueAsync(deadline.Token) ?? throw new InvalidOperationException("Missing broker password.");
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Basic", Convert.ToBase64String(Encoding.UTF8.GetBytes(username + ":" + password)));
        using HttpResponseMessage authenticated = await client.GetAsync("/api/overview", deadline.Token);
        Assert.Equal(HttpStatusCode.OK, authenticated.StatusCode);

        if (Environment.GetEnvironmentVariable("ADMIN_CONSOLE_BROWSER") == "1")
        {
            string prefix = "admin-ui-" + Guid.NewGuid().ToString("N");
            string queue = prefix + "-consumer";
            string settings = await app.GetConnectionStringAsync("messaging", deadline.Token) ?? throw new InvalidOperationException("Missing broker connection.");
            await using IConnection connection = await RabbitConnection.Factory(settings, TimeSpan.FromSeconds(3)).CreateConnectionAsync(deadline.Token);
            await using IChannel channel = await connection.CreateChannelAsync(cancellationToken: deadline.Token);
            _ = await channel.QueueDeclareAsync(queue, true, false, true, cancellationToken: deadline.Token);
            string consumer = await channel.BasicConsumeAsync(queue, false, new AsyncEventingBasicConsumer(channel), deadline.Token);
            try
            {
                output.WriteLine(await RunAsync("node", ["scripts/admin-console-browser.mjs", "rabbit"], deadline.Token,
                    new Dictionary<string, string>
                    {
                        ["RABBIT_URL"] = address.ToString(),
                        ["RABBIT_USERNAME"] = username,
                        ["RABBIT_PASSWORD"] = password,
                        ["RABBIT_PREFIX"] = prefix,
                        ["RABBIT_CONSUMER_QUEUE"] = queue
                    }));
            }
            finally
            {
                await channel.BasicCancelAsync(consumer, cancellationToken: CancellationToken.None);
            }
        }
    }

    [Fact]
    public async Task PgAdminOpensWithoutLoginAfterRuntimeBindingGate()
    {
        using var deadline = new CancellationTokenSource(TimeSpan.FromMinutes(3));
        await using IDistributedApplicationTestingBuilder builder = await CreateAsync("Development");
        PgAdminContainerResource console = Assert.Single(builder.Resources.OfType<PgAdminContainerResource>());
        Assert.Equal(PgAdminImageTag, Assert.Single(console.Annotations.OfType<ContainerImageAnnotation>()).Tag);
        EndpointAnnotation endpoint = Assert.Single(console.Annotations.OfType<EndpointAnnotation>());
        KeepOnly(builder,
            "postgres", console.Name, "database-bootstrap", "postgres-password",
            "inventory-password", "reservations-password", "notifications-password");
        string container = "admin-pgadmin-" + Guid.NewGuid().ToString("N");
        _ = builder.CreateResourceBuilder(console).WithContainerName(container);
        SmokeStartup.IsolateStorage(builder);
        await using DistributedApplication app = await builder.BuildAsync(deadline.Token);
        await SmokeStartup.StartAsync(app, deadline.Token);
        _ = await app.ResourceNotifications.WaitForResourceHealthyAsync(console.Name, deadline.Token);
        await AssertPgAdminImageAsync(container, deadline.Token);
        Uri address = app.GetEndpoint(console.Name, endpoint.Name);
        await AssertRuntimeBindingsAsync(address.Port, container, endpoint.TargetPort!.Value, deadline.Token);

        using HttpClient client = app.CreateHttpClient(console.Name, endpoint.Name);
        client.Timeout = TimeSpan.FromSeconds(10);
        using HttpResponseMessage response = await client.GetAsync("/browser/", deadline.Token);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.DoesNotContain("/login", response.RequestMessage!.RequestUri!.AbsolutePath, StringComparison.OrdinalIgnoreCase);
        await app.ResourceNotifications.WaitForResourceAsync("database-bootstrap", KnownResourceStates.Finished, deadline.Token);

        var settings = new NpgsqlConnectionStringBuilder(await app.GetConnectionStringAsync("postgres", deadline.Token)) { Database = "inventory" };
        await using var source = NpgsqlDataSource.Create(settings.ConnectionString);
        string sentinel = "admin_console_" + Guid.NewGuid().ToString("N");
        await using (NpgsqlCommand create = source.CreateCommand($"CREATE TABLE {sentinel} (value text); INSERT INTO {sentinel} VALUES ('preserved')"))
        {
            _ = await create.ExecuteNonQueryAsync(deadline.Token);
        }

        if (Environment.GetEnvironmentVariable("ADMIN_CONSOLE_BROWSER") == "1")
        {
            using var browserDeadline = new CancellationTokenSource(TimeSpan.FromMinutes(8));
            output.WriteLine(await RunAsync("node", ["scripts/admin-console-browser.mjs", "postgres"], browserDeadline.Token,
                new Dictionary<string, string> { ["PGADMIN_URL"] = address.ToString() }));
        }

        using var recreation = new CancellationTokenSource(TimeSpan.FromMinutes(3));
        string initialContainer = await RunAsync("podman", ["inspect", "--format", "{{.Id}}", container], recreation.Token);
        ExecuteCommandResult stopped = await app.ResourceCommands.ExecuteCommandAsync(console.Name, KnownResourceCommands.StopCommand, recreation.Token);
        Assert.True(stopped.Success, "pgAdmin stop command failed.");
        await app.ResourceNotifications.WaitForResourceAsync(console.Name, KnownResourceStates.Exited, recreation.Token);

        ExecuteCommandResult started = await app.ResourceCommands.ExecuteCommandAsync(console.Name, KnownResourceCommands.StartCommand, recreation.Token);
        Assert.True(started.Success, "pgAdmin start command failed.");
        _ = await app.ResourceNotifications.WaitForResourceHealthyAsync(console.Name, recreation.Token);
        await AssertPgAdminImageAsync(container, recreation.Token);

        string recreatedContainer = await RunAsync("podman", ["inspect", "--format", "{{.Id}}", container], recreation.Token);
        Assert.NotEqual(initialContainer, recreatedContainer);
        address = app.GetEndpoint(console.Name, endpoint.Name);
        await AssertRuntimeBindingsAsync(address.Port, container, endpoint.TargetPort!.Value, recreation.Token);

        using HttpResponseMessage reopened = await client.GetAsync("/browser/", recreation.Token);
        Assert.Equal(HttpStatusCode.OK, reopened.StatusCode);
        Assert.DoesNotContain("/login", reopened.RequestMessage!.RequestUri!.AbsolutePath, StringComparison.OrdinalIgnoreCase);
        await using (NpgsqlCommand retained = source.CreateCommand($"SELECT value FROM {sentinel}"))
        {
            Assert.Equal("preserved", await retained.ExecuteScalarAsync(recreation.Token));
        }

        if (Environment.GetEnvironmentVariable("ADMIN_CONSOLE_BROWSER") == "1")
        {
            using var browserDeadline = new CancellationTokenSource(TimeSpan.FromMinutes(8));
            output.WriteLine(await RunAsync("node", ["scripts/admin-console-browser.mjs", "postgres"], browserDeadline.Token,
                new Dictionary<string, string> { ["PGADMIN_URL"] = address.ToString() }));
        }

        output.WriteLine("pgAdmin container identity changed after supported stop/start; no settings volume; automatic no-login HTTP and PostgreSQL sentinel retained after recreation.");
    }

    private static Task<IDistributedApplicationTestingBuilder> CreateAsync(string environment)
    {
        Environment.SetEnvironmentVariable("ASPIRE_CONTAINER_RUNTIME", "podman");
        return DistributedApplicationTestingBuilder.CreateAsync<Projects.AppHost>(["--environment=" + environment]);
    }

    private async Task AssertPgAdminImageAsync(string container, CancellationToken token)
    {
        string image = (await RunAsync("podman", ["inspect", "--format", "{{.Config.Image}}", container], token)).Trim();
        Assert.Equal("docker.io/dpage/pgadmin4:" + PgAdminImageTag, image);
        output.WriteLine("Verified running pgAdmin image: " + image);
    }

    private static void AssertLocalConsole(EndpointAnnotation endpoint)
    {
        Assert.Equal("http", endpoint.UriScheme);
        Assert.Null(endpoint.Port);
        Assert.Equal("127.0.0.1", endpoint.TargetHost);
        Assert.True(endpoint.IsProxied);
        Assert.False(endpoint.IsExternal);
        Assert.True(endpoint.ExcludeReferenceEndpoint);
    }

    private static void AssertVolume(IResource resource, string expected)
    {
        Assert.Equal(expected, Assert.Single(resource.Annotations.OfType<ContainerMountAnnotation>(), mount => mount.Type == ContainerMountType.Volume).Source);
    }

    private static void KeepOnly(IDistributedApplicationTestingBuilder builder, params string[] names)
    {
        foreach (IResource resource in builder.Resources.Where(resource => !names.Contains(resource.Name, StringComparer.Ordinal)).ToArray())
        {
            _ = builder.Resources.Remove(resource);
        }
    }

    private async Task AssertRuntimeBindingsAsync(int proxyPort, string container, int targetPort, CancellationToken token)
    {
        IPEndPoint[] listeners = [.. IPGlobalProperties.GetIPGlobalProperties()
            .GetActiveTcpListeners()
            .Where(endpoint => endpoint.Port == proxyPort)];
        Assert.NotEmpty(listeners);
        Assert.All(listeners, listener => Assert.True(IPAddress.IsLoopback(listener.Address), $"Console proxy has non-loopback listener {listener}."));
        string publications = await RunAsync("podman", ["inspect", "--format", "{{json .NetworkSettings.Ports}}", container], token);
        using var ports = JsonDocument.Parse(publications);
        JsonElement bindings = ports.RootElement.GetProperty(targetPort + "/tcp");
        Assert.Equal(JsonValueKind.Array, bindings.ValueKind);
        Assert.NotEmpty(bindings.EnumerateArray());
        var hostPorts = new HashSet<int> { proxyPort };
        foreach (JsonElement binding in bindings.EnumerateArray())
        {
            string address = binding.GetProperty("HostIp").GetString()!;
            int port = int.Parse(binding.GetProperty("HostPort").GetString()!, System.Globalization.CultureInfo.InvariantCulture);
            Assert.True(IPAddress.TryParse(address, out IPAddress? parsed) && IPAddress.IsLoopback(parsed), $"Backing console port published on non-loopback {address}:{port}.");
            _ = hostPorts.Add(port);
            output.WriteLine($"Verified backing console binding {address}:{port} -> {targetPort}; proxy port {proxyPort} is loopback.");
        }

        IPEndPoint[] hostListeners = [.. IPGlobalProperties.GetIPGlobalProperties()
            .GetActiveTcpListeners()
            .Where(endpoint => hostPorts.Contains(endpoint.Port))];
        foreach (int port in hostPorts)
        {
            Assert.Contains(hostListeners, listener => listener.Port == port);
        }

        Assert.All(hostListeners, listener => Assert.True(IPAddress.IsLoopback(listener.Address), $"Console proxy or backing host listener is non-loopback: {listener}."));

        IPAddress[] external = [.. NetworkInterface.GetAllNetworkInterfaces()
            .Where(network => network.OperationalStatus == OperationalStatus.Up)
            .SelectMany(network => network.GetIPProperties().UnicastAddresses)
            .Select(address => address.Address)
            .Where(address => !IPAddress.IsLoopback(address))
            .Distinct()];
        foreach (IPAddress address in external)
        {
            foreach (int port in hostPorts)
            {
                using var probe = new TcpClient(address.AddressFamily);
                using var timeout = CancellationTokenSource.CreateLinkedTokenSource(token);
                timeout.CancelAfter(TimeSpan.FromSeconds(1));
                try
                {
                    await probe.ConnectAsync(address, port, timeout.Token);
                }
                catch (SocketException)
                {
                    continue;
                }
                catch (OperationCanceledException) when (!token.IsCancellationRequested)
                {
                    continue;
                }

                Assert.Fail($"Console reachable through non-loopback address {address}:{port}.");
            }
        }

        output.WriteLine($"Binding gate passed before administration: {listeners.Length} proxy listeners, {hostPorts.Count - 1} backing ports, {hostListeners.Length} actual host listeners, {external.Length} non-loopback addresses probed.");
    }

    private static async Task<string> RunAsync(string executable, string[] arguments, CancellationToken token, IReadOnlyDictionary<string, string>? environment = null)
    {
        var start = new ProcessStartInfo(executable)
        {
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            WorkingDirectory = Path.GetFullPath("../../../../../", AppContext.BaseDirectory)
        };
        foreach (string argument in arguments)
        {
            start.ArgumentList.Add(argument);
        }

        if (environment is not null)
        {
            foreach ((string name, string value) in environment)
            {
                start.Environment[name] = value;
            }
        }

        using Process process = Process.Start(start) ?? throw new InvalidOperationException("Unable to inspect container ports.");
        Task<string> result = process.StandardOutput.ReadToEndAsync(token);
        Task<string> errors = process.StandardError.ReadToEndAsync(token);
        try
        {
            await process.WaitForExitAsync(token);
        }
        catch (OperationCanceledException)
        {
            process.Kill(entireProcessTree: true);
            throw;
        }

        Assert.True(process.ExitCode == 0, await errors);
        return await result;
    }
}
