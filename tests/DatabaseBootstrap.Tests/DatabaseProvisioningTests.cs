using DotNet.Testcontainers.Builders;
using DotNet.Testcontainers.Volumes;
using Npgsql;
using Testcontainers.PostgreSql;
using Xunit;

namespace DatabaseBootstrap.Tests;

[Collection("Database telemetry and recovery")]
public sealed class DatabaseProvisioningTests
{
    [Fact]
    public async Task OwnDatabasePrivilegesAndRepeatedProvisioningRetainDataAndPasswords()
    {
        using var deadline = new CancellationTokenSource(TimeSpan.FromSeconds(120));
        await using IVolume volume = new VolumeBuilder().Build();
        await volume.CreateAsync(deadline.Token);
        string adminPassword = Guid.NewGuid().ToString("N");
        await using PostgreSqlContainer postgres = new PostgreSqlBuilder("postgres:18.6")
            .WithUsername("bootstrap_admin")
            .WithPassword(adminPassword)
            .WithVolumeMount(volume, "/var/lib/postgresql")
            .Build();
        await postgres.StartAsync(deadline.Token);
        string admin = postgres.GetConnectionString();
        var passwords = new Dictionary<string, string>
        {
            ["inventory"] = Guid.NewGuid().ToString("N"),
            ["reservations"] = Guid.NewGuid().ToString("N"),
            ["notifications"] = Guid.NewGuid().ToString("N"),
            ["keycloak"] = Guid.NewGuid().ToString("N")
        };
        await DatabaseProvisioner.ReconcileAsync(admin, passwords, cancellationToken: TestContext.Current.CancellationToken);

        foreach (string database in passwords.Keys)
        {
            var own = new NpgsqlConnectionStringBuilder(admin)
            {
                Database = database,
                Username = database + "_app",
                Password = passwords[database],
                Timeout = 3,
                CommandTimeout = 5
            };
            await using var source = NpgsqlDataSource.Create(own.ConnectionString);
            await using NpgsqlCommand privileges = source.CreateCommand("SELECT count(*) FROM pg_roles WHERE rolname=current_user AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolreplication AND NOT rolbypassrls");
            Assert.Equal(1L, await privileges.ExecuteScalarAsync(TestContext.Current.CancellationToken));
            await using NpgsqlCommand memberships = source.CreateCommand("SELECT count(*) FROM pg_auth_members WHERE member=(SELECT oid FROM pg_roles WHERE rolname=current_user)");
            Assert.Equal(0L, await memberships.ExecuteScalarAsync(TestContext.Current.CancellationToken));

            foreach (string other in passwords.Keys.Append("postgres").Append("template1").Where(name => name != database))
            {
                var forbidden = new NpgsqlConnectionStringBuilder(own.ConnectionString) { Database = other };
                await using var denied = NpgsqlDataSource.Create(forbidden.ConnectionString);
                PostgresException exception = await Assert.ThrowsAsync<PostgresException>(async () => await denied.OpenConnectionAsync(TestContext.Current.CancellationToken));
                Assert.Equal("42501", exception.SqlState);
            }
        }

        var inventory = new NpgsqlConnectionStringBuilder(admin)
        {
            Database = "inventory",
            Username = "inventory_app",
            Password = passwords["inventory"]
        };
        await using (var source = NpgsqlDataSource.Create(inventory.ConnectionString))
        await using (NpgsqlCommand edit = source.CreateCommand("UPDATE equipment SET name='Preserved Camera', operational=false WHERE id='camera-001'"))
        {
            Assert.Equal(1, await edit.ExecuteNonQueryAsync(TestContext.Current.CancellationToken));
        }

        await postgres.DisposeAsync();
        await using PostgreSqlContainer recreatedPostgres = new PostgreSqlBuilder("postgres:18.6")
            .WithUsername("bootstrap_admin")
            .WithPassword(adminPassword)
            .WithVolumeMount(volume, "/var/lib/postgresql")
            .Build();
        await recreatedPostgres.StartAsync(deadline.Token);
        admin = recreatedPostgres.GetConnectionString();
        await DatabaseProvisioner.ReconcileAsync(admin, passwords, deadline.Token);
        var changed = passwords.ToDictionary(pair => pair.Key, pair => pair.Value);
        changed["inventory"] = Guid.NewGuid().ToString("N");
        _ = await Assert.ThrowsAsync<InvalidOperationException>(() => DatabaseProvisioner.ReconcileAsync(admin, changed, deadline.Token));
        inventory = new NpgsqlConnectionStringBuilder(admin)
        {
            Database = "inventory",
            Username = "inventory_app",
            Password = passwords["inventory"]
        };
        await using var restarted = NpgsqlDataSource.Create(inventory.ConnectionString);
        await using NpgsqlCommand retained = restarted.CreateCommand("SELECT count(*) FROM equipment WHERE id='camera-001' AND name='Preserved Camera' AND operational=false");
        Assert.Equal(1L, await retained.ExecuteScalarAsync(TestContext.Current.CancellationToken));
        await using NpgsqlCommand seeds = restarted.CreateCommand("SELECT count(*) FROM equipment");
        Assert.Equal(3L, await seeds.ExecuteScalarAsync(TestContext.Current.CancellationToken));
    }
}
