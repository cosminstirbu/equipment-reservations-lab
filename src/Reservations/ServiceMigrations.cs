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
                ["Reservations.Migrations.001_initial.sql"] = "9CE4C0FEC08D7E10A506F32E4223022492FC83A28BF8BD607CDE5033277A0EA0",
                ["Reservations.Migrations.002_outbox_notifications.sql"] = "B2D7EE7284706734B271A2C8159323862F3832B717277EC9D3D6190FA96CD9D8"
            }, cancellationToken);
    }
}
