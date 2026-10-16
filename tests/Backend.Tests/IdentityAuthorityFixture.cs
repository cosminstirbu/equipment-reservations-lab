using System.Net;
using System.Net.Http.Headers;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using IdentityAccess;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.IdentityModel.Tokens;

namespace Backend.Tests;

internal sealed class IdentityAuthorityFixture(string authority = IdentityAuthorityFixture.Issuer) : IDisposable
{
    internal const string Issuer = "https://identity.test/realms/equipment";
    internal const string EmployeeSubject = "employee-a-subject";
    internal static IdentityAuthorityFixture Shared { get; } = new();
    private readonly RSA signingKey = RSA.Create(2048);
    private int requests;

    public bool Unavailable
    {
        get; set;
    }

    public string Authority { get; } = authority;

    public string MetadataIssuer { get; set; } = authority;

    public int Requests => requests;

    internal static string UserKeyFor(string subject = EmployeeSubject)
    {
        return Convert.ToHexStringLower(SHA256.HashData(JsonSerializer.SerializeToUtf8Bytes(new[] { Issuer, subject })));
    }

    public string Token(string subject = EmployeeSubject, string[]? roles = null, string audience = "reservations-api", string? issuer = null,
        string type = "Bearer", string kind = "human", string client = "equipment-web", DateTimeOffset? expires = null,
        bool wrongSignature = false, object? subjectClaim = null, bool omitSubject = false, bool omitExpiry = false,
        string[]? serviceRoles = null, string keyId = "fixture-key", string algorithm = "RS256", object? resourceAccess = null)
    {
        var payload = new Dictionary<string, object?>
        {
            ["iss"] = issuer ?? Authority,
            ["aud"] = audience,
            ["iat"] = DateTimeOffset.UtcNow.AddSeconds(-1).ToUnixTimeSeconds(),
            ["typ"] = type,
            ["azp"] = client,
            ["principal_kind"] = kind,
            ["realm_access"] = new { roles = roles ?? ["Employee"] },
            ["resource_access"] = resourceAccess ?? new Dictionary<string, object>
            {
                ["inventory-api"] = new { roles = serviceRoles ?? [] }
            }
        };
        if (!omitSubject)
        {
            payload["sub"] = subjectClaim ?? subject;
        }

        if (!omitExpiry)
        {
            payload["exp"] = (expires ?? DateTimeOffset.UtcNow.AddMinutes(2)).ToUnixTimeSeconds();
        }

        string header = Base64UrlEncoder.Encode(JsonSerializer.SerializeToUtf8Bytes(new
        {
            alg = algorithm,
            typ = "JWT",
            kid = keyId
        }));
        string body = Base64UrlEncoder.Encode(JsonSerializer.SerializeToUtf8Bytes(payload));
        byte[] input = Encoding.ASCII.GetBytes(header + "." + body);
        using RSA? alternate = wrongSignature ? RSA.Create(2048) : null;
        HashAlgorithmName hash = algorithm == "RS512" ? HashAlgorithmName.SHA512 : HashAlgorithmName.SHA256;
        byte[] signature = (alternate ?? signingKey).SignData(input, hash, RSASignaturePadding.Pkcs1);
        return header + "." + body + "." + Base64UrlEncoder.Encode(signature);
    }

    public HttpClient Authenticate(HttpClient client, string audience = "reservations-api", string subject = EmployeeSubject)
    {
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", Token(subject, audience: audience));
        return client;
    }

    public void Configure(IConfigurationBuilder configuration)
    {
        _ = configuration.AddInMemoryCollection(new Dictionary<string, string?> { ["Identity:Authority"] = Authority });
    }

    public void Configure(IServiceCollection services)
    {
        _ = services.AddHttpClient(IdentityAuthentication.MetadataClient)
            .ConfigurePrimaryHttpMessageHandler(() => new Boundary(this));
        _ = services.AddHttpClient(ServiceTokenClient.ClientName)
            .ConfigurePrimaryHttpMessageHandler(() => new Boundary(this));
    }

    public void Dispose()
    {
        signingKey.Dispose();
    }

    private HttpResponseMessage Respond(Uri uri)
    {
        _ = Interlocked.Increment(ref requests);
        if (Unavailable)
        {
            return new HttpResponseMessage(HttpStatusCode.ServiceUnavailable);
        }

        object response;
        if (uri.AbsoluteUri == Authority + "/.well-known/openid-configuration")
        {
            response = new
            {
                issuer = MetadataIssuer,
                jwks_uri = Authority + "/certs",
                authorization_endpoint = Authority + "/auth",
                token_endpoint = Authority + "/token"
            };
        }
        else if (uri.AbsoluteUri == Authority + "/certs")
        {
            RSAParameters key = signingKey.ExportParameters(false);
            response = new
            {
                keys = new[] { new { kty = "RSA", use = "sig", kid = "fixture-key", alg = "RS256", n = Base64UrlEncoder.Encode(key.Modulus), e = Base64UrlEncoder.Encode(key.Exponent) } }
            };
        }
        else if (uri.AbsoluteUri == Authority + "/protocol/openid-connect/token")
        {
            response = new
            {
                access_token = Token(audience: "inventory-api", kind: "service", client: "reservations-service", serviceRoles: ["equipment.read"]),
                token_type = "Bearer",
                expires_in = 120
            };
        }
        else
        {
            return new HttpResponseMessage(HttpStatusCode.NotFound);
        }

        return new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent(JsonSerializer.Serialize(response), Encoding.UTF8, "application/json") };
    }

    private sealed class Boundary(IdentityAuthorityFixture owner) : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            cancellationToken.ThrowIfCancellationRequested();
            return Task.FromResult(owner.Respond(request.RequestUri!));
        }
    }
}

internal sealed class AuthenticatedApplicationFactory<TProgram> : WebApplicationFactory<TProgram> where TProgram : class
{
    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        _ = builder.UseSetting("Identity:Authority", IdentityAuthorityFixture.Shared.Authority);
        _ = builder.UseSetting("Identity:ClientId", "reservations-service");
        _ = builder.UseSetting("Identity:ClientSecret", "fixture-service-credential");
        _ = builder.ConfigureAppConfiguration((_, configuration) => IdentityAuthorityFixture.Shared.Configure(configuration));
        _ = builder.ConfigureServices(IdentityAuthorityFixture.Shared.Configure);
    }

    protected override void ConfigureClient(HttpClient client)
    {
        base.ConfigureClient(client);
        string audience = typeof(TProgram).Assembly.GetName().Name switch
        {
            "Inventory" => "inventory-api",
            "Notifications" => "notifications-api",
            _ => "reservations-api"
        };
        _ = IdentityAuthorityFixture.Shared.Authenticate(client, audience);
    }
}
