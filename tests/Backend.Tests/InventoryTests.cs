using System.Net;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using Npgsql;
using Xunit;

namespace Backend.Tests;

[Collection("PostgreSQL")]
public class InventoryTests(PostgresFixture postgres)
{
    [Fact]
    public async Task ReturnsAuthoritativeSeedAndLookup()
    {
        await using NpgsqlDataSource database = await postgres.CreateMigratedDatabaseAsync("inventory");
        using WebApplicationFactory<Inventory.Program> app = PostgresFixture.Factory<Inventory.Program>(database);
        using HttpClient client = app.CreateClient();
        Equipment[]? items = await client.GetFromJsonAsync<Equipment[]>("/api/equipment");
        Equipment item = Assert.Single(items!, equipment => equipment.Id == "camera-001");
        Assert.Equal("camera-001", item.Id);
        Assert.Equal("Demo Camera", item.Name);
        Assert.Equal(item, await client.GetFromJsonAsync<Equipment>("/api/equipment/camera-001"));
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync("/api/equipment/unknown")).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.GetAsync("/api/equipment/bad%20id")).StatusCode);
    }

    private sealed record Equipment(string Id, string Name);
}
