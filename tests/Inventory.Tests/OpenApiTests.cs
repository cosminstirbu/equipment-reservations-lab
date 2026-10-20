using System.Net;
using System.Text.Json.Nodes;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Configuration;
using Npgsql;
using Xunit;

namespace Inventory.Tests;

[Collection("Application behavior")]
public sealed class OpenApiTests(PostgresFixture postgres)
{
    [Fact]
    public async Task DevelopmentDocumentsDescribeBusinessContractsIndependentlyOfViewer()
    {
        await using NpgsqlDataSource database = await postgres.CreateMigratedDatabaseAsync("inventory");
        using WebApplicationFactory<Program> app = Host(database, "Development");
        using HttpClient client = app.CreateClient();
        string authenticated = await client.GetStringAsync("/openapi/v1.json", TestContext.Current.CancellationToken);
        client.DefaultRequestHeaders.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", IdentityAuthorityFixture.Shared.Token(audience: "inventory-api", roles: ["Approver"]));
        Assert.Equal(authenticated, await client.GetStringAsync("/openapi/v1.json", TestContext.Current.CancellationToken));
        client.DefaultRequestHeaders.Authorization = null;
        string anonymous = await client.GetStringAsync("/openapi/v1.json", TestContext.Current.CancellationToken);
        Assert.Equal(authenticated, anonymous);
        await OpenApiAssertions.AssertDocumentAsync(anonymous, "Inventory");
        string ui = await client.GetStringAsync("/scalar/", TestContext.Current.CancellationToken);
        Assert.Contains("equipment-docs", ui, StringComparison.Ordinal);
        using HttpResponseMessage callback = await client.GetAsync("/oauth/callback", TestContext.Current.CancellationToken);
        string callbackHtml = await callback.Content.ReadAsStringAsync(TestContext.Current.CancellationToken);
        Assert.Equal(HttpStatusCode.OK, callback.StatusCode);
        Assert.Contains("<html lang=\"en\">", callbackHtml, StringComparison.Ordinal);
        Assert.DoesNotContain("<script", callbackHtml, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("scalar.js", callbackHtml, StringComparison.OrdinalIgnoreCase);
        Assert.True(callback.Headers.CacheControl?.NoStore);
        Assert.Equal("no-referrer", Assert.Single(callback.Headers.GetValues("Referrer-Policy")));
        Assert.Equal("default-src 'none'", Assert.Single(callback.Headers.GetValues("Content-Security-Policy")));
        Assert.Contains("persistAuth", ui, StringComparison.Ordinal);
        Assert.DoesNotContain("cdn.jsdelivr", ui, StringComparison.Ordinal);
    }

    [Theory]
    [InlineData("Production")]
    [InlineData("Testing")]
    public async Task OtherEnvironmentsDoNotExposeDocumentation(string environment)
    {
        await using NpgsqlDataSource database = await postgres.CreateMigratedDatabaseAsync("inventory");
        using WebApplicationFactory<Program> app = Host(database, environment);
        using HttpClient client = app.CreateClient();
        foreach (string route in new[] { "/openapi/v1.json", "/scalar/", "/scalar/scalar.js", "/oauth/callback" })
        {
            Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync(route, TestContext.Current.CancellationToken)).StatusCode);
        }
    }

    [Fact]
    public async Task ServiceContractStillRejectsAnUndocumentedErrorWhenSpectralPasses()
    {
        await using NpgsqlDataSource database = await postgres.CreateMigratedDatabaseAsync("inventory");
        using WebApplicationFactory<Program> app = Host(database, "Development");
        using HttpClient client = app.CreateClient();
        string json = await client.GetStringAsync("/openapi/v1.json", TestContext.Current.CancellationToken);
        JsonNode document = JsonNode.Parse(json)!;
        _ = document["paths"]!["/api/equipment"]!["get"]!["responses"]!.AsObject().Remove("503");
        string mutated = document.ToJsonString();

        await SpectralValidation.AssertValidAsync(mutated, "Inventory", TestContext.Current.CancellationToken);
        Exception? failure = await Record.ExceptionAsync(() => OpenApiAssertions.AssertDocumentAsync(mutated, "Inventory"));
        Assert.NotNull(failure);
        Assert.Contains("503", failure.Message, StringComparison.Ordinal);
    }

    [Fact]
    public async Task ConfiguredProductionDocumentationUsesCanonicalServicePrefix()
    {
        await using NpgsqlDataSource database = await postgres.CreateMigratedDatabaseAsync("inventory");
        using WebApplicationFactory<Program> app = PostgresFixture.Factory<Program>(database).WithWebHostBuilder(builder =>
            builder.UseEnvironment("Production")
                .UseSetting("Documentation:Enabled", "true")
                .UseSetting("Application:ExternalOrigin", "https://app.equipment.test")
                .UseSetting("Documentation:ExternalBasePath", "/services/inventory")
                .UseSetting("Documentation:Callback", "https://app.equipment.test/services/inventory/oauth/callback")
                .ConfigureAppConfiguration((_, configuration) => configuration.AddInMemoryCollection(new Dictionary<string, string?>
                {
                    ["Documentation:Callback"] = "https://app.equipment.test/services/inventory/oauth/callback"
                })));
        using HttpClient client = app.CreateClient(new WebApplicationFactoryClientOptions { BaseAddress = new Uri("https://app.equipment.test") });
        string document = await client.GetStringAsync("/openapi/v1.json", TestContext.Current.CancellationToken);
        using var json = System.Text.Json.JsonDocument.Parse(document);
        Assert.Equal("/services/inventory", json.RootElement.GetProperty("servers")[0].GetProperty("url").GetString());
        string ui = await client.GetStringAsync("/scalar/v1", TestContext.Current.CancellationToken);
        Assert.True(ui.Contains("/services/inventory/openapi/v1.json", StringComparison.Ordinal), ui);
        Assert.Contains("https://app.equipment.test/services/inventory/oauth/callback", ui, StringComparison.Ordinal);
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/oauth/callback", TestContext.Current.CancellationToken)).StatusCode);
    }

    [Theory]
    [InlineData(null, "/services/inventory", "http://localhost:5100/oauth/callback")]
    [InlineData("http://app.equipment.test", "/services/inventory", "http://app.equipment.test/services/inventory/oauth/callback")]
    [InlineData("https://app.equipment.test", "/services/inventory", "https://evil.test/services/inventory/oauth/callback")]
    [InlineData("https://app.equipment.test", "/services/other", "https://app.equipment.test/services/other/oauth/callback")]
    public async Task UnsafeExplicitDocumentationConfigurationFailsDuringStartup(string? origin, string prefix, string callback)
    {
        await using NpgsqlDataSource database = await postgres.CreateMigratedDatabaseAsync("inventory");
        using WebApplicationFactory<Program> app = PostgresFixture.Factory<Program>(database).WithWebHostBuilder(builder =>
        {
            _ = builder.UseEnvironment("Production")
                .UseSetting("Documentation:Enabled", "true")
                .UseSetting("Documentation:ExternalBasePath", prefix)
                .UseSetting("Documentation:Callback", callback)
                .ConfigureAppConfiguration((_, configuration) => configuration.AddInMemoryCollection(new Dictionary<string, string?>
                {
                    ["Documentation:Callback"] = callback
                }));
            if (origin is not null)
            {
                _ = builder.UseSetting("Application:ExternalOrigin", origin);
            }
        });
        _ = Assert.Throws<InvalidOperationException>(() =>
        {
            using HttpClient client = app.CreateClient();
        });
    }

    private static WebApplicationFactory<Program> Host(NpgsqlDataSource database, string environment)
    {
        return PostgresFixture.Factory<Program>(database).WithWebHostBuilder(builder =>
            builder.UseEnvironment(environment).UseSetting("Documentation:Callback", "http://localhost:5100/oauth/callback"));
    }
}
