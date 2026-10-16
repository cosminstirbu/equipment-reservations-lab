using System.Net;
using System.Net.Http.Headers;
using IdentityAccess;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Npgsql;
using Xunit;

namespace Backend.Tests;

public sealed class IdentityAccessTests
{
    private static readonly string[] AmbiguousSubjects = ["first", "second"];

    [Theory]
    [InlineData("missing")]
    [InlineData("malformed")]
    [InlineData("expired")]
    [InlineData("signature")]
    [InlineData("algorithm")]
    [InlineData("issuer")]
    [InlineData("audience")]
    [InlineData("audience-slash")]
    [InlineData("id-token")]
    [InlineData("missing-expiry")]
    [InlineData("missing-subject")]
    [InlineData("duplicate-subject")]
    [InlineData("empty-subject")]
    [InlineData("oversized-subject")]
    public async Task InvalidAuthorityCannotReadProtectedData(string fault)
    {
        using var authority = new IdentityAuthorityFixture();
        await using WebApplication app = await IdentityHttpHarness.StartAsync(authority);
        using HttpClient client = app.GetTestClient();
        string? token = fault switch
        {
            "missing" => null,
            "malformed" => "untrusted",
            "expired" => authority.Token(expires: DateTimeOffset.UtcNow.AddMinutes(-1)),
            "signature" => authority.Token(wrongSignature: true),
            "algorithm" => authority.Token(algorithm: "RS512"),
            "issuer" => authority.Token(issuer: "https://other.test/realms/equipment"),
            "audience" => authority.Token(audience: "inventory-api"),
            "audience-slash" => authority.Token(audience: "reservations-api/"),
            "id-token" => authority.Token(type: "ID"),
            "missing-expiry" => authority.Token(omitExpiry: true),
            "missing-subject" => authority.Token(omitSubject: true),
            "duplicate-subject" => authority.Token(subjectClaim: AmbiguousSubjects),
            "empty-subject" => authority.Token(subject: ""),
            _ => authority.Token(subject: new string('é', 128))
        };
        if (token is not null)
        {
            client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);
        }

        using HttpResponseMessage response = await client.GetAsync("/human");
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.DoesNotContain("protected", await response.Content.ReadAsStringAsync(), StringComparison.Ordinal);
    }

    [Fact]
    public async Task MetadataCannotExtendTheConfiguredIssuerTrustBoundary()
    {
        using var authority = new IdentityAuthorityFixture { MetadataIssuer = "https://other.test/realms/equipment" };
        await using WebApplication app = await IdentityHttpHarness.StartAsync(authority);
        using HttpClient client = app.GetTestClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", authority.Token(issuer: authority.MetadataIssuer));
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/human")).StatusCode);
    }

    [Theory]
    [InlineData("Employee", true)]
    [InlineData("Approver", false)]
    [InlineData("EquipmentStaff", false)]
    [InlineData("Approver,Employee", true)]
    [InlineData("", false)]
    public async Task OnlyExplicitEmployeeGrantAllowsEmployeeOperation(string grants, bool allowed)
    {
        using var authority = new IdentityAuthorityFixture();
        await using WebApplication app = await IdentityHttpHarness.StartAsync(authority);
        using HttpClient client = app.GetTestClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", authority.Token(roles: grants.Split(',', StringSplitOptions.RemoveEmptyEntries)));
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/human")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/equipment")).StatusCode);
        Assert.Equal(allowed ? HttpStatusCode.OK : HttpStatusCode.Forbidden, (await client.GetAsync("/employee")).StatusCode);
    }

    [Theory]
    [InlineData("human", "reservations-service", true, false)]
    [InlineData("service", "equipment-web", true, false)]
    [InlineData("service", "reservations-service", true, true)]
    [InlineData("service", "reservations-service", false, false)]
    public async Task ServiceAuthorityRequiresExactKindClientAudienceAndClientRole(string kind, string clientId, bool permission, bool allowed)
    {
        using var authority = new IdentityAuthorityFixture();
        await using WebApplication app = await IdentityHttpHarness.StartAsync(authority, "inventory-api");
        using HttpClient client = app.GetTestClient();
        string[] serviceRoles = permission ? ["equipment.read"] : [];
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", authority.Token(kind: kind, client: clientId, audience: "inventory-api", serviceRoles: serviceRoles));
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync("/human")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync("/employee")).StatusCode);
        Assert.Equal(allowed ? HttpStatusCode.OK : HttpStatusCode.Forbidden, (await client.GetAsync("/equipment")).StatusCode);
    }

    [Fact]
    public async Task OwnershipKeyUsesCanonicalFramedIssuerAndOpaqueSubject()
    {
        using var authority = new IdentityAuthorityFixture();
        await using WebApplication app = await IdentityHttpHarness.StartAsync(authority);
        using HttpClient client = app.GetTestClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", authority.Token(subject: "opaque/é<>"));
        string key = await client.GetStringAsync("/key");
        Assert.Equal("797eadf59feeb4848cd1aa54c35593df1d374d8c10319ffc61324a5d018c83b3", key);
    }

    [Fact]
    public async Task MalformedServiceRoleGrantFailsClosed()
    {
        using var authority = new IdentityAuthorityFixture();
        await using WebApplication app = await IdentityHttpHarness.StartAsync(authority, "inventory-api");
        using HttpClient client = app.GetTestClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", authority.Token(
            kind: "service", client: "reservations-service", audience: "inventory-api",
            resourceAccess: new Dictionary<string, object?> { ["inventory-api"] = null }));
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync("/equipment")).StatusCode);
    }

    [Fact]
    public async Task EqualOpaqueSubjectsFromDifferentIssuersHaveDistinctOwnershipKeys()
    {
        using var first = new IdentityAuthorityFixture();
        using var second = new IdentityAuthorityFixture("https://identity.test/realms/another");
        await using WebApplication firstApp = await IdentityHttpHarness.StartAsync(first);
        await using WebApplication secondApp = await IdentityHttpHarness.StartAsync(second);
        using HttpClient firstClient = first.Authenticate(firstApp.GetTestClient());
        using HttpClient secondClient = second.Authenticate(secondApp.GetTestClient());
        string firstKey = await firstClient.GetStringAsync("/key");
        string secondKey = await secondClient.GetStringAsync("/key");
        Assert.Equal(64, firstKey.Length);
        Assert.Equal(64, secondKey.Length);
        Assert.NotEqual(firstKey, secondKey);
    }

    [Fact]
    public async Task MaximumByteLengthOpaqueSubjectRemainsUsable()
    {
        using var authority = new IdentityAuthorityFixture();
        await using WebApplication app = await IdentityHttpHarness.StartAsync(authority);
        using HttpClient client = authority.Authenticate(app.GetTestClient(), subject: new string('é', 127) + "a");
        Assert.Equal(64, (await client.GetStringAsync("/key")).Length);
    }

    [Fact]
    public async Task CachedKnownSigningKeyRemainsUsableDuringMetadataOutageAndUnknownKeyFailsClosed()
    {
        using var authority = new IdentityAuthorityFixture();
        await using WebApplication app = await IdentityHttpHarness.StartAsync(authority);
        using HttpClient client = authority.Authenticate(app.GetTestClient());
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/human")).StatusCode);
        int initialRequests = authority.Requests;
        Assert.True(initialRequests >= 2);
        authority.Unavailable = true;
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/human")).StatusCode);
        Assert.Equal(initialRequests, authority.Requests);
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", authority.Token(wrongSignature: true, keyId: "unknown-key"));
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/human")).StatusCode);
    }

    [Fact]
    public async Task InitialMetadataOutageFailsClosedWithoutProviderDetails()
    {
        using var authority = new IdentityAuthorityFixture { Unavailable = true };
        await using WebApplication app = await IdentityHttpHarness.StartAsync(authority);
        using HttpClient client = authority.Authenticate(app.GetTestClient());
        using HttpResponseMessage response = await client.GetAsync("/human");
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.DoesNotContain("identity.test", await response.Content.ReadAsStringAsync(), StringComparison.Ordinal);
    }
}

[Collection("PostgreSQL")]
public sealed class ApiAuthorizationTests(PostgresFixture postgres)
{
    [Theory]
    [InlineData("inventory")]
    [InlineData("reservations")]
    [InlineData("notifications")]
    public async Task ActualApplicationRoutesRequireValidPerApiBearerBeforeRequestValidation(string service)
    {
        await using NpgsqlDataSource database = await postgres.CreateMigratedDatabaseAsync(service);
        switch (service)
        {
            case "inventory":
                await AssertAuthorityAsync<Inventory.Program>(database, [(HttpMethod.Get, "/api/equipment"), (HttpMethod.Get, "/api/equipment/camera-001")]);
                break;
            case "notifications":
                await AssertAuthorityAsync<Notifications.Program>(database, [(HttpMethod.Get, "/api/notifications")]);
                break;
            default:
                await AssertAuthorityAsync<Reservations.Program>(database,
                [
                    (HttpMethod.Get, "/api/reservations"), (HttpMethod.Get, "/api/reservations/11111111-1111-1111-1111-111111111111"),
                    (HttpMethod.Get, "/api/availability"), (HttpMethod.Post, "/api/reservations"),
                    (HttpMethod.Post, "/api/reservations/11111111-1111-1111-1111-111111111111/cancel")
                ]);
                break;
        }
    }

    [Theory]
    [InlineData("Approver")]
    [InlineData("EquipmentStaff")]
    public async Task NonEmployeeHumansCanCheckAvailabilityButAllReservationOperationsAreForbidden(string role)
    {
        await using BookingScenario scenario = await BookingScenario.CreateAsync(postgres);
        scenario.Client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", IdentityAuthorityFixture.Shared.Token(roles: [role]));
        Assert.Equal(HttpStatusCode.OK, (await scenario.AvailabilityAsync()).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await scenario.BookAsync()).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await scenario.Client.GetAsync("/api/reservations")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await scenario.Client.GetAsync("/api/reservations/11111111-1111-1111-1111-111111111111")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await scenario.Client.PostAsync("/api/reservations/11111111-1111-1111-1111-111111111111/cancel", null)).StatusCode);
        Assert.Equal(0, await scenario.CountAsync("reservations"));
        Assert.Equal(0, await scenario.CountAsync("reservation_outbox"));
    }

    private static async Task AssertAuthorityAsync<TProgram>(NpgsqlDataSource database, (HttpMethod Method, string Path)[] routes) where TProgram : class
    {
        using WebApplicationFactory<TProgram> app = PostgresFixture.Factory<TProgram>(database);
        using HttpClient client = app.CreateClient();
        foreach (string fault in new[] { "missing", "malformed", "wrong-audience" })
        {
            client.DefaultRequestHeaders.Authorization = fault switch
            {
                "missing" => null,
                "malformed" => new AuthenticationHeaderValue("Bearer", "invalid"),
                _ => new AuthenticationHeaderValue("Bearer", IdentityAuthorityFixture.Shared.Token(audience: "unrelated-api"))
            };
            _ = client.DefaultRequestHeaders.Remove("X-Owner-Key");
            client.DefaultRequestHeaders.Add("X-Owner-Key", "forged");
            foreach ((HttpMethod method, string path) in routes)
            {
                using var request = new HttpRequestMessage(method, path);
                Assert.Equal(HttpStatusCode.Unauthorized, (await client.SendAsync(request)).StatusCode);
            }
        }

        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/alive")).StatusCode);
    }
}

internal static class IdentityHttpHarness
{
    internal static async Task<WebApplication> StartAsync(IdentityAuthorityFixture authority, string audience = "reservations-api", Action? mutation = null)
    {
        WebApplicationBuilder builder = WebApplication.CreateBuilder(new WebApplicationOptions { EnvironmentName = "Testing" });
        _ = builder.WebHost.UseTestServer();
        authority.Configure(builder.Configuration);
        _ = builder.Services.AddIdentityAuthentication(builder.Configuration, builder.Environment, audience);
        authority.Configure(builder.Services);
        WebApplication app = builder.Build();
        _ = app.UseAuthentication();
        _ = app.UseAuthorization();
        _ = app.UseOwnershipInputGuard();
        _ = app.MapGet("/human", () => "protected human data").RequireAuthorization(IdentityAuthentication.Human);
        _ = app.MapGet("/employee", () => "protected employee data").RequireAuthorization(IdentityAuthentication.Employee);
        _ = app.MapGet("/equipment", () => "equipment data").RequireAuthorization(IdentityAuthentication.EquipmentRead);
        _ = app.MapGet("/key", (HttpContext context) => IdentityPrincipal.UserKey(context.User)).RequireAuthorization(IdentityAuthentication.Human);
        _ = app.MapGet("/alive", () => "alive").AllowAnonymous();
        _ = app.MapGet("/api/reservations", () => "owned history").RequireAuthorization(IdentityAuthentication.Employee);
        _ = app.MapGet("/api/availability", () => "available").RequireAuthorization(IdentityAuthentication.Human);
        _ = app.MapPost("/api/reservations", () =>
        {
            mutation?.Invoke();
            return Results.Created("/api/reservations/1", "saved");
        }).RequireAuthorization(IdentityAuthentication.Employee);
        _ = app.MapPost("/api/reservations/1/cancel", () =>
        {
            mutation?.Invoke();
            return Results.Ok("cancelled");
        }).RequireAuthorization(IdentityAuthentication.Employee);
        await app.StartAsync();
        return app;
    }
}
