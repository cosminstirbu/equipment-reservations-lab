using System.Net;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using Npgsql;
using Xunit;

namespace Backend.Tests;

[Collection("PostgreSQL")]
public sealed class EquipmentPersistenceTests(PostgresFixture postgres)
{
    [Fact]
    public async Task CatalogIsSortedAndOperationalStatusIsAuthoritative()
    {
        await using NpgsqlDataSource database = await postgres.CreateMigratedDatabaseAsync("inventory");
        using WebApplicationFactory<Inventory.Program> app = PostgresFixture.Factory<Inventory.Program>(database);
        using HttpClient client = app.CreateClient();
        Item[] items = (await client.GetFromJsonAsync<Item[]>("/api/equipment"))!;
        Assert.Equal(["camera-001", "laptop-001", "projector-001"], items.Select(item => item.Id));
        Assert.True(items[0].Operational);
        Assert.True(items[1].Operational);
        Assert.False(items[2].Operational);
        Assert.Equal(items[0], await client.GetFromJsonAsync<Item>("/api/equipment/camera-001"));
        OldItem? oldContract = await client.GetFromJsonAsync<OldItem>("/api/equipment/camera-001");
        Assert.Equal(new OldItem("camera-001", "Demo Camera"), oldContract);
    }

    [Fact]
    public async Task RestartReadsPersistedEquipmentWithoutResettingEditedSeed()
    {
        await using NpgsqlDataSource database = await postgres.CreateMigratedDatabaseAsync("inventory");
        await using (NpgsqlCommand change = database.CreateCommand("UPDATE equipment SET name='Stored Camera', operational=false WHERE id='camera-001'"))
        {
            _ = await change.ExecuteNonQueryAsync();
        }

        for (int restart = 0; restart < 2; restart++)
        {
            await Inventory.ServiceMigrations.ApplyAsync(database);
            using WebApplicationFactory<Inventory.Program> app = PostgresFixture.Factory<Inventory.Program>(database);
            using HttpClient client = app.CreateClient();
            Assert.Equal(new Item("camera-001", "Stored Camera", false), await client.GetFromJsonAsync<Item>("/api/equipment/camera-001"));
        }
    }

    [Theory]
    [InlineData("unknown", HttpStatusCode.NotFound)]
    [InlineData("bad%20id", HttpStatusCode.BadRequest)]
    public async Task InvalidLookupReturnsUnderstandableError(string id, HttpStatusCode expected)
    {
        await using NpgsqlDataSource database = await postgres.CreateMigratedDatabaseAsync("inventory");
        using WebApplicationFactory<Inventory.Program> app = PostgresFixture.Factory<Inventory.Program>(database);
        using HttpClient client = app.CreateClient();
        HttpResponseMessage response = await client.GetAsync("/api/equipment/" + id);
        Assert.Equal(expected, response.StatusCode);
        Assert.Contains("equipment", await response.Content.ReadAsStringAsync(), StringComparison.OrdinalIgnoreCase);
    }

    private sealed record Item(string Id, string Name, bool Operational);

    private sealed record OldItem(string Id, string Name);
}
