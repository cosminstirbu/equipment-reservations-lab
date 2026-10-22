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
    private readonly DatabaseProvisioning provisioning = new();
    private readonly PostgreSqlContainer container = new PostgreSqlBuilder("postgres:18.6")
        .WithUsername("fixture_admin")
        .WithPassword(Guid.NewGuid().ToString("N"))
        // Concurrent scenarios use separate databases but share the server's connection budget.
        .WithCommand("-c", "max_connections=512")
        .Build();

    public async ValueTask InitializeAsync()
    {
        // First use also starts Testcontainers' resource reaper before PostgreSQL readiness.
        using var deadline = new CancellationTokenSource(TimeSpan.FromMinutes(2));
        await ContainerStartup.StartAsync(container.StartAsync, deadline.Token);
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
        }
    }

    public async Task<NpgsqlDataSource> CreateDatabaseAsync()
    {
        return await CreateDatabaseAsync(TestContext.Current.CancellationToken);
    }

    private async Task<NpgsqlDataSource> CreateDatabaseAsync(CancellationToken cancellationToken)
    {
        string name = "test_" + Guid.NewGuid().ToString("N");
        await using var admin = NpgsqlDataSource.Create(container.GetConnectionString());
        await using NpgsqlCommand create = admin.CreateCommand($"CREATE DATABASE {name}");
        _ = await create.ExecuteNonQueryAsync(cancellationToken);
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

    public Task<NpgsqlDataSource> CreateMigratedDatabaseAsync(string service)
    {
        return provisioning.RunAsync(token => CreateMigratedDatabaseCoreAsync(service, token), TestContext.Current.CancellationToken);
    }

    private async Task<NpgsqlDataSource> CreateMigratedDatabaseCoreAsync(string service, CancellationToken cancellationToken)
    {
        NpgsqlDataSource source = await CreateDatabaseAsync(cancellationToken);
        try
        {
            var settings = new NpgsqlConnectionStringBuilder(ConnectionStringFor(source))
            {
                Timeout = 30,
                CommandTimeout = 30
            };
            await using var setup = NpgsqlDataSource.Create(settings.ConnectionString);
            switch (service)
            {
                case "inventory":
                    await Inventory.ServiceMigrations.ApplyAsync(setup, cancellationToken);
                    break;
                case "reservations":
                    await using (NpgsqlCommand extension = setup.CreateCommand("CREATE EXTENSION btree_gist"))
                    {
                        _ = await extension.ExecuteNonQueryAsync(cancellationToken);
                    }

                    await Reservations.ServiceMigrations.ApplyAsync(setup, cancellationToken);
                    break;
                case "notifications":
                    await Notifications.ServiceMigrations.ApplyAsync(setup, cancellationToken);
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
    public static async Task<HttpClient> CreateClientAsync<TProgram>(WebApplicationFactory<TProgram> factory) where TProgram : class
    {
        CancellationToken cancellationToken = TestContext.Current.CancellationToken;
        return await ApplicationStartup.RunAsync(() => Task.FromResult(factory.CreateClient()), cancellationToken);
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
