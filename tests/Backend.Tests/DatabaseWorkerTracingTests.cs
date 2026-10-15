using System.Diagnostics;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Notifications;
using Npgsql;
using ReservationMessaging;
using Reservations;
using Xunit;

namespace Backend.Tests;

[Collection("PostgreSQL")]
public sealed class DatabaseWorkerTracingTests(PostgresFixture postgres)
{
    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task OutboxSpansSeparatePollingFromPropagatedPublicationAndIncludeReschedule(bool fail)
    {
        await using NpgsqlDataSource fixture = await postgres.CreateMigratedDatabaseAsync("reservations");
        var clock = new TestTimeProvider(new DateTimeOffset(2030, 1, 1, 0, 0, 0, TimeSpan.Zero));
        var store = new ReservationStore(fixture, clock);
        _ = await store.ConfirmAsync(new ReservationInterval("camera-001", clock.Now.AddDays(1), clock.Now.AddDays(1).AddHours(1)), "Demo Camera", CancellationToken.None);
        const string parent = "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01";
        await using (NpgsqlCommand seedContext = fixture.CreateCommand("UPDATE reservation_outbox SET traceparent=$1"))
        {
            _ = seedContext.Parameters.AddWithValue(parent);
            _ = await seedContext.ExecuteNonQueryAsync();
        }

        using var capture = new DatabaseTelemetryCapture();
        var schedule = new PollGate();
        using WebApplicationFactory<Reservations.Program> host = capture.App<Reservations.Program>("reservations", postgres.ConnectionStringFor(fixture))
            .WithWebHostBuilder(builder =>
            {
                _ = builder.ConfigureAppConfiguration((_, config) => config.AddInMemoryCollection(new Dictionary<string, string?> { ["ConnectionStrings:messaging"] = "amqp://unused" }));
                _ = builder.ConfigureServices(services =>
                {
                    _ = services.RemoveAll<IReservationPublisher>();
                    _ = services.AddSingleton<IReservationPublisher>(new Publisher(fail));
                    _ = services.RemoveAll<IRecoverySchedule>();
                    _ = services.AddSingleton<IRecoverySchedule>(schedule);
                    _ = services.RemoveAll<TimeProvider>();
                    _ = services.AddSingleton<TimeProvider>(clock);
                });
            });
        _ = host.CreateClient();
        await schedule.Reached.Task.WaitAsync(TimeSpan.FromSeconds(10));
        await host.DisposeAsync();

        DatabaseSpan publication = Assert.Single(capture.Spans.Values, span => span.Name == "reservation.publish");
        Assert.Equal(ActivityTraceId.CreateFromString("4bf92f3577b34da6a3ce929d0e0e4736"), publication.TraceId);
        foreach (string operation in new[] { "outbox.snapshot", "outbox.select" })
        {
            DatabaseSpan[] polling = [.. capture.Spans.Values.Where(span => Equals(span.Tags.GetValueOrDefault("db.operation.name"), operation))];
            Assert.NotEmpty(polling);
            Assert.All(polling, span => Assert.NotEqual(publication.TraceId, span.TraceId));
        }

        DatabaseSpan update = Assert.Single(capture.Spans.Values, span => Equals(span.Tags.GetValueOrDefault("db.operation.name"), fail ? "outbox.reschedule" : "outbox.published"));
        Assert.Equal(publication.SpanId, update.ParentSpanId);
        Assert.Equal(publication.TraceId, update.TraceId);
        if (!fail)
        {
            Assert.Equal(2, capture.Spans.Values.Count(span => Equals(span.Tags.GetValueOrDefault("db.operation.name"), "outbox.select")));
        }
    }

    [Fact]
    public async Task InboxInsertDedupAndHistoryRetainActualConsumerContextAndHealthVisibility()
    {
        await using NpgsqlDataSource fixture = await postgres.CreateMigratedDatabaseAsync("notifications");
        var now = new DateTimeOffset(2030, 1, 1, 0, 0, 0, TimeSpan.Zero);
        var message = new ReservationEvent(1, Guid.NewGuid(), "ReservationConfirmed", Guid.NewGuid(), "demo-user", "camera-001", "Demo Camera", now.AddDays(1), now.AddDays(2), now);
        var subscription = new Subscription(message);
        using var capture = new DatabaseTelemetryCapture();
        using WebApplicationFactory<Notifications.Program> host = capture.App<Notifications.Program>("notifications", postgres.ConnectionStringFor(fixture))
            .WithWebHostBuilder(builder => builder.ConfigureServices(services =>
            {
                _ = services.RemoveAll<IReservationSubscription>();
                _ = services.AddSingleton<IReservationSubscription>(subscription);
            }));
        using HttpClient client = host.CreateClient();
        await subscription.Completed.Task.WaitAsync(TimeSpan.FromSeconds(10));
        _ = Assert.Single(await host.Services.GetRequiredService<ReservationInbox>().ListAsync(CancellationToken.None));
        Assert.True((await client.GetAsync("/api/notifications")).IsSuccessStatusCode);
        _ = await client.GetAsync("/health");
        await host.DisposeAsync();
        DatabaseSpan[] consumers = [.. capture.Spans.Values.Where(span => span.Name == "reservation.consume")];
        Assert.Equal(2, consumers.Length);
        Assert.All(consumers, consumer => Assert.Equal(ActivityTraceId.CreateFromString("4bf92f3577b34da6a3ce929d0e0e4736"), consumer.TraceId));
        DatabaseSpan[] inserted = [.. capture.Spans.Values.Where(span => Equals(span.Tags.GetValueOrDefault("db.operation.name"), "inbox.insert"))];
        Assert.Equal(2, inserted.Length);
        Assert.All(inserted, span => Assert.Contains(consumers, consumer => consumer.SpanId == span.ParentSpanId && consumer.TraceId == span.TraceId));
        Assert.Contains(capture.Spans.Values, span => Equals(span.Tags.GetValueOrDefault("db.operation.name"), "inbox.list"));
        Assert.Contains(capture.Spans.Values, span => Equals(span.Tags.GetValueOrDefault("db.operation.name"), "database.health"));
    }

    private sealed class Subscription(ReservationEvent message) : IReservationSubscription
    {
        public TaskCompletionSource Completed { get; } = new(TaskCreationOptions.RunContinuationsAsynchronously);

        public async Task ListenAsync(Func<BrokerDelivery, CancellationToken, Task> receive, Action<bool> readiness, CancellationToken cancellationToken)
        {
            readiness(true);
            byte[] body = JsonSerializer.SerializeToUtf8Bytes(message, ReservationJsonContext.Default.ReservationEvent);
            var headers = new Dictionary<string, object?>
            {
                ["schema"] = 1,
                ["traceparent"] = "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01"
            };
            for (int attempt = 0; attempt < 2; attempt++)
            {
                var delivery = new BrokerDelivery(false, body, "reservation.confirmed", "application/json", message.EventId.ToString(), message.ReservationId.ToString(),
                    headers, (accepted, _) =>
                    {
                        Assert.True(accepted);
                        return Task.CompletedTask;
                    });
                await receive(delivery, cancellationToken);
            }

            _ = Completed.TrySetResult();
            await Task.Delay(Timeout.InfiniteTimeSpan, cancellationToken);
        }
    }

    private sealed class Publisher(bool fail) : IReservationPublisher
    {
        public Task PublishAsync(ReservationEvent message, string? traceparent, string? tracestate, CancellationToken cancellationToken)
        {
            return fail ? Task.FromException(new IOException("Controlled publication failure")) : Task.CompletedTask;
        }
    }

    private sealed class PollGate : IRecoverySchedule
    {
        public TaskCompletionSource Reached { get; } = new(TaskCreationOptions.RunContinuationsAsynchronously);

        public double Jitter()
        {
            return 0.5;
        }

        public async Task DelayAsync(TimeSpan delay, CancellationToken cancellationToken)
        {
            _ = Reached.TrySetResult();
            await Task.Delay(Timeout.InfiniteTimeSpan, cancellationToken);
        }
    }
}
