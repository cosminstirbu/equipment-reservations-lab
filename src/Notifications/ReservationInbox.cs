using HelloMessaging;
using Npgsql;
using Persistence;

namespace Notifications;

public sealed class ReservationInbox(NpgsqlDataSource database, TimeProvider time)
{
    private const string InsertSql = "INSERT INTO reservation_inbox (event_id,reservation_id,demo_user_id,event_type,schema_version,equipment_id,equipment_name,start_at,end_at,occurred_at,received_at,message) VALUES ($1,$2,$3,$4,1,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT (event_id) DO NOTHING";
    private const string ListSql = "SELECT event_id,reservation_id,demo_user_id,equipment_id,equipment_name,event_type,start_at,end_at,occurred_at,received_at,message FROM reservation_inbox ORDER BY occurred_at DESC,event_id";

    public static IReadOnlyList<DatabaseCommand> Commands
    {
        get;
    } =
    [
        new("inbox.insert", InsertSql),
        new("inbox.list", ListSql)
    ];

    public async Task<bool> ReceiveAsync(ReservationEvent message, CancellationToken cancellationToken)
    {
        if (!ReservationEventValidation.Valid(message))
        {
            throw new InvalidDataException("Invalid reservation envelope.");
        }

        string text = message.EventType == "ReservationConfirmed"
            ? $"Reservation confirmed for {message.EquipmentName}"
            : $"Reservation cancelled for {message.EquipmentName}";
        DateTimeOffset now = time.GetUtcNow();
        now = now.AddTicks(-(now.Ticks % 10));
        await using NpgsqlConnection connection = await database.OpenConnectionAsync(cancellationToken);
        await using NpgsqlTransaction transaction = await connection.BeginTransactionAsync(cancellationToken);
        await using var insert = new NpgsqlCommand(InsertSql, connection, transaction);
        _ = insert.Parameters.AddWithValue(message.EventId);
        _ = insert.Parameters.AddWithValue(message.ReservationId);
        _ = insert.Parameters.AddWithValue(message.DemoUserId);
        _ = insert.Parameters.AddWithValue(message.EventType);
        _ = insert.Parameters.AddWithValue(message.EquipmentId);
        _ = insert.Parameters.AddWithValue(message.EquipmentName);
        _ = insert.Parameters.AddWithValue(message.StartAt);
        _ = insert.Parameters.AddWithValue(message.EndAt);
        _ = insert.Parameters.AddWithValue(message.OccurredAt);
        _ = insert.Parameters.AddWithValue(now);
        _ = insert.Parameters.AddWithValue(text);
        bool stored = await insert.ExecuteNonQueryAsync(cancellationToken) == 1;
        await transaction.CommitAsync(cancellationToken);
        return stored;
    }

    public async Task<InboxEntry[]> ListAsync(CancellationToken cancellationToken)
    {
        await using NpgsqlCommand command = database.CreateCommand(ListSql);
        await using NpgsqlDataReader reader = await command.ExecuteReaderAsync(cancellationToken);
        var entries = new List<InboxEntry>();
        while (await reader.ReadAsync(cancellationToken))
        {
            entries.Add(new InboxEntry(reader.GetGuid(0), reader.GetGuid(1), reader.GetString(2), reader.GetString(3), reader.GetString(4), reader.GetString(5),
                reader.GetFieldValue<DateTimeOffset>(6), reader.GetFieldValue<DateTimeOffset>(7), reader.GetFieldValue<DateTimeOffset>(8), reader.GetFieldValue<DateTimeOffset>(9), reader.GetString(10)));
        }

        return [.. entries];
    }
}
