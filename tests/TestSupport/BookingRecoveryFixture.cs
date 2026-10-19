using DatabaseBootstrap;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Npgsql;
using Testcontainers.PostgreSql;

namespace TestSupport;

internal sealed class BookingRecoveryFixture(IdentityProviderFixture identity) : IAsyncDisposable
{
    private readonly PostgreSqlContainer postgres = new PostgreSqlBuilder("postgres:18.6")
        .WithUsername("fixture_admin")
        .WithPassword(Guid.NewGuid().ToString("N"))
        .Build();
    private readonly Dictionary<string, string> passwords = new()
    {
        ["inventory"] = Guid.NewGuid().ToString("N"),
        ["reservations"] = Guid.NewGuid().ToString("N"),
        ["notifications"] = Guid.NewGuid().ToString("N")
    };

    public BrokerAccessFixture Broker { get; } = new();

    public async Task InitializeAsync(CancellationToken cancellationToken)
    {
        await postgres.StartAsync(cancellationToken);
        await ReconcileAsync(cancellationToken);
        await identity.ProvisionAsync(cancellationToken: cancellationToken);
        await Broker.InitializeAsync();
    }

    public Task ReconcileAsync(CancellationToken cancellationToken)
    {
        return DatabaseProvisioner.ReconcileAsync(postgres.GetConnectionString(), passwords, cancellationToken);
    }

    public NpgsqlDataSource Database(string service)
    {
        return NpgsqlDataSource.Create(Connection(service));
    }

    private string Connection(string service)
    {
        var settings = new NpgsqlConnectionStringBuilder(postgres.GetConnectionString())
        {
            Database = service,
            Username = service + "_app",
            Password = passwords[service],
            Timeout = 3,
            CommandTimeout = 5,
            IncludeErrorDetail = false,
            LogParameters = false
        };
        return settings.ConnectionString;
    }

    public WebApplicationFactory<TProgram> Host<TProgram>(string service, WebApplicationFactory<Inventory.Program>? inventory = null) where TProgram : class
    {
        return new RecoveryApplicationFactory<TProgram>(new Dictionary<string, string?>
        {
            ["Identity:Authority"] = identity.Settings.Authority,
            ["Identity:ClientId"] = "reservations-service",
            ["Identity:ClientSecret"] = identity.Settings.ServiceSecret,
            ["ConnectionStrings:" + service] = Connection(service),
            ["ConnectionStrings:messaging"] = service == "reservations" ? Broker.Connection("reservations") : Broker.Connection("notifications"),
            ["InventoryUrl"] = "http://inventory"
        }, inventory);
    }

    public async ValueTask DisposeAsync()
    {
        await Broker.DisposeAsync();
        await postgres.DisposeAsync();
    }

    private sealed class RecoveryApplicationFactory<TProgram>(Dictionary<string, string?> configuration, WebApplicationFactory<Inventory.Program>? inventory) : WebApplicationFactory<TProgram> where TProgram : class
    {
        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            _ = builder.UseEnvironment("Development");
            foreach ((string key, string? value) in configuration)
            {
                _ = builder.UseSetting(key, value);
            }

            _ = builder.ConfigureAppConfiguration((_, settings) => settings.AddInMemoryCollection(configuration));
            if (inventory is not null)
            {
                _ = builder.ConfigureServices(services => services.AddHttpClient("inventory")
                    .ConfigurePrimaryHttpMessageHandler(() => inventory.Server.CreateHandler()));
            }
        }
    }
}
