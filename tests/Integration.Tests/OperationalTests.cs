using System.Net;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Npgsql;
using Xunit;

namespace Integration.Tests;

[Collection("Application behavior")]
public class OperationalTests(PostgresFixture postgres)
{
    [Fact]
    public async Task ConfiguredButUnreachableDependenciesAreNotReady()
    {
        await using NpgsqlDataSource database = await postgres.CreateMigratedDatabaseAsync("reservations");
        using WebApplicationFactory<Reservations.Program> app = PostgresFixture.Factory<Reservations.Program>(database).WithWebHostBuilder(builder => builder.ConfigureAppConfiguration((_, config) => config.AddInMemoryCollection(new Dictionary<string, string?> { { "ConnectionStrings:messaging", "amqp://test:test@127.0.0.1:1" } })));
        using HttpClient client = app.CreateClient();
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/alive", TestContext.Current.CancellationToken)).StatusCode);
        Assert.Equal(HttpStatusCode.ServiceUnavailable, (await client.GetAsync("/health", TestContext.Current.CancellationToken)).StatusCode);
    }

    [Fact]
    public async Task DependencyOutageChangesReadinessWithoutKillingProcess()
    {
        await using NpgsqlDataSource database = await postgres.CreateMigratedDatabaseAsync("reservations");
        using WebApplicationFactory<Reservations.Program> app = PostgresFixture.Factory<Reservations.Program>(database);
        using HttpClient client = app.CreateClient();
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/alive", TestContext.Current.CancellationToken)).StatusCode);
        Assert.Equal(HttpStatusCode.ServiceUnavailable, (await client.GetAsync("/health", TestContext.Current.CancellationToken)).StatusCode);
    }

    [Fact]
    public async Task BrokerOutageLeavesDatabaseBackedApisReadyAndWorkersUnhealthy()
    {
        await using NpgsqlDataSource reservationsDatabase = await postgres.CreateMigratedDatabaseAsync("reservations");
        using WebApplicationFactory<Reservations.Program> reservations = PostgresFixture.Factory<Reservations.Program>(reservationsDatabase)
            .WithWebHostBuilder(builder => builder.ConfigureServices(services =>
            {
                _ = services.AddHttpClient("inventory").ConfigurePrimaryHttpMessageHandler(() => new ReadyInventory());
            }));
        using HttpClient reservationClient = reservations.CreateClient();
        Assert.Equal(HttpStatusCode.OK, (await reservationClient.GetAsync("/health", TestContext.Current.CancellationToken)).StatusCode);
        Assert.Equal(HttpStatusCode.ServiceUnavailable, (await reservationClient.GetAsync("/health/workers", TestContext.Current.CancellationToken)).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await reservationClient.GetAsync("/alive", TestContext.Current.CancellationToken)).StatusCode);

        await using NpgsqlDataSource notificationsDatabase = await postgres.CreateMigratedDatabaseAsync("notifications");
        using WebApplicationFactory<Notifications.Program> notifications = PostgresFixture.Factory<Notifications.Program>(notificationsDatabase);
        using HttpClient notificationClient = notifications.CreateClient();
        Assert.Equal(HttpStatusCode.OK, (await notificationClient.GetAsync("/health", TestContext.Current.CancellationToken)).StatusCode);
        Assert.Equal(HttpStatusCode.ServiceUnavailable, (await notificationClient.GetAsync("/health/workers", TestContext.Current.CancellationToken)).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await notificationClient.GetAsync("/alive", TestContext.Current.CancellationToken)).StatusCode);
    }

    private sealed class ReadyInventory : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            return Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK));
        }
    }
}
