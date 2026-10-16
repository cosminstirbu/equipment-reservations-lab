using System.Net;
using System.Net.Http.Headers;
using System.Text.Json;
using Aspire.Hosting.ApplicationModel;
using Aspire.Hosting.Testing;
using IdentityAccess;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;

namespace Smoke.Tests;

[Collection("Identity provider")]
public sealed class IdentityProviderTests(IdentityProviderFixture provider)
{
    private static readonly string[] HumanAudiences = ["inventory-api", "notifications-api", "reservations-api"];

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
        ProviderTokens before = await provider.LoginAsync("employee-a", cancellationToken: deadline.Token);
        await provider.RestartAsync(deadline.Token);
        await provider.ProvisionAsync(provider.Settings with
        {
            UserPasswords = provider.Settings.UserPasswords.ToDictionary(pair => pair.Key, _ => Guid.NewGuid().ToString("N"))
        }, deadline.Token);
        ProviderTokens after = await provider.LoginAsync("employee-a", cancellationToken: deadline.Token);
        using JsonDocument first = IdentityProviderFixture.Claims(before.AccessToken);
        using JsonDocument second = IdentityProviderFixture.Claims(after.AccessToken);
        Assert.Equal(first.RootElement.GetProperty("sub").GetString(), second.RootElement.GetProperty("sub").GetString());
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
        using var deadline = new CancellationTokenSource(TimeSpan.FromSeconds(60));
        await provider.ProvisionAsync(cancellationToken: deadline.Token);
        ProviderTokens tokens = await provider.LoginAsync("employee-a", cancellationToken: deadline.Token);
        _ = await Assert.ThrowsAnyAsync<Xunit.Sdk.XunitException>(() => provider.LoginAsync("employee-a", Guid.NewGuid().ToString("N"), deadline.Token));
        string diagnostics = await provider.DiagnosticLogsAsync(deadline.Token);
        using JsonDocument claims = IdentityProviderFixture.Claims(tokens.AccessToken);
        string[] privateValues = [tokens.AccessToken, tokens.IdToken, "LOGIN_ERROR", "employee-a@example.invalid", provider.Settings.AdminPassword,
            .. provider.Settings.UserPasswords.Values,
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

public sealed class IdentityHostingTests
{
    [Theory]
    [InlineData("18081")]
    [InlineData(" 18081 ")]
    [InlineData("\u00a018081\u00a0")]
    [InlineData("0x46A1")]
    [InlineData("#46A1")]
    [InlineData("&h46A1")]
    public async Task ConfiguredPortPreservesSupportedIntegerFormats(string value)
    {
        await using IDistributedApplicationTestingBuilder builder = await DistributedApplicationTestingBuilder.CreateAsync<Projects.AppHost>(["--environment=Development", "--IdentityPort=" + value]);
        KeycloakResource identity = Assert.Single(builder.Resources.OfType<KeycloakResource>());
        EndpointAnnotation endpoint = Assert.Single(identity.Annotations.OfType<EndpointAnnotation>(), item => item.Name == "http");
        Assert.Equal(18081, endpoint.Port);
    }

    [Theory]
    [InlineData("")]
    [InlineData(" ")]
    [InlineData("0")]
    [InlineData("65536")]
    [InlineData("-1")]
    [InlineData("not-a-port")]
    [InlineData("0x10000")]
    [InlineData("0xinvalid")]
    public async Task InvalidConfiguredPortFailsBeforeProviderStartup(string value)
    {
        _ = await Assert.ThrowsAsync<InvalidOperationException>(async () =>
        {
            await using IDistributedApplicationTestingBuilder builder = await DistributedApplicationTestingBuilder.CreateAsync<Projects.AppHost>(["--environment=Development", "--IdentityPort=" + value]);
        });
    }

    [Fact]
    public async Task LocalProviderUsesStableAuthorityPersistentStateAndExplicitProvisioningGate()
    {
        await using IDistributedApplicationTestingBuilder builder = await DistributedApplicationTestingBuilder.CreateAsync<Projects.AppHost>(["--environment=Development"]);
        KeycloakResource identity = Assert.Single(builder.Resources.OfType<KeycloakResource>());
        Assert.Equal("26.8.1", Assert.Single(identity.Annotations.OfType<ContainerImageAnnotation>()).Tag);
        Assert.Equal("equipment-reservations-identity", Assert.Single(identity.Annotations.OfType<ContainerMountAnnotation>()).Source);
        EndpointAnnotation endpoint = Assert.Single(identity.Annotations.OfType<EndpointAnnotation>(), item => item.Name == "http");
        Assert.Equal(18080, endpoint.Port);
        Assert.Equal("127.0.0.1", endpoint.TargetHost);
        EndpointAnnotation management = Assert.Single(identity.Annotations.OfType<EndpointAnnotation>(), item => item.Name == "management");
        Assert.Equal("127.0.0.1", management.TargetHost);
        Assert.True(management.ExcludeReferenceEndpoint);
        Assert.Contains(builder.Resources, resource => resource.Name == "identity-bootstrap");
    }

    [Fact]
    public async Task ProviderAdvertisesAllocatedBrowserAddressInsteadOfContainerNetworkAddress()
    {
        using var deadline = new CancellationTokenSource(TimeSpan.FromSeconds(10));
        await using IDistributedApplicationTestingBuilder builder = await DistributedApplicationTestingBuilder.CreateAsync<Projects.AppHost>(["--environment=Development"]);
        KeycloakResource identity = Assert.Single(builder.Resources.OfType<KeycloakResource>());
        foreach (EndpointAnnotation endpoint in identity.Annotations.OfType<EndpointAnnotation>())
        {
            endpoint.UriScheme = "https";
            endpoint.AllocatedEndpoint = new AllocatedEndpoint(endpoint, "127.0.0.1", 18443);
            endpoint.AllAllocatedEndpoints.AddOrUpdateAllocatedEndpoint(KnownNetworkIdentifiers.DefaultAspireContainerNetwork,
                new AllocatedEndpoint(endpoint, "identity.dev.internal", 8443, EndpointBindingMode.SingleAddress, null, KnownNetworkIdentifiers.DefaultAspireContainerNetwork));
        }

        IExecutionConfigurationResult configuration = await ExecutionConfigurationBuilder.Create(identity)
            .WithEnvironmentVariablesConfig()
            .BuildAsync(builder.ExecutionContext, NullLogger.Instance, deadline.Token);
        Assert.Equal("https://127.0.0.1:18443", configuration.EnvironmentVariables.Single(variable => variable.Key == "KC_HOSTNAME").Value);
    }
}
