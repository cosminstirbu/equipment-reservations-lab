using System.Globalization;
using System.Reflection;
using System.Security.Cryptography;
using System.Text;
using Npgsql;

namespace Persistence;

public sealed record SqlMigration(int Version, string Sql);

public static class SqlMigrations
{
    private const long LockKey = 435487123;

    public static async Task ApplyEmbeddedAsync(NpgsqlDataSource source, Assembly assembly, CancellationToken cancellationToken = default)
    {
        var migrations = new List<SqlMigration>();
        IEnumerable<string> resources = assembly.GetManifestResourceNames()
            .Where(name => name.Contains(".Migrations.", StringComparison.Ordinal)
                && name.EndsWith(".sql", StringComparison.Ordinal))
            .Order(StringComparer.Ordinal);

        foreach (string resource in resources)
        {
            using Stream stream = assembly.GetManifestResourceStream(resource)!;
            using var reader = new StreamReader(stream);
            int version = int.Parse(resource.Split('.')[^2].Split('_')[0], CultureInfo.InvariantCulture);
            migrations.Add(new SqlMigration(version, await reader.ReadToEndAsync(cancellationToken)));
        }

        await ApplyAsync(source, migrations, cancellationToken);
    }

    public static async Task ApplyAsync(NpgsqlDataSource source, IEnumerable<SqlMigration> migrations, CancellationToken cancellationToken = default)
    {
        SqlMigration[] ordered = [.. migrations.OrderBy(migration => migration.Version)];
        if (ordered.Any(migration => migration.Version <= 0) || ordered.Select(migration => migration.Version).Distinct().Count() != ordered.Length)
        {
            throw new ArgumentException("Migration versions must be positive and unique.", nameof(migrations));
        }

        await using NpgsqlConnection connection = await source.OpenConnectionAsync(cancellationToken);
        await using (var acquire = new NpgsqlCommand("SELECT pg_advisory_lock($1)", connection) { CommandTimeout = 30 })
        {
            _ = acquire.Parameters.AddWithValue(LockKey);
            _ = await acquire.ExecuteNonQueryAsync(cancellationToken);
        }

        try
        {
            await using (var ledger = new NpgsqlCommand("CREATE TABLE IF NOT EXISTS schema_migrations (version integer PRIMARY KEY, applied_at timestamptz NOT NULL, checksum text NOT NULL)", connection) { CommandTimeout = 30 })
            {
                _ = await ledger.ExecuteNonQueryAsync(cancellationToken);
            }

            foreach (SqlMigration migration in ordered)
            {
                string checksum = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(migration.Sql)));
                await using var lookup = new NpgsqlCommand("SELECT checksum FROM schema_migrations WHERE version=$1", connection);
                _ = lookup.Parameters.AddWithValue(migration.Version);
                object? applied = await lookup.ExecuteScalarAsync(cancellationToken);
                if (applied is string existing)
                {
                    if (existing != checksum)
                    {
                        throw new InvalidOperationException($"Applied migration {migration.Version} has a changed checksum.");
                    }

                    continue;
                }

                await using NpgsqlTransaction transaction = await connection.BeginTransactionAsync(cancellationToken);
                await using var command = new NpgsqlCommand(migration.Sql, connection, transaction) { CommandTimeout = 30 };
                _ = await command.ExecuteNonQueryAsync(cancellationToken);
                await using var record = new NpgsqlCommand("INSERT INTO schema_migrations (version, applied_at, checksum) VALUES ($1, CURRENT_TIMESTAMP, $2)", connection, transaction);
                _ = record.Parameters.AddWithValue(migration.Version);
                _ = record.Parameters.AddWithValue(checksum);
                _ = await record.ExecuteNonQueryAsync(cancellationToken);
                await transaction.CommitAsync(cancellationToken);
            }
        }
        finally
        {
            await using var release = new NpgsqlCommand("SELECT pg_advisory_unlock($1)", connection) { CommandTimeout = 3 };
            _ = release.Parameters.AddWithValue(LockKey);
            _ = await release.ExecuteNonQueryAsync(CancellationToken.None);
        }
    }
}
