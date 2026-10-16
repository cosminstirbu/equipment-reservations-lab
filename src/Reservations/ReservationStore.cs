using System.Diagnostics;
using Npgsql;
using NpgsqlTypes;
using Persistence;

namespace Reservations;

public sealed class ReservationStore(NpgsqlDataSource database, TimeProvider time)
{
    private const string Projection = "SELECT r.id, r.user_key, r.equipment_id, r.equipment_name, r.start_at, r.end_at, r.status, r.confirmed_at, r.cancelled_at, (SELECT event_id FROM reservation_outbox WHERE reservation_id=r.id AND event_type='ReservationConfirmed'), (SELECT event_id FROM reservation_outbox WHERE reservation_id=r.id AND event_type='ReservationCancelled') FROM reservations r";
    private const string AvailableSql = "SELECT NOT EXISTS (SELECT 1 FROM reservations WHERE equipment_id=$1 AND status='Confirmed' AND tstzrange(start_at,end_at,'[)') && tstzrange($2,$3,'[)'))";
    private const string InsertSql = "INSERT INTO reservations (id,user_key,equipment_id,equipment_name,start_at,end_at,status,confirmed_at) VALUES ($1,$2,$3,$4,$5,$6,'Confirmed',$7)";
    private const string ConfirmedOutboxSql = "INSERT INTO reservation_outbox (event_id,reservation_id,event_type,schema_version,user_key,equipment_id,equipment_name,start_at,end_at,occurred_at,next_attempt_at,traceparent,tracestate) VALUES ($1,$2,'ReservationConfirmed',1,$3,$4,$5,$6,$7,$8,$8,$9,$10)";
    private const string LockSql = "SELECT id FROM reservations WHERE id=$1 AND user_key=$2 FOR UPDATE";
    private const string CancelSql = "UPDATE reservations SET status='Cancelled', cancelled_at=$3 WHERE id=$1 AND user_key=$2";
    private const string CancelledOutboxSql = "INSERT INTO reservation_outbox (event_id,reservation_id,event_type,schema_version,user_key,equipment_id,equipment_name,start_at,end_at,occurred_at,next_attempt_at,traceparent,tracestate) VALUES ($1,$2,'ReservationCancelled',1,$3,$4,$5,$6,$7,$8,$8,$9,$10)";
    private const string FindSql = Projection + " WHERE r.id=$1 AND r.user_key=$2";
    private const string ListSql = Projection + " WHERE r.user_key=$1 ORDER BY r.confirmed_at DESC, r.id";

    public static IReadOnlyList<DatabaseCommand> Commands
    {
        get;
    } =
    [
        new("reservation.available", AvailableSql),
        new("reservation.insert", InsertSql),
        new("outbox.insert.confirmed", ConfirmedOutboxSql),
        new("reservation.lock", LockSql),
        new("reservation.cancel", CancelSql),
        new("outbox.insert.cancelled", CancelledOutboxSql),
        new("reservation.find", FindSql),
        new("reservation.list", ListSql)
    ];

    public async Task<bool> AvailableAsync(ReservationInterval interval, CancellationToken cancellationToken)
    {
        ReservationValidation.EnsureNotPast(interval, ReservationValidation.UtcNow(time));
        await using NpgsqlCommand command = database.CreateCommand(AvailableSql);
        AddInterval(command, interval);
        return (bool)(await command.ExecuteScalarAsync(cancellationToken))!;
    }

    public async Task<Reservation> ConfirmAsync(ReservationInterval interval, string equipmentName, string userKey, CancellationToken cancellationToken)
    {
        try
        {
            await using NpgsqlConnection connection = await database.OpenConnectionAsync(cancellationToken);
            await using NpgsqlTransaction transaction = await connection.BeginTransactionAsync(cancellationToken);
            DateTimeOffset now = ReservationValidation.UtcNow(time);
            ReservationValidation.EnsureNotPast(interval, now);
            var id = Guid.NewGuid();
            var eventId = Guid.NewGuid();
            await using var reservation = new NpgsqlCommand(InsertSql, connection, transaction);
            _ = reservation.Parameters.AddWithValue(id);
            _ = reservation.Parameters.AddWithValue(userKey);
            _ = reservation.Parameters.AddWithValue(interval.EquipmentId);
            _ = reservation.Parameters.AddWithValue(equipmentName);
            _ = reservation.Parameters.AddWithValue(interval.StartAt);
            _ = reservation.Parameters.AddWithValue(interval.EndAt);
            _ = reservation.Parameters.AddWithValue(now);
            _ = await reservation.ExecuteNonQueryAsync(cancellationToken);

            await using var outbox = new NpgsqlCommand(ConfirmedOutboxSql, connection, transaction);
            _ = outbox.Parameters.AddWithValue(eventId);
            _ = outbox.Parameters.AddWithValue(id);
            _ = outbox.Parameters.AddWithValue(userKey);
            _ = outbox.Parameters.AddWithValue(interval.EquipmentId);
            _ = outbox.Parameters.AddWithValue(equipmentName);
            _ = outbox.Parameters.AddWithValue(interval.StartAt);
            _ = outbox.Parameters.AddWithValue(interval.EndAt);
            _ = outbox.Parameters.AddWithValue(now);
            _ = outbox.Parameters.AddWithValue(NpgsqlDbType.Text, (object?)Activity.Current?.Id ?? DBNull.Value);
            _ = outbox.Parameters.AddWithValue(NpgsqlDbType.Text, (object?)Activity.Current?.TraceStateString ?? DBNull.Value);
            _ = await outbox.ExecuteNonQueryAsync(cancellationToken);
            await transaction.CommitAsync(cancellationToken);
            _ = (Activity.Current?.SetTag("reservation.id", id));
            _ = (Activity.Current?.SetTag("reservation.event_id", eventId));
            _ = (Activity.Current?.SetTag("equipment.id", interval.EquipmentId));

            return new Reservation(id, userKey, interval.EquipmentId, equipmentName, interval.StartAt, interval.EndAt, "Confirmed", now, null, eventId, null);
        }
        catch (PostgresException exception) when (exception.SqlState == "23P01" && exception.ConstraintName == "reservations_no_confirmed_overlap")
        {
            throw new ReservationProblemException(409, "booking_conflict", "Another confirmed reservation overlaps these dates. Check another interval.");
        }
    }

    public async Task<Reservation> CancelAsync(Guid id, string userKey, CancellationToken cancellationToken)
    {
        await using NpgsqlConnection connection = await database.OpenConnectionAsync(cancellationToken);
        await using NpgsqlTransaction transaction = await connection.BeginTransactionAsync(cancellationToken);
        await using (var rowLock = new NpgsqlCommand(LockSql, connection, transaction))
        {
            _ = rowLock.Parameters.AddWithValue(id);
            _ = rowLock.Parameters.AddWithValue(userKey);
            if (await rowLock.ExecuteScalarAsync(cancellationToken) is null)
            {
                throw new ReservationProblemException(404, "reservation_not_found", "Reservation was not found.");
            }
        }

        // A new READ COMMITTED statement snapshot includes the outbox event committed
        // by a cancellation that held the lock before this request.
        Reservation current;
        await using (var command = new NpgsqlCommand(FindSql, connection, transaction))
        {
            _ = command.Parameters.AddWithValue(id);
            _ = command.Parameters.AddWithValue(userKey);
            await using NpgsqlDataReader reader = await command.ExecuteReaderAsync(cancellationToken);
            _ = await reader.ReadAsync(cancellationToken);
            current = Read(reader);
        }

        if (current.Status == "Cancelled")
        {
            await transaction.CommitAsync(cancellationToken);
            _ = (Activity.Current?.SetTag("reservation.id", current.Id));
            _ = (Activity.Current?.SetTag("reservation.event_id", current.CancellationEventId));
            _ = (Activity.Current?.SetTag("equipment.id", current.EquipmentId));
            return current;
        }

        DateTimeOffset now = ReservationValidation.UtcNow(time);
        if (now >= current.StartAt)
        {
            throw new ReservationProblemException(409, "cancellation_started", "This confirmed reservation has already started and cannot be cancelled.");
        }

        var eventId = Guid.NewGuid();
        await using var update = new NpgsqlCommand(CancelSql, connection, transaction);
        _ = update.Parameters.AddWithValue(id);
        _ = update.Parameters.AddWithValue(userKey);
        _ = update.Parameters.AddWithValue(now);
        _ = await update.ExecuteNonQueryAsync(cancellationToken);

        await using var outbox = new NpgsqlCommand(CancelledOutboxSql, connection, transaction);
        _ = outbox.Parameters.AddWithValue(eventId);
        _ = outbox.Parameters.AddWithValue(id);
        _ = outbox.Parameters.AddWithValue(userKey);
        _ = outbox.Parameters.AddWithValue(current.EquipmentId);
        _ = outbox.Parameters.AddWithValue(current.EquipmentName);
        _ = outbox.Parameters.AddWithValue(current.StartAt);
        _ = outbox.Parameters.AddWithValue(current.EndAt);
        _ = outbox.Parameters.AddWithValue(now);
        _ = outbox.Parameters.AddWithValue(NpgsqlDbType.Text, (object?)Activity.Current?.Id ?? DBNull.Value);
        _ = outbox.Parameters.AddWithValue(NpgsqlDbType.Text, (object?)Activity.Current?.TraceStateString ?? DBNull.Value);
        _ = await outbox.ExecuteNonQueryAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);
        _ = (Activity.Current?.SetTag("reservation.id", id));
        _ = (Activity.Current?.SetTag("reservation.event_id", eventId));
        _ = (Activity.Current?.SetTag("equipment.id", current.EquipmentId));
        return current with
        {
            Status = "Cancelled",
            CancelledAt = now,
            CancellationEventId = eventId
        };
    }

    public async Task<Reservation[]> ListAsync(string userKey, CancellationToken cancellationToken)
    {
        await using NpgsqlCommand command = database.CreateCommand(ListSql);
        _ = command.Parameters.AddWithValue(userKey);
        await using NpgsqlDataReader reader = await command.ExecuteReaderAsync(cancellationToken);
        var reservations = new List<Reservation>();
        while (await reader.ReadAsync(cancellationToken))
        {
            reservations.Add(Read(reader));
        }

        return [.. reservations];
    }

    public async Task<Reservation?> FindAsync(Guid id, string userKey, CancellationToken cancellationToken)
    {
        await using NpgsqlCommand command = database.CreateCommand(FindSql);
        _ = command.Parameters.AddWithValue(id);
        _ = command.Parameters.AddWithValue(userKey);
        await using NpgsqlDataReader reader = await command.ExecuteReaderAsync(cancellationToken);
        return await reader.ReadAsync(cancellationToken) ? Read(reader) : null;
    }

    private static void AddInterval(NpgsqlCommand command, ReservationInterval interval)
    {
        _ = command.Parameters.AddWithValue(interval.EquipmentId);
        _ = command.Parameters.AddWithValue(interval.StartAt);
        _ = command.Parameters.AddWithValue(interval.EndAt);
    }

    private static Reservation Read(NpgsqlDataReader reader)
    {
        return new Reservation(reader.GetGuid(0), reader.GetString(1), reader.GetString(2), reader.GetString(3),
            reader.GetFieldValue<DateTimeOffset>(4), reader.GetFieldValue<DateTimeOffset>(5), reader.GetString(6), reader.GetFieldValue<DateTimeOffset>(7),
            reader.IsDBNull(8) ? null : reader.GetFieldValue<DateTimeOffset>(8), reader.GetGuid(9), reader.IsDBNull(10) ? null : reader.GetGuid(10));
    }
}
