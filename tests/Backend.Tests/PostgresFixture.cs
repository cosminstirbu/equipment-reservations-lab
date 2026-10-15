using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Npgsql;
using Testcontainers.PostgreSql;
using Xunit;

namespace Backend.Tests;

[CollectionDefinition("PostgreSQL")]
public sealed class PostgresTests : ICollectionFixture<PostgresFixture>;

public sealed class PostgresFixture : IAsyncLifetime
{
    private readonly PostgreSqlContainer container = new PostgreSqlBuilder("postgres:18.6")
        .WithUsername("fixture_admin")
        .WithPassword(Guid.NewGuid().ToString("N"))
        .Build();

    public async Task InitializeAsync()
    {
        using var deadline = new CancellationTokenSource(TimeSpan.FromSeconds(60));
        await container.StartAsync(deadline.Token);
    }

    public async Task DisposeAsync()
    {
        await container.DisposeAsync();
    }

    public async Task<NpgsqlDataSource> CreateDatabaseAsync()
    {
        string name = "test_" + Guid.NewGuid().ToString("N");
        await using var admin = NpgsqlDataSource.Create(container.GetConnectionString());
        await using NpgsqlCommand create = admin.CreateCommand($"CREATE DATABASE {name}");
        _ = await create.ExecuteNonQueryAsync();
        var settings = new NpgsqlConnectionStringBuilder(container.GetConnectionString())
        {
            Database = name,
            Timeout = 3,
            CommandTimeout = 5,
            IncludeErrorDetail = false,
            LogParameters = false
        };

        return NpgsqlDataSource.Create(settings.ConnectionString);
    }

    public async Task<NpgsqlDataSource> CreateMigratedDatabaseAsync(string service)
    {
        NpgsqlDataSource source = await CreateDatabaseAsync();
        try
        {
            switch (service)
            {
                case "inventory":
                    await Inventory.ServiceMigrations.ApplyAsync(source);
                    break;
                case "reservations":
                    await using (NpgsqlCommand extension = source.CreateCommand("CREATE EXTENSION btree_gist"))
                    {
                        _ = await extension.ExecuteNonQueryAsync();
                    }

                    await Reservations.ServiceMigrations.ApplyAsync(source);
                    break;
                case "notifications":
                    await Notifications.ServiceMigrations.ApplyAsync(source);
                    break;
                default:
                    throw new ArgumentException("Unknown database owner.", nameof(service));
            }

            return source;
        }
        catch
        {
            await source.DisposeAsync();
            throw;
        }
    }

    public static WebApplicationFactory<TProgram> Factory<TProgram>(NpgsqlDataSource source) where TProgram : class
    {
        return new WebApplicationFactory<TProgram>().WithWebHostBuilder(builder => builder.ConfigureServices(services =>
        {
            _ = services.RemoveAll<NpgsqlDataSource>();
            _ = services.AddSingleton(source);
        }));
    }
}
