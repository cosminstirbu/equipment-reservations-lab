using System.Net;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using Xunit;

namespace Backend.Tests;

public class InventoryTests
{
    [Fact]
    public async Task ReturnsAuthoritativeSeedAndLookup()
    {
        using var app = new WebApplicationFactory<Inventory.Program>();
        using HttpClient client = app.CreateClient();
        Equipment[]? items = await client.GetFromJsonAsync<Equipment[]>("/api/equipment");
        Equipment item = Assert.Single(items!);
        Assert.Equal("camera-001", item.Id);
        Assert.Equal("Demo Camera", item.Name);
        Assert.Equal(item, await client.GetFromJsonAsync<Equipment>("/api/equipment/camera-001"));
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync("/api/equipment/unknown")).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.GetAsync("/api/equipment/bad%20id")).StatusCode);
    }

    private sealed record Equipment(string Id, string Name);
}
