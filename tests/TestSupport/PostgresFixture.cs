using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Npgsql;
using Testcontainers.PostgreSql;
using Xunit;

namespace TestSupport;

public sealed class PostgresFixture : IAsyncLifetime
{
    // Limit concurrent schema setup on the shared provider; hosts and requests remain parallel.
    // Measured provisioning pressure and capacity evidence: specs/013-local-kubernetes/team/test-infrastructure-diagnosis.md.
    private readonly SemaphoreSlim provisioning = new(4);
    private readonly SemaphoreSlim hostStartup = new(4);
    private readonly PostgreSqlContainer container = new PostgreSqlBuilder("postgres:18.6")
        .WithUsername("fixture_admin")
        .WithPassword(Guid.NewGuid().ToString("N"))
        // Concurrent scenarios use separate databases but share the server's connection budget.
        .WithCommand("-c", "max_connections=512")
        .Build();

    public async ValueTask InitializeAsync()
    {
        using var deadline = new CancellationTokenSource(TimeSpan.FromSeconds(60));
        await container.StartAsync(deadline.Token);
    }

    public async ValueTask DisposeAsync()
    {
        try
        {
            await container.DisposeAsync();
        }
        finally
        {
            provisioning.Dispose();
            hostStartup.Dispose();
        }
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
        if (!await provisioning.WaitAsync(TimeSpan.FromSeconds(60), TestContext.Current.CancellationToken))
        {
            throw new TimeoutException("Database scenario provisioning did not acquire setup capacity.");
        }

        try
        {
            return await CreateMigratedDatabaseCoreAsync(service);
        }
        finally
        {
            _ = provisioning.Release();
        }
    }

    private async Task<NpgsqlDataSource> CreateMigratedDatabaseCoreAsync(string service)
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
                        // Extension installation is setup work and can exceed the application
                        // command budget when independent databases initialize concurrently.
                        extension.CommandTimeout = 30;
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

    // Admit first factory startup only; requests and additional clients remain parallel.
    public async Task<HttpClient> CreateClientAsync<TProgram>(WebApplicationFactory<TProgram> factory) where TProgram : class
    {
        if (!await hostStartup.WaitAsync(TimeSpan.FromSeconds(60), TestContext.Current.CancellationToken))
        {
            throw new TimeoutException("Application host startup did not acquire setup capacity.");
        }

        try
        {
            return factory.CreateClient();
        }
        finally
        {
            _ = hostStartup.Release();
        }
    }

    public string ConnectionStringFor(NpgsqlDataSource source)
    {
        var settings = new NpgsqlConnectionStringBuilder(source.ConnectionString)
        {
            Password = new NpgsqlConnectionStringBuilder(container.GetConnectionString()).Password
        };
        return settings.ConnectionString;
    }

    public static WebApplicationFactory<TProgram> Factory<TProgram>(NpgsqlDataSource source) where TProgram : class
    {
        return new AuthenticatedApplicationFactory<TProgram>().WithWebHostBuilder(builder => builder.ConfigureServices(services =>
        {
            _ = services.RemoveAll<NpgsqlDataSource>();
            _ = services.AddSingleton(source);
        }));
    }
}
