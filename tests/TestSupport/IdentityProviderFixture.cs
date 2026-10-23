using System.Net;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using DotNet.Testcontainers.Builders;
using DotNet.Testcontainers.Containers;
using IdentityBootstrap;
using Microsoft.AspNetCore.WebUtilities;
using Microsoft.IdentityModel.Tokens;
using Xunit;

namespace TestSupport;

public sealed class IdentityProviderFixture : IAsyncLifetime
{
    private readonly string adminPassword = Guid.NewGuid().ToString("N");
    private IContainer? provider;
    private StableContainerPorts? ports;

    public IdentityProvisioningSettings Settings { get; private set; } = null!;

    public async ValueTask InitializeAsync()
    {
        using var deadline = new CancellationTokenSource(TimeSpan.FromMinutes(3));
        try
        {
            ports = new StableContainerPorts(8080);
            await ports.StartAsync(deadline.Token);
            provider = new ContainerBuilder("quay.io/keycloak/keycloak:26.8.1")
                .WithEnvironment("KC_BOOTSTRAP_ADMIN_USERNAME", "fixture-admin")
                .WithEnvironment("KC_BOOTSTRAP_ADMIN_PASSWORD", adminPassword)
                .WithCommand("start-dev", "--hostname-strict=false")
                .WithCreateParameterModifier(parameters =>
                {
                    parameters.HostConfig ??= new Docker.DotNet.Models.HostConfig();
                    parameters.HostConfig.NetworkMode = ports.NetworkMode;
                })
                .WithWaitStrategy(Wait.ForUnixContainer().AddCustomWaitStrategy(ports.HttpReady(8080, "/realms/master")))
                .Build();

            await provider.StartAsync(deadline.Token);
            string root = $"http://{ports.Hostname}:{ports.Port(8080)}";
            Settings = new IdentityProvisioningSettings(root + "/realms/equipment", "http://localhost:19876/", "fixture-admin", adminPassword,
                new Dictionary<string, string>
                {
                    ["employee-a"] = Guid.NewGuid().ToString("N"),
                    ["employee-b"] = Guid.NewGuid().ToString("N"),
                    ["approver"] = Guid.NewGuid().ToString("N"),
                    ["equipment-staff"] = Guid.NewGuid().ToString("N")
                }, Guid.NewGuid().ToString("N"), ["http://localhost:19877/oauth/callback", "http://localhost:19878/oauth/callback", "http://localhost:19879/oauth/callback"]);
            using var readiness = new HttpClient { Timeout = Timeout.InfiniteTimeSpan };
            await IdentityReadiness.WaitAsync(async token =>
            {
                using var credentials = new FormUrlEncodedContent(new Dictionary<string, string>
                {
                    ["grant_type"] = "password",
                    ["client_id"] = "admin-cli",
                    ["username"] = Settings.AdminUsername,
                    ["password"] = Settings.AdminPassword
                });
                using HttpResponseMessage response = await readiness.PostAsync(root + "/realms/master/protocol/openid-connect/token", credentials, token);
                if (response.StatusCode == HttpStatusCode.OK)
                {
                    using JsonDocument authority = await JsonDocument.ParseAsync(await response.Content.ReadAsStreamAsync(token), cancellationToken: token);
                    if (!authority.RootElement.TryGetProperty("access_token", out JsonElement access)
                        || access.ValueKind != JsonValueKind.String || string.IsNullOrWhiteSpace(access.GetString()))
                    {
                        throw new InvalidOperationException("Identity fixture readiness returned an invalid authority response.");
                    }
                }

                return response.StatusCode;
            }, deadline.Token);
        }
        catch
        {
            await DisposeAsync();
            throw;
        }
    }

    public async Task ProvisionAsync(IdentityProvisioningSettings? settings = null, CancellationToken cancellationToken = default)
    {
        using var client = new HttpClient { Timeout = TimeSpan.FromSeconds(5) };
        await new IdentityProvisioning(client).ReconcileAsync(settings ?? Settings, cancellationToken);
    }

    public Task<ProviderTokens> LoginAsync(string username, string? password = null, CancellationToken cancellationToken = default)
    {
        return LoginAsync(Settings, username, password, cancellationToken: cancellationToken);
    }

    internal static async Task<ProviderTokens> LoginAsync(IdentityProvisioningSettings settings, string username, string? password = null, string clientId = "equipment-web", string? callbackUri = null, CancellationToken cancellationToken = default)
    {
        string redirectUri = callbackUri ?? settings.WebRoot;
        using var handler = new HttpClientHandler { AllowAutoRedirect = false, UseCookies = false };
        using var browser = new HttpClient(handler) { Timeout = TimeSpan.FromSeconds(5) };
        string verifier = Base64UrlEncoder.Encode(RandomNumberGenerator.GetBytes(32));
        string state = Guid.NewGuid().ToString("N");
        string nonce = Guid.NewGuid().ToString("N");
        string authorize = QueryHelpers.AddQueryString(settings.Authority + "/protocol/openid-connect/auth", new Dictionary<string, string?>
        {
            ["client_id"] = clientId,
            ["redirect_uri"] = redirectUri,
            ["response_type"] = "code",
            ["response_mode"] = "fragment",
            ["scope"] = "openid",
            ["state"] = state,
            ["nonce"] = nonce,
            ["code_challenge"] = Base64UrlEncoder.Encode(SHA256.HashData(Encoding.ASCII.GetBytes(verifier))),
            ["code_challenge_method"] = "S256"
        });
        using HttpResponseMessage login = await browser.GetAsync(authorize, cancellationToken);
        Assert.Equal(HttpStatusCode.OK, login.StatusCode);
        string html = await login.Content.ReadAsStringAsync(cancellationToken);
        const string marker = "action=\"";
        int actionStart = html.IndexOf(marker, StringComparison.Ordinal);
        Assert.True(actionStart >= 0, "Provider login form must expose a submission action.");
        actionStart += marker.Length;
        int actionEnd = html.IndexOf('"', actionStart);
        string action = WebUtility.HtmlDecode(html[actionStart..actionEnd]);
        Assert.Equal(new Uri(settings.Authority).Authority, new Uri(action).Authority);
        Assert.EndsWith("/login-actions/authenticate", new Uri(action).AbsolutePath, StringComparison.Ordinal);
        // Browsers accept Secure cookies on trustworthy loopback HTTP; CookieContainer does not.
        // Replay only this provider's login cookies to its verified same-origin form action.
        if (login.Headers.TryGetValues("Set-Cookie", out IEnumerable<string>? cookies))
        {
            browser.DefaultRequestHeaders.Add("Cookie", string.Join("; ", cookies.Select(cookie => cookie.Split(';')[0])));
        }

        using var credentials = new FormUrlEncodedContent(new Dictionary<string, string>
        {
            ["username"] = username,
            ["password"] = password ?? settings.UserPasswords[username],
            ["credentialId"] = ""
        });
        using HttpResponseMessage submitted = await browser.PostAsync(action, credentials, cancellationToken);
        string submittedHtml = await submitted.Content.ReadAsStringAsync(cancellationToken);
        string failure = "Unknown provider login failure.";
        foreach (string known in new[] { "Cookie not found", "Invalid username or password", "Invalid code", "Session not active", "HTTPS required", "Invalid parameter", "expired" })
        {
            if (submittedHtml.Contains(known, StringComparison.OrdinalIgnoreCase))
            {
                failure = known;
                break;
            }
        }

        Assert.True(submitted.StatusCode == HttpStatusCode.Found, $"Provider code login returned {(int)submitted.StatusCode}: {failure}");
        Uri redirect = Assert.IsType<Uri>(submitted.Headers.Location);
        Assert.StartsWith(redirectUri + "#", redirect.AbsoluteUri, StringComparison.Ordinal);
        Dictionary<string, Microsoft.Extensions.Primitives.StringValues> callback = QueryHelpers.ParseQuery(redirect.Fragment[1..]);
        Assert.Equal(state, callback["state"].ToString());
        Assert.False(callback.ContainsKey("error"), "Provider code flow must complete without an authorization error.");
        using var exchange = new FormUrlEncodedContent(new Dictionary<string, string>
        {
            ["grant_type"] = "authorization_code",
            ["client_id"] = clientId,
            ["redirect_uri"] = redirectUri,
            ["code"] = callback["code"].ToString(),
            ["code_verifier"] = verifier
        });
        using HttpResponseMessage issued = await browser.PostAsync(settings.Authority + "/protocol/openid-connect/token", exchange, cancellationToken);
        Assert.Equal(HttpStatusCode.OK, issued.StatusCode);
        using var tokens = JsonDocument.Parse(await issued.Content.ReadAsStringAsync(cancellationToken));
        string access = tokens.RootElement.GetProperty("access_token").GetString()!;
        string id = tokens.RootElement.GetProperty("id_token").GetString()!;
        using JsonDocument idClaims = Claims(id);
        Assert.Equal(nonce, idClaims.RootElement.GetProperty("nonce").GetString());
        return new ProviderTokens(access, id);
    }

    public static JsonDocument Claims(string token)
    {
        return JsonDocument.Parse(Base64UrlEncoder.DecodeBytes(token.Split('.')[1]));
    }

    internal static async Task LogoutAsync(IdentityProvisioningSettings settings, ProviderTokens tokens, CancellationToken cancellationToken)
    {
        using var handler = new HttpClientHandler { AllowAutoRedirect = false };
        using var client = new HttpClient(handler) { Timeout = TimeSpan.FromSeconds(5) };
        string logout = QueryHelpers.AddQueryString(settings.Authority + "/protocol/openid-connect/logout", new Dictionary<string, string?>
        {
            ["id_token_hint"] = tokens.IdToken,
            ["post_logout_redirect_uri"] = settings.WebRoot
        });
        using HttpResponseMessage response = await client.GetAsync(logout, cancellationToken);
        Assert.Equal(HttpStatusCode.Found, response.StatusCode);
        Assert.Equal(settings.WebRoot, response.Headers.Location?.AbsoluteUri);
    }

    public async Task<string> DiagnosticLogsAsync(CancellationToken cancellationToken)
    {
        (string stdout, string stderr) = await provider!.GetLogsAsync(ct: cancellationToken);
        return stdout + stderr;
    }

    public async Task RestartAsync(CancellationToken cancellationToken)
    {
        await StopAsync(cancellationToken);
        await StartAsync(cancellationToken);
    }

    public Task StopAsync(CancellationToken cancellationToken)
    {
        return provider!.StopAsync(cancellationToken);
    }

    public Task StartAsync(CancellationToken cancellationToken)
    {
        return provider!.StartAsync(cancellationToken);
    }

    public async ValueTask DisposeAsync()
    {
        try
        {
            if (provider is not null)
            {
                await provider.DisposeAsync();
            }
        }
        finally
        {
            if (ports is not null)
            {
                await ports.DisposeAsync();
            }
        }
    }
}

public sealed record ProviderTokens(string AccessToken, string IdToken);
