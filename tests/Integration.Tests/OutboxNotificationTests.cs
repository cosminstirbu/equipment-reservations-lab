using System.Collections.Concurrent;
using System.Diagnostics;
using System.Threading.Channels;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using Npgsql;
using ReservationMessaging;
using Reservations;
using Xunit;

namespace Integration.Tests;

[Collection("Database telemetry and recovery")]
public sealed class OutboxNotificationTests(PostgresFixture postgres, ITestOutputHelper output)
{
    [Fact]
    public async Task InsertNotificationIsEmptyCommitOnlyAndRollbackIsSilent()
    {
        await using BookingScenario scenario = await BookingScenario.CreateAsync(postgres);
        await using NpgsqlConnection listening = await scenario.Database.OpenConnectionAsync(TestContext.Current.CancellationToken);
        var signals = new ConcurrentQueue<string>();
        listening.Notification += (_, notification) => signals.Enqueue(notification.Payload);
        await using var listen = new NpgsqlCommand("LISTEN reservation_outbox_changed", listening);
        _ = await listen.ExecuteNonQueryAsync(TestContext.Current.CancellationToken);
        await using NpgsqlConnection writer = await scenario.Database.OpenConnectionAsync(TestContext.Current.CancellationToken);
        await using (NpgsqlTransaction transaction = await writer.BeginTransactionAsync(TestContext.Current.CancellationToken))
        {
            await using var insert = new NpgsqlCommand("INSERT INTO reservation_outbox SELECT * FROM reservation_outbox WHERE false", writer, transaction);
            _ = await insert.ExecuteNonQueryAsync(TestContext.Current.CancellationToken);
            Assert.False(await listening.WaitAsync(TimeSpan.FromMilliseconds(100), TestContext.Current.CancellationToken));
            await transaction.CommitAsync(TestContext.Current.CancellationToken);
        }

        Assert.True(await listening.WaitAsync(TimeSpan.FromSeconds(1), TestContext.Current.CancellationToken));
        Assert.Equal("", Assert.Single(signals));
        await using (NpgsqlTransaction transaction = await writer.BeginTransactionAsync(TestContext.Current.CancellationToken))
        {
            await using var insert = new NpgsqlCommand("INSERT INTO reservation_outbox SELECT * FROM reservation_outbox WHERE false", writer, transaction);
            _ = await insert.ExecuteNonQueryAsync(TestContext.Current.CancellationToken);
            await transaction.RollbackAsync(TestContext.Current.CancellationToken);
        }

        Assert.False(await listening.WaitAsync(TimeSpan.FromMilliseconds(100), TestContext.Current.CancellationToken));
        _ = await scenario.BookAsync();
        Assert.True(await listening.WaitAsync(TimeSpan.FromSeconds(1), TestContext.Current.CancellationToken));
        Assert.Equal(2, signals.Count);
        _ = await scenario.BookAsync(equipment: "laptop-001");
        Assert.True(await listening.WaitAsync(TimeSpan.FromSeconds(1), TestContext.Current.CancellationToken));
        await using NpgsqlCommand multirow = scenario.Database.CreateCommand("INSERT INTO reservation_outbox SELECT gen_random_uuid(),reservation_id,'ReservationCancelled',schema_version,user_key,equipment_id,equipment_name,start_at,end_at,occurred_at,traceparent,tracestate,attempt_count,next_attempt_at,published_at FROM reservation_outbox");
        Assert.Equal(2, await multirow.ExecuteNonQueryAsync(TestContext.Current.CancellationToken));
        Assert.True(await listening.WaitAsync(TimeSpan.FromSeconds(1), TestContext.Current.CancellationToken));
        Assert.Equal(4, signals.Count);
        Assert.All(signals, Assert.Empty);
    }

    [Fact]
    public async Task IdleWorkerPublishesWithinOneSecondWithoutAdvancingFallbackAndDrainsBusyInserts()
    {
        await using BookingScenario scenario = await BookingScenario.CreateAsync(postgres);
        using var schedule = new ManualSchedule();
        using var publisher = new AttemptPublisher(gated: true);
        using OutboxWorker worker = Worker(scenario, publisher, schedule);
        await worker.StartAsync(TestContext.Current.CancellationToken);
        Assert.Equal(TimeSpan.FromSeconds(30), await schedule.NextAsync());
        long committed = Stopwatch.GetTimestamp();
        _ = await scenario.BookAsync();
        ReservationEvent first = await publisher.NextAsync();
        TimeSpan latency = Stopwatch.GetElapsedTime(committed);
        output.WriteLine($"Healthy commit-to-publisher observation including HTTP completion: {latency.TotalMilliseconds:F1}ms; fallback never advanced.");
        Assert.True(latency < TimeSpan.FromSeconds(1), "Healthy idle publication must start within one second of commit (HTTP completion included).");
        _ = await scenario.BookAsync(equipment: "laptop-001");
        publisher.Release();
        ReservationEvent second = await publisher.NextAsync();
        Assert.NotEqual(first.EventId, second.EventId);
        publisher.Release();
        _ = await schedule.NextAsync();
        await worker.StopAsync(TestContext.Current.CancellationToken);
        Assert.Equal(1, publisher.MaximumConcurrency);
    }

    [Fact]
    public async Task RestartHonorsFuturePersistedRetryWithoutNewInsert()
    {
        await using BookingScenario scenario = await BookingScenario.CreateAsync(postgres);
        _ = await scenario.BookAsync();
        DateTimeOffset due = scenario.Clock.Now.AddSeconds(4);
        await using NpgsqlCommand postpone = scenario.Database.CreateCommand("UPDATE reservation_outbox SET next_attempt_at=$1");
        _ = postpone.Parameters.AddWithValue(due);
        _ = await postpone.ExecuteNonQueryAsync(TestContext.Current.CancellationToken);
        using var publisher = new AttemptPublisher();
        using (var schedule = new ManualSchedule())
        using (OutboxWorker worker = Worker(scenario, publisher, schedule))
        {
            await worker.StartAsync(TestContext.Current.CancellationToken);
            Assert.Equal(TimeSpan.FromSeconds(4), await schedule.NextAsync());
            Assert.Empty(publisher.Events);
            await worker.StopAsync(TestContext.Current.CancellationToken);
        }

        using var restartedSchedule = new ManualSchedule();
        using OutboxWorker restarted = Worker(scenario, publisher, restartedSchedule);
        await restarted.StartAsync(TestContext.Current.CancellationToken);
        Assert.Equal(TimeSpan.FromSeconds(4), await restartedSchedule.NextAsync());
        scenario.Clock.Now = due;
        restartedSchedule.Advance();
        _ = await publisher.NextAsync();
        await restarted.StopAsync(TestContext.Current.CancellationToken);
    }

    [Fact]
    public async Task TerminatedListenerReconnectsThenDrainsAndShutdownReleasesSession()
    {
        await using BookingScenario scenario = await BookingScenario.CreateAsync(postgres);
        using var schedule = new ManualSchedule();
        using var publisher = new AttemptPublisher();
        using OutboxWorker worker = Worker(scenario, publisher, schedule);
        await worker.StartAsync(TestContext.Current.CancellationToken);
        _ = await schedule.NextAsync();
        int original = await ListenerPidAsync(scenario.Database);
        await using NpgsqlCommand kill = scenario.Database.CreateCommand("SELECT pg_terminate_backend($1)");
        _ = kill.Parameters.AddWithValue(original);
        Assert.True((bool)(await kill.ExecuteScalarAsync(TestContext.Current.CancellationToken))!);
        _ = await scenario.BookAsync();
        _ = await publisher.NextAsync();
        Assert.NotEqual(original, await ListenerPidAsync(scenario.Database));
        await worker.StopAsync(TestContext.Current.CancellationToken);
        Assert.Equal(0, await ListenerPidAsync(scenario.Database));
    }

    [Theory]
    [InlineData(1)]
    [InlineData(5)]
    public async Task ReplicasClaimDistinctRowsAndKeepEachPublisherSequential(int replicas)
    {
        await using BookingScenario scenario = await BookingScenario.CreateAsync(postgres);
        var schedules = new List<ManualSchedule>();
        var publishers = new List<AttemptPublisher>();
        var workers = new List<OutboxWorker>();
        try
        {
            for (int index = 0; index < replicas; index++)
            {
                var schedule = new ManualSchedule();
                var publisher = new AttemptPublisher(gated: true);
                OutboxWorker worker = Worker(scenario, publisher, schedule);
                schedules.Add(schedule);
                publishers.Add(publisher);
                workers.Add(worker);
                await worker.StartAsync(TestContext.Current.CancellationToken);
                _ = await schedule.NextAsync();
            }

            for (int index = 0; index < replicas; index++)
            {
                _ = await scenario.BookAsync(equipment: $"camera-{index}");
            }

            ReservationEvent[] attempts = await Task.WhenAll(publishers.Select(publisher => publisher.NextAsync()));
            Assert.Equal(replicas, attempts.Select(message => message.EventId).Distinct().Count());
            foreach (AttemptPublisher publisher in publishers)
            {
                publisher.Release();
            }

            await AwaitPublishedAsync(scenario.Database, replicas);
            Assert.All(publishers, publisher => Assert.Equal(1, publisher.MaximumConcurrency));
        }
        finally
        {
            foreach (OutboxWorker worker in workers)
            {
                await worker.StopAsync(TestContext.Current.CancellationToken);
                worker.Dispose();
            }

            publishers.ForEach(publisher => publisher.Dispose());
            schedules.ForEach(schedule => schedule.Dispose());
        }
    }

    [Fact]
    public async Task MissingTriggerAndManualRepairAreRecoveredByFallback()
    {
        await using BookingScenario scenario = await BookingScenario.CreateAsync(postgres);
        await using NpgsqlCommand remove = scenario.Database.CreateCommand("DROP TRIGGER reservation_outbox_changed ON reservation_outbox");
        _ = await remove.ExecuteNonQueryAsync(TestContext.Current.CancellationToken);
        using var schedule = new ManualSchedule();
        using var publisher = new AttemptPublisher();
        using OutboxWorker worker = Worker(scenario, publisher, schedule);
        await worker.StartAsync(TestContext.Current.CancellationToken);
        Assert.Equal(TimeSpan.FromSeconds(30), await schedule.NextAsync());
        _ = await scenario.BookAsync();
        Assert.Empty(publisher.Events);
        schedule.Advance();
        ReservationEvent original = await publisher.NextAsync();
        await AwaitPublishedAsync(scenario.Database, 1);
        _ = await schedule.NextAsync();
        await using NpgsqlCommand repair = scenario.Database.CreateCommand("UPDATE reservation_outbox SET published_at=NULL WHERE event_id=$1");
        _ = repair.Parameters.AddWithValue(original.EventId);
        _ = await repair.ExecuteNonQueryAsync(TestContext.Current.CancellationToken);
        schedule.Advance();
        Assert.Equal(original, await publisher.NextAsync());
        await worker.StopAsync(TestContext.Current.CancellationToken);
    }

    [Fact]
    public async Task ShutdownCancelsUncertainPublicationAndDisabledMessagingNeverListens()
    {
        await using BookingScenario scenario = await BookingScenario.CreateAsync(postgres);
        _ = await scenario.BookAsync();
        using var publisher = new AttemptPublisher(gated: true);
        using var schedule = new ManualSchedule();
        using (OutboxWorker disabled = Worker(scenario, publisher, schedule, enabled: false))
        {
            await disabled.StartAsync(TestContext.Current.CancellationToken);
            await disabled.ExecuteTask!;
            Assert.Equal(0, await ListenerPidAsync(scenario.Database));
            Assert.Empty(publisher.Events);
        }

        using OutboxWorker worker = Worker(scenario, publisher, schedule);
        await worker.StartAsync(TestContext.Current.CancellationToken);
        _ = await publisher.NextAsync();
        await worker.StopAsync(TestContext.Current.CancellationToken).WaitAsync(TimeSpan.FromSeconds(2), TestContext.Current.CancellationToken);
        Assert.Equal(0, await ListenerPidAsync(scenario.Database));
        await using NpgsqlCommand pending = scenario.Database.CreateCommand("SELECT published_at IS NULL AND attempt_count=0 FROM reservation_outbox");
        Assert.True((bool)(await pending.ExecuteScalarAsync(TestContext.Current.CancellationToken))!);
    }

    [Theory]
    [InlineData("idle")]
    [InlineData("busy")]
    [InlineData("backoff")]
    public async Task PermanentListenerAuthenticationFailureInterruptsEveryProcessingPhase(string phase)
    {
        await using BookingScenario scenario = await BookingScenario.CreateAsync(postgres);
        string role = "worker_" + Guid.NewGuid().ToString("N");
        string password = Guid.NewGuid().ToString("N");
        await using NpgsqlCommand grant = scenario.Database.CreateCommand($"CREATE ROLE {role} LOGIN PASSWORD '{password}'; GRANT SELECT,UPDATE ON reservation_outbox TO {role}");
        _ = await grant.ExecuteNonQueryAsync(TestContext.Current.CancellationToken);
        var settings = new NpgsqlConnectionStringBuilder(postgres.ConnectionStringFor(scenario.Database)) { Username = role, Password = password };
        await using var database = NpgsqlDataSource.Create(settings.ConnectionString);
        using var schedule = new ManualSchedule();
        using var publisher = new AttemptPublisher(gated: phase == "busy", failures: phase == "backoff" ? 1 : 0);
        if (phase != "idle")
        {
            _ = await scenario.BookAsync();
        }

        using OutboxWorker worker = Worker(scenario, publisher, schedule, source: database);
        await worker.StartAsync(TestContext.Current.CancellationToken);
        if (phase == "busy")
        {
            _ = await publisher.NextAsync();
        }
        else
        {
            _ = await schedule.NextAsync();
        }

        int pid = await ListenerPidAsync(scenario.Database);
        await using NpgsqlCommand reject = scenario.Database.CreateCommand($"ALTER ROLE {role} PASSWORD 'rejected-password'");
        _ = await reject.ExecuteNonQueryAsync(TestContext.Current.CancellationToken);
        database.Clear();
        await using NpgsqlCommand terminate = scenario.Database.CreateCommand("SELECT pg_terminate_backend($1)");
        _ = terminate.Parameters.AddWithValue(pid);
        _ = await terminate.ExecuteNonQueryAsync(TestContext.Current.CancellationToken);
        await worker.ExecuteTask!.WaitAsync(TimeSpan.FromSeconds(5), TestContext.Current.CancellationToken);
        Assert.Equal(0, await ListenerPidAsync(scenario.Database));
        Assert.Equal(phase == "idle" ? 0 : 1, publisher.Events.Count);
        if (phase != "idle")
        {
            await using NpgsqlCommand pending = scenario.Database.CreateCommand("SELECT published_at IS NULL FROM reservation_outbox");
            Assert.True((bool)(await pending.ExecuteScalarAsync(TestContext.Current.CancellationToken))!);
        }
    }

    [Fact]
    public async Task InsertAndReconnectCannotShortenPublicationBackoff()
    {
        await using BookingScenario scenario = await BookingScenario.CreateAsync(postgres);
        _ = await scenario.BookAsync();
        using var publisher = new AttemptPublisher(failures: 1);
        using var schedule = new ManualSchedule();
        using OutboxWorker worker = Worker(scenario, publisher, schedule);
        await worker.StartAsync(TestContext.Current.CancellationToken);
        Assert.Equal(TimeSpan.FromSeconds(1), await schedule.NextAsync());
        _ = await publisher.NextAsync();
        int pid = await ListenerPidAsync(scenario.Database);
        await using NpgsqlCommand terminate = scenario.Database.CreateCommand("SELECT pg_terminate_backend($1)");
        _ = terminate.Parameters.AddWithValue(pid);
        _ = await terminate.ExecuteNonQueryAsync(TestContext.Current.CancellationToken);
        _ = await scenario.BookAsync(equipment: "laptop-001");
        await AwaitDifferentListenerAsync(scenario.Database, pid);
        _ = Assert.Single(publisher.Events);
        scenario.Clock.Now = scenario.Clock.Now.AddSeconds(1);
        schedule.Advance();
        _ = await publisher.NextAsync();
        _ = await publisher.NextAsync();
        await worker.StopAsync(TestContext.Current.CancellationToken);
    }

    [Fact]
    public async Task MigrationUpgradeReapplicationAndRuntimeInsertNeedNoDdlAuthority()
    {
        await using NpgsqlDataSource database = await postgres.CreateDatabaseAsync();
        await using NpgsqlCommand extension = database.CreateCommand("CREATE EXTENSION btree_gist");
        _ = await extension.ExecuteNonQueryAsync(TestContext.Current.CancellationToken);
        using Stream stream = typeof(ServiceMigrations).Assembly.GetManifestResourceStream("Reservations.Migrations.001_initial.sql")!;
        using var reader = new StreamReader(stream);
        string initial = await reader.ReadToEndAsync(TestContext.Current.CancellationToken);
        await Persistence.SqlMigrations.ApplyAsync(database, [new Persistence.SqlMigration(1, initial)], TestContext.Current.CancellationToken);
        await using NpgsqlCommand old = database.CreateCommand("INSERT INTO reservations VALUES ('10000000-0000-0000-0000-000000000001',repeat('a',64),'camera-old','Camera',now(),now()+interval '1 hour',now(),NULL,'Confirmed'); INSERT INTO reservation_outbox(event_id,reservation_id,event_type,schema_version,user_key,equipment_id,equipment_name,start_at,end_at,occurred_at,next_attempt_at) SELECT '20000000-0000-0000-0000-000000000001',id,'ReservationConfirmed',1,user_key,equipment_id,equipment_name,start_at,end_at,confirmed_at,confirmed_at FROM reservations");
        _ = await old.ExecuteNonQueryAsync(TestContext.Current.CancellationToken);
        await ServiceMigrations.ApplyAsync(database, TestContext.Current.CancellationToken);
        await ServiceMigrations.ApplyAsync(database, TestContext.Current.CancellationToken);
        await using NpgsqlCommand ledger = database.CreateCommand("SELECT count(*) FROM schema_migrations");
        Assert.Equal(2L, await ledger.ExecuteScalarAsync(TestContext.Current.CancellationToken));
        await using NpgsqlCommand preserved = database.CreateCommand("SELECT event_id FROM reservation_outbox");
        Assert.Equal(Guid.Parse("20000000-0000-0000-0000-000000000001"), await preserved.ExecuteScalarAsync(TestContext.Current.CancellationToken));
        string role = "runtime_" + Guid.NewGuid().ToString("N");
        string password = Guid.NewGuid().ToString("N");
        await using NpgsqlCommand grant = database.CreateCommand($"CREATE ROLE {role} LOGIN PASSWORD '{password}'; GRANT SELECT,INSERT ON reservation_outbox TO {role}");
        _ = await grant.ExecuteNonQueryAsync(TestContext.Current.CancellationToken);
        var settings = new NpgsqlConnectionStringBuilder(postgres.ConnectionStringFor(database)) { Username = role, Password = password };
        await using var runtime = NpgsqlDataSource.Create(settings.ConnectionString);
        await using NpgsqlCommand insert = runtime.CreateCommand("INSERT INTO reservation_outbox SELECT gen_random_uuid(),reservation_id,'ReservationCancelled',schema_version,user_key,equipment_id,equipment_name,start_at,end_at,occurred_at,traceparent,tracestate,attempt_count,next_attempt_at,published_at FROM reservation_outbox");
        Assert.Equal(1, await insert.ExecuteNonQueryAsync(TestContext.Current.CancellationToken));
        await using NpgsqlCommand deny = runtime.CreateCommand("CREATE TABLE forbidden_ddl(id int)");
        PostgresException permission = await Assert.ThrowsAsync<PostgresException>(() => deny.ExecuteNonQueryAsync(TestContext.Current.CancellationToken));
        Assert.Equal("42501", permission.SqlState);
    }

    [Fact]
    public async Task TransientListenerRecoveryUsesBoundedBurstsAndIndependentTenSecondDegradedPolling()
    {
        await using BookingScenario scenario = await BookingScenario.CreateAsync(postgres);
        _ = await scenario.BookAsync();
        string role = "limited_" + Guid.NewGuid().ToString("N");
        string password = Guid.NewGuid().ToString("N");
        await using NpgsqlCommand grant = scenario.Database.CreateCommand($"CREATE ROLE {role} LOGIN PASSWORD '{password}'; GRANT SELECT,UPDATE ON reservation_outbox TO {role}");
        _ = await grant.ExecuteNonQueryAsync(TestContext.Current.CancellationToken);
        var settings = new NpgsqlConnectionStringBuilder(postgres.ConnectionStringFor(scenario.Database)) { Username = role, Password = password };
        await using var database = NpgsqlDataSource.Create(settings.ConnectionString);
        using var schedule = new ManualSchedule();
        using var publisher = new AttemptPublisher(gated: true);
        using OutboxWorker worker = Worker(scenario, publisher, schedule, source: database);
        await worker.StartAsync(TestContext.Current.CancellationToken);
        _ = await publisher.NextAsync();
        int pid = await ListenerPidAsync(scenario.Database);
        await using NpgsqlCommand limit = scenario.Database.CreateCommand($"ALTER ROLE {role} CONNECTION LIMIT 0");
        _ = await limit.ExecuteNonQueryAsync(TestContext.Current.CancellationToken);
        await using NpgsqlCommand terminate = scenario.Database.CreateCommand("SELECT pg_terminate_backend($1)");
        _ = terminate.Parameters.AddWithValue(pid);
        _ = await terminate.ExecuteNonQueryAsync(TestContext.Current.CancellationToken);
        foreach (int seconds in new[] { 1, 2 })
        {
            Assert.Equal(TimeSpan.FromSeconds(seconds), await schedule.NextAsync());
            schedule.Advance();
        }

        Assert.Equal(TimeSpan.FromSeconds(10), await schedule.NextAsync());
        await using NpgsqlCommand restore = scenario.Database.CreateCommand($"ALTER ROLE {role} CONNECTION LIMIT -1");
        _ = await restore.ExecuteNonQueryAsync(TestContext.Current.CancellationToken);
        publisher.Release();
        await AwaitPublishedAsync(scenario.Database, 1);
        // Listener is still in its failed-burst delay; processing independently polls at10s.
        Assert.Equal(TimeSpan.FromSeconds(10), await schedule.NextAsync());
        await worker.StopAsync(TestContext.Current.CancellationToken).WaitAsync(TimeSpan.FromSeconds(2), TestContext.Current.CancellationToken);
        Assert.Equal(0, await ListenerPidAsync(scenario.Database));
    }

    [Fact]
    public async Task LegacyPollingAndListeningWorkersShareLocksAndStableEventIds()
    {
        await using BookingScenario scenario = await BookingScenario.CreateAsync(postgres);
        using var modernSchedule = new ManualSchedule();
        using var legacySchedule = new ManualSchedule();
        using var modernPublisher = new AttemptPublisher(gated: true);
        using var legacyPublisher = new AttemptPublisher(gated: true);
        using OutboxWorker modern = Worker(scenario, modernPublisher, modernSchedule);
        using var legacy = new LegacyPollingWorker(scenario.Database, legacyPublisher, legacySchedule, scenario.Clock);
        await modern.StartAsync(TestContext.Current.CancellationToken);
        await legacy.StartAsync(TestContext.Current.CancellationToken);
        Assert.Equal(TimeSpan.FromSeconds(30), await modernSchedule.NextAsync());
        Assert.Equal(TimeSpan.FromSeconds(10), await legacySchedule.NextAsync());
        _ = await scenario.BookAsync();
        _ = await scenario.BookAsync(equipment: "laptop-001");
        ReservationEvent first = await modernPublisher.NextAsync();
        legacySchedule.Advance();
        ReservationEvent second = await legacyPublisher.NextAsync();
        Assert.NotEqual(first.EventId, second.EventId);
        modernPublisher.Release();
        legacyPublisher.Release();
        await AwaitPublishedAsync(scenario.Database, 2);
        Assert.Equal(1, modernPublisher.MaximumConcurrency);
        Assert.Equal(1, legacyPublisher.MaximumConcurrency);
        await modern.StopAsync(TestContext.Current.CancellationToken);
        await legacy.StopAsync(TestContext.Current.CancellationToken);
    }

    private sealed class LegacyPollingWorker(NpgsqlDataSource database, AttemptPublisher publisher, ManualSchedule schedule, TimeProvider time) : Microsoft.Extensions.Hosting.BackgroundService
    {
        protected override async Task ExecuteAsync(CancellationToken stoppingToken)
        {
            try
            {
                while (!stoppingToken.IsCancellationRequested)
                {
                    bool published = await AttemptAsync(stoppingToken);
                    if (!published)
                    {
                        await schedule.DelayAsync(TimeSpan.FromSeconds(10), stoppingToken);
                    }
                }
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
            }
        }

        private async Task<bool> AttemptAsync(CancellationToken cancellationToken)
        {
            await using NpgsqlConnection connection = await database.OpenConnectionAsync(cancellationToken);
            await using NpgsqlTransaction transaction = await connection.BeginTransactionAsync(cancellationToken);
            ReservationEvent message;
            await using (var select = new NpgsqlCommand("SELECT schema_version,event_id,event_type,reservation_id,user_key,equipment_id,equipment_name,start_at,end_at,occurred_at FROM reservation_outbox WHERE published_at IS NULL AND next_attempt_at <= $1 ORDER BY next_attempt_at,event_id FOR UPDATE SKIP LOCKED LIMIT 1", connection, transaction))
            {
                _ = select.Parameters.AddWithValue(time.GetUtcNow());
                await using NpgsqlDataReader reader = await select.ExecuteReaderAsync(cancellationToken);
                if (!await reader.ReadAsync(cancellationToken))
                {
                    return false;
                }

                message = new ReservationEvent(reader.GetInt32(0), reader.GetGuid(1), reader.GetString(2), reader.GetGuid(3), reader.GetString(4), reader.GetString(5), reader.GetString(6), reader.GetFieldValue<DateTimeOffset>(7), reader.GetFieldValue<DateTimeOffset>(8), reader.GetFieldValue<DateTimeOffset>(9));
            }

            await publisher.PublishAsync(message, null, null, cancellationToken);
            await using var update = new NpgsqlCommand("UPDATE reservation_outbox SET published_at=$2,attempt_count=attempt_count+1 WHERE event_id=$1", connection, transaction);
            _ = update.Parameters.AddWithValue(message.EventId);
            _ = update.Parameters.AddWithValue(time.GetUtcNow());
            _ = await update.ExecuteNonQueryAsync(cancellationToken);
            await transaction.CommitAsync(cancellationToken);
            return true;
        }
    }

    private static async Task AwaitDifferentListenerAsync(NpgsqlDataSource database, int previous)
    {
        using var deadline = new CancellationTokenSource(TimeSpan.FromSeconds(5));
        while (true)
        {
            int pid = await ListenerPidAsync(database);
            if (pid != 0 && pid != previous)
            {
                return;
            }

            await Task.Delay(10, deadline.Token);
        }
    }

    private static async Task AwaitPublishedAsync(NpgsqlDataSource database, int count)
    {
        using var deadline = new CancellationTokenSource(TimeSpan.FromSeconds(5));
        while (true)
        {
            await using NpgsqlCommand published = database.CreateCommand("SELECT count(*) FROM reservation_outbox WHERE published_at IS NOT NULL");
            if ((long)(await published.ExecuteScalarAsync(deadline.Token))! == count)
            {
                return;
            }

            await Task.Delay(10, deadline.Token);
        }
    }

    private static async Task<int> ListenerPidAsync(NpgsqlDataSource database)
    {
        await using NpgsqlCommand sessions = database.CreateCommand("SELECT coalesce(max(pid),0) FROM pg_stat_activity WHERE datname=current_database() AND query='LISTEN reservation_outbox_changed' AND state='idle'");
        return (int)(await sessions.ExecuteScalarAsync(TestContext.Current.CancellationToken))!;
    }

    [Fact]
    public async Task CommitBetweenEmptyScanAndWaitPublishesWithoutAdvancingFallback()
    {
        await using BookingScenario scenario = await BookingScenario.CreateAsync(postgres);
        _ = await scenario.BookAsync();
        await using NpgsqlCommand saved = scenario.Database.CreateCommand("SELECT event_id FROM reservation_outbox");
        var eventId = (Guid)(await saved.ExecuteScalarAsync(TestContext.Current.CancellationToken))!;
        await using NpgsqlCommand remove = scenario.Database.CreateCommand("DELETE FROM reservation_outbox");
        _ = await remove.ExecuteNonQueryAsync(TestContext.Current.CancellationToken);
        await using NpgsqlConnection connection = await scenario.Database.OpenConnectionAsync(TestContext.Current.CancellationToken);
        await using NpgsqlTransaction transaction = await connection.BeginTransactionAsync(TestContext.Current.CancellationToken);
        await using var staged = new NpgsqlCommand("INSERT INTO reservation_outbox(event_id,reservation_id,event_type,schema_version,user_key,equipment_id,equipment_name,start_at,end_at,occurred_at,next_attempt_at) SELECT $1,id,'ReservationConfirmed',1,user_key,equipment_id,equipment_name,start_at,end_at,confirmed_at,confirmed_at FROM reservations", connection, transaction);
        _ = staged.Parameters.AddWithValue(eventId);
        Assert.Equal(1, await staged.ExecuteNonQueryAsync(TestContext.Current.CancellationToken));
        using var schedule = new TransitionSchedule();
        using var publisher = new AttemptPublisher();
        using OutboxWorker worker = Worker(scenario, publisher, schedule);
        await worker.StartAsync(TestContext.Current.CancellationToken);
        try
        {
            await schedule.Entered.Task.WaitAsync(TimeSpan.FromSeconds(5), TestContext.Current.CancellationToken);
            Assert.Equal(TimeSpan.FromSeconds(30), schedule.RequestedDelay);
            Assert.Empty(publisher.Events);
            await transaction.CommitAsync(TestContext.Current.CancellationToken);
            schedule.Release();
            Assert.Equal(eventId, (await publisher.NextAsync()).EventId);
            await AwaitPublishedAsync(scenario.Database, 1);
        }
        finally
        {
            schedule.Release();
            await worker.StopAsync(TestContext.Current.CancellationToken);
        }
    }

    // This local gate controls the synchronous timer-registration boundary without blocking provider I/O.
    private sealed class TransitionSchedule : IRecoverySchedule, IDisposable
    {
        private readonly ManualResetEventSlim release = new(false);

        public TaskCompletionSource Entered { get; } = new(TaskCreationOptions.RunContinuationsAsynchronously);

        public TimeSpan RequestedDelay
        {
            get; private set;
        }

        public double Jitter()
        {
            return 0.5;
        }

        public Task DelayAsync(TimeSpan delay, CancellationToken cancellationToken)
        {
            RequestedDelay = delay;
            _ = Entered.TrySetResult();
            return !release.Wait(TimeSpan.FromSeconds(5), cancellationToken)
                ? throw new TimeoutException("Test did not release the idle timer-registration boundary within five seconds.")
                : Task.Delay(Timeout.Infinite, cancellationToken);
        }

        public void Release()
        {
            release.Set();
        }

        public void Dispose()
        {
            release.Dispose();
        }
    }

    private static OutboxWorker Worker(BookingScenario scenario, AttemptPublisher publisher, IRecoverySchedule schedule, bool enabled = true, NpgsqlDataSource? source = null)
    {
        IConfiguration configuration = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["ConnectionStrings:messaging"] = enabled ? "amqp://fixture" : null
        }).Build();
        return new OutboxWorker(source ?? scenario.Database, publisher, schedule, scenario.Clock, configuration, NullLogger<OutboxWorker>.Instance);
    }

    private sealed class AttemptPublisher(bool gated = false, int failures = 0) : IReservationPublisher, IDisposable
    {
        private readonly Channel<ReservationEvent> attempts = Channel.CreateUnbounded<ReservationEvent>();
        private readonly SemaphoreSlim release = new(0);
        private int concurrency;

        public ConcurrentQueue<ReservationEvent> Events { get; } = new();

        public int MaximumConcurrency
        {
            get; private set;
        }

        public async Task PublishAsync(ReservationEvent message, string? traceparent, string? tracestate, CancellationToken cancellationToken)
        {
            Events.Enqueue(message);
            int active = Interlocked.Increment(ref concurrency);
            MaximumConcurrency = Math.Max(MaximumConcurrency, active);
            try
            {
                await attempts.Writer.WriteAsync(message, cancellationToken);
                if (Events.Count <= failures)
                {
                    throw new IOException("Controlled publisher transport failure");
                }

                if (gated)
                {
                    await release.WaitAsync(cancellationToken);
                }
            }
            finally
            {
                _ = Interlocked.Decrement(ref concurrency);
            }
        }

        public Task<ReservationEvent> NextAsync()
        {
            return attempts.Reader.ReadAsync(TestContext.Current.CancellationToken).AsTask().WaitAsync(TimeSpan.FromSeconds(5), TestContext.Current.CancellationToken);
        }

        public void Release()
        {
            _ = release.Release();
        }

        public void Dispose()
        {
            release.Dispose();
        }
    }

    private sealed class ManualSchedule : IRecoverySchedule, IDisposable
    {
        private readonly Channel<(TimeSpan Delay, TaskCompletionSource Completion)> delays = Channel.CreateUnbounded<(TimeSpan, TaskCompletionSource)>();
        private TaskCompletionSource? current;

        public double Jitter()
        {
            return 0.5;
        }

        public async Task DelayAsync(TimeSpan delay, CancellationToken cancellationToken)
        {
            var completion = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
            await delays.Writer.WriteAsync((delay, completion), cancellationToken);
            await completion.Task.WaitAsync(cancellationToken);
        }

        public async Task<TimeSpan> NextAsync()
        {
            (TimeSpan delay, current) = await delays.Reader.ReadAsync(TestContext.Current.CancellationToken).AsTask().WaitAsync(TimeSpan.FromSeconds(5), TestContext.Current.CancellationToken);
            return delay;
        }

        public void Advance()
        {
            _ = current!.TrySetResult();
        }

        public void Dispose()
        {
        }
    }
}
