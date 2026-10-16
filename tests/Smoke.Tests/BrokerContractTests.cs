using System.Net;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using Aspire.Hosting;
using Aspire.Hosting.ApplicationModel;
using Aspire.Hosting.Postgres;
using Aspire.Hosting.Testing;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Logging.Abstractions;
using RabbitMQ.Client;
using RabbitMQ.Client.Exceptions;
using ReservationMessaging;
using Xunit;

namespace Smoke.Tests;

public class BrokerContractTests
{
    [Fact]
    public async Task ReservationTopologyRoutesBothEventsConfirmsAndRejectsUnroutable()
    {
        using var deadline = new CancellationTokenSource(TimeSpan.FromMinutes(3));
        Environment.SetEnvironmentVariable("ASPIRE_CONTAINER_RUNTIME", "podman");
        IDistributedApplicationTestingBuilder builder = await DistributedApplicationTestingBuilder.CreateAsync<Projects.AppHost>(["--environment=Development"], deadline.Token);
        RabbitMQServerResource broker = Assert.Single(builder.Resources.OfType<RabbitMQServerResource>());
        EndpointAnnotation endpoint = broker.PrimaryEndpoint.EndpointAnnotation;
        Assert.Equal("tcp", endpoint.Name);
        Assert.Equal(5672, endpoint.TargetPort);
        foreach (IResource? resource in builder.Resources
            .Where(resource => resource is PgAdminContainerResource ||
                resource.Name is "postgres" or "database-bootstrap" or "inventory" or
                    "reservations" or "notifications" or "web" or "web-installer" or "identity" or "identity-bootstrap")
            .ToArray())
        {
            _ = builder.Resources.Remove(resource);
        }

        SmokeStartup.IsolateStorage(builder);
        await using DistributedApplication app = await builder.BuildAsync(deadline.Token);
        await SmokeStartup.StartAsync(app, deadline.Token);
        _ = await app.ResourceNotifications.WaitForResourceHealthyAsync("messaging", deadline.Token);
        string? connectionString = await app.GetConnectionStringAsync("messaging", deadline.Token);
        await using IConnection connection = await RabbitConnection.Factory(connectionString!, TimeSpan.FromSeconds(3)).CreateConnectionAsync(deadline.Token);
        await using IChannel channel = await connection.CreateChannelAsync(new CreateChannelOptions(true, true), deadline.Token);
        await ReservationTopology.DeclareAsync(channel, deadline.Token);
        _ = await Assert.ThrowsAsync<PublishReturnException>(async () =>
            await channel.BasicPublishAsync(ReservationTopology.Exchange, "unroutable", true, new BasicProperties(), "{}"u8.ToArray(), deadline.Token));

        foreach (string key in new[] { ReservationTopology.Confirmed, ReservationTopology.Cancelled })
        {
            await channel.BasicPublishAsync(ReservationTopology.Exchange, key, true,
                new BasicProperties { Persistent = true }, Encoding.UTF8.GetBytes(key), deadline.Token);
        }

        Assert.Equal(2u, (await channel.QueueDeclarePassiveAsync(ReservationTopology.Queue, deadline.Token)).MessageCount);
        foreach (string key in new[] { ReservationTopology.Confirmed, ReservationTopology.Cancelled })
        {
            BasicGetResult? delivery = await channel.BasicGetAsync(ReservationTopology.Queue, false, deadline.Token);
            Assert.NotNull(delivery);
            Assert.Equal(key, delivery.RoutingKey);
            Assert.Equal(key, Encoding.UTF8.GetString(delivery.Body.Span));
            Assert.True(delivery.BasicProperties.Persistent);
            await channel.BasicAckAsync(delivery.DeliveryTag, false, deadline.Token);
        }
    }
}

public sealed class BrokerAccessTests(BrokerAccessFixture fixture) : IClassFixture<BrokerAccessFixture>
{
    [Fact]
    public async Task WorkerConnectionsConfirmRouteAndManuallyAcknowledgeOrRejectBothEvents()
    {
        using var deadline = new CancellationTokenSource(TimeSpan.FromSeconds(15));
        await using IConnection publisher = await RabbitConnection.Factory(fixture.Connection("reservations"), TimeSpan.FromSeconds(3)).CreateConnectionAsync(deadline.Token);
        await using IConnection consumer = await RabbitConnection.Factory(fixture.Connection("notifications"), TimeSpan.FromSeconds(3)).CreateConnectionAsync(deadline.Token);
        await using IChannel outgoing = await publisher.CreateChannelAsync(new CreateChannelOptions(true, true), deadline.Token);
        await using IChannel incoming = await consumer.CreateChannelAsync(cancellationToken: deadline.Token);
        _ = await Assert.ThrowsAsync<PublishReturnException>(async () =>
            await outgoing.BasicPublishAsync(ReservationTopology.Exchange, "unroutable", true, new BasicProperties(), "{}"u8.ToArray(), deadline.Token));

        foreach (string route in new[] { ReservationTopology.Confirmed, ReservationTopology.Cancelled })
        {
            await outgoing.BasicPublishAsync(ReservationTopology.Exchange, route, true, new BasicProperties { Persistent = true }, Encoding.UTF8.GetBytes(route), deadline.Token);
            BasicGetResult? delivery = await incoming.BasicGetAsync(ReservationTopology.Queue, false, deadline.Token);
            Assert.NotNull(delivery);
            Assert.Equal(route, delivery.RoutingKey);
            Assert.Equal(route, Encoding.UTF8.GetString(delivery.Body.Span));
            Assert.True(delivery.BasicProperties.Persistent);
            if (route == ReservationTopology.Confirmed)
            {
                await incoming.BasicAckAsync(delivery.DeliveryTag, false, deadline.Token);
            }
            else
            {
                await incoming.BasicRejectAsync(delivery.DeliveryTag, false, deadline.Token);
            }
        }

        Assert.Null(await incoming.BasicGetAsync(ReservationTopology.Queue, false, deadline.Token));
    }

    [Theory]
    [InlineData("reservations", "consume")]
    [InlineData("reservations", "unrelated-consume")]
    [InlineData("reservations", "configure")]
    [InlineData("reservations", "bind")]
    [InlineData("reservations", "unrelated-publish")]
    [InlineData("reservations", "default-publish")]
    [InlineData("notifications", "publish")]
    [InlineData("notifications", "unrelated-publish")]
    [InlineData("notifications", "configure")]
    [InlineData("notifications", "bind")]
    [InlineData("notifications", "unrelated-consume")]
    [InlineData("notifications", "default-publish")]
    public async Task WorkerCannotPerformUnrelatedOrReverseOperations(string worker, string operation)
    {
        using var deadline = new CancellationTokenSource(TimeSpan.FromSeconds(15));
        await using IConnection connection = await RabbitConnection.Factory(fixture.Connection(worker), TimeSpan.FromSeconds(3)).CreateConnectionAsync(deadline.Token);
        await using IChannel channel = await connection.CreateChannelAsync(new CreateChannelOptions(true, true), deadline.Token);
        OperationInterruptedException failure = await Assert.ThrowsAnyAsync<OperationInterruptedException>(async () =>
        {
            switch (operation)
            {
                case "consume":
                    _ = await channel.BasicGetAsync(ReservationTopology.Queue, false, deadline.Token);
                    break;
                case "unrelated-consume":
                    _ = await channel.BasicGetAsync("unrelated", false, deadline.Token);
                    break;
                case "configure":
                    _ = await channel.QueueDeclareAsync("unrelated", true, false, false, cancellationToken: deadline.Token);
                    break;
                case "bind":
                    await channel.QueueBindAsync(ReservationTopology.Queue, ReservationTopology.Exchange, "unrelated", cancellationToken: deadline.Token);
                    break;
                default:
                    string exchange = operation switch
                    {
                        "default-publish" => "",
                        "unrelated-publish" => "unrelated",
                        _ => ReservationTopology.Exchange
                    };
                    string route = operation == "default-publish" ? ReservationTopology.Queue : ReservationTopology.Confirmed;
                    await channel.BasicPublishAsync(exchange, route, true, new BasicProperties(), "{}"u8.ToArray(), deadline.Token);
                    break;
            }
        });
        Assert.Equal(403, failure.ShutdownReason!.ReplyCode);
    }

    [Theory]
    [InlineData("reservations", "other-vhost")]
    [InlineData("notifications", "other-vhost")]
    [InlineData("reservations", "management")]
    [InlineData("notifications", "management")]
    public async Task WorkerHasNoOtherVirtualHostOrAdministrationAuthority(string worker, string operation)
    {
        using var deadline = new CancellationTokenSource(TimeSpan.FromSeconds(15));
        if (operation == "other-vhost")
        {
            await fixture.AssertExactAuthorityAsync(worker, deadline.Token);
            ConnectionFactory settings = RabbitConnection.Factory(fixture.Connection(worker), TimeSpan.FromSeconds(3));
            settings.VirtualHost = "/";
            Assert.Equal("/", settings.VirtualHost);
            OperationInterruptedException denial = await Assert.ThrowsAnyAsync<OperationInterruptedException>(async () =>
            {
                await using IConnection connection = await settings.CreateConnectionAsync(deadline.Token);
                await using IChannel channel = await connection.CreateChannelAsync(cancellationToken: deadline.Token);
            });
            Assert.Equal(530, denial.ShutdownReason!.ReplyCode);
            return;
        }

        var credentials = new Uri(fixture.Connection(worker));
        using var client = new HttpClient { BaseAddress = fixture.Management, Timeout = TimeSpan.FromSeconds(5) };
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Basic", Convert.ToBase64String(Encoding.UTF8.GetBytes(Uri.UnescapeDataString(credentials.UserInfo))));
        using HttpResponseMessage response = await client.GetAsync("/api/overview", deadline.Token);
        Assert.True(response.StatusCode is HttpStatusCode.Unauthorized or HttpStatusCode.Forbidden, "Worker must not administer the broker.");
    }
}

public sealed class BrokerAccessFixture : IAsyncLifetime, IDisposable
{
    private static readonly string[] ExpectedFileModes = ["999:999:600", "999:999:600", "999:999:700"];
    private readonly Dictionary<string, string> connections = new(StringComparer.Ordinal);
    private DistributedApplication? app;
    private string administration = "";
    private string container = "";
    private readonly DcpStorageCapture storage = new();
    private readonly HashSet<string> sensitive = new(StringComparer.Ordinal);
    private CancellationTokenSource? expectedFailureStartup;
    private Task? startupAttempt;
    private RabbitMQServerResource? messaging;

    public Uri Management { get; private set; } = null!;

    public string Connection(string worker)
    {
        return connections[worker];
    }

    public async Task AssertExactAuthorityAsync(string worker, CancellationToken cancellationToken)
    {
        var credentials = new Uri(administration);
        using var client = new HttpClient { BaseAddress = Management, Timeout = TimeSpan.FromSeconds(5) };
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Basic", Convert.ToBase64String(Encoding.UTF8.GetBytes(Uri.UnescapeDataString(credentials.UserInfo))));
        string username = worker == "reservations" ? "reservations-publisher" : "notifications-consumer";
        Assert.Equal(username, Uri.UnescapeDataString(new Uri(Connection(worker)).UserInfo.Split(':')[0]));
        using HttpResponseMessage response = await client.GetAsync("/api/users/" + username + "/permissions", cancellationToken);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using JsonDocument document = await JsonDocument.ParseAsync(await response.Content.ReadAsStreamAsync(cancellationToken), cancellationToken: cancellationToken);
        JsonElement permission = Assert.Single(document.RootElement.EnumerateArray());
        Assert.Equal("equipment", permission.GetProperty("vhost").GetString());
        Assert.Equal("^$", permission.GetProperty("configure").GetString());
        Assert.Equal(worker == "reservations" ? "^reservations$" : "^$", permission.GetProperty("write").GetString());
        Assert.Equal(worker == "notifications" ? "^reservation-notifications$" : "^$", permission.GetProperty("read").GetString());
    }

    public Task InitializeAsync()
    {
        return InitializeCoreAsync(null);
    }

    public Task InitializeWithFailureAsync(string failure)
    {
        return InitializeCoreAsync(failure);
    }

    public Task InitializeWithPasswordsAsync(string publisherPassword, string consumerPassword)
    {
        return InitializeCoreAsync(null, publisherPassword, consumerPassword);
    }

    public bool SessionRemoved => storage.SessionRemoved;

    public async Task<string> InspectStorageAsync(CancellationToken cancellationToken)
    {
        string modes = await BrokerMetadata.RunAsync(["exec", container, "stat", "-c", "%u:%g:%a", "/etc/rabbitmq/equipment-definitions.json", "/etc/rabbitmq/conf.d/20-equipment.conf", "/etc/rabbitmq/conf.d"], cancellationToken);
        Assert.Equal(ExpectedFileModes, modes.Split('\n', StringSplitOptions.RemoveEmptyEntries));
        return storage.Inspect();
    }

    public async Task AssertImportBlockedWorkerAsync(CancellationToken cancellationToken)
    {
        Assert.NotNull(app);
        Assert.True(app.ResourceNotifications.TryGetCurrentState("notifications", out ResourceEvent? worker));
        Assert.Equal(KnownResourceStates.Waiting, worker.Snapshot.State?.Text);
        ResourceLoggerService logs = app.Services.GetRequiredService<ResourceLoggerService>();
        bool failed = false;
        while (!failed)
        {
            await foreach (IReadOnlyList<LogLine> lines in logs.GetAllAsync(messaging!).WithCancellation(cancellationToken))
            {
                foreach (LogLine line in lines)
                {
                    failed |= line.Content.Contains("BOOT FAILED", StringComparison.Ordinal)
                        || line.Content.Contains("failed_to_prepare_configuration", StringComparison.Ordinal);
                    Assert.False(sensitive.Any(value => line.Content.Contains(value, StringComparison.Ordinal)), "Broker failure diagnostics exposed sensitive material.");
                }
            }

            if (!failed)
            {
                await Task.Delay(TimeSpan.FromMilliseconds(100), cancellationToken);
            }
        }

        _ = storage.Inspect();
    }

    private async Task InitializeCoreAsync(string? failure, string? publisherPassword = null, string? consumerPassword = null)
    {
        using var deadline = new CancellationTokenSource(TimeSpan.FromMinutes(3));
        Environment.SetEnvironmentVariable("ASPIRE_CONTAINER_RUNTIME", "podman");
        IDistributedApplicationTestingBuilder builder = await DistributedApplicationTestingBuilder.CreateAsync<Projects.AppHost>(["--environment=Development"], deadline.Token);
        if (publisherPassword is not null && consumerPassword is not null)
        {
            _ = builder.Configuration.AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Parameters:reservations-broker-password"] = publisherPassword,
                ["Parameters:notifications-broker-password"] = consumerPassword
            });
        }

        _ = builder.Services.AddLogging(logging => logging.AddFilter("Aspire.Hosting.Dcp.DcpHost", LogLevel.Debug).AddProvider(storage));
        ProjectResource[] workers = [.. builder.Resources.OfType<ProjectResource>().Where(resource => resource.Name is "reservations" or "notifications")];
        RabbitMQServerResource broker = Assert.Single(builder.Resources.OfType<RabbitMQServerResource>());
        messaging = broker;
        container = "broker-access-" + Guid.NewGuid().ToString("N");
        _ = builder.CreateResourceBuilder(broker).WithContainerName(container);
        if (failure is not null)
        {
            ContainerFileSystemCallbackAnnotation original = Assert.Single(broker.Annotations.OfType<ContainerFileSystemCallbackAnnotation>());
            _ = broker.Annotations.Remove(original);
            _ = builder.CreateResourceBuilder(broker).WithContainerFiles("/etc/rabbitmq", async (context, token) =>
            {
                ContainerFileSystemItem[] files = [.. await original.Callback(context, token)];
                ContainerFile definitions = Assert.Single(files.OfType<ContainerFile>());
                using var document = JsonDocument.Parse(definitions.Contents!);
                foreach (JsonElement user in document.RootElement.GetProperty("users").EnumerateArray())
                {
                    _ = sensitive.Add(user.GetProperty("password_hash").GetString()!);
                }

                if (failure == "malformed")
                {
                    definitions.Contents = "{";
                }
                else
                {
                    definitions.Owner = 0;
                    definitions.Group = 0;
                }

                return files;
            }, defaultOwner: 999, defaultGroup: 999);

            ProjectResource notifications = Assert.Single(workers, worker => worker.Name == "notifications");
            foreach (WaitAnnotation wait in notifications.Annotations.OfType<WaitAnnotation>().Where(wait => wait.Resource != broker).ToArray())
            {
                _ = notifications.Annotations.Remove(wait);
            }
        }

        foreach (IResource resource in builder.Resources.Where(resource => resource is not ParameterResource && resource.Name is not ("messaging" or "broker-bootstrap")).ToArray())
        {
            if (failure is not null && resource.Name == "notifications")
            {
                continue;
            }

            foreach (EndpointAnnotation endpoint in resource.Annotations.OfType<EndpointAnnotation>())
            {
                endpoint.AllocatedEndpoint = new AllocatedEndpoint(endpoint, "127.0.0.1", 19001);
            }

            _ = builder.Resources.Remove(resource);
        }

        SmokeStartup.IsolateStorage(builder);
        app = await builder.BuildAsync(deadline.Token);
        if (failure is not null)
        {
            expectedFailureStartup = new CancellationTokenSource(TimeSpan.FromSeconds(60));
            startupAttempt = app.StartAsync(expectedFailureStartup.Token);
            _ = await app.ResourceNotifications.WaitForResourceAsync("messaging", [KnownResourceStates.Exited, KnownResourceStates.FailedToStart], expectedFailureStartup.Token);
            return;
        }

        await SmokeStartup.StartAsync(app, deadline.Token);
        _ = await app.ResourceNotifications.WaitForResourceHealthyAsync("messaging", deadline.Token);
        Management = app.GetEndpoint("messaging", broker.ManagementEndpoint.EndpointName);
        string admin = await app.GetConnectionStringAsync("messaging", deadline.Token) ?? throw new InvalidOperationException("Missing fixture broker settings.");
        administration = admin;
        await using (IConnection connection = await RabbitConnection.Factory(admin, TimeSpan.FromSeconds(3)).CreateConnectionAsync(deadline.Token))
        await using (IChannel channel = await connection.CreateChannelAsync(cancellationToken: deadline.Token))
        {
            await ReservationTopology.DeclareAsync(channel, deadline.Token);
            await channel.ExchangeDeclareAsync("unrelated", ExchangeType.Direct, true, cancellationToken: deadline.Token);
            _ = await channel.QueueDeclareAsync("unrelated", true, false, false, cancellationToken: deadline.Token);
        }

        foreach (ProjectResource worker in workers)
        {
            IExecutionConfigurationResult configuration = await ExecutionConfigurationBuilder.Create(worker)
                .WithEnvironmentVariablesConfig()
                .BuildAsync(builder.ExecutionContext, NullLogger.Instance, deadline.Token);
            connections[worker.Name] = configuration.EnvironmentVariables.Single(variable => variable.Key == "ConnectionStrings__messaging").Value;
        }
    }

    public async Task DisposeAsync()
    {
        try
        {
            expectedFailureStartup?.Cancel();
            if (startupAttempt is not null)
            {
                try
                {
                    await startupAttempt;
                }
                catch (OperationCanceledException) when (expectedFailureStartup?.IsCancellationRequested == true)
                {
                    // Expected failed-start test cancellation is observed before disposing its AppHost.
                }
            }
        }
        finally
        {
            try
            {
                if (app is not null)
                {
                    await app.DisposeAsync();
                }
            }
            finally
            {
                Dispose();
            }
        }
    }

    public void Dispose()
    {
        expectedFailureStartup?.Dispose();
        storage.Dispose();
    }
}
