using System.Net;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using Npgsql;
using Xunit;

namespace Inventory.Tests;

[Collection("Application behavior")]
public sealed class EquipmentPersistenceTests(PostgresFixture postgres)
{
    [Fact]
    public async Task CatalogIsSortedAndOperationalStatusIsAuthoritative()
    {
        await using NpgsqlDataSource database = await postgres.CreateMigratedDatabaseAsync("inventory");
        using WebApplicationFactory<Program> app = PostgresFixture.Factory<Program>(database);
        using HttpClient client = app.CreateClient();
        Item[] items = (await client.GetFromJsonAsync<Item[]>("/api/equipment", cancellationToken: TestContext.Current.CancellationToken))!;
        Assert.Equal(["camera-001", "laptop-001", "projector-001"], items.Select(item => item.Id));
        Assert.True(items[0].Operational);
        Assert.True(items[1].Operational);
        Assert.False(items[2].Operational);
        Assert.Equal(items[0], await client.GetFromJsonAsync<Item>("/api/equipment/camera-001", cancellationToken: TestContext.Current.CancellationToken));
        OldItem? oldContract = await client.GetFromJsonAsync<OldItem>("/api/equipment/camera-001", cancellationToken: TestContext.Current.CancellationToken);
        Assert.Equal(new OldItem("camera-001", "Demo Camera"), oldContract);
    }

    [Fact]
    public async Task RestartReadsPersistedEquipmentWithoutResettingEditedSeed()
    {
        await using NpgsqlDataSource database = await postgres.CreateMigratedDatabaseAsync("inventory");
        await using (NpgsqlCommand change = database.CreateCommand("UPDATE equipment SET name='Stored Camera', operational=false WHERE id='camera-001'"))
        {
            _ = await change.ExecuteNonQueryAsync(TestContext.Current.CancellationToken);
        }

        for (int restart = 0; restart < 2; restart++)
        {
            await ServiceMigrations.ApplyAsync(database, TestContext.Current.CancellationToken);
            using WebApplicationFactory<Program> app = PostgresFixture.Factory<Program>(database);
            using HttpClient client = app.CreateClient();
            Assert.Equal(new Item("camera-001", "Stored Camera", false), await client.GetFromJsonAsync<Item>("/api/equipment/camera-001", cancellationToken: TestContext.Current.CancellationToken));
        }
    }

    [Theory]
    [InlineData("unknown", HttpStatusCode.NotFound)]
    [InlineData("bad%20id", HttpStatusCode.BadRequest)]
    public async Task InvalidLookupReturnsUnderstandableError(string id, HttpStatusCode expected)
    {
        await using NpgsqlDataSource database = await postgres.CreateMigratedDatabaseAsync("inventory");
        using WebApplicationFactory<Program> app = PostgresFixture.Factory<Program>(database);
        using HttpClient client = app.CreateClient();
        HttpResponseMessage response = await client.GetAsync("/api/equipment/" + id, TestContext.Current.CancellationToken);
        Assert.Equal(expected, response.StatusCode);
        Assert.Contains("equipment", await response.Content.ReadAsStringAsync(TestContext.Current.CancellationToken), StringComparison.OrdinalIgnoreCase);
    }

    private sealed record Item(string Id, string Name, bool Operational);

    private sealed record OldItem(string Id, string Name);
}
