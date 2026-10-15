using System.Diagnostics;
using HelloMessaging;
using Npgsql;
using Persistence;

namespace Reservations;

public sealed class OutboxWorker(NpgsqlDataSource database, IReservationPublisher publisher, IRecoverySchedule schedule, TimeProvider time, IConfiguration configuration, ILogger<OutboxWorker> logger) : BackgroundService
{
    private const string SnapshotSql = "SELECT count(*), min(occurred_at) FROM reservation_outbox WHERE published_at IS NULL";
    private const string SelectSql = "SELECT event_id,reservation_id,event_type,schema_version,demo_user_id,equipment_id,equipment_name,start_at,end_at,occurred_at,attempt_count,traceparent,tracestate FROM reservation_outbox WHERE published_at IS NULL AND next_attempt_at <= $1 ORDER BY next_attempt_at,event_id FOR UPDATE SKIP LOCKED LIMIT 1";
    private const string PublishedSql = "UPDATE reservation_outbox SET published_at=$2,attempt_count=attempt_count+1 WHERE event_id=$1";
    private const string RescheduleSql = "UPDATE reservation_outbox SET attempt_count=attempt_count+1,next_attempt_at=$2 WHERE event_id=$1 AND published_at IS NULL";

    public static IReadOnlyList<DatabaseCommand> Commands
    {
        get;
    } =
    [
        new("outbox.snapshot", SnapshotSql),
        new("outbox.select", SelectSql),
        new("outbox.published", PublishedSql),
        new("outbox.reschedule", RescheduleSql)
    ];

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        if (string.IsNullOrEmpty(configuration.GetConnectionString("messaging")))
        {
            return;
        }

        int failures = 0;
        try
        {
            while (!stoppingToken.IsCancellationRequested)
            {
                TimeSpan delay;
                long started = Stopwatch.GetTimestamp();
                try
                {
                    delay = await AttemptAsync(stoppingToken);
                    failures = 0;
                }
                catch (Exception exception) when (!stoppingToken.IsCancellationRequested)
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
                    await schedule.DelayAsync(delay, stoppingToken);
                }
            }
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
        {
        }
    }

    private async Task<TimeSpan> AttemptAsync(CancellationToken stoppingToken)
    {
        await using NpgsqlConnection connection = await ReservationTelemetry.DatabaseAsync(token => database.OpenConnectionAsync(token).AsTask(), stoppingToken);
        await using (var snapshot = new NpgsqlCommand(SnapshotSql, connection))
        {
            await using NpgsqlDataReader reader = await ReservationTelemetry.DatabaseAsync(snapshot.ExecuteReaderAsync, stoppingToken);
            _ = await reader.ReadAsync(stoppingToken);
            long count = reader.GetInt64(0);
            double age = reader.IsDBNull(1) ? 0 : (ReservationValidation.UtcNow(time) - reader.GetFieldValue<DateTimeOffset>(1)).TotalSeconds;
            ReservationTelemetry.OutboxSnapshot(count, age);
        }

        await using NpgsqlTransaction transaction = await connection.BeginTransactionAsync(stoppingToken);
        ReservationEvent message;
        int attempts;
        string? parent;
        string? state;
        await using (var command = new NpgsqlCommand(SelectSql, connection, transaction))
        {
            _ = command.Parameters.AddWithValue(ReservationValidation.UtcNow(time));
            await using NpgsqlDataReader reader = await ReservationTelemetry.DatabaseAsync(command.ExecuteReaderAsync, stoppingToken);
            if (!await reader.ReadAsync(stoppingToken))
            {
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
