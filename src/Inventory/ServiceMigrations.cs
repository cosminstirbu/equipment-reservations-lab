using Npgsql;
using Persistence;

namespace Inventory;

public static class ServiceMigrations
{
    public static Task ApplyAsync(NpgsqlDataSource source, CancellationToken cancellationToken = default)
    {
        return SqlMigrations.ApplyEmbeddedAsync(source, typeof(ServiceMigrations).Assembly,
            new Dictionary<string, string>(StringComparer.Ordinal)
            {
                ["Inventory.Migrations.001_initial.sql"] = "8346D2E4C9E8873DDA21C745A75D4642055C7AB8E8A5E4038FFE940E9BB841AD"
            }, cancellationToken);
    }
}
