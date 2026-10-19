using System.Net;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using Npgsql;
using Xunit;

namespace Inventory.Tests;

[Collection("Application behavior")]
public class InventoryTests(PostgresFixture postgres)
{
    [Fact]
    public async Task ReturnsAuthoritativeSeedAndLookup()
    {
        await using NpgsqlDataSource database = await postgres.CreateMigratedDatabaseAsync("inventory");
        using WebApplicationFactory<Program> app = PostgresFixture.Factory<Program>(database);
        using HttpClient client = app.CreateClient();
        Equipment[]? items = await client.GetFromJsonAsync<Equipment[]>("/api/equipment", cancellationToken: TestContext.Current.CancellationToken);
        Equipment item = Assert.Single(items!, equipment => equipment.Id == "camera-001");
        Assert.Equal("camera-001", item.Id);
        Assert.Equal("Demo Camera", item.Name);
        Assert.Equal(item, await client.GetFromJsonAsync<Equipment>("/api/equipment/camera-001", cancellationToken: TestContext.Current.CancellationToken));
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync("/api/equipment/unknown", TestContext.Current.CancellationToken)).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.GetAsync("/api/equipment/bad%20id", TestContext.Current.CancellationToken)).StatusCode);
    }

    private sealed record Equipment(string Id, string Name);
}
