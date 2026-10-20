using System.Net;
using System.Net.Http.Headers;
using System.Text.Json;
using IdentityAccess;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.Configuration;
using Xunit;

namespace IdentityBootstrap.Tests;

[Collection("Identity provider")]
public sealed class IdentityProviderTests(IdentityProviderFixture provider)
{
    private static readonly string[] HumanAudiences = ["inventory-api", "notifications-api", "reservations-api"];

    [Fact]
    public async Task DocumentationCodeFlowUsesExistingHumanRolesAudiencesAndSubject()
    {
        using var deadline = new CancellationTokenSource(TimeSpan.FromSeconds(60));
        await provider.ProvisionAsync(cancellationToken: deadline.Token);
        ProviderTokens web = await provider.LoginAsync("employee-a", cancellationToken: deadline.Token);
        ProviderTokens docs = await IdentityProviderFixture.LoginAsync(provider.Settings, "employee-a", cancellationToken: deadline.Token, clientId: "equipment-docs", callbackUri: "http://localhost:19877/oauth/callback");
        using JsonDocument webClaims = IdentityProviderFixture.Claims(web.AccessToken);
        using JsonDocument claims = IdentityProviderFixture.Claims(docs.AccessToken);
        Assert.Equal("equipment-docs", claims.RootElement.GetProperty("azp").GetString());
        Assert.Equal("human", claims.RootElement.GetProperty("principal_kind").GetString());
        Assert.Equal(webClaims.RootElement.GetProperty("sub").GetString(), claims.RootElement.GetProperty("sub").GetString());
        Assert.Equal(HumanAudiences, claims.RootElement.GetProperty("aud").EnumerateArray().Select(item => item.GetString()).Order());
        Assert.Equal("Employee", Assert.Single(claims.RootElement.GetProperty("realm_access").GetProperty("roles").EnumerateArray()).GetString());
    }

    [Fact]
    public async Task DocumentationReconciliationReplacesStaleCallbackAndOrigin()
    {
        using var deadline = new CancellationTokenSource(TimeSpan.FromSeconds(60));
        await provider.ProvisionAsync(cancellationToken: deadline.Token);
        const string changed = "http://localhost:19880/oauth/callback";
        try
        {
            await provider.ProvisionAsync(provider.Settings with
            {
                DocumentationCallbacks = [changed]
            }, deadline.Token);
            _ = await IdentityProviderFixture.LoginAsync(provider.Settings, "employee-a", clientId: "equipment-docs", callbackUri: changed, cancellationToken: deadline.Token);
            using var client = new HttpClient(new HttpClientHandler { AllowAutoRedirect = false }) { Timeout = TimeSpan.FromSeconds(5) };
            string stale = provider.Settings.Authority + "/protocol/openid-connect/auth?client_id=equipment-docs&response_type=code&redirect_uri="
                + Uri.EscapeDataString("http://localhost:19877/oauth/callback") + "&code_challenge=abcdefghijklmnopqrstuvwxyz012345678901234567890&code_challenge_method=S256";
            Assert.Equal(HttpStatusCode.BadRequest, (await client.GetAsync(stale, deadline.Token)).StatusCode);
        }
        finally
        {
            await provider.ProvisionAsync(cancellationToken: deadline.Token);
        }
    }

    [Theory]
    [InlineData("missing")]
    [InlineData("plain")]
    [InlineData("redirect")]
    [InlineData("implicit")]
    public async Task DocumentationAuthorizationRejectsUnsafeRequests(string fault)
    {
        using var deadline = new CancellationTokenSource(TimeSpan.FromSeconds(60));
        await provider.ProvisionAsync(cancellationToken: deadline.Token);
        using var client = new HttpClient(new HttpClientHandler { AllowAutoRedirect = false }) { Timeout = TimeSpan.FromSeconds(5) };
        string callback = "http://localhost:19877/oauth/callback";
        string authorize = provider.Settings.Authority + "/protocol/openid-connect/auth?client_id=equipment-docs&scope=openid&response_type="
            + (fault == "implicit" ? "token" : "code") + "&redirect_uri=" + Uri.EscapeDataString(fault == "redirect" ? callback + "unregistered" : callback)
            + (fault == "missing" ? "" : "&code_challenge=abcdefghijklmnopqrstuvwxyz012345678901234567890&code_challenge_method=" + (fault == "plain" ? "plain" : "S256"));
        using HttpResponseMessage response = await client.GetAsync(authorize, deadline.Token);
        Assert.NotEqual(HttpStatusCode.OK, response.StatusCode);
        if (response.Headers.Location is { } redirect)
        {
            Assert.Contains("error=", redirect.AbsoluteUri, StringComparison.Ordinal);
        }
    }

    [Theory]
    [InlineData("password")]
    [InlineData("client_credentials")]
    public async Task DocumentationClientRejectsNonCodeGrantsAndUnregisteredCors(string grant)
    {
        using var deadline = new CancellationTokenSource(TimeSpan.FromSeconds(60));
        await provider.ProvisionAsync(cancellationToken: deadline.Token);
        using var client = new HttpClient { Timeout = TimeSpan.FromSeconds(5) };
        foreach (string origin in new[] { "http://localhost:19877", "http://localhost:19999" })
        {
            using var request = new HttpRequestMessage(HttpMethod.Post, provider.Settings.Authority + "/protocol/openid-connect/token");
            request.Headers.Add("Origin", origin);
            request.Content = new FormUrlEncodedContent(new Dictionary<string, string> { ["client_id"] = "equipment-docs", ["grant_type"] = grant });
            using HttpResponseMessage response = await client.SendAsync(request, deadline.Token);
            Assert.False(response.IsSuccessStatusCode);
            bool allowed = response.Headers.TryGetValues("Access-Control-Allow-Origin", out IEnumerable<string>? values);
            Assert.Equal(origin.EndsWith(":19877", StringComparison.Ordinal), allowed);
            if (allowed)
            {
                Assert.Equal(origin, Assert.Single(values!));
            }
        }
    }

    [Theory]
    [InlineData("http://localhost:0/oauth/callback")]
    [InlineData("http://example.com/oauth/callback")]
    [InlineData("http://127.1/oauth/callback")]
    [InlineData("http://localhost:19877/oauth/callback*")]
    [InlineData("http://localhost:19877/oauth/callback?code=secret")]
    [InlineData("http://user@localhost:19877/oauth/callback")]
    [InlineData("http://localhost:19877/oauth/callback#token")]
    [InlineData("http://localhost:19877/wrong/")]
    public async Task InvalidDocumentationCallbackFailsBeforeAnyProviderRequest(string callback)
    {
        using var client = new HttpClient { Timeout = TimeSpan.FromSeconds(5) };
        _ = await Assert.ThrowsAsync<InvalidOperationException>(() => new IdentityProvisioning(client).ReconcileAsync(provider.Settings with { DocumentationCallbacks = [callback] }, TestContext.Current.CancellationToken));
        Assert.Null(client.BaseAddress);
    }

    [Theory]
    [InlineData("employee-a", "Employee")]
    [InlineData("employee-b", "Employee")]
    [InlineData("approver", "Approver")]
    [InlineData("equipment-staff", "EquipmentStaff")]
    public async Task RealCodePkceFlowIssuesOnlyExplicitHumanAuthority(string username, string role)
    {
        using var deadline = new CancellationTokenSource(TimeSpan.FromSeconds(60));
        await provider.ProvisionAsync(cancellationToken: deadline.Token);
        ProviderTokens tokens = await provider.LoginAsync(username, cancellationToken: deadline.Token);
        using JsonDocument claims = IdentityProviderFixture.Claims(tokens.AccessToken);
        JsonElement value = claims.RootElement;
        Assert.Equal(provider.Settings.Authority, value.GetProperty("iss").GetString());
        Assert.Equal("equipment-web", value.GetProperty("azp").GetString());
        Assert.Equal("human", value.GetProperty("principal_kind").GetString());
        Assert.Equal("Bearer", value.GetProperty("typ").GetString());
        Assert.Equal(username, value.GetProperty("preferred_username").GetString());
        string[] audiences = [.. value.GetProperty("aud").EnumerateArray().Select(item => item.GetString()!)];
        Assert.Equal(HumanAudiences, audiences.Order());
        string[] roles = [.. value.GetProperty("realm_access").GetProperty("roles").EnumerateArray().Select(item => item.GetString()!)];
        Assert.Equal(role, Assert.Single(roles));
        Assert.Equal(120, value.GetProperty("exp").GetInt64() - value.GetProperty("iat").GetInt64());
        await using WebApplication app = await ApiAsync();
        using HttpClient api = app.GetTestClient();
        api.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", tokens.AccessToken);
        Assert.Equal(HttpStatusCode.OK, (await api.GetAsync("/human", deadline.Token)).StatusCode);
        Assert.Equal(role == "Employee" ? HttpStatusCode.OK : HttpStatusCode.Forbidden, (await api.GetAsync("/employee", deadline.Token)).StatusCode);
        api.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", tokens.IdToken);
        Assert.Equal(HttpStatusCode.Unauthorized, (await api.GetAsync("/human", deadline.Token)).StatusCode);
    }

    [Fact]
    public async Task RepeatedProvisioningPreservesSubjectsPasswordsAndAllocatedCallback()
    {
        using var deadline = new CancellationTokenSource(TimeSpan.FromSeconds(60));
        await provider.ProvisionAsync(cancellationToken: deadline.Token);
        var subjects = new Dictionary<string, string>();
        foreach (string username in provider.Settings.UserPasswords.Keys)
        {
            ProviderTokens before = await provider.LoginAsync(username, cancellationToken: deadline.Token);
            using JsonDocument claims = IdentityProviderFixture.Claims(before.AccessToken);
            Assert.Equal(provider.Settings.Authority, claims.RootElement.GetProperty("iss").GetString());
            subjects[username] = claims.RootElement.GetProperty("sub").GetString()!;
        }

        await provider.RestartAsync(deadline.Token);
        await provider.ProvisionAsync(provider.Settings with
        {
            UserPasswords = provider.Settings.UserPasswords.ToDictionary(pair => pair.Key, _ => Guid.NewGuid().ToString("N"))
        }, deadline.Token);
        foreach (string username in provider.Settings.UserPasswords.Keys)
        {
            ProviderTokens after = await provider.LoginAsync(username, cancellationToken: deadline.Token);
            using JsonDocument claims = IdentityProviderFixture.Claims(after.AccessToken);
            Assert.Equal(subjects[username], claims.RootElement.GetProperty("sub").GetString());
            Assert.Equal(provider.Settings.Authority, claims.RootElement.GetProperty("iss").GetString());
            string expectedRole = username switch
            {
                "approver" => "Approver",
                "equipment-staff" => "EquipmentStaff",
                _ => "Employee"
            };
            Assert.Equal(expectedRole, Assert.Single(claims.RootElement.GetProperty("realm_access").GetProperty("roles").EnumerateArray()).GetString());
        }

        using var client = new HttpClient { Timeout = TimeSpan.FromSeconds(5) };
        using var metadata = JsonDocument.Parse(await client.GetStringAsync(provider.Settings.Authority + "/.well-known/openid-configuration", deadline.Token));
        Assert.Equal(provider.Settings.Authority, metadata.RootElement.GetProperty("issuer").GetString());
        Assert.Equal(provider.Settings.Authority + "/protocol/openid-connect/token", metadata.RootElement.GetProperty("token_endpoint").GetString());
    }

    [Fact]
    public async Task ProviderRejectsUnregisteredCallbacksAndBrowserPasswordGrant()
    {
        using var deadline = new CancellationTokenSource(TimeSpan.FromSeconds(60));
        await provider.ProvisionAsync(cancellationToken: deadline.Token);
        using var client = new HttpClient(new HttpClientHandler { AllowAutoRedirect = false }) { Timeout = TimeSpan.FromSeconds(5) };
        string invalidCallback = provider.Settings.Authority + "/protocol/openid-connect/auth?client_id=equipment-web&response_type=code&redirect_uri="
            + Uri.EscapeDataString(provider.Settings.WebRoot + "unregistered") + "&code_challenge=untrusted&code_challenge_method=S256";
        Assert.Equal(HttpStatusCode.BadRequest, (await client.GetAsync(invalidCallback, deadline.Token)).StatusCode);
        using var direct = new FormUrlEncodedContent(new Dictionary<string, string>
        {
            ["client_id"] = "equipment-web",
            ["grant_type"] = "password",
            ["username"] = "employee-a",
            ["password"] = provider.Settings.UserPasswords["employee-a"]
        });
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsync(provider.Settings.Authority + "/protocol/openid-connect/token", direct, deadline.Token)).StatusCode);
    }

    [Fact]
    public async Task SuccessfulAndRejectedProviderLoginsExcludePrivateSessionAndProfileDiagnostics()
    {
        // This assertion owns the complete provider log history, including startup.
        await using var isolated = new IdentityProviderFixture();
        await isolated.InitializeAsync();

        using var deadline = new CancellationTokenSource(TimeSpan.FromSeconds(60));
        await isolated.ProvisionAsync(cancellationToken: deadline.Token);
        ProviderTokens tokens = await isolated.LoginAsync("employee-a", cancellationToken: deadline.Token);
        _ = await Assert.ThrowsAnyAsync<Xunit.Sdk.XunitException>(() => isolated.LoginAsync("employee-a", Guid.NewGuid().ToString("N"), deadline.Token));
        string diagnostics = await isolated.DiagnosticLogsAsync(deadline.Token);
        using JsonDocument claims = IdentityProviderFixture.Claims(tokens.AccessToken);
        string[] privateValues = [tokens.AccessToken, tokens.IdToken, "LOGIN_ERROR", "employee-a@example.invalid", isolated.Settings.AdminPassword,
            .. isolated.Settings.UserPasswords.Values,
            .. claims.RootElement.EnumerateObject().Where(property => property.Name is "sid" or "session_state" or "jti").Select(property => property.Value.GetString()!)];
        Assert.All(privateValues, value => Assert.False(diagnostics.Contains(value, StringComparison.Ordinal), "Provider diagnostics must exclude credentials, tokens, session and profile data."));
    }

    private async Task<WebApplication> ApiAsync()
    {
        WebApplicationBuilder builder = WebApplication.CreateBuilder(new WebApplicationOptions { EnvironmentName = "Development" });
        _ = builder.WebHost.UseTestServer();
        _ = builder.Configuration.AddInMemoryCollection(new Dictionary<string, string?> { ["Identity:Authority"] = provider.Settings.Authority });
        _ = builder.Services.AddIdentityAuthentication(builder.Configuration, builder.Environment, "reservations-api");
        WebApplication app = builder.Build();
        _ = app.UseAuthentication();
        _ = app.UseAuthorization();
        _ = app.MapGet("/human", () => "owned data").RequireAuthorization(IdentityAuthentication.Human);
        _ = app.MapGet("/employee", () => "owned reservation").RequireAuthorization(IdentityAuthentication.Employee);
        await app.StartAsync();
        return app;
    }
}
