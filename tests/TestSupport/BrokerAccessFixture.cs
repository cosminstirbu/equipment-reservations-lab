using System.Net;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using BrokerBootstrap;
using DotNet.Testcontainers.Builders;
using DotNet.Testcontainers.Configurations;
using DotNet.Testcontainers.Containers;
using RabbitMQ.Client;
using ReservationMessaging;
using Xunit;

namespace TestSupport;

public sealed class BrokerAccessFixture : IAsyncLifetime
{
    private static readonly string[] ExpectedFileModes = ["999:999:600", "999:999:600"];
    private readonly string administratorPassword = Guid.NewGuid().ToString("N");
    private readonly Dictionary<string, string> connections = new(StringComparer.Ordinal);
    private readonly HashSet<string> sensitive = new(StringComparer.Ordinal);
    private IContainer? broker;

    public Uri Management { get; private set; } = null!;

    public string Administration { get; private set; } = "";

    public string Connection(string worker)
    {
        return connections[worker];
    }

    public ValueTask InitializeAsync()
    {
        return new ValueTask(InitializeCoreAsync(null));
    }

    public Task InitializeWithFailureAsync(string failure)
    {
        return InitializeCoreAsync(failure);
    }

    public Task InitializeWithPasswordsAsync(string publisherPassword, string consumerPassword)
    {
        return InitializeCoreAsync(null, publisherPassword, consumerPassword);
    }

    private async Task InitializeCoreAsync(string? failure, string? publisherPassword = null, string? consumerPassword = null)
    {
        using var deadline = new CancellationTokenSource(TimeSpan.FromSeconds(60));
        publisherPassword ??= Guid.NewGuid().ToString("N");
        consumerPassword ??= Guid.NewGuid().ToString("N");
        sensitive.UnionWith([administratorPassword, publisherPassword, consumerPassword]);
        string definitions = BrokerProvisioning.Build("fixture", administratorPassword, Guid.NewGuid().ToString("N"),
            publisherPassword, Guid.NewGuid().ToString("N"), consumerPassword, Guid.NewGuid().ToString("N"));
        using (var document = JsonDocument.Parse(definitions))
        {
            foreach (JsonElement user in document.RootElement.GetProperty("users").EnumerateArray())
            {
                _ = sensitive.Add(user.GetProperty("password_hash").GetString()!);
            }
        }

        broker = new ContainerBuilder("rabbitmq:4.3.6-management")
            .WithEnvironment("RABBITMQ_DEFAULT_USER", "fixture")
            .WithEnvironment("RABBITMQ_DEFAULT_PASS", administratorPassword)
            .WithResourceMapping(Encoding.UTF8.GetBytes(failure == "malformed" ? "{" : definitions), "/etc/rabbitmq/equipment-definitions.json",
                failure == "unreadable" ? 0U : 999U, failure == "unreadable" ? 0U : 999U, UnixFileModes.UserRead | UnixFileModes.UserWrite)
            .WithResourceMapping(Encoding.UTF8.GetBytes(BrokerProvisioning.Configuration), "/etc/rabbitmq/conf.d/20-equipment.conf", 999, 999, UnixFileModes.UserRead | UnixFileModes.UserWrite)
            .WithPortBinding(5672, true)
            .WithPortBinding(15672, true)
            .WithWaitStrategy(failure is null
                ? Wait.ForUnixContainer().UntilInternalTcpPortIsAvailable(5672)
                : Wait.ForUnixContainer().UntilMessageIsLogged("BOOT FAILED"))
            .Build();
        try
        {
            if (failure is not null)
            {
                try
                {
                    await broker.StartAsync(deadline.Token);
                }
                catch (Exception exception) when (exception is ContainerNotRunningException)
                {
                    // Startup rejection is verified from actual provider diagnostics below.
                }

                await AssertImportRejectedAsync(deadline.Token);
                return;
            }

            await broker.StartAsync(deadline.Token);
            Administration = Address("fixture", administratorPassword);
            connections["reservations"] = Address("reservations-publisher", publisherPassword);
            connections["notifications"] = Address("notifications-consumer", consumerPassword);
            Management = new Uri($"http://{broker.Hostname}:{broker.GetMappedPublicPort(15672)}");
            await using IConnection connection = await RabbitConnection.Factory(Administration, TimeSpan.FromSeconds(3)).CreateConnectionAsync(deadline.Token);
            await using IChannel channel = await connection.CreateChannelAsync(cancellationToken: deadline.Token);
            await ReservationTopology.DeclareAsync(channel, deadline.Token);
            await channel.ExchangeDeclareAsync("unrelated", ExchangeType.Direct, true, cancellationToken: deadline.Token);
            _ = await channel.QueueDeclareAsync("unrelated", true, false, false, cancellationToken: deadline.Token);
            await AwaitManagementAsync(deadline.Token);
        }
        catch
        {
            await DisposeAsync();
            throw;
        }
    }

    private string Address(string username, string password)
    {
        return $"amqp://{Uri.EscapeDataString(username)}:{Uri.EscapeDataString(password)}@{broker!.Hostname}:{broker.GetMappedPublicPort(5672)}/equipment";
    }

    private async Task AwaitManagementAsync(CancellationToken cancellationToken)
    {
        using HttpClient client = AdministrationClient();
        while (true)
        {
            try
            {
                using HttpResponseMessage response = await client.GetAsync("/api/overview", cancellationToken);
                if (response.StatusCode == HttpStatusCode.OK)
                {
                    return;
                }
            }
            catch (HttpRequestException)
            {
                // AMQP can become ready before the management listener.
            }

            await Task.Delay(100, cancellationToken);
        }
    }

    private HttpClient AdministrationClient()
    {
        var client = new HttpClient { BaseAddress = Management, Timeout = TimeSpan.FromSeconds(5) };
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Basic", Convert.ToBase64String(Encoding.UTF8.GetBytes("fixture:" + administratorPassword)));
        return client;
    }

    public async Task AssertExactAuthorityAsync(string worker, CancellationToken cancellationToken)
    {
        using HttpClient client = AdministrationClient();
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

    public async Task AssertProtectedFilesAsync(CancellationToken cancellationToken)
    {
        ExecResult result = await broker!.ExecAsync(["stat", "-c", "%u:%g:%a", "/etc/rabbitmq/equipment-definitions.json", "/etc/rabbitmq/conf.d/20-equipment.conf"], cancellationToken);
        Assert.Equal(0, result.ExitCode);
        Assert.Equal(ExpectedFileModes, result.Stdout.Split('\n', StringSplitOptions.RemoveEmptyEntries));
    }

    public async Task AssertImportRejectedAsync(CancellationToken cancellationToken)
    {
        (string stdout, string stderr) = await broker!.GetLogsAsync(ct: cancellationToken);
        string logs = stdout + stderr;
        Assert.True(logs.Contains("BOOT FAILED", StringComparison.Ordinal) || logs.Contains("failed_to_prepare_configuration", StringComparison.Ordinal), "Expected observed RabbitMQ import rejection, not a readiness timeout.");
        Assert.All(sensitive, value => Assert.False(logs.Contains(value, StringComparison.Ordinal), "Broker failure diagnostics exposed sensitive material."));
    }

    public Task StopAsync(CancellationToken cancellationToken)
    {
        return broker!.StopAsync(cancellationToken);
    }

    public async Task RestartAsync(CancellationToken cancellationToken)
    {
        await broker!.StartAsync(cancellationToken);
        await AwaitManagementAsync(cancellationToken);
    }

    public async ValueTask DisposeAsync()
    {
        if (broker is not null)
        {
            await broker.DisposeAsync();
        }
    }
}
