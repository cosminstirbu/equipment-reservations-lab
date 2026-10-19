using System.Diagnostics.CodeAnalysis;
using System.Net;
using System.Net.Http.Headers;
using System.Text;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.TestHost;
using Xunit;

namespace IdentityAccess.Tests;

[Collection("Authentication and input security")]
public sealed class OwnershipInputTests
{
    [StringSyntax(StringSyntaxAttribute.Json)]
    private const string OwnerCancellationBody = """{"userKey":"other"}""";

    [StringSyntax(StringSyntaxAttribute.Json)]
    private const string ValidBookingBody = """{"equipmentId":"camera-001","startAt":"2030-01-02T12:00:00Z","endAt":"2030-01-02T13:00:00Z"}""";

    [Theory]
    [InlineData("X-User-Id")]
    [InlineData("x-user-key")]
    [InlineData("X-Owner-Id")]
    [InlineData("X-Owner-Key")]
    [InlineData("X-Demo-User-Id")]
    [InlineData("X-Subject")]
    [InlineData("X-Issuer")]
    [InlineData("X-Authenticated-User")]
    [InlineData("X-Forwarded-User")]
    public async Task IdentityHeadersAreRejectedBeforeAnyWrite(string header)
    {
        using var authority = new IdentityAuthorityFixture();
        int mutations = 0;
        await using WebApplication app = await IdentityHttpHarness.StartAsync(authority, mutation: () => mutations++);
        using HttpClient client = authority.Authenticate(app.GetTestClient());
        client.DefaultRequestHeaders.Add(header, "other-user");
        using HttpResponseMessage response = await client.PostAsync("/api/reservations", BookingBody(), TestContext.Current.CancellationToken);
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal(0, mutations);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.GetAsync("/api/reservations", TestContext.Current.CancellationToken)).StatusCode);
    }

    [Theory]
    [InlineData("/api/reservations?userKey=other")]
    [InlineData("/api/reservations?subject=other")]
    [InlineData("/api/availability?equipmentId=camera-001&startAt=2030-01-02T12:00:00Z&endAt=2030-01-02T13:00:00Z&ownerId=other")]
    public async Task UnknownQueryInputsCannotChangeReadScope(string path)
    {
        using var authority = new IdentityAuthorityFixture();
        await using WebApplication app = await IdentityHttpHarness.StartAsync(authority);
        using HttpClient client = authority.Authenticate(app.GetTestClient());
        Assert.Equal(HttpStatusCode.BadRequest, (await client.GetAsync(path, TestContext.Current.CancellationToken)).StatusCode);
    }

    [Theory]
    [InlineData("userKey")]
    [InlineData("ownerId")]
    [InlineData("issuer")]
    [InlineData("subject")]
    [InlineData("demoUserId")]
    public async Task BookingRejectsExplicitOwnerBodyFieldsWithoutEffects(string field)
    {
        using var authority = new IdentityAuthorityFixture();
        int mutations = 0;
        await using WebApplication app = await IdentityHttpHarness.StartAsync(authority, mutation: () => mutations++);
        using HttpClient client = authority.Authenticate(app.GetTestClient());
        string json = "{\"equipmentId\":\"camera-001\",\"startAt\":\"2030-01-02T12:00:00Z\",\"endAt\":\"2030-01-02T13:00:00Z\",\"" + field + "\":\"other\"}";
        using var body = new StringContent(json, Encoding.UTF8, "application/json");
        using HttpResponseMessage response = await client.PostAsync("/api/reservations", body, TestContext.Current.CancellationToken);
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal(0, mutations);
    }

    [Theory]
    [InlineData(OwnerCancellationBody)]
    [InlineData("{}")]
    [InlineData("untrusted")]
    public async Task NonNullCancellationBodiesAreRejectedWithoutEffects(string json)
    {
        using var authority = new IdentityAuthorityFixture();
        int mutations = 0;
        await using WebApplication app = await IdentityHttpHarness.StartAsync(authority, mutation: () => mutations++);
        using HttpClient client = authority.Authenticate(app.GetTestClient());
        using var body = new StringContent(json, Encoding.UTF8, "application/json");
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsync("/api/reservations/1/cancel", body, TestContext.Current.CancellationToken)).StatusCode);
        Assert.Equal(0, mutations);
    }

    [Theory]
    [InlineData(false, HttpStatusCode.Unauthorized)]
    [InlineData(true, HttpStatusCode.Forbidden)]
    public async Task AuthorityDenialPrecedesForgedOwnershipValidation(bool authenticated, HttpStatusCode expected)
    {
        using var authority = new IdentityAuthorityFixture();
        int mutations = 0;
        await using WebApplication app = await IdentityHttpHarness.StartAsync(authority, mutation: () => mutations++);
        using HttpClient client = app.GetTestClient();
        if (authenticated)
        {
            client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", authority.Token(roles: ["Approver"]));
        }

        client.DefaultRequestHeaders.Add("X-User-Id", "other");
        Assert.Equal(expected, (await client.PostAsync("/api/reservations?ownerId=other", BookingBody(), TestContext.Current.CancellationToken)).StatusCode);
        Assert.Equal(0, mutations);
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/alive", TestContext.Current.CancellationToken)).StatusCode);
    }

    [Fact]
    public async Task ValidBookingAndEmptyCancellationReachAuthorizedOperation()
    {
        using var authority = new IdentityAuthorityFixture();
        int mutations = 0;
        await using WebApplication app = await IdentityHttpHarness.StartAsync(authority, mutation: () => mutations++);
        using HttpClient client = authority.Authenticate(app.GetTestClient());
        Assert.Equal(HttpStatusCode.Created, (await client.PostAsync("/api/reservations", BookingBody(), TestContext.Current.CancellationToken)).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsync("/api/reservations/1/cancel", null, TestContext.Current.CancellationToken)).StatusCode);
        Assert.Equal(2, mutations);
    }

    [Fact]
    public async Task OversizedBookingRetainsPayloadLimitAndCreatesNoEffects()
    {
        using var authority = new IdentityAuthorityFixture();
        int mutations = 0;
        await using WebApplication app = await IdentityHttpHarness.StartAsync(authority, mutation: () => mutations++);
        using HttpClient client = authority.Authenticate(app.GetTestClient());
        using var body = new StringContent(new string('x', 4097), Encoding.UTF8, "application/json");
        Assert.Equal(HttpStatusCode.RequestEntityTooLarge, (await client.PostAsync("/api/reservations", body, TestContext.Current.CancellationToken)).StatusCode);
        Assert.Equal(0, mutations);
    }

    private static StringContent BookingBody()
    {
        return new StringContent(ValidBookingBody, Encoding.UTF8, "application/json");
    }
}
