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
                ["Reservations.Migrations.001_initial.sql"] = "70A2F6C7E59014A277ED39B24A49503ED60674C0E05316A95FC71A5660D128A7"
            }, cancellationToken);
    }
}
