using System.Net;
using System.Net.Http.Headers;
using System.Text.Json;
using IdentityAccess;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace IdentityBootstrap.Tests;

[Collection("Identity provider")]
public sealed class ServiceIdentityContractTests(IdentityProviderFixture provider)
{
    [Fact]
    public async Task RealClientCredentialsIssueInventoryOnlyAuthorityAndNeverHumanPrivileges()
    {
        using var deadline = new CancellationTokenSource(TimeSpan.FromSeconds(60));
        await provider.ProvisionAsync(cancellationToken: deadline.Token);
        await provider.RestartAsync(deadline.Token);
        await provider.ProvisionAsync(cancellationToken: deadline.Token);
        await using WebApplication app = await ApiAsync(provider.Settings.ServiceSecret);
        ServiceTokenClient service = app.Services.GetRequiredService<ServiceTokenClient>();
        string access = await service.GetTokenAsync(new Uri("http://inventory/api/equipment/camera-001"), deadline.Token);
        using JsonDocument claims = IdentityProviderFixture.Claims(access);
        JsonElement token = claims.RootElement;
        Assert.Equal(provider.Settings.Authority, token.GetProperty("iss").GetString());
        Assert.Equal("reservations-service", token.GetProperty("azp").GetString());
        Assert.Equal("service", token.GetProperty("principal_kind").GetString());
        Assert.Equal("Bearer", token.GetProperty("typ").GetString());
        JsonElement audiences = token.GetProperty("aud");
        string[] values = audiences.ValueKind == JsonValueKind.Array
            ? [.. audiences.EnumerateArray().Select(value => value.GetString()!)] : [audiences.GetString()!];
        Assert.Equal("inventory-api", Assert.Single(values));
        Assert.Equal("equipment.read", Assert.Single(token.GetProperty("resource_access").GetProperty("inventory-api").GetProperty("roles").EnumerateArray()).GetString());
        if (token.TryGetProperty("realm_access", out JsonElement realm))
        {
            Assert.DoesNotContain(realm.GetProperty("roles").EnumerateArray(), role => role.GetString() is "Employee" or "Approver" or "EquipmentStaff");
        }

        using HttpClient client = app.GetTestClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", access);
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/equipment", deadline.Token)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync("/human", deadline.Token)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync("/employee", deadline.Token)).StatusCode);
    }

    [Fact]
    public async Task RealProviderRejectsWrongServiceCredentialWithSafeFailure()
    {
        using var deadline = new CancellationTokenSource(TimeSpan.FromSeconds(60));
        await provider.ProvisionAsync(cancellationToken: deadline.Token);
        await using WebApplication app = await ApiAsync(Guid.NewGuid().ToString("N"));
        ServiceTokenClient service = app.Services.GetRequiredService<ServiceTokenClient>();
        HttpRequestException failure = await Assert.ThrowsAsync<HttpRequestException>(() => service.GetTokenAsync(new Uri("http://inventory/api/equipment/camera-001"), deadline.Token));
        Assert.Equal("Service authority unavailable.", failure.Message);
        Assert.Null(failure.InnerException);
    }

    private async Task<WebApplication> ApiAsync(string secret)
    {
        WebApplicationBuilder builder = WebApplication.CreateBuilder(new WebApplicationOptions { EnvironmentName = "Development" });
        _ = builder.WebHost.UseTestServer();
        _ = builder.Configuration.AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Identity:Authority"] = provider.Settings.Authority,
            ["Identity:ClientId"] = "reservations-service",
            ["Identity:ClientSecret"] = secret,
            ["InventoryUrl"] = "http://inventory"
        });
        _ = builder.Services.AddIdentityAuthentication(builder.Configuration, builder.Environment, "inventory-api");
        _ = builder.Services.AddServiceIdentity();
        WebApplication app = builder.Build();
        _ = app.UseAuthentication();
        _ = app.UseAuthorization();
        _ = app.MapGet("/equipment", () => "readable").RequireAuthorization(IdentityAuthentication.EquipmentRead);
        _ = app.MapGet("/human", () => "private").RequireAuthorization(IdentityAuthentication.Human);
        _ = app.MapGet("/employee", () => "private").RequireAuthorization(IdentityAuthentication.Employee);
        await app.StartAsync();
        return app;
    }
}
