using Npgsql;
using Persistence;

namespace Notifications;

public static class ServiceMigrations
{
    public static Task ApplyAsync(NpgsqlDataSource source, CancellationToken cancellationToken = default)
    {
        return SqlMigrations.ApplyEmbeddedAsync(source, typeof(ServiceMigrations).Assembly,
            new Dictionary<string, string>(StringComparer.Ordinal)
            {
                ["Notifications.Migrations.001_initial.sql"] = "820F1ED307350E2457C934B4D965D64AF20BD6F05988867925E33C5CC0BFFCA5"
            }, cancellationToken);
    }
}
