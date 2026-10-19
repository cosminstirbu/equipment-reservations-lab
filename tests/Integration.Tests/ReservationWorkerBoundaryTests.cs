using System.Net;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Logging;
using Npgsql;
using RabbitMQ.Client;
using ReservationMessaging;
using Reservations;
using Xunit;

namespace Integration.Tests;

// This collection owns shared broker queues and lifecycle operations. The real
// hosted worker and publisher are retained; only time and retry waits are controlled.
[Collection("Reservation delivery")]
public sealed class ReservationWorkerBoundaryTests(ReservationDeliveryFixture infrastructure)
{
    [Fact]
    public async Task OutboxSchemaFailurePreservesEventUntilRepairedHostRestarts()
    {
        using var deadline = new CancellationTokenSource(TimeSpan.FromSeconds(60));
        await infrastructure.ResetQueueAsync(deadline.Token);
        await using BookingScenario scenario = await BookingScenario.CreateAsync(infrastructure.Postgres);
        BookedReservation original = await BookAsync(scenario, deadline.Token);
        await using NpgsqlCommand breakSchema = scenario.Database.CreateCommand("ALTER TABLE reservation_outbox RENAME TO unavailable_outbox");
        _ = await breakSchema.ExecuteNonQueryAsync(deadline.Token);
        try
        {
            var logs = new DeliveryLogCapture();
            using var schedule = new ControlledDeliverySchedule();
            await using WebApplicationFactory<Reservations.Program> host = Host(scenario, schedule, logs);
            using HttpClient client = host.CreateClient();
            await WaitUntilAsync(() => Task.FromResult(logs.Messages.Any(message => message.Contains("permanent_error", StringComparison.Ordinal))), deadline.Token);

            await using NpgsqlCommand pending = scenario.Database.CreateCommand("SELECT published_at IS NULL AND attempt_count=0 FROM unavailable_outbox WHERE event_id=$1");
            _ = pending.Parameters.AddWithValue(original.ConfirmationEventId);
            Assert.True((bool)(await pending.ExecuteScalarAsync(deadline.Token))!);
            Assert.Equal(1L, await scenario.CountAsync("reservations"));
            await AssertQueueEmptyAsync(deadline.Token);
        }
        finally
        {
            await using NpgsqlCommand repair = scenario.Database.CreateCommand("ALTER TABLE unavailable_outbox RENAME TO reservation_outbox");
            _ = await repair.ExecuteNonQueryAsync(deadline.Token);
        }

        using var repairedSchedule = new ControlledDeliverySchedule();
        await using WebApplicationFactory<Reservations.Program> repaired = Host(scenario, repairedSchedule);
        using HttpClient repairedClient = repaired.CreateClient();
        _ = await repairedSchedule.NextAsync(deadline.Token);
        DeliveryState state = await StateAsync(scenario.Database, original.ConfirmationEventId, deadline.Token);
        Assert.True(state.Published);
        Assert.Equal(1, state.Attempts);
        Assert.Equal(original.ConfirmationEventId, (await ReadDeliveryAsync(deadline.Token)).EventId);
        await AssertQueueEmptyAsync(deadline.Token);
    }

    [Fact]
    public async Task RealBrokerOutageRetriesDurablyAndHostShutdownAllowsRecoveryByRestart()
    {
        using var deadline = new CancellationTokenSource(TimeSpan.FromSeconds(90));
        await infrastructure.ResetQueueAsync(deadline.Token);
        await using BookingScenario scenario = await BookingScenario.CreateAsync(infrastructure.Postgres);
        BookedReservation original = await BookAsync(scenario, deadline.Token);
        await infrastructure.StopBrokerAsync(deadline.Token);
        try
        {
            using var schedule = new ControlledDeliverySchedule();
            await using WebApplicationFactory<Reservations.Program> host = Host(scenario, schedule);
            using HttpClient client = host.CreateClient();
            int attempts = 0;
            foreach (int seconds in new[] { 1, 2, 10 })
            {
                TimeSpan delay = await schedule.NextAsync(deadline.Token);
                Assert.Equal(TimeSpan.FromSeconds(seconds), delay);
                DeliveryState pending = await StateAsync(scenario.Database, original.ConfirmationEventId, deadline.Token);
                Assert.False(pending.Published);
                Assert.Equal(++attempts, pending.Attempts);
                Assert.Equal(ReservationValidation.UtcNow(scenario.Clock) + delay, pending.Due);
                if (seconds != 10)
                {
                    scenario.Clock.Now += delay;
                    schedule.Advance();
                }
            }

            // Disposal must cancel the real hosted worker's pending retry wait.
            await host.DisposeAsync().AsTask().WaitAsync(deadline.Token);
            DeliveryState stopped = await StateAsync(scenario.Database, original.ConfirmationEventId, deadline.Token);
            Assert.False(stopped.Published);
            Assert.Equal(3, stopped.Attempts);
        }
        finally
        {
            using var cleanup = new CancellationTokenSource(TimeSpan.FromSeconds(60));
            await infrastructure.StartBrokerAsync(cleanup.Token);
        }

        scenario.Clock.Now += TimeSpan.FromSeconds(10);
        using var recoveredSchedule = new ControlledDeliverySchedule();
        await using WebApplicationFactory<Reservations.Program> recovered = Host(scenario, recoveredSchedule);
        using HttpClient recoveredClient = recovered.CreateClient();
        _ = await recoveredSchedule.NextAsync(deadline.Token);
        DeliveryState published = await StateAsync(scenario.Database, original.ConfirmationEventId, deadline.Token);
        Assert.True(published.Published);
        Assert.Equal(4, published.Attempts);
        ReservationEvent delivered = await ReadDeliveryAsync(deadline.Token);
        Assert.Equal(original.ConfirmationEventId, delivered.EventId);
        Assert.Equal(original.Id, delivered.ReservationId);
        Assert.Equal(original.StartAt, delivered.StartAt);
        Assert.Equal(original.EndAt, delivered.EndAt);
        await AssertQueueEmptyAsync(deadline.Token);
    }

    [Fact]
    public async Task ShutdownCancelsBlockedOutboxReadWithoutPublishingOrChangingEvent()
    {
        using var deadline = new CancellationTokenSource(TimeSpan.FromSeconds(45));
        await infrastructure.ResetQueueAsync(deadline.Token);
        await using BookingScenario scenario = await BookingScenario.CreateAsync(infrastructure.Postgres);
        BookedReservation original = await BookAsync(scenario, deadline.Token);
        await using NpgsqlConnection connection = await scenario.Database.OpenConnectionAsync(deadline.Token);
        await using NpgsqlTransaction transaction = await connection.BeginTransactionAsync(deadline.Token);
        await using var lockTable = new NpgsqlCommand("LOCK TABLE reservation_outbox IN ACCESS EXCLUSIVE MODE", connection, transaction);
        _ = await lockTable.ExecuteNonQueryAsync(deadline.Token);
        try
        {
            using var schedule = new ControlledDeliverySchedule();
            await using WebApplicationFactory<Reservations.Program> host = Host(scenario, schedule);
            using HttpClient client = host.CreateClient();
            await WaitUntilAsync(async () =>
            {
                await using NpgsqlCommand blocked = scenario.Database.CreateCommand("SELECT EXISTS (SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock')");
                return (bool)(await blocked.ExecuteScalarAsync(deadline.Token))!;
            }, deadline.Token);

            await host.DisposeAsync().AsTask().WaitAsync(deadline.Token);
        }
        finally
        {
            await transaction.RollbackAsync(deadline.Token);
        }

        DeliveryState pending = await StateAsync(scenario.Database, original.ConfirmationEventId, deadline.Token);
        Assert.False(pending.Published);
        Assert.Equal(0, pending.Attempts);
        await AssertQueueEmptyAsync(deadline.Token);
    }

    [Fact]
    public async Task EventsWithoutStoredTraceContextArePublishedWithTheirOriginalIdentities()
    {
        using var deadline = new CancellationTokenSource(TimeSpan.FromSeconds(60));
        await infrastructure.ResetQueueAsync(deadline.Token);
        await using BookingScenario scenario = await BookingScenario.CreateAsync(infrastructure.Postgres);
        BookedReservation original = await BookAsync(scenario, deadline.Token);
        using HttpResponseMessage cancellation = await scenario.Client.PostAsync($"/api/reservations/{original.Id}/cancel", null, deadline.Token);
        Assert.Equal(HttpStatusCode.OK, cancellation.StatusCode);
        BookedReservation cancelled = (await cancellation.Content.ReadFromJsonAsync<BookedReservation>(deadline.Token))!;
        // Represent valid durable records written without an ambient trace. Keep
        // the actual event payloads created by booking and cancellation unchanged.
        await using NpgsqlCommand untrace = scenario.Database.CreateCommand("UPDATE reservation_outbox SET traceparent=NULL,tracestate=NULL");
        Assert.Equal(2, await untrace.ExecuteNonQueryAsync(deadline.Token));
        using var schedule = new ControlledDeliverySchedule();
        await using WebApplicationFactory<Reservations.Program> host = Host(scenario, schedule);
        using HttpClient client = host.CreateClient();
        _ = await schedule.NextAsync(deadline.Token);

        ReservationEvent first = await ReadDeliveryAsync(deadline.Token);
        ReservationEvent second = await ReadDeliveryAsync(deadline.Token);
        Guid[] expectedIdentities = [original.ConfirmationEventId, cancelled.CancellationEventId!.Value];
        Guid[] deliveredIdentities = [first.EventId, second.EventId];
        Assert.Equal(expectedIdentities.Order(), deliveredIdentities.Order());
        ReservationEvent[] delivered = [first, second];
        Assert.All(delivered, message =>
        {
            Assert.Equal(original.Id, message.ReservationId);
            Assert.Equal(original.UserKey, message.UserKey);
            Assert.Equal(original.StartAt, message.StartAt);
            Assert.Equal(original.EndAt, message.EndAt);
        });
        Assert.True((await StateAsync(scenario.Database, first.EventId, deadline.Token)).Published);
        Assert.True((await StateAsync(scenario.Database, second.EventId, deadline.Token)).Published);
        await AssertQueueEmptyAsync(deadline.Token);
    }

    [Fact]
    public async Task InvalidStoredTraceContextIsParkedByRealPublisherAndCanBeRepaired()
    {
        using var deadline = new CancellationTokenSource(TimeSpan.FromSeconds(60));
        await infrastructure.ResetQueueAsync(deadline.Token);
        await using BookingScenario scenario = await BookingScenario.CreateAsync(infrastructure.Postgres);
        BookedReservation original = await BookAsync(scenario, deadline.Token);
        await using NpgsqlCommand corrupt = scenario.Database.CreateCommand("UPDATE reservation_outbox SET traceparent='invalid'");
        Assert.Equal(1, await corrupt.ExecuteNonQueryAsync(deadline.Token));
        using (var schedule = new ControlledDeliverySchedule())
        {
            await using WebApplicationFactory<Reservations.Program> host = Host(scenario, schedule);
            using HttpClient client = host.CreateClient();
            _ = await schedule.NextAsync(deadline.Token);
            DeliveryState parked = await StateAsync(scenario.Database, original.ConfirmationEventId, deadline.Token);
            Assert.False(parked.Published);
            Assert.Equal(1, parked.Attempts);
            Assert.Equal(9999, parked.Due.Year);
            await AssertQueueEmptyAsync(deadline.Token);
        }

        await using NpgsqlCommand repair = scenario.Database.CreateCommand("UPDATE reservation_outbox SET traceparent=NULL,tracestate=NULL,next_attempt_at=$1");
        _ = repair.Parameters.AddWithValue(ReservationValidation.UtcNow(scenario.Clock));
        Assert.Equal(1, await repair.ExecuteNonQueryAsync(deadline.Token));
        using var repairedSchedule = new ControlledDeliverySchedule();
        await using WebApplicationFactory<Reservations.Program> repaired = Host(scenario, repairedSchedule);
        using HttpClient repairedClient = repaired.CreateClient();
        _ = await repairedSchedule.NextAsync(deadline.Token);
        Assert.True((await StateAsync(scenario.Database, original.ConfirmationEventId, deadline.Token)).Published);
        Assert.Equal(original.ConfirmationEventId, (await ReadDeliveryAsync(deadline.Token)).EventId);
        await AssertQueueEmptyAsync(deadline.Token);
    }

    private WebApplicationFactory<Reservations.Program> Host(BookingScenario scenario, ControlledDeliverySchedule schedule, DeliveryLogCapture? logs = null)
    {
        return infrastructure.App<Reservations.Program>(scenario.Database).WithWebHostBuilder(builder => builder.ConfigureServices(services =>
        {
            _ = services.RemoveAll<IRecoverySchedule>();
            _ = services.AddSingleton<IRecoverySchedule>(schedule);
            _ = services.RemoveAll<TimeProvider>();
            _ = services.AddSingleton<TimeProvider>(scenario.Clock);
            if (logs is not null)
            {
                _ = services.AddLogging(logging => logging.AddProvider(logs));
            }
        }));
    }

    private static async Task<BookedReservation> BookAsync(BookingScenario scenario, CancellationToken cancellationToken)
    {
        scenario.Clock.Now = DateTimeOffset.UtcNow;
        using HttpResponseMessage response = await scenario.BookAsync();
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<BookedReservation>(cancellationToken))!;
    }

    private static async Task<DeliveryState> StateAsync(NpgsqlDataSource database, Guid eventId, CancellationToken cancellationToken)
    {
        await using NpgsqlCommand command = database.CreateCommand("SELECT published_at IS NOT NULL,attempt_count,next_attempt_at FROM reservation_outbox WHERE event_id=$1");
        _ = command.Parameters.AddWithValue(eventId);
        await using NpgsqlDataReader reader = await command.ExecuteReaderAsync(cancellationToken);
        Assert.True(await reader.ReadAsync(cancellationToken));
        return new DeliveryState(reader.GetBoolean(0), reader.GetInt32(1), reader.GetFieldValue<DateTimeOffset>(2));
    }

    private async Task<ReservationEvent> ReadDeliveryAsync(CancellationToken cancellationToken)
    {
        await using IConnection connection = await RabbitConnection.Factory(infrastructure.Consumer, TimeSpan.FromSeconds(3)).CreateConnectionAsync(cancellationToken);
        await using IChannel channel = await connection.CreateChannelAsync(cancellationToken: cancellationToken);
        BasicGetResult? delivery = await channel.BasicGetAsync(ReservationTopology.Queue, true, cancellationToken);
        Assert.NotNull(delivery);
        Assert.True(ReservationEventValidation.TryRead(delivery.Body, delivery.RoutingKey, delivery.BasicProperties.ContentType,
            delivery.BasicProperties.MessageId, delivery.BasicProperties.CorrelationId, delivery.BasicProperties.Headers, out ReservationEvent? message, out _));
        Assert.NotNull(message);
        return message;
    }

    private async Task AssertQueueEmptyAsync(CancellationToken cancellationToken)
    {
        await using IConnection connection = await RabbitConnection.Factory(infrastructure.Consumer, TimeSpan.FromSeconds(3)).CreateConnectionAsync(cancellationToken);
        await using IChannel channel = await connection.CreateChannelAsync(cancellationToken: cancellationToken);
        Assert.Null(await channel.BasicGetAsync(ReservationTopology.Queue, true, cancellationToken));
    }

    private static async Task WaitUntilAsync(Func<Task<bool>> observed, CancellationToken cancellationToken)
    {
        using var timer = new PeriodicTimer(TimeSpan.FromMilliseconds(50));
        while (!await observed())
        {
            _ = await timer.WaitForNextTickAsync(cancellationToken);
        }
    }

    private sealed record DeliveryState(bool Published, int Attempts, DateTimeOffset Due);
}
