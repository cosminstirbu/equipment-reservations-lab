using System.Collections.Concurrent;
using System.Diagnostics;
using System.Diagnostics.Metrics;
using System.Threading.Channels;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Npgsql;
using OpenTelemetry.Metrics;
using ReservationMessaging;
using Reservations;
using Xunit;

namespace Integration.Tests;

// Production exporters and application meters observe process-wide providers, so capture requires exclusivity.
[TestClass(DisableParallelization = true)]
[Collection("Database telemetry and recovery")]
public sealed class OutboxNotificationTelemetryTests(PostgresFixture postgres)
{
    private static readonly string[] WakeCauses = ["notification", "retry", "fallback", "degraded_poll", "startup", "reconnect"];
    private static readonly string[] ListenerOutcomes = ["listening", "unavailable", "recovered", "permanent_error", "cancelled"];
    private static readonly string[] IdleOperations = ["outbox.snapshot", "outbox.select"];

    [Fact]
    public async Task ProductionExportAdmitsListenAndSnapshotIgnoresSpoofPayloadAndPreservesEventParent()
    {
        await using NpgsqlDataSource database = await postgres.CreateMigratedDatabaseAsync("reservations");
        var clock = new TestTimeProvider(new DateTimeOffset(2030, 1, 1, 0, 0, 0, TimeSpan.Zero));
        using var capture = new DatabaseTelemetryCapture();
        using var metrics = new OutboxMeasurements();
        using var schedule = new ScanSchedule();
        var publisher = new RecordingPublisher();
        using WebApplicationFactory<Reservations.Program> host = CreateHost(database, capture, schedule, clock, publisher);
        using HttpClient client = host.CreateClient();
        _ = await schedule.NextAsync();

        DatabaseSpan listen = Assert.Single(capture.Spans.Values, span => Operation(span) == "outbox.listen" && span.Source == "Npgsql");
        Assert.Equal("postgresql.outbox.listen", listen.Name);
        Assert.Equal("LISTEN reservation_outbox_changed", listen.Tags.GetValueOrDefault("db.query.text"));
        Assert.Contains(capture.Spans.Values, span => span.Source != "Npgsql" && span.SpanId == listen.ParentSpanId && span.TraceId == listen.TraceId);
        Assert.NotEqual(ActivityStatusCode.Error, listen.Status);

        const string secret = "spoof-payload-private@example.invalid";
        await using (NpgsqlCommand spoof = database.CreateCommand("SELECT pg_notify('reservation_outbox_changed', $1)"))
        {
            _ = spoof.Parameters.AddWithValue(secret);
            _ = await spoof.ExecuteNonQueryAsync(TestContext.Current.CancellationToken);
        }

        _ = await schedule.NextAsync();
        Assert.Empty(publisher.Events);
        Assert.Contains(metrics.Values, value => value.Name == "reservation.outbox.wakeups" && value.Tags.Contains(new("cause", "notification")));

        const string parent = "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01";
        using (Activity workflow = new Activity("fixture.confirm").SetParentId(parent).Start())
        {
            var store = new ReservationStore(database, clock);
            _ = await store.ConfirmAsync(new ReservationInterval("camera-001", clock.Now.AddDays(1), clock.Now.AddDays(1).AddHours(1)), "Demo Camera", new string('a', 64), TestContext.Current.CancellationToken);
        }

        _ = await schedule.NextAsync();
        _ = host.Services.GetRequiredService<MeterProvider>().ForceFlush();
        await host.DisposeAsync();
        DatabaseSpan unlisten = Assert.Single(capture.Spans.Values, span => Operation(span) == "outbox.unlisten" && span.Source == "Npgsql");
        Assert.Equal("postgresql.outbox.unlisten", unlisten.Name);
        Assert.Equal("UNLISTEN reservation_outbox_changed", unlisten.Tags.GetValueOrDefault("db.query.text"));
        Assert.NotEqual(ActivityStatusCode.Error, unlisten.Status);
        _ = Assert.Single(publisher.Events);
        DatabaseSpan publication = Assert.Single(capture.Spans.Values, span => span.Name == "reservation.publish");
        Assert.Equal(ActivityTraceId.CreateFromString("4bf92f3577b34da6a3ce929d0e0e4736"), publication.TraceId);
        Assert.Equal(publisher.Events.Single().Parent, "00-" + publication.TraceId + "-" + publication.ParentSpanId + "-01");
        Assert.NotEqual(publication.TraceId, listen.TraceId);
        Assert.Contains(capture.Spans.Values, span => Operation(span) == "outbox.snapshot" && span.Tags.GetValueOrDefault("db.query.text") is string sql && sql.Contains("min(next_attempt_at)", StringComparison.Ordinal) && sql.Contains("$1", StringComparison.Ordinal));
        Assert.Contains(metrics.Values, value => value.Name == "reservation.outbox.listener.transitions" && value.Tags.Contains(new("outcome", "listening")));
        Assert.Contains(capture.Fields, value => value == "reservation.outbox.wakeups");
        Assert.All(metrics.Values, value =>
        {
            string dimension = value.Name == "reservation.outbox.wakeups" ? "cause" : "outcome";
            KeyValuePair<string, object?> tag = Assert.Single(value.Tags);
            Assert.Equal(dimension, tag.Key);
            Assert.Contains(Assert.IsType<string>(tag.Value), dimension == "cause" ? WakeCauses : ListenerOutcomes);
        });
        Assert.DoesNotContain(capture.AllFields, value => value.Contains(secret, StringComparison.Ordinal));
        Assert.DoesNotContain(capture.AllFields, value => value.Contains(postgres.ConnectionStringFor(database), StringComparison.Ordinal));
        Assert.Null(capture.Spans.Failure);
    }

    [Fact]
    public async Task FailedRevisedSnapshotExportsAdmittedSqlAndSanitizedProviderException()
    {
        await using NpgsqlDataSource database = await postgres.CreateMigratedDatabaseAsync("reservations");
        const string secret = "private_outbox_fault";
        await using (NpgsqlCommand fault = database.CreateCommand("ALTER TABLE reservation_outbox RENAME TO " + secret))
        {
            _ = await fault.ExecuteNonQueryAsync(TestContext.Current.CancellationToken);
        }

        var clock = new TestTimeProvider(DateTimeOffset.UtcNow);
        using var capture = new DatabaseTelemetryCapture();
        using var schedule = new ScanSchedule();
        var publisher = new RecordingPublisher();
        using WebApplicationFactory<Reservations.Program> host = CreateHost(database, capture, schedule, clock, publisher);
        using HttpClient client = host.CreateClient();
        using var deadline = CancellationTokenSource.CreateLinkedTokenSource(TestContext.Current.CancellationToken);
        deadline.CancelAfter(TimeSpan.FromSeconds(10));
        while (!capture.Spans.Values.Any(span => Operation(span) == "outbox.snapshot" && span.Status == ActivityStatusCode.Error))
        {
            await Task.Delay(10, deadline.Token);
        }

        await host.DisposeAsync();
        DatabaseSpan failed = Assert.Single(capture.Spans.Values, span => Operation(span) == "outbox.snapshot" && span.Status == ActivityStatusCode.Error);
        Assert.Equal("Npgsql", failed.Source);
        Assert.Equal("postgresql.outbox.snapshot", failed.Name);
        Assert.Equal("42P01", failed.Tags.GetValueOrDefault("error.type"));
        Assert.Contains("min(next_attempt_at)", Assert.IsType<string>(failed.Tags.GetValueOrDefault("db.query.text")), StringComparison.Ordinal);
        Assert.Contains("exception", failed.Fields);
        Assert.Contains("exception.message=Database operation failed", failed.Fields);
        Assert.Contains("exception.stacktrace=[redacted]", failed.Fields);
        Assert.DoesNotContain(capture.AllFields, value => value.Contains(secret, StringComparison.Ordinal));
        Assert.Empty(publisher.Events);
        Assert.Null(capture.Spans.Failure);
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task NinetySecondsOfHealthyIdleHasSixStatementsAndNoHiddenQueriesOrLockedRowSpin(bool peerLocksDueRow)
    {
        await using NpgsqlDataSource database = await postgres.CreateMigratedDatabaseAsync("reservations");
        var clock = new TestTimeProvider(new DateTimeOffset(2030, 1, 1, 0, 0, 0, TimeSpan.Zero));
        await using NpgsqlConnection peer = await database.OpenConnectionAsync(TestContext.Current.CancellationToken);
        await using NpgsqlTransaction transaction = await peer.BeginTransactionAsync(TestContext.Current.CancellationToken);
        if (peerLocksDueRow)
        {
            var store = new ReservationStore(database, clock);
            _ = await store.ConfirmAsync(new ReservationInterval("camera-001", clock.Now.AddDays(1), clock.Now.AddDays(1).AddHours(1)), "Demo Camera", new string('a', 64), TestContext.Current.CancellationToken);
            await using var locked = new NpgsqlCommand("SELECT event_id FROM reservation_outbox FOR UPDATE", peer, transaction);
            _ = await locked.ExecuteScalarAsync(TestContext.Current.CancellationToken);
        }

        using var capture = new DatabaseTelemetryCapture();
        using var schedule = new ScanSchedule();
        var publisher = new RecordingPublisher();
        using WebApplicationFactory<Reservations.Program> host = CreateHost(database, capture, schedule, clock, publisher);
        using HttpClient client = host.CreateClient();
        Assert.Equal(TimeSpan.FromSeconds(30), await schedule.NextAsync());
        int setupCount = capture.Spans.Values.Count;
        for (int scan = 0; scan < 3; scan++)
        {
            clock.Now += TimeSpan.FromSeconds(30);
            schedule.Advance();
            Assert.Equal(TimeSpan.FromSeconds(30), await schedule.NextAsync());
        }

        DatabaseSpan[] steady = [.. capture.Spans.Values.Skip(setupCount).Where(span => span.Source == "Npgsql")];
        DatabaseSpan[] statements = [.. steady.Where(span => Operation(span) is not "connect" && span.OperationName != "COMMIT")];
        Assert.Equal(6, statements.Length);
        Assert.Equal(3, statements.Count(span => Operation(span) == "outbox.snapshot"));
        Assert.Equal(3, statements.Count(span => Operation(span) == "outbox.select"));
        Assert.All(statements, span => Assert.Contains(Operation(span), IdleOperations));
        Assert.DoesNotContain(steady, span => Operation(span) is "connect" or "outbox.listen");
        Assert.Equal(6, steady.Length);
        Assert.Empty(publisher.Events);
        Assert.Null(capture.Spans.Failure);
    }

    [Fact]
    public async Task FailedListenerAuthenticationExportsSafeSetupFailureAndBoundedTerminalOutcome()
    {
        await using NpgsqlDataSource database = await postgres.CreateMigratedDatabaseAsync("reservations");
        const string secret = "listener-password-private-marker";
        var settings = new NpgsqlConnectionStringBuilder(postgres.ConnectionStringFor(database)) { Password = secret };
        var clock = new TestTimeProvider(DateTimeOffset.UtcNow);
        using var capture = new DatabaseTelemetryCapture();
        using var metrics = new OutboxMeasurements();
        using var schedule = new ScanSchedule();
        var publisher = new RecordingPublisher();
        using WebApplicationFactory<Reservations.Program> host = CreateHost(database, capture, schedule, clock, publisher)
            .WithWebHostBuilder(builder => builder.ConfigureAppConfiguration((_, config) => config.AddInMemoryCollection(new Dictionary<string, string?> { ["ConnectionStrings:reservations"] = settings.ConnectionString })));
        using HttpClient client = host.CreateClient();
        using var deadline = CancellationTokenSource.CreateLinkedTokenSource(TestContext.Current.CancellationToken);
        deadline.CancelAfter(TimeSpan.FromSeconds(10));
        while (!metrics.Values.Any(value => value.Name == "reservation.outbox.listener.transitions" && value.Tags.Contains(new("outcome", "permanent_error"))))
        {
            await Task.Delay(10, deadline.Token);
        }

        await host.DisposeAsync();
        DatabaseSpan failure = Assert.Single(capture.Spans.Values, span => span.Source == "Npgsql" && Operation(span) == "connect" && span.Status == ActivityStatusCode.Error);
        Assert.Equal("28P01", failure.Tags.GetValueOrDefault("error.type"));
        Assert.Contains("exception.message=Database operation failed", failure.Fields);
        Assert.Contains("exception.stacktrace=[redacted]", failure.Fields);
        Assert.Contains(capture.Spans.Values, span => span.Source != "Npgsql" && span.SpanId == failure.ParentSpanId && span.TraceId == failure.TraceId);
        Assert.DoesNotContain(capture.AllFields, value => value.Contains(secret, StringComparison.Ordinal));
        Assert.DoesNotContain(capture.Spans.Values, span => Operation(span) == "outbox.select");
        Assert.Empty(publisher.Events);
        Assert.Null(capture.Spans.Failure);
    }

    [Fact]
    public async Task InterruptedListenerExportsDegradedPollingAndCorrelatedSafeRecovery()
    {
        await using NpgsqlDataSource database = await postgres.CreateMigratedDatabaseAsync("reservations");
        var clock = new TestTimeProvider(new DateTimeOffset(2030, 1, 1, 0, 0, 0, TimeSpan.Zero));
        var store = new ReservationStore(database, clock);
        _ = await store.ConfirmAsync(new ReservationInterval("camera-001", clock.Now.AddDays(1), clock.Now.AddDays(1).AddHours(1)), "Demo Camera", new string('a', 64), TestContext.Current.CancellationToken);
        string role = "telemetry_" + Guid.NewGuid().ToString("N");
        string password = Guid.NewGuid().ToString("N");
        await using (NpgsqlCommand grant = database.CreateCommand($"CREATE ROLE {role} LOGIN PASSWORD '{password}'; GRANT SELECT,UPDATE ON reservation_outbox TO {role}"))
        {
            _ = await grant.ExecuteNonQueryAsync(TestContext.Current.CancellationToken);
        }

        var settings = new NpgsqlConnectionStringBuilder(postgres.ConnectionStringFor(database)) { Username = role, Password = password };
        using var capture = new DatabaseTelemetryCapture();
        using var metrics = new OutboxMeasurements();
        var schedule = new RecoveryGates();
        var publisher = new GatedPublisher();
        using WebApplicationFactory<Reservations.Program> host = capture.App<Reservations.Program>("reservations", settings.ConnectionString)
            .WithWebHostBuilder(builder =>
            {
                _ = builder.ConfigureAppConfiguration((_, config) => config.AddInMemoryCollection(new Dictionary<string, string?> { ["ConnectionStrings:messaging"] = "amqp://unused" }));
                _ = builder.ConfigureServices(services =>
                {
                    _ = services.RemoveAll<IRecoverySchedule>();
                    _ = services.AddSingleton<IRecoverySchedule>(schedule);
                    _ = services.RemoveAll<TimeProvider>();
                    _ = services.AddSingleton<TimeProvider>(clock);
                    _ = services.RemoveAll<IReservationPublisher>();
                    _ = services.AddSingleton<IReservationPublisher>(publisher);
                });
            });
        using HttpClient client = host.CreateClient();
        await publisher.Entered.Task.WaitAsync(TimeSpan.FromSeconds(10), TestContext.Current.CancellationToken);
        int pid;
        await using (NpgsqlCommand sessions = database.CreateCommand("SELECT coalesce(max(pid),0) FROM pg_stat_activity WHERE datname=current_database() AND query='LISTEN reservation_outbox_changed' AND state='idle'"))
        {
            pid = (int)(await sessions.ExecuteScalarAsync(TestContext.Current.CancellationToken))!;
            Assert.NotEqual(0, pid);
        }

        await using (NpgsqlCommand limit = database.CreateCommand($"ALTER ROLE {role} CONNECTION LIMIT 0"))
        {
            _ = await limit.ExecuteNonQueryAsync(TestContext.Current.CancellationToken);
        }

        await using (NpgsqlCommand terminate = database.CreateCommand("SELECT pg_terminate_backend($1)"))
        {
            _ = terminate.Parameters.AddWithValue(pid);
            Assert.Equal(true, await terminate.ExecuteScalarAsync(TestContext.Current.CancellationToken));
        }

        foreach (int seconds in new[] { 1, 2 })
        {
            RecoveryDelay retry = await schedule.NextAsync();
            Assert.Equal(TimeSpan.FromSeconds(seconds), retry.Delay);
            retry.Resume.SetResult();
        }

        RecoveryDelay reconnect = await schedule.NextAsync();
        Assert.Equal(TimeSpan.FromSeconds(10), reconnect.Delay);
        await using (NpgsqlCommand restore = database.CreateCommand($"ALTER ROLE {role} CONNECTION LIMIT -1"))
        {
            _ = await restore.ExecuteNonQueryAsync(TestContext.Current.CancellationToken);
        }

        publisher.Resume.SetResult();
        RecoveryDelay degraded = await schedule.NextAsync();
        Assert.Equal(TimeSpan.FromSeconds(10), degraded.Delay);
        degraded.Resume.SetResult();
        RecoveryDelay nextDegraded = await schedule.NextAsync();
        Assert.Equal(TimeSpan.FromSeconds(10), nextDegraded.Delay);
        Assert.Contains(metrics.Values, value => value.Name == "reservation.outbox.wakeups" && value.Tags.Contains(new("cause", "degraded_poll")));
        reconnect.Resume.SetResult();
        RecoveryDelay healthy = await schedule.NextAsync();
        Assert.Equal(TimeSpan.FromSeconds(30), healthy.Delay);
        _ = host.Services.GetRequiredService<MeterProvider>().ForceFlush();
        await host.DisposeAsync();

        OutboxMeasurement[] transitions = [.. metrics.Values.Where(value => value.Name == "reservation.outbox.listener.transitions")];
        int unavailable = Array.FindIndex(transitions, value => value.Tags.Contains(new("outcome", "unavailable")));
        int recovered = Array.FindIndex(transitions, value => value.Tags.Contains(new("outcome", "recovered")));
        Assert.True(unavailable >= 0 && recovered > unavailable, "Exported listener transitions must progress from unavailable to recovered.");
        Assert.Contains(capture.Fields, value => value == "reservation.outbox.listener.transitions");
        Assert.Contains(capture.Fields, value => value == "outcome=unavailable");
        Assert.Contains(capture.Fields, value => value == "outcome=recovered");
        Assert.Contains(capture.Fields, value => value == "cause=degraded_poll");
        Assert.Contains(capture.Fields, value => value == "Outbox listener outcome unavailable");
        Assert.Contains(capture.Fields, value => value == "Outbox listener outcome recovered");
        DatabaseSpan[] failures = [.. capture.Spans.Values.Where(span => span.Source == "Npgsql" && Operation(span) == "connect" && span.Status == ActivityStatusCode.Error)];
        Assert.NotEmpty(failures);
        Assert.All(failures, failure =>
        {
            Assert.Equal("53300", failure.Tags.GetValueOrDefault("error.type"));
            Assert.Contains("exception.message=Database operation failed", failure.Fields);
            Assert.Contains("exception.stacktrace=[redacted]", failure.Fields);
            Assert.Contains(capture.Spans.Values, span => span.Source != "Npgsql" && span.Name == "outbox.listen" && span.Status == ActivityStatusCode.Error && span.SpanId == failure.ParentSpanId && span.TraceId == failure.TraceId);
        });
        DatabaseSpan[] listens = [.. capture.Spans.Values.Where(span => span.Source == "Npgsql" && Operation(span) == "outbox.listen")];
        Assert.Equal(2, listens.Length);
        Assert.All(listens, listen =>
        {
            Assert.Equal("LISTEN reservation_outbox_changed", listen.Tags.GetValueOrDefault("db.query.text"));
            Assert.Contains(capture.Spans.Values, span => span.Source != "Npgsql" && span.Name == "outbox.listen" && span.Status == ActivityStatusCode.Ok && span.SpanId == listen.ParentSpanId && span.TraceId == listen.TraceId);
        });
        Assert.All(metrics.Values, value =>
        {
            string dimension = value.Name == "reservation.outbox.wakeups" ? "cause" : "outcome";
            KeyValuePair<string, object?> tag = Assert.Single(value.Tags);
            Assert.Equal(dimension, tag.Key);
            Assert.Contains(Assert.IsType<string>(tag.Value), dimension == "cause" ? WakeCauses : ListenerOutcomes);
        });
        Assert.DoesNotContain(capture.AllFields, value => value.Contains(password, StringComparison.Ordinal) || value.Contains(role, StringComparison.Ordinal) || value.Contains(settings.ConnectionString, StringComparison.Ordinal));
        Assert.DoesNotContain(capture.AllFields, value => value.Contains("too many connections for role", StringComparison.OrdinalIgnoreCase) || value.Contains("terminating connection due to administrator command", StringComparison.OrdinalIgnoreCase));
        Assert.Null(capture.Spans.Failure);
    }

    private WebApplicationFactory<Reservations.Program> CreateHost(NpgsqlDataSource database, DatabaseTelemetryCapture capture, ScanSchedule schedule, TimeProvider clock, RecordingPublisher publisher)
    {
        return capture.App<Reservations.Program>("reservations", postgres.ConnectionStringFor(database))
            .WithWebHostBuilder(builder =>
            {
                _ = builder.ConfigureAppConfiguration((_, config) => config.AddInMemoryCollection(new Dictionary<string, string?> { ["ConnectionStrings:messaging"] = "amqp://unused" }));
                _ = builder.ConfigureServices(services =>
                {
                    _ = services.RemoveAll<IRecoverySchedule>();
                    _ = services.AddSingleton<IRecoverySchedule>(schedule);
                    _ = services.RemoveAll<TimeProvider>();
                    _ = services.AddSingleton(clock);
                    _ = services.RemoveAll<IReservationPublisher>();
                    _ = services.AddSingleton<IReservationPublisher>(publisher);
                });
            });
    }

    private static string? Operation(DatabaseSpan span)
    {
        return span.Tags.GetValueOrDefault("db.operation.name") as string;
    }

    private sealed class RecordingPublisher : IReservationPublisher
    {
        public ConcurrentQueue<(ReservationEvent Message, string? Parent)> Events { get; } = new();

        public Task PublishAsync(ReservationEvent message, string? traceParent, string? traceState, CancellationToken cancellationToken)
        {
            Events.Enqueue((message, traceParent));
            return Task.CompletedTask;
        }
    }

    private sealed class GatedPublisher : IReservationPublisher
    {
        public TaskCompletionSource Entered { get; } = new(TaskCreationOptions.RunContinuationsAsynchronously);

        public TaskCompletionSource Resume { get; } = new(TaskCreationOptions.RunContinuationsAsynchronously);

        public async Task PublishAsync(ReservationEvent message, string? traceParent, string? traceState, CancellationToken cancellationToken)
        {
            Entered.SetResult();
            await Resume.Task.WaitAsync(cancellationToken);
        }
    }

    private sealed record RecoveryDelay(TimeSpan Delay, TaskCompletionSource Resume);

    private sealed class RecoveryGates : IRecoverySchedule
    {
        private readonly Channel<RecoveryDelay> delays = Channel.CreateUnbounded<RecoveryDelay>();

        public double Jitter()
        {
            return 0.5;
        }

        public async Task DelayAsync(TimeSpan delay, CancellationToken cancellationToken)
        {
            var gate = new RecoveryDelay(delay, new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously));
            await delays.Writer.WriteAsync(gate, cancellationToken);
            await gate.Resume.Task.WaitAsync(cancellationToken);
        }

        public async Task<RecoveryDelay> NextAsync()
        {
            return await delays.Reader.ReadAsync(TestContext.Current.CancellationToken).AsTask().WaitAsync(TimeSpan.FromSeconds(10), TestContext.Current.CancellationToken);
        }
    }

    private sealed class ScanSchedule : IRecoverySchedule, IDisposable
    {
        private readonly Channel<RecoveryDelay> delays = Channel.CreateUnbounded<RecoveryDelay>();
        private RecoveryDelay? current;

        public double Jitter()
        {
            return 0.5;
        }

        public async Task DelayAsync(TimeSpan delay, CancellationToken cancellationToken)
        {
            var gate = new RecoveryDelay(delay, new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously));
            using CancellationTokenRegistration registration = cancellationToken.Register(() => gate.Resume.TrySetCanceled(cancellationToken));
            await delays.Writer.WriteAsync(gate, cancellationToken);
            await gate.Resume.Task;
        }

        public async Task<TimeSpan> NextAsync()
        {
            using var deadline = CancellationTokenSource.CreateLinkedTokenSource(TestContext.Current.CancellationToken);
            deadline.CancelAfter(TimeSpan.FromSeconds(10));
            do
            {
                current = await delays.Reader.ReadAsync(deadline.Token);
            }
            while (current.Resume.Task.IsCanceled);

            return current.Delay;
        }

        public void Advance()
        {
            _ = current!.Resume.TrySetResult();
        }

        public void Dispose()
        {
            _ = current?.Resume.TrySetCanceled();
        }
    }

    private sealed class OutboxMeasurements : IDisposable
    {
        private readonly MeterListener listener = new();

        public ConcurrentQueue<OutboxMeasurement> Values { get; } = new();

        public OutboxMeasurements()
        {
            listener.InstrumentPublished = (instrument, current) =>
            {
                if (instrument.Name is "reservation.outbox.wakeups" or "reservation.outbox.listener.transitions")
                {
                    current.EnableMeasurementEvents(instrument);
                }
            };
            listener.SetMeasurementEventCallback<long>((instrument, _, tags, _) => Values.Enqueue(new(instrument.Name, tags.ToArray())));
            listener.Start();
        }

        public void Dispose()
        {
            listener.Dispose();
        }
    }

    private sealed record OutboxMeasurement(string Name, KeyValuePair<string, object?>[] Tags);
}
