using Npgsql;
using Persistence;

namespace Reservations;

public static class ServiceMigrations
{
    public static Task ApplyAsync(NpgsqlDataSource source, CancellationToken cancellationToken = default)
    {
        return SqlMigrations.ApplyEmbeddedAsync(source, typeof(ServiceMigrations).Assembly,
            new Dictionary<string, string>(StringComparer.Ordinal)
            {
                ["Reservations.Migrations.001_initial.sql"] = "9CE4C0FEC08D7E10A506F32E4223022492FC83A28BF8BD607CDE5033277A0EA0"
            }, cancellationToken);
    }
}
