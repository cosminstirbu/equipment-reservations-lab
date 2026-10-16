using System.Collections.Concurrent;
using System.Net.Http.Json;
using System.Text.Json;
using System.Threading.Channels;
using Backend.Tests;
using BrokerBootstrap;
using DotNet.Testcontainers.Builders;
using DotNet.Testcontainers.Configurations;
using DotNet.Testcontainers.Containers;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using Npgsql;
using RabbitMQ.Client;
using ReservationMessaging;
using Xunit;

namespace Smoke.Tests;

[CollectionDefinition("Reservation delivery")]
public sealed class ReservationDeliveryTests : ICollectionFixture<ReservationDeliveryFixture>;

public sealed class ReservationDeliveryFixture : IAsyncLifetime
{
    private static readonly string[] ExpectedFileModes = ["999:999:600", "999:999:600"];
    private readonly string password = Guid.NewGuid().ToString("N");
    private readonly string publisherPassword = Guid.NewGuid().ToString("N");
    private readonly string consumerPassword = Guid.NewGuid().ToString("N");
    private readonly string administratorSalt = Guid.NewGuid().ToString("N");
    private readonly string publisherSalt = Guid.NewGuid().ToString("N");
    private readonly string consumerSalt = Guid.NewGuid().ToString("N");
    private IContainer? broker;

    public PostgresFixture Postgres { get; } = new();

    public string Messaging { get; private set; } = string.Empty;

    public string Publisher { get; private set; } = string.Empty;

    public string Consumer { get; private set; } = string.Empty;

    public async Task InitializeAsync()
    {
        using var deadline = new CancellationTokenSource(TimeSpan.FromSeconds(60));
        await Postgres.InitializeAsync();
        string definitions = Definitions();
        Assert.True(string.Equals(definitions, Definitions(), StringComparison.Ordinal), "Unchanged secret and salt inputs must produce byte-stable definitions.");
        broker = new ContainerBuilder("rabbitmq:4.3.6")
            .WithEnvironment("RABBITMQ_DEFAULT_USER", "fixture")
            .WithEnvironment("RABBITMQ_DEFAULT_PASS", password)
            .WithResourceMapping(System.Text.Encoding.UTF8.GetBytes(definitions), "/etc/rabbitmq/equipment-definitions.json", 999, 999, UnixFileModes.UserRead | UnixFileModes.UserWrite)
            .WithResourceMapping(System.Text.Encoding.UTF8.GetBytes(BrokerProvisioning.Configuration), "/etc/rabbitmq/conf.d/20-equipment.conf", 999, 999, UnixFileModes.UserRead | UnixFileModes.UserWrite)
            .WithPortBinding(5672, true)
            .WithWaitStrategy(Wait.ForUnixContainer().UntilInternalTcpPortIsAvailable(5672))
            .Build();
        await broker.StartAsync(deadline.Token);
        Messaging = $"amqp://fixture:{password}@{broker.Hostname}:{broker.GetMappedPublicPort(5672)}/equipment";
        Publisher = $"amqp://reservations-publisher:{publisherPassword}@{broker.Hostname}:{broker.GetMappedPublicPort(5672)}/equipment";
        Consumer = $"amqp://notifications-consumer:{consumerPassword}@{broker.Hostname}:{broker.GetMappedPublicPort(5672)}/equipment";
        await ResetQueueAsync(deadline.Token);
    }

    public async Task ResetQueueAsync(CancellationToken cancellationToken)
    {
        await using IConnection connection = await RabbitConnection.Factory(Messaging, TimeSpan.FromSeconds(3)).CreateConnectionAsync(cancellationToken);
        await using IChannel channel = await connection.CreateChannelAsync(cancellationToken: cancellationToken);
        await channel.ExchangeDeclareAsync("reservations", ExchangeType.Direct, true, cancellationToken: cancellationToken);
        _ = await channel.QueueDeclareAsync("reservation-notifications", true, false, false, cancellationToken: cancellationToken);
        await channel.QueueBindAsync("reservation-notifications", "reservations", "reservation.confirmed", cancellationToken: cancellationToken);
        await channel.QueueBindAsync("reservation-notifications", "reservations", "reservation.cancelled", cancellationToken: cancellationToken);
        _ = await channel.QueuePurgeAsync("reservation-notifications", cancellationToken);
    }

    public Task StopBrokerAsync(CancellationToken cancellationToken)
    {
        return broker!.StopAsync(cancellationToken);
    }

    public async Task ChangePublisherPermissionAsync(bool denied, CancellationToken cancellationToken)
    {
        ExecResult result = await broker!.ExecAsync(["rabbitmqctl", "set_permissions", "-p", "equipment", "reservations-publisher", "^$", denied ? "^$" : "^reservations$", "^$"], cancellationToken);
        Assert.Equal(0, result.ExitCode);
    }

    public Task StartBrokerAsync(CancellationToken cancellationToken)
    {
        return broker!.StartAsync(cancellationToken);
    }

    public async Task AssertProtectedFilesAsync(CancellationToken cancellationToken)
    {
        ExecResult account = await broker!.ExecAsync(["id", "-u", "rabbitmq"], cancellationToken);
        Assert.Equal(0, account.ExitCode);
        Assert.Equal("999", account.Stdout.Trim());
        ExecResult files = await broker.ExecAsync(["stat", "-c", "%u:%g:%a", "/etc/rabbitmq/equipment-definitions.json", "/etc/rabbitmq/conf.d/20-equipment.conf"], cancellationToken);
        Assert.Equal(0, files.ExitCode);
        Assert.Equal(ExpectedFileModes, files.Stdout.Split('\n', StringSplitOptions.RemoveEmptyEntries));
    }

    private string Definitions()
    {
        return BrokerProvisioning.Build("fixture", password, administratorSalt, publisherPassword, publisherSalt, consumerPassword, consumerSalt);
    }

    public WebApplicationFactory<TProgram> App<TProgram>(NpgsqlDataSource database) where TProgram : class
    {
        return PostgresFixture.Factory<TProgram>(database).WithWebHostBuilder(builder => builder.ConfigureAppConfiguration((context, configuration) =>
        {
            string messaging = typeof(TProgram) == typeof(Reservations.Program) ? Publisher : Consumer;
            _ = configuration.AddInMemoryCollection(new Dictionary<string, string?> { ["ConnectionStrings:messaging"] = messaging });
        }));
    }

    public async Task DisposeAsync()
    {
        if (broker is not null)
        {
            await broker.DisposeAsync();
        }

        await Postgres.DisposeAsync();
    }

    internal static async Task<ObservedNotification[]> AwaitInboxAsync(HttpClient client, int count, CancellationToken cancellationToken)
    {
        while (true)
        {
            using HttpResponseMessage response = await client.GetAsync("/api/notifications", cancellationToken);
            Assert.Equal(System.Net.HttpStatusCode.OK, response.StatusCode);
            ObservedNotification[] items = (await response.Content.ReadFromJsonAsync<ObservedNotification[]>(cancellationToken))!;
            if (items.Length >= count)
            {
                return items;
            }

            await Task.Delay(100, cancellationToken);
        }
    }

    internal static byte[] Envelope(Guid eventId, Guid reservationId, string type = "ReservationConfirmed", DateTimeOffset? occurredAt = null, string? userKey = null)
    {
        DateTimeOffset occurrence = occurredAt ?? DateTimeOffset.UtcNow;
        occurrence = occurrence.AddTicks(-(occurrence.Ticks % 10));
        return JsonSerializer.SerializeToUtf8Bytes(new
        {
            schemaVersion = 1,
            eventId,
            reservationId,
            eventType = type,
            userKey = userKey ?? IdentityAuthorityFixture.UserKeyFor(),
            equipmentId = "camera-001",
            equipmentName = "Demo Camera",
            startAt = "2030-01-02T12:00:00Z",
            endAt = "2030-01-02T13:00:00Z",
            occurredAt = occurrence
        });
    }
}

internal sealed record ObservedNotification(Guid EventId, Guid ReservationId, string UserKey, string EquipmentId, string EquipmentName, string EventType, DateTimeOffset StartAt, DateTimeOffset EndAt, DateTimeOffset OccurredAt, DateTimeOffset ReceivedAt, string Message);

internal sealed class ControlledDeliverySchedule : IRecoverySchedule, IDisposable
{
    private readonly Channel<TimeSpan> delays = Channel.CreateUnbounded<TimeSpan>();
    private readonly SemaphoreSlim advance = new(0);

    public double Jitter()
    {
        return 0.5;
    }

    public async Task DelayAsync(TimeSpan delay, CancellationToken cancellationToken)
    {
        await delays.Writer.WriteAsync(delay, cancellationToken);
        await advance.WaitAsync(cancellationToken);
    }

    public async Task<TimeSpan> NextAsync(CancellationToken cancellationToken)
    {
        return await delays.Reader.ReadAsync(cancellationToken);
    }

    public void Advance()
    {
        _ = advance.Release();
    }

    public void Dispose()
    {
        advance.Dispose();
    }
}

internal sealed class DeliveryLogCapture : ILoggerProvider
{
    public ConcurrentQueue<string> Messages { get; } = new();

    public ILogger CreateLogger(string categoryName)
    {
        return new Capture(Messages);
    }

    public void Dispose()
    {
    }

    private sealed class Capture(ConcurrentQueue<string> messages) : ILogger
    {
        public IDisposable? BeginScope<TState>(TState state) where TState : notnull
        {
            return null;
        }

        public bool IsEnabled(LogLevel logLevel)
        {
            return true;
        }

        public void Log<TState>(LogLevel logLevel, EventId eventId, TState state, Exception? exception, Func<TState, Exception?, string> formatter)
        {
            messages.Enqueue(formatter(state, exception));
        }
    }
}
