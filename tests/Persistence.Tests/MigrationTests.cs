using Npgsql;
using Xunit;

namespace Persistence.Tests;

[Collection("Database telemetry and recovery")]
public sealed class MigrationTests(PostgresFixture postgres)
{
    private static readonly SqlMigration Initial = new(1, "CREATE TABLE equipment (id text PRIMARY KEY, name text NOT NULL); INSERT INTO equipment VALUES ('camera-001', 'Demo Camera') ON CONFLICT DO NOTHING;");

    [Fact]
    public async Task RealDatabaseUsesSelectedPostgreSqlVersion()
    {
        await using NpgsqlDataSource source = await postgres.CreateDatabaseAsync();
        await using NpgsqlCommand command = source.CreateCommand("SHOW server_version");
        Assert.StartsWith("18.6", (string)(await command.ExecuteScalarAsync(TestContext.Current.CancellationToken))!);
    }

    [Fact]
    public async Task FirstRunCreatesSchemaSeedAndLedger()
    {
        await using NpgsqlDataSource source = await postgres.CreateDatabaseAsync();
        await SqlMigrations.ApplyAsync(source, [Initial], TestContext.Current.CancellationToken);
        Assert.Equal(1L, await ScalarAsync(source, "SELECT count(*) FROM equipment WHERE id='camera-001' AND name='Demo Camera'"));
        Assert.Equal(1L, await ScalarAsync(source, "SELECT count(*) FROM schema_migrations WHERE version=1 AND applied_at IS NOT NULL AND length(checksum)=64"));
    }

    [Fact]
    public async Task SecondRunPreservesEditedSeedAndDoesNotDuplicateLedger()
    {
        await using NpgsqlDataSource source = await postgres.CreateDatabaseAsync();
        await SqlMigrations.ApplyAsync(source, [Initial], TestContext.Current.CancellationToken);
        await using NpgsqlCommand edit = source.CreateCommand("UPDATE equipment SET name='Edited Camera'");
        _ = await edit.ExecuteNonQueryAsync(TestContext.Current.CancellationToken);
        await SqlMigrations.ApplyAsync(source, [Initial], TestContext.Current.CancellationToken);
        Assert.Equal(1L, await ScalarAsync(source, "SELECT count(*) FROM equipment WHERE name='Edited Camera'"));
        Assert.Equal(1L, await ScalarAsync(source, "SELECT count(*) FROM schema_migrations"));
    }

    [Fact]
    public async Task ChangedAppliedMigrationFailsWithoutChangingData()
    {
        await using NpgsqlDataSource source = await postgres.CreateDatabaseAsync();
        await SqlMigrations.ApplyAsync(source, [Initial], TestContext.Current.CancellationToken);
        _ = await Assert.ThrowsAsync<InvalidOperationException>(() => SqlMigrations.ApplyAsync(source, [new SqlMigration(1, Initial.Sql + " DELETE FROM equipment;")], TestContext.Current.CancellationToken));
        Assert.Equal(1L, await ScalarAsync(source, "SELECT count(*) FROM equipment"));
    }

    [Fact]
    public async Task FailedMigrationRollsBackSchemaAndLedgerTogether()
    {
        await using NpgsqlDataSource source = await postgres.CreateDatabaseAsync();
        await SqlMigrations.ApplyAsync(source, [Initial], TestContext.Current.CancellationToken);
        var invalid = new SqlMigration(2, "CREATE TABLE should_rollback (id int); SELECT 1/0;");
        _ = await Assert.ThrowsAsync<PostgresException>(() => SqlMigrations.ApplyAsync(source, [Initial, invalid], TestContext.Current.CancellationToken));
        Assert.Equal(0L, await ScalarAsync(source, "SELECT count(*) FROM information_schema.tables WHERE table_name='should_rollback'"));
        Assert.Equal(1L, await ScalarAsync(source, "SELECT count(*) FROM schema_migrations"));
    }

    [Fact]
    public async Task ConcurrentMigrationsSerializeAndApplyOnce()
    {
        await using NpgsqlDataSource source = await postgres.CreateDatabaseAsync();
        await Task.WhenAll(SqlMigrations.ApplyAsync(source, [Initial], TestContext.Current.CancellationToken), SqlMigrations.ApplyAsync(source, [Initial], TestContext.Current.CancellationToken));
        Assert.Equal(1L, await ScalarAsync(source, "SELECT count(*) FROM equipment"));
        Assert.Equal(1L, await ScalarAsync(source, "SELECT count(*) FROM schema_migrations"));
    }

    private static async Task<long> ScalarAsync(NpgsqlDataSource source, string sql)
    {
        await using NpgsqlCommand command = source.CreateCommand(sql);
        return (long)(await command.ExecuteScalarAsync())!;
    }
}
