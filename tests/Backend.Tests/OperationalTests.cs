using System.Net;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Configuration;
using Xunit;

namespace Backend.Tests;

public class OperationalTests
{
    [Fact]
    public async Task ConfiguredButUnreachableDependenciesAreNotReady()
    {
        using WebApplicationFactory<Reservations.Program> app = new WebApplicationFactory<Reservations.Program>().WithWebHostBuilder(builder => builder.ConfigureAppConfiguration((_, config) => config.AddInMemoryCollection(new Dictionary<string, string?> { { "ConnectionStrings:messaging", "amqp://test:test@127.0.0.1:1" } })));
        using HttpClient client = app.CreateClient();
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/alive")).StatusCode);
        Assert.Equal(HttpStatusCode.ServiceUnavailable, (await client.GetAsync("/health")).StatusCode);
    }

    [Fact]
    public async Task DependencyOutageChangesReadinessWithoutKillingProcess()
    {
        using var app = new WebApplicationFactory<Reservations.Program>();
        using HttpClient client = app.CreateClient();
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/alive")).StatusCode);
        Assert.Equal(HttpStatusCode.ServiceUnavailable, (await client.GetAsync("/health")).StatusCode);
    }
}
