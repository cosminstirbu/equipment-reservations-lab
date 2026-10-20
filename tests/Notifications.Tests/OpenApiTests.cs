using System.Net;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Configuration;
using Npgsql;
using Xunit;

namespace Notifications.Tests;

[Collection("Application behavior")]
public sealed class OpenApiTests(PostgresFixture postgres)
{
    [Fact]
    public async Task DevelopmentDocumentsDescribeBusinessContractsIndependentlyOfViewer()
    {
        await using NpgsqlDataSource database = await postgres.CreateMigratedDatabaseAsync("notifications");
        using WebApplicationFactory<Program> app = Host(database, "Development");
        using HttpClient client = app.CreateClient();
        string authenticated = await client.GetStringAsync("/openapi/v1.json", TestContext.Current.CancellationToken);
        client.DefaultRequestHeaders.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", IdentityAuthorityFixture.Shared.Token(audience: "notifications-api", roles: ["Approver"]));
        Assert.Equal(authenticated, await client.GetStringAsync("/openapi/v1.json", TestContext.Current.CancellationToken));
        client.DefaultRequestHeaders.Authorization = null;
        string anonymous = await client.GetStringAsync("/openapi/v1.json", TestContext.Current.CancellationToken);
        Assert.Equal(authenticated, anonymous);
        await OpenApiAssertions.AssertDocumentAsync(anonymous, "Notifications");
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
        await using NpgsqlDataSource database = await postgres.CreateMigratedDatabaseAsync("notifications");
        using WebApplicationFactory<Program> app = Host(database, environment);
        using HttpClient client = app.CreateClient();
        foreach (string route in new[] { "/openapi/v1.json", "/scalar/", "/scalar/scalar.js", "/oauth/callback" })
        {
            Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync(route, TestContext.Current.CancellationToken)).StatusCode);
        }
    }

    [Fact]
    public async Task ConfiguredProductionDocumentationUsesCanonicalServicePrefix()
    {
        await using NpgsqlDataSource database = await postgres.CreateMigratedDatabaseAsync("notifications");
        using WebApplicationFactory<Program> app = PostgresFixture.Factory<Program>(database).WithWebHostBuilder(builder =>
            builder.UseEnvironment("Production")
                .UseSetting("Documentation:Enabled", "true")
                .UseSetting("Application:ExternalOrigin", "https://app.equipment.test")
                .UseSetting("Documentation:ExternalBasePath", "/services/notifications")
                .UseSetting("Documentation:Callback", "https://app.equipment.test/services/notifications/oauth/callback")
                .ConfigureAppConfiguration((_, configuration) => configuration.AddInMemoryCollection(new Dictionary<string, string?>
                {
                    ["Documentation:Callback"] = "https://app.equipment.test/services/notifications/oauth/callback"
                })));
        using HttpClient client = app.CreateClient(new WebApplicationFactoryClientOptions { BaseAddress = new Uri("https://app.equipment.test") });
        string document = await client.GetStringAsync("/openapi/v1.json", TestContext.Current.CancellationToken);
        using var json = System.Text.Json.JsonDocument.Parse(document);
        Assert.Equal("/services/notifications", json.RootElement.GetProperty("servers")[0].GetProperty("url").GetString());
        string ui = await client.GetStringAsync("/scalar/v1", TestContext.Current.CancellationToken);
        Assert.Contains("/services/notifications/openapi/v1.json", ui, StringComparison.Ordinal);
        Assert.Contains("https://app.equipment.test/services/notifications/oauth/callback", ui, StringComparison.Ordinal);
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/oauth/callback", TestContext.Current.CancellationToken)).StatusCode);
    }

    private static WebApplicationFactory<Program> Host(NpgsqlDataSource database, string environment)
    {
        return PostgresFixture.Factory<Program>(database).WithWebHostBuilder(builder =>
            builder.UseEnvironment(environment).UseSetting("Documentation:Callback", "http://localhost:5100/oauth/callback"));
    }
}
