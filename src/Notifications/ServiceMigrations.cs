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
                ["Notifications.Migrations.001_initial.sql"] = "57EB255A20290541A6106945F5628694B992A617BFB3CD8D6FBEE1796A9E2378"
            }, cancellationToken);
    }
}
