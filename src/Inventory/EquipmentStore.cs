using Npgsql;
using Persistence;

namespace Inventory;

public sealed record EquipmentItem(string Id, string Name, bool Operational);

public sealed class EquipmentStore(NpgsqlDataSource database)
{
    private const string ListSql = "SELECT id, name, operational FROM equipment ORDER BY id";
    private const string FindSql = "SELECT id, name, operational FROM equipment WHERE id=$1";

    public static IReadOnlyList<DatabaseCommand> Commands
    {
        get;
    } =
    [
        new("equipment.list", ListSql),
        new("equipment.find", FindSql)
    ];

    public async Task<EquipmentItem[]> ListAsync(CancellationToken cancellationToken)
    {
        await using NpgsqlCommand command = database.CreateCommand(ListSql);
        await using NpgsqlDataReader reader = await command.ExecuteReaderAsync(cancellationToken);
        var items = new List<EquipmentItem>();
        while (await reader.ReadAsync(cancellationToken))
        {
            items.Add(Read(reader));
        }

        return [.. items];
    }

    public async Task<EquipmentItem?> FindAsync(string id, CancellationToken cancellationToken)
    {
        await using NpgsqlCommand command = database.CreateCommand(FindSql);
        _ = command.Parameters.AddWithValue(id);
        await using NpgsqlDataReader reader = await command.ExecuteReaderAsync(cancellationToken);
        return await reader.ReadAsync(cancellationToken) ? Read(reader) : null;
    }

    private static EquipmentItem Read(NpgsqlDataReader reader)
    {
        return new EquipmentItem(reader.GetString(0), reader.GetString(1), reader.GetBoolean(2));
    }
}
