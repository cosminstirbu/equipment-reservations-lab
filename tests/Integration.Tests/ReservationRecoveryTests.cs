using System.Collections.Concurrent;
using System.Diagnostics;
using System.Diagnostics.Metrics;
using System.Net.Http.Json;
using System.Text.Json;
using System.Threading.Channels;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Logging;
using Notifications;
using Npgsql;
using RabbitMQ.Client;
using RabbitMQ.Client.Events;
using RabbitMQ.Client.Exceptions;
using ReservationMessaging;
using Reservations;
using Xunit;

namespace Integration.Tests;

// Telemetry capture observes process-wide sources, so this class runs exclusively.
[TestClass(DisableParallelization = true)]
[Collection("Database telemetry and recovery")]
public sealed class ReservationRecoveryTests(PostgresFixture postgres)
{
    private static readonly string[] DeliveryDimensions = ["operation", "outcome"];

    [Theory]
    [InlineData("setup", 0)]
    [InlineData("ack", 1)]
    [InlineData("database", 0)]
    public async Task ConsumerDependencyBudgetsCancelAttemptsWithoutFalseAcknowledgement(string dependency, long committedRows)
    {
        await using NpgsqlDataSource database = await postgres.CreateMigratedDatabaseAsync("notifications");
        if (dependency == "database")
        {
            await using NpgsqlCommand stall = database.CreateCommand("CREATE FUNCTION stall_inbox() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN PERFORM pg_sleep(20); RETURN NEW; END $$; CREATE TRIGGER stall_inbox BEFORE INSERT ON reservation_inbox FOR EACH ROW EXECUTE FUNCTION stall_inbox()");
            _ = await stall.ExecuteNonQueryAsync(TestContext.Current.CancellationToken);
        }

        using var schedule = new ControlledSchedule(new TestTimeProvider(DateTimeOffset.UtcNow));
        var boundary = new BudgetSubscription(dependency);
        using WebApplicationFactory<Notifications.Program> host = PostgresFixture.Factory<Notifications.Program>(database).WithWebHostBuilder(builder => builder.ConfigureServices(services =>
        {
            _ = services.RemoveAll<IRecoverySchedule>();
            _ = services.AddSingleton<IRecoverySchedule>(schedule);
            _ = services.RemoveAll<IReservationSubscription>();
            _ = services.AddSingleton<IReservationSubscription>(boundary);
        }));
        using HttpClient client = host.CreateClient();
        using var deadline = new CancellationTokenSource(TimeSpan.FromSeconds(10));
        Assert.Equal(TimeSpan.FromSeconds(1), await schedule.NextAsync(deadline.Token));
        Assert.True(boundary.Cancelled);
        Assert.InRange(boundary.Elapsed.TotalSeconds, dependency == "ack" ? 2.5 : 4.5, dependency == "ack" ? 4.5 : 7.0);
        await using NpgsqlCommand rows = database.CreateCommand("SELECT count(*) FROM reservation_inbox");
        Assert.Equal(committedRows, await rows.ExecuteScalarAsync(deadline.Token));
        Assert.False(boundary.Acknowledged);
    }

    private sealed class BudgetSubscription(string dependency) : IReservationSubscription
    {
        public bool Cancelled
        {
            get; private set;
        }

        public bool Acknowledged
        {
            get; private set;
        }

        public TimeSpan Elapsed
        {
            get; private set;
        }

        public async Task ListenAsync(Func<BrokerDelivery, CancellationToken, Task> receive, Action<bool> readiness, CancellationToken cancellationToken)
        {
            long started = Stopwatch.GetTimestamp();
            try
            {
                if (dependency == "setup")
                {
                    await Task.Delay(Timeout.Infinite, cancellationToken);
                    return;
                }

                readiness(true);
                var occurrence = new DateTimeOffset(2030, 1, 1, 12, 0, 0, TimeSpan.Zero);
                var message = new ReservationEvent(1, Guid.NewGuid(), "ReservationConfirmed", Guid.NewGuid(), new string('a', 64), "camera-001", "Demo Camera", occurrence.AddDays(1), occurrence.AddDays(1).AddHours(1), occurrence);
                byte[] body = JsonSerializer.SerializeToUtf8Bytes(message, ReservationJsonContext.Default.ReservationEvent);
                var delivery = new BrokerDelivery(false, body, "reservation.confirmed", "application/json", message.EventId.ToString(), message.ReservationId.ToString(),
                    new Dictionary<string, object?> { ["schema"] = 1 }, async (accepted, token) =>
                    {
                        await Task.Delay(Timeout.Infinite, token);
                        Acknowledged = accepted;
                    });
                await receive(delivery, cancellationToken);
            }
            catch (OperationCanceledException)
            {
                Cancelled = true;
                throw;
            }
            finally
            {
                Elapsed = Stopwatch.GetElapsedTime(started);
            }
        }
    }

    [Theory]
    [InlineData(false, "retry")]
    [InlineData(true, "permanent_error")]
    public async Task PublishDeliverySignalsFailuresAndRecoveryWithoutLeakingPayload(bool permanent, string expected)
    {
        var outcomes = new ConcurrentQueue<string>();
        var spans = new ConcurrentQueue<Activity>();
        using var metrics = new MeterListener();
        metrics.InstrumentPublished = (instrument, listener) =>
        {
            if (instrument.Name == "reservation.delivery.outcomes")
            {
                listener.EnableMeasurementEvents(instrument);
            }
        };
        metrics.SetMeasurementEventCallback<long>((instrument, value, tags, state) =>
        {
            foreach (KeyValuePair<string, object?> tag in tags)
            {
                Assert.Contains(tag.Key, DeliveryDimensions);
                if (tag.Key == "outcome")
                {
                    outcomes.Enqueue((string)tag.Value!);
                }
            }
        });
        metrics.Start();
        using var traces = new ActivityListener
        {
            ShouldListenTo = source => source.Name == "Equipment.ReservationMessaging",
            Sample = (ref options) => ActivitySamplingResult.AllDataAndRecorded,
            ActivityStopped = activity => spans.Enqueue(activity)
        };
        ActivitySource.AddActivityListener(traces);
        await using BookingScenario scenario = await BookingScenario.CreateAsync(postgres);
        BookedReservation original = (await (await scenario.BookAsync()).Content.ReadFromJsonAsync<BookedReservation>(cancellationToken: TestContext.Current.CancellationToken))!;
        const string parent = "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01";
        await using NpgsqlCommand context = scenario.Database.CreateCommand("UPDATE reservation_outbox SET traceparent=$1");
        _ = context.Parameters.AddWithValue(parent);
        _ = await context.ExecuteNonQueryAsync(TestContext.Current.CancellationToken);
        var boundary = new PublisherBoundary(1, permanent);
        var logs = new DeliveryLogs();
        using var schedule = new ControlledSchedule(scenario.Clock);
        using var deadline = new CancellationTokenSource(TimeSpan.FromSeconds(10));
        using WebApplicationFactory<Reservations.Program> host = PublisherHost(scenario, boundary, schedule)
            .WithWebHostBuilder(builder => builder.ConfigureServices(services => services.AddLogging(logging => logging.AddProvider(logs))));
        using HttpClient client = host.CreateClient();
        _ = await schedule.NextAsync(deadline.Token);
        _ = Assert.Single(boundary.Events);
        Assert.Contains(expected, outcomes);
        Assert.Contains(logs.Messages, message => message.Contains(expected, StringComparison.Ordinal));
        Assert.DoesNotContain(logs.Messages, message => message.Contains("Controlled", StringComparison.Ordinal) || message.Contains("Demo Camera", StringComparison.Ordinal));
        Activity failed = Assert.Single(spans);
        Assert.Equal(parent, failed.ParentId);
        Assert.Equal(ActivityStatusCode.Error, failed.Status);
        Assert.Equal(original.ConfirmationEventId.ToString(), failed.GetTagItem("event.id"));
        Assert.Equal(original.Id.ToString(), failed.GetTagItem("reservation.id"));
        if (!permanent)
        {
            schedule.Advance();
            _ = await schedule.NextAsync(deadline.Token);
            Assert.Contains("published", outcomes);
            Assert.Contains(spans, activity => activity.Status == ActivityStatusCode.Ok);
        }
    }

    [Theory]
    [InlineData(0.0, 0.75, 1.5)]
    [InlineData(0.5, 1.0, 2.0)]
    [InlineData(1.0, 1.25, 2.5)]
    public async Task PublisherRetriesThreeAttemptBurstsWithStablePayloadThenSchedulesNextCycleWithoutHoldingLocks(double random, double first, double second)
    {
        await using BookingScenario scenario = await BookingScenario.CreateAsync(postgres);
        BookedReservation original = (await (await scenario.BookAsync()).Content.ReadFromJsonAsync<BookedReservation>(cancellationToken: TestContext.Current.CancellationToken))!;
        var boundary = new PublisherBoundary(3);
        using var schedule = new ControlledSchedule(scenario.Clock, random);
        using var deadline = new CancellationTokenSource(TimeSpan.FromSeconds(10));
        using WebApplicationFactory<Reservations.Program> host = PublisherHost(scenario, boundary, schedule);
        using HttpClient client = host.CreateClient();
        foreach (double seconds in new[] { first, second, 10.0 })
        {
            TimeSpan delay = await schedule.NextAsync(deadline.Token);
            Assert.Equal(TimeSpan.FromSeconds(seconds), delay);
            await AssertOutboxUnlockedAsync(scenario.Database, deadline.Token);
            Assert.All(boundary.Events, message => Assert.Equal(original.ConfirmationEventId, message.EventId));
            await using NpgsqlCommand pending = scenario.Database.CreateCommand("SELECT published_at IS NULL FROM reservation_outbox");
            Assert.True((bool)(await pending.ExecuteScalarAsync(deadline.Token))!);
            schedule.Advance();
        }

        _ = await schedule.NextAsync(deadline.Token);
        Assert.Equal(4, boundary.Events.Count);
        Assert.All(boundary.Events, message => Assert.Equal(boundary.Events.First(), message));
        await using NpgsqlCommand published = scenario.Database.CreateCommand("SELECT published_at IS NOT NULL FROM reservation_outbox");
        Assert.True((bool)(await published.ExecuteScalarAsync(deadline.Token))!);
    }

    [Theory]
    [InlineData("contract")]
    [InlineData("311")]
    [InlineData("402")]
    [InlineData("403")]
    [InlineData("404")]
    [InlineData("405")]
    [InlineData("406")]
    [InlineData("501")]
    [InlineData("502")]
    [InlineData("503")]
    [InlineData("504")]
    [InlineData("505")]
    [InlineData("530")]
    [InlineData("540")]
    [InlineData("authentication")]
    [InlineData("uri")]
    public async Task PermanentContractFailureStaysPendingAndDoesNotBurstOrFalsePublish(string failure)
    {
        await using BookingScenario scenario = await BookingScenario.CreateAsync(postgres);
        _ = await scenario.BookAsync();
        var boundary = new PublisherBoundary(int.MaxValue, providerFailure: PermanentProviderFailure(failure));
        using var schedule = new ControlledSchedule(scenario.Clock);
        using var deadline = new CancellationTokenSource(TimeSpan.FromSeconds(10));
        using WebApplicationFactory<Reservations.Program> host = PublisherHost(scenario, boundary, schedule);
        using HttpClient client = host.CreateClient();
        Assert.Equal(TimeSpan.FromSeconds(10), await schedule.NextAsync(deadline.Token));
        _ = Assert.Single(boundary.Events);
        await AssertOutboxUnlockedAsync(scenario.Database, deadline.Token);
        await using NpgsqlCommand pending = scenario.Database.CreateCommand("SELECT published_at IS NULL FROM reservation_outbox");
        Assert.True((bool)(await pending.ExecuteScalarAsync(deadline.Token))!);
        schedule.Advance();
        Assert.Equal(TimeSpan.FromSeconds(10), await schedule.NextAsync(deadline.Token));
        _ = Assert.Single(boundary.Events);
        await host.DisposeAsync();

        using var restartedSchedule = new ControlledSchedule(scenario.Clock);
        using WebApplicationFactory<Reservations.Program> restarted = PublisherHost(scenario, boundary, restartedSchedule);
        using HttpClient restartedClient = restarted.CreateClient();
        Assert.Equal(TimeSpan.FromSeconds(10), await restartedSchedule.NextAsync(deadline.Token));
        _ = Assert.Single(boundary.Events);
        await using NpgsqlCommand stillPending = scenario.Database.CreateCommand("SELECT published_at IS NULL FROM reservation_outbox");
        Assert.True((bool)(await stillPending.ExecuteScalarAsync(deadline.Token))!);
        await restarted.DisposeAsync();

        var repaired = new PublisherBoundary(0);
        using var repairedSchedule = new ControlledSchedule(scenario.Clock);
        ReservationEvent original = boundary.Events.Single();
        await using NpgsqlCommand reset = scenario.Database.CreateCommand("UPDATE reservation_outbox SET next_attempt_at=$2 WHERE event_id=$1 AND published_at IS NULL");
        _ = reset.Parameters.AddWithValue(original.EventId);
        _ = reset.Parameters.AddWithValue(scenario.Clock.Now);
        Assert.Equal(1, await reset.ExecuteNonQueryAsync(deadline.Token));
        using WebApplicationFactory<Reservations.Program> repairedHost = PublisherHost(scenario, repaired, repairedSchedule);
        using HttpClient repairedClient = repairedHost.CreateClient();
        _ = await repairedSchedule.NextAsync(deadline.Token);
        Assert.Equal(original, Assert.Single(repaired.Events));
        Assert.Equal(1L, await scenario.CountAsync("reservation_outbox"));
        await using NpgsqlCommand resumed = scenario.Database.CreateCommand("SELECT published_at IS NOT NULL FROM reservation_outbox WHERE event_id=$1");
        _ = resumed.Parameters.AddWithValue(original.EventId);
        Assert.True((bool)(await resumed.ExecuteScalarAsync(deadline.Token))!);
    }

    [Theory]
    [InlineData("postgres_auth")]
    [InlineData("postgres_permission")]
    [InlineData("postgres_table")]
    [InlineData("postgres_catalog")]
    [InlineData("postgres_schema")]
    public async Task PermanentOwnDatabaseFailureDuringPublicationHaltsWithoutParkingUntilRepairedRestart(string failure)
    {
        var spans = new ConcurrentQueue<Activity>();
        using var traces = new ActivityListener
        {
            ShouldListenTo = source => source.Name == "Equipment.ReservationMessaging",
            Sample = (ref options) => ActivitySamplingResult.AllDataAndRecorded,
            ActivityStopped = activity => spans.Enqueue(activity)
        };
        ActivitySource.AddActivityListener(traces);
        await using BookingScenario scenario = await BookingScenario.CreateAsync(postgres);
        BookedReservation original = (await (await scenario.BookAsync()).Content.ReadFromJsonAsync<BookedReservation>(cancellationToken: TestContext.Current.CancellationToken))!;
        var failed = new PublisherBoundary(int.MaxValue, providerFailure: PermanentProviderFailure(failure));
        var logs = new DeliveryLogs();
        using var schedule = new ControlledSchedule(scenario.Clock);
        using WebApplicationFactory<Reservations.Program> host = PublisherHost(scenario, failed, schedule)
            .WithWebHostBuilder(builder => builder.ConfigureServices(services => services.AddLogging(logging => logging.AddProvider(logs))));
        using HttpClient client = host.CreateClient();
        using var observation = new CancellationTokenSource(TimeSpan.FromSeconds(1));
        _ = await Assert.ThrowsAnyAsync<OperationCanceledException>(() => schedule.NextAsync(observation.Token));
        ReservationEvent snapshot = Assert.Single(failed.Events);
        Assert.Equal(original.ConfirmationEventId, snapshot.EventId);
        Assert.Equal(ActivityStatusCode.Error, Assert.Single(spans).Status);
        Assert.Contains(logs.Messages, message => message.Contains("permanent_error", StringComparison.Ordinal));
        Assert.DoesNotContain(logs.Messages, message => message.Contains("Controlled", StringComparison.Ordinal));
        await using NpgsqlCommand pending = scenario.Database.CreateCommand("SELECT published_at IS NULL AND attempt_count=0 AND next_attempt_at < '9999-12-31T23:59:59.999999Z'::timestamptz FROM reservation_outbox WHERE event_id=$1");
        _ = pending.Parameters.AddWithValue(snapshot.EventId);
        Assert.True((bool)(await pending.ExecuteScalarAsync(TestContext.Current.CancellationToken))!);
        await host.DisposeAsync();
        var repaired = new PublisherBoundary(0);
        using var repairedSchedule = new ControlledSchedule(scenario.Clock);
        using WebApplicationFactory<Reservations.Program> repairedHost = PublisherHost(scenario, repaired, repairedSchedule);
        using HttpClient repairedClient = repairedHost.CreateClient();
        using var deadline = new CancellationTokenSource(TimeSpan.FromSeconds(10));
        _ = await repairedSchedule.NextAsync(deadline.Token);
        Assert.Equal(snapshot, Assert.Single(repaired.Events));
        Assert.Equal(1L, await scenario.CountAsync("reservation_outbox"));
    }

    [Fact]
    public async Task PublisherAttemptHasThreeSecondBudgetAndHostDisposalCancelsBackoff()
    {
        await using BookingScenario scenario = await BookingScenario.CreateAsync(postgres);
        _ = await scenario.BookAsync();
        var boundary = new PublisherBoundary(int.MaxValue, stall: true);
        using var schedule = new ControlledSchedule(scenario.Clock);
        using var deadline = new CancellationTokenSource(TimeSpan.FromSeconds(10));
        WebApplicationFactory<Reservations.Program> host = PublisherHost(scenario, boundary, schedule);
        using HttpClient client = host.CreateClient();
        try
        {
            Assert.Equal(TimeSpan.FromSeconds(1), await schedule.NextAsync(deadline.Token));
            _ = Assert.Single(boundary.Events);
            Assert.True(boundary.AttemptCancelled);
            await AssertOutboxUnlockedAsync(scenario.Database, deadline.Token);
        }
        finally
        {
            await host.DisposeAsync().AsTask().WaitAsync(TimeSpan.FromSeconds(2), TestContext.Current.CancellationToken);
        }

        Assert.True(schedule.Cancelled);
    }

    [Theory]
    [InlineData(false, "transport")]
    [InlineData(true, "transport")]
    [InlineData(false, "320")]
    [InlineData(false, "506")]
    [InlineData(false, "541")]
    [InlineData(false, "nested_transport")]
    [InlineData(false, "possible_authentication")]
    [InlineData(false, "postgres_connection")]
    public async Task ConsumerReconnectsInBoundedJitteredBurstsAndDisposesPendingBackoff(bool connectedBeforeFailure, string failure)
    {
        await using NpgsqlDataSource database = await postgres.CreateMigratedDatabaseAsync("notifications");
        var clock = new TestTimeProvider(DateTimeOffset.UtcNow);
        using var schedule = new ControlledSchedule(clock);
        var boundary = new SubscriptionBoundary(connectedBeforeFailure, providerFailure: TransientProviderFailure(failure));
        using var deadline = new CancellationTokenSource(TimeSpan.FromSeconds(10));
        WebApplicationFactory<Notifications.Program> host = PostgresFixture.Factory<Notifications.Program>(database).WithWebHostBuilder(builder => builder.ConfigureServices(services =>
        {
            _ = services.RemoveAll<IRecoverySchedule>();
            _ = services.AddSingleton<IRecoverySchedule>(schedule);
            _ = services.RemoveAll<IReservationSubscription>();
            _ = services.AddSingleton<IReservationSubscription>(boundary);
        }));
        using HttpClient client = host.CreateClient();
        try
        {
            foreach (int seconds in new[] { 1, 2, 10 })
            {
                Assert.Equal(TimeSpan.FromSeconds(seconds), await schedule.NextAsync(deadline.Token));
                schedule.Advance();
            }

            Assert.Equal(TimeSpan.FromSeconds(1), await schedule.NextAsync(deadline.Token));
            Assert.Equal(4, boundary.Attempts);
        }
        finally
        {
            await host.DisposeAsync().AsTask().WaitAsync(TimeSpan.FromSeconds(2), TestContext.Current.CancellationToken);
        }

        Assert.True(schedule.Cancelled);
    }

    private static WebApplicationFactory<Reservations.Program> PublisherHost(BookingScenario scenario, PublisherBoundary boundary, ControlledSchedule schedule)
    {
        return scenario.App.WithWebHostBuilder(builder =>
        {
            _ = builder.ConfigureAppConfiguration((context, configuration) =>
            {
                _ = configuration.AddInMemoryCollection(new Dictionary<string, string?> { ["ConnectionStrings:messaging"] = "amqp://fixture:fixture@127.0.0.1:1/" });
            });
            _ = builder.ConfigureServices(services =>
            {
                _ = services.RemoveAll<IReservationPublisher>();
                _ = services.AddSingleton<IReservationPublisher>(boundary);
                _ = services.RemoveAll<IRecoverySchedule>();
                _ = services.AddSingleton<IRecoverySchedule>(schedule);
            });
        });
    }

    [Fact]
    public async Task PermanentOutboxSelectionSchemaFailureStopsUntilRepairedRestartWithoutChangingEvent()
    {
        await using BookingScenario scenario = await BookingScenario.CreateAsync(postgres);
        BookedReservation original = (await (await scenario.BookAsync()).Content.ReadFromJsonAsync<BookedReservation>(cancellationToken: TestContext.Current.CancellationToken))!;
        await using NpgsqlCommand breakSchema = scenario.Database.CreateCommand("ALTER TABLE reservation_outbox RENAME TO unavailable_outbox");
        _ = await breakSchema.ExecuteNonQueryAsync(TestContext.Current.CancellationToken);
        await using NpgsqlCommand probe = scenario.Database.CreateCommand("SELECT event_id FROM reservation_outbox");
        PostgresException provider = await Assert.ThrowsAsync<PostgresException>(probe.ExecuteScalarAsync);
        Assert.Equal("42P01", provider.SqlState);
        var publisher = new PublisherBoundary(0);
        var logs = new DeliveryLogs();
        using var schedule = new ControlledSchedule(scenario.Clock);
        using WebApplicationFactory<Reservations.Program> host = PublisherHost(scenario, publisher, schedule)
            .WithWebHostBuilder(builder => builder.ConfigureServices(services => services.AddLogging(logging => logging.AddProvider(logs))));
        using HttpClient client = host.CreateClient();
        using var observation = new CancellationTokenSource(TimeSpan.FromSeconds(1));
        _ = await Assert.ThrowsAnyAsync<OperationCanceledException>(() => schedule.NextAsync(observation.Token));
        Assert.Contains(logs.Messages, message => message.Contains("permanent_error", StringComparison.Ordinal));
        Assert.DoesNotContain(logs.Messages, message => message.Contains("unavailable_outbox", StringComparison.Ordinal));
        Assert.Empty(publisher.Events);
        Assert.Equal(1L, await scenario.CountAsync("reservations"));
        await using NpgsqlCommand pending = scenario.Database.CreateCommand("SELECT published_at IS NULL FROM unavailable_outbox WHERE event_id=$1");
        _ = pending.Parameters.AddWithValue(original.ConfirmationEventId);
        Assert.True((bool)(await pending.ExecuteScalarAsync(TestContext.Current.CancellationToken))!);
        await host.DisposeAsync();
        await using NpgsqlCommand repair = scenario.Database.CreateCommand("ALTER TABLE unavailable_outbox RENAME TO reservation_outbox");
        _ = await repair.ExecuteNonQueryAsync(TestContext.Current.CancellationToken);
        using var repairedSchedule = new ControlledSchedule(scenario.Clock);
        using WebApplicationFactory<Reservations.Program> repaired = PublisherHost(scenario, publisher, repairedSchedule);
        using HttpClient repairedClient = repaired.CreateClient();
        using var deadline = new CancellationTokenSource(TimeSpan.FromSeconds(10));
        _ = await repairedSchedule.NextAsync(deadline.Token);
        Assert.Equal(original.ConfirmationEventId, Assert.Single(publisher.Events).EventId);
        Assert.Equal(original.StartAt, publisher.Events.Single().StartAt);
        Assert.Equal(original.EndAt, publisher.Events.Single().EndAt);
        Assert.Equal(1L, await scenario.CountAsync("reservation_outbox"));
    }

    [Theory]
    [InlineData("contract")]
    [InlineData("311")]
    [InlineData("402")]
    [InlineData("403")]
    [InlineData("404")]
    [InlineData("405")]
    [InlineData("406")]
    [InlineData("501")]
    [InlineData("502")]
    [InlineData("503")]
    [InlineData("504")]
    [InlineData("505")]
    [InlineData("530")]
    [InlineData("540")]
    [InlineData("authentication")]
    [InlineData("uri")]
    [InlineData("postgres_auth")]
    [InlineData("postgres_permission")]
    [InlineData("postgres_table")]
    [InlineData("postgres_catalog")]
    [InlineData("postgres_schema")]
    public async Task PermanentConsumerConfigurationDoesNotRetryScheduledCycles(string failure)
    {
        await using NpgsqlDataSource database = await postgres.CreateMigratedDatabaseAsync("notifications");
        using var schedule = new ControlledSchedule(new TestTimeProvider(DateTimeOffset.UtcNow));
        var boundary = new SubscriptionBoundary(false, providerFailure: PermanentProviderFailure(failure));
        var logs = new DeliveryLogs();
        using WebApplicationFactory<Notifications.Program> host = PostgresFixture.Factory<Notifications.Program>(database).WithWebHostBuilder(builder => builder.ConfigureServices(services =>
        {
            _ = services.RemoveAll<IRecoverySchedule>();
            _ = services.AddSingleton<IRecoverySchedule>(schedule);
            _ = services.RemoveAll<IReservationSubscription>();
            _ = services.AddSingleton<IReservationSubscription>(boundary);
            _ = services.AddLogging(logging => logging.AddProvider(logs));
        }));
        using HttpClient client = host.CreateClient();
        using var deadline = new CancellationTokenSource(TimeSpan.FromSeconds(10));
        Assert.Equal(TimeSpan.FromSeconds(10), await schedule.NextAsync(deadline.Token));
        Assert.Contains(logs.Messages, message => message.Contains("permanent_error", StringComparison.Ordinal));
        Assert.DoesNotContain(logs.Messages, message => message.Contains("Controlled", StringComparison.Ordinal));
        schedule.Advance();
        using var observation = new CancellationTokenSource(TimeSpan.FromMilliseconds(300));
        _ = await Assert.ThrowsAnyAsync<OperationCanceledException>(() => schedule.NextAsync(observation.Token));
        Assert.Equal(1, boundary.Attempts);
    }

    private static async Task AssertOutboxUnlockedAsync(NpgsqlDataSource database, CancellationToken cancellationToken)
    {
        await using NpgsqlConnection connection = await database.OpenConnectionAsync(cancellationToken);
        await using NpgsqlTransaction transaction = await connection.BeginTransactionAsync(cancellationToken);
        await using var command = new NpgsqlCommand("SELECT event_id FROM reservation_outbox FOR UPDATE NOWAIT", connection, transaction);
        Assert.NotNull(await command.ExecuteScalarAsync(cancellationToken));
    }

    private static Exception PermanentProviderFailure(string failure)
    {
        return failure switch
        {
            "contract" => new InvalidDataException("Controlled permanent contract failure"),
            "authentication" => new BrokerUnreachableException(new AggregateException(new IOException("Controlled transport outage"), new AuthenticationFailureException("Controlled credential rejection"))),
            "uri" => new UriFormatException("Controlled invalid broker URI"),
            "postgres_auth" => new PostgresException("Controlled authentication configuration", "ERROR", "ERROR", "28P01"),
            "postgres_permission" => new PostgresException("Controlled permission configuration", "ERROR", "ERROR", "42501"),
            "postgres_table" => new PostgresException("Controlled table configuration", "ERROR", "ERROR", "42P01"),
            "postgres_catalog" => new PostgresException("Controlled catalog configuration", "ERROR", "ERROR", "3D000"),
            "postgres_schema" => new PostgresException("Controlled schema configuration", "ERROR", "ERROR", "3F000"),
            _ => new OperationInterruptedException(new ShutdownEventArgs(ShutdownInitiator.Peer, ushort.Parse(failure, System.Globalization.CultureInfo.InvariantCulture), "Controlled permanent protocol configuration", 50, 10))
        };
    }

    private static Exception TransientProviderFailure(string failure)
    {
        return failure switch
        {
            "transport" => new IOException("Controlled transport outage"),
            "nested_transport" => new BrokerUnreachableException(new AggregateException(new IOException("Controlled connection outage"))),
            "possible_authentication" => new PossibleAuthenticationFailureException("Controlled uncertain handshake interruption"),
            "postgres_connection" => new PostgresException("Controlled connection failure", "ERROR", "ERROR", "08006"),
            _ => new OperationInterruptedException(new ShutdownEventArgs(ShutdownInitiator.Peer, ushort.Parse(failure, System.Globalization.CultureInfo.InvariantCulture), "Controlled transient protocol outcome", 0, 0))
        };
    }

    private sealed class PublisherBoundary(int failures, bool permanent = false, bool stall = false, Exception? providerFailure = null) : IReservationPublisher
    {
        public ConcurrentQueue<ReservationEvent> Events { get; } = new();

        public bool AttemptCancelled
        {
            get; private set;
        }

        public async Task PublishAsync(ReservationEvent message, string? traceparent, string? tracestate, CancellationToken cancellationToken)
        {
            Events.Enqueue(message);
            if (stall)
            {
                try
                {
                    await Task.Delay(Timeout.Infinite, cancellationToken);
                }
                catch (OperationCanceledException)
                {
                    AttemptCancelled = true;
                    throw;
                }
            }

            if (Events.Count <= failures)
            {
                if (providerFailure is not null)
                {
                    throw providerFailure;
                }

                if (permanent)
                {
                    throw new InvalidDataException("Controlled permanent contract failure");
                }

                throw new IOException("Controlled uncertain broker outcome");
            }
        }
    }

    private sealed class DeliveryLogs : ILoggerProvider
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

    private sealed class SubscriptionBoundary(bool connectedBeforeFailure, bool permanent = false, Exception? providerFailure = null) : IReservationSubscription
    {
        public int Attempts
        {
            get; private set;
        }

        public Task ListenAsync(Func<BrokerDelivery, CancellationToken, Task> receive, Action<bool> readiness, CancellationToken cancellationToken)
        {
            Attempts++;
            if (connectedBeforeFailure)
            {
                readiness(true);
            }

            if (permanent)
            {
                throw new InvalidOperationException("Controlled permanent configuration failure");
            }

            if (providerFailure is not null)
            {
                throw providerFailure;
            }

            throw new IOException("Controlled broker setup failure");
        }
    }

    private sealed class ControlledSchedule(TestTimeProvider clock, double random = 0.5) : IRecoverySchedule, IDisposable
    {
        private readonly Channel<TimeSpan> delays = Channel.CreateUnbounded<TimeSpan>();
        private readonly SemaphoreSlim steps = new(0);

        public bool Cancelled
        {
            get; private set;
        }

        public double Jitter()
        {
            return random;
        }

        public async Task DelayAsync(TimeSpan delay, CancellationToken cancellationToken)
        {
            await delays.Writer.WriteAsync(delay, cancellationToken);
            try
            {
                await steps.WaitAsync(cancellationToken);
                clock.Now += delay;
            }
            catch (OperationCanceledException)
            {
                Cancelled = true;
                throw;
            }
        }

        public async Task<TimeSpan> NextAsync(CancellationToken cancellationToken)
        {
            return await delays.Reader.ReadAsync(cancellationToken);
        }

        public void Advance()
        {
            _ = steps.Release();
        }

        public void Dispose()
        {
            steps.Dispose();
        }
    }
}
