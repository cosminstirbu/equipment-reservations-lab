using System.Diagnostics;
using Npgsql;
using Persistence;
using ReservationMessaging;

namespace Reservations;

public sealed class OutboxWorker(NpgsqlDataSource database, IReservationPublisher publisher, IRecoverySchedule schedule, TimeProvider time, IConfiguration configuration, ILogger<OutboxWorker> logger) : BackgroundService
{
    private const string SnapshotSql = "SELECT count(*), min(occurred_at), min(next_attempt_at) FILTER (WHERE next_attempt_at > $1) FROM reservation_outbox WHERE published_at IS NULL";
    private const string SelectSql = "SELECT event_id,reservation_id,event_type,schema_version,user_key,equipment_id,equipment_name,start_at,end_at,occurred_at,attempt_count,traceparent,tracestate FROM reservation_outbox WHERE published_at IS NULL AND next_attempt_at <= $1 ORDER BY next_attempt_at,event_id FOR UPDATE SKIP LOCKED LIMIT 1";
    private const string PublishedSql = "UPDATE reservation_outbox SET published_at=$2,attempt_count=attempt_count+1 WHERE event_id=$1";
    private const string RescheduleSql = "UPDATE reservation_outbox SET attempt_count=attempt_count+1,next_attempt_at=$2 WHERE event_id=$1 AND published_at IS NULL";

    public static IReadOnlyList<DatabaseCommand> Commands
    {
        get;
    } =
    [
        new("outbox.listen", OutboxListener.ListenSql),
        new("outbox.unlisten", OutboxListener.UnlistenSql),
        new("outbox.snapshot", SnapshotSql),
        new("outbox.select", SelectSql),
        new("outbox.published", PublishedSql),
        new("outbox.reschedule", RescheduleSql)
    ];

    private bool idle;
    private DateTimeOffset? nextRetry;

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        if (string.IsNullOrEmpty(configuration.GetConnectionString("messaging")))
        {
            return;
        }

        using var listener = new OutboxListener(database, schedule, logger);
        using var lifetime = CancellationTokenSource.CreateLinkedTokenSource(stoppingToken);
        Task receiving = listener.RunAsync(lifetime.Token);
        await listener.Ready;
        using var processing = CancellationTokenSource.CreateLinkedTokenSource(stoppingToken, listener.TerminalToken);
        CancellationToken token = processing.Token;
        ReservationTelemetry.OutboxWakeup("startup");
        int failures = 0;
        try
        {
            while (!token.IsCancellationRequested)
            {
                TimeSpan delay;
                long started = Stopwatch.GetTimestamp();
                try
                {
                    listener.ConsumeSignal();
                    idle = false;
                    delay = await AttemptAsync(token);
                    failures = 0;
                }
                catch (Exception exception) when (!token.IsCancellationRequested)
                {
                    if (DatabaseFailure.IsPermanent(exception) || ReservationFailure.IsPermanent(exception))
                    {
                        ReservationMessagingTelemetry.Record("outbox", "permanent_error", started);
                        ReservationsLog.Delivery(logger, "outbox", "permanent_error");
                        return;
                    }

                    failures++;
                    delay = Backoff(failures);
                }

                if (delay > TimeSpan.Zero)
                {
                    if (idle)
                    {
                        TimeSpan fallback = listener.IsListening ? TimeSpan.FromSeconds(30) : TimeSpan.FromSeconds(10);
                        TimeSpan remaining = nextRetry is { } due ? due - ReservationValidation.UtcNow(time) : fallback;
                        bool retry = nextRetry.HasValue && remaining <= fallback;
                        TimeSpan wait = remaining < TimeSpan.Zero ? TimeSpan.Zero : TimeSpan.FromTicks(Math.Min(fallback.Ticks, remaining.Ticks));
                        string timerCause = listener.IsListening ? "fallback" : "degraded_poll";
                        if (retry)
                        {
                            timerCause = "retry";
                        }

                        string cause = await WaitAsync(listener, wait, timerCause, token);
                        ReservationTelemetry.OutboxWakeup(cause);
                    }
                    else
                    {
                        await schedule.DelayAsync(delay, token);
                    }
                }
            }
        }
        catch (OperationCanceledException) when (token.IsCancellationRequested)
        {
            if (listener.TerminalToken.IsCancellationRequested && !stoppingToken.IsCancellationRequested)
            {
                ReservationsLog.Delivery(logger, "outbox", "permanent_error");
            }
        }
        catch (Exception) when (listener.TerminalToken.IsCancellationRequested)
        {
            ReservationsLog.Delivery(logger, "outbox", "permanent_error");
        }
        finally
        {
            await lifetime.CancelAsync();
            await receiving;
        }
    }

    private async Task<TimeSpan> AttemptAsync(CancellationToken stoppingToken)
    {
        DateTimeOffset scannedAt = ReservationValidation.UtcNow(time);
        await using NpgsqlConnection connection = await ReservationTelemetry.DatabaseAsync(token => database.OpenConnectionAsync(token).AsTask(), stoppingToken);
        await using (var snapshot = new NpgsqlCommand(SnapshotSql, connection))
        {
            _ = snapshot.Parameters.AddWithValue(scannedAt);
            await using NpgsqlDataReader reader = await ReservationTelemetry.DatabaseAsync(snapshot.ExecuteReaderAsync, stoppingToken);
            _ = await reader.ReadAsync(stoppingToken);
            long count = reader.GetInt64(0);
            double age = reader.IsDBNull(1) ? 0 : (ReservationValidation.UtcNow(time) - reader.GetFieldValue<DateTimeOffset>(1)).TotalSeconds;
            nextRetry = reader.IsDBNull(2) ? null : reader.GetFieldValue<DateTimeOffset>(2);
            ReservationTelemetry.OutboxSnapshot(count, age);
        }

        await using NpgsqlTransaction transaction = await connection.BeginTransactionAsync(stoppingToken);
        ReservationEvent message;
        int attempts;
        string? parent;
        string? state;
        await using (var command = new NpgsqlCommand(SelectSql, connection, transaction))
        {
            _ = command.Parameters.AddWithValue(scannedAt);
            await using NpgsqlDataReader reader = await ReservationTelemetry.DatabaseAsync(command.ExecuteReaderAsync, stoppingToken);
            if (!await reader.ReadAsync(stoppingToken))
            {
                idle = true;
                return TimeSpan.FromSeconds(10);
            }

            message = new ReservationEvent(reader.GetInt32(3), reader.GetGuid(0), reader.GetString(2), reader.GetGuid(1), reader.GetString(4), reader.GetString(5), reader.GetString(6),
                reader.GetFieldValue<DateTimeOffset>(7), reader.GetFieldValue<DateTimeOffset>(8), reader.GetFieldValue<DateTimeOffset>(9));
            attempts = reader.GetInt32(10);
            parent = reader.IsDBNull(11) ? null : reader.GetString(11);
            state = reader.IsDBNull(12) ? null : reader.GetString(12);
        }

        long started = Stopwatch.GetTimestamp();
        _ = ActivityContext.TryParse(parent, state, out ActivityContext context);
        using Activity? activity = ReservationMessagingTelemetry.Activities.StartActivity("reservation.publish", ActivityKind.Producer, context);
        _ = activity?.SetTag("event.id", message.EventId.ToString());
        _ = activity?.SetTag("reservation.id", message.ReservationId.ToString());
        try
        {
            using var budget = CancellationTokenSource.CreateLinkedTokenSource(stoppingToken);
            budget.CancelAfter(TimeSpan.FromSeconds(3));
            await PublishAsync(message, parent, state, budget.Token);
            await using var published = new NpgsqlCommand(PublishedSql, connection, transaction);
            _ = published.Parameters.AddWithValue(message.EventId);
            _ = published.Parameters.AddWithValue(ReservationValidation.UtcNow(time));
            _ = await ReservationTelemetry.DatabaseAsync(published.ExecuteNonQueryAsync, stoppingToken);
            _ = await ReservationTelemetry.DatabaseAsync(async token =>
            {
                await transaction.CommitAsync(token);
                return true;
            }, stoppingToken);
            _ = activity?.SetStatus(ActivityStatusCode.Ok);
            ReservationMessagingTelemetry.Record("publish", "published", started);
            ReservationsLog.Delivery(logger, "publish", "published");
            return TimeSpan.Zero;
        }
        catch (Exception exception) when (!stoppingToken.IsCancellationRequested)
        {
            await transaction.RollbackAsync(stoppingToken);
            if (DatabaseFailure.IsPermanent(exception))
            {
                _ = activity?.SetStatus(ActivityStatusCode.Error);
                throw;
            }

            bool permanent = ReservationFailure.IsPermanent(exception);
            TimeSpan delay = permanent ? TimeSpan.FromSeconds(10) : Backoff(attempts + 1);
            await using NpgsqlCommand reschedule = database.CreateCommand(RescheduleSql);
            _ = reschedule.Parameters.AddWithValue(message.EventId);
            DateTimeOffset due = permanent
                ? new DateTimeOffset(9999, 12, 31, 23, 59, 59, TimeSpan.Zero).AddTicks(9999990)
                : ReservationValidation.UtcNow(time) + delay;
            _ = reschedule.Parameters.AddWithValue(due);
            _ = await ReservationTelemetry.DatabaseAsync(reschedule.ExecuteNonQueryAsync, stoppingToken);
            _ = activity?.SetStatus(ActivityStatusCode.Error);
            string outcome = permanent ? "permanent_error" : "retry";
            ReservationMessagingTelemetry.Record("publish", outcome, started);
            ReservationsLog.Delivery(logger, "publish", outcome);
            return delay;
        }
    }

    private async Task<string> WaitAsync(OutboxListener listener, TimeSpan delay, string timerCause, CancellationToken cancellationToken)
    {
        using var wait = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        Task timer = schedule.DelayAsync(delay, wait.Token);
        Task<string> signal = listener.WaitAsync(wait.Token);
        Task completed = await Task.WhenAny(timer, signal);
        await wait.CancelAsync();
        try
        {
            await Task.WhenAll(timer, signal);
        }
        catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
        {
        }

        await completed;
        return completed == signal ? await signal : timerCause;
    }

    private TimeSpan Backoff(int failures)
    {
        int attempt = (failures - 1) % 3;
        if (attempt == 2)
        {
            return TimeSpan.FromSeconds(10);
        }

        double jitter = 0.75 + (schedule.Jitter() * 0.5);
        return TimeSpan.FromSeconds(Math.Min(4, Math.Pow(2, attempt) * jitter));
    }

    private async Task PublishAsync(ReservationEvent message, string? parent, string? state, CancellationToken cancellationToken)
    {
        long started = Stopwatch.GetTimestamp();
        string outcome = "available";
        try
        {
            await publisher.PublishAsync(message, parent, state, cancellationToken);
        }
        catch (Exception exception)
        {
            outcome = ReservationFailure.IsPermanent(exception) || DatabaseFailure.IsPermanent(exception) ? "permanent_error" : "unavailable";
            throw;
        }
        finally
        {
            ReservationMessagingTelemetry.Dependency("broker_publish", outcome, started);
        }
    }
}
