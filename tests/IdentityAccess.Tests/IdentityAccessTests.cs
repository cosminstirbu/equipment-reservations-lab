using System.Net;
using System.Net.Http.Headers;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.TestHost;
using Xunit;

namespace IdentityAccess.Tests;

[Collection("Authentication and input security")]
public sealed class IdentityAccessTests
{
    private static readonly string[] AmbiguousSubjects = ["first", "second"];

    [Fact]
    public async Task ConcurrentFirstUseOfAuthoritySignsTokensWithItsPublishedKey()
    {
        using var authority = new IdentityAuthorityFixture();
        await using WebApplication app = await IdentityHttpHarness.StartAsync(authority);
        using HttpClient client = app.GetTestClient();
        var start = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        Task<HttpStatusCode>[] requests = [.. Enumerable.Range(0, 32).Select(_ => Task.Run(async () =>
        {
            await start.Task.WaitAsync(TestContext.Current.CancellationToken);
            using var request = new HttpRequestMessage(HttpMethod.Get, "/human");
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", authority.Token());
            using HttpResponseMessage response = await client.SendAsync(request, TestContext.Current.CancellationToken);
            return response.StatusCode;
        }, TestContext.Current.CancellationToken))];

        start.SetResult();
        HttpStatusCode[] responses = await Task.WhenAll(requests);
        Assert.All(responses, status => Assert.Equal(HttpStatusCode.OK, status));
    }

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

        using HttpResponseMessage response = await client.GetAsync("/human", TestContext.Current.CancellationToken);
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.DoesNotContain("protected", await response.Content.ReadAsStringAsync(TestContext.Current.CancellationToken), StringComparison.Ordinal);
    }

    [Fact]
    public async Task MetadataCannotExtendTheConfiguredIssuerTrustBoundary()
    {
        using var authority = new IdentityAuthorityFixture { MetadataIssuer = "https://other.test/realms/equipment" };
        await using WebApplication app = await IdentityHttpHarness.StartAsync(authority);
        using HttpClient client = app.GetTestClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", authority.Token(issuer: authority.MetadataIssuer));
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/human", TestContext.Current.CancellationToken)).StatusCode);
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
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/human", TestContext.Current.CancellationToken)).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/equipment", TestContext.Current.CancellationToken)).StatusCode);
        Assert.Equal(allowed ? HttpStatusCode.OK : HttpStatusCode.Forbidden, (await client.GetAsync("/employee", TestContext.Current.CancellationToken)).StatusCode);
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
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync("/human", TestContext.Current.CancellationToken)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync("/employee", TestContext.Current.CancellationToken)).StatusCode);
        Assert.Equal(allowed ? HttpStatusCode.OK : HttpStatusCode.Forbidden, (await client.GetAsync("/equipment", TestContext.Current.CancellationToken)).StatusCode);
    }

    [Fact]
    public async Task OwnershipKeyUsesCanonicalFramedIssuerAndOpaqueSubject()
    {
        using var authority = new IdentityAuthorityFixture();
        await using WebApplication app = await IdentityHttpHarness.StartAsync(authority);
        using HttpClient client = app.GetTestClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", authority.Token(subject: "opaque/é<>"));
        string key = await client.GetStringAsync("/key", TestContext.Current.CancellationToken);
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
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync("/equipment", TestContext.Current.CancellationToken)).StatusCode);
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
        string firstKey = await firstClient.GetStringAsync("/key", TestContext.Current.CancellationToken);
        string secondKey = await secondClient.GetStringAsync("/key", TestContext.Current.CancellationToken);
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
        Assert.Equal(64, (await client.GetStringAsync("/key", TestContext.Current.CancellationToken)).Length);
    }

    [Fact]
    public async Task CachedKnownSigningKeyRemainsUsableDuringMetadataOutageAndUnknownKeyFailsClosed()
    {
        using var authority = new IdentityAuthorityFixture();
        await using WebApplication app = await IdentityHttpHarness.StartAsync(authority);
        using HttpClient client = authority.Authenticate(app.GetTestClient());
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/human", TestContext.Current.CancellationToken)).StatusCode);
        int initialRequests = authority.Requests;
        Assert.True(initialRequests >= 2);
        authority.Unavailable = true;
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/human", TestContext.Current.CancellationToken)).StatusCode);
        Assert.Equal(initialRequests, authority.Requests);
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", authority.Token(wrongSignature: true, keyId: "unknown-key"));
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/human", TestContext.Current.CancellationToken)).StatusCode);
    }

    [Fact]
    public async Task InitialMetadataOutageFailsClosedWithoutProviderDetails()
    {
        using var authority = new IdentityAuthorityFixture { Unavailable = true };
        await using WebApplication app = await IdentityHttpHarness.StartAsync(authority);
        using HttpClient client = authority.Authenticate(app.GetTestClient());
        using HttpResponseMessage response = await client.GetAsync("/human", TestContext.Current.CancellationToken);
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.DoesNotContain("identity.test", await response.Content.ReadAsStringAsync(TestContext.Current.CancellationToken), StringComparison.Ordinal);
    }
}

