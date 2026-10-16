using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Hosting;

namespace IdentityAccess;

public sealed class ServiceTokenClient(IHttpClientFactory clients, IConfiguration configuration, IHostEnvironment environment, TimeProvider time) : IDisposable
{
    public const string ClientName = "identity-service-token";
    private readonly SemaphoreSlim acquisition = new(1, 1);
    private CachedToken? cached;
    private long completedAcquisitions;

    public async Task<string> GetTokenAsync(Uri target, CancellationToken cancellationToken)
    {
        using var budget = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        budget.CancelAfter(TimeSpan.FromSeconds(2));
        try
        {
            ValidateTarget(target);
            long observedAcquisition = Interlocked.Read(ref completedAcquisitions);
            CachedToken? current = Volatile.Read(ref cached);
            if (Usable(current))
            {
                return current!.Token;
            }

            await acquisition.WaitAsync(budget.Token);
            try
            {
                current = cached;
                if (Usable(current))
                {
                    return current!.Token;
                }

                if (Interlocked.Read(ref completedAcquisitions) != observedAcquisition)
                {
                    return current is not null && current.ExpiresAt > time.GetUtcNow()
                        ? current.Token
                        : throw new HttpRequestException("Service authority unavailable.");
                }

                cached = null;
                try
                {
                    CachedToken acquired = await AcquireAsync(budget.Token);
                    IdentityTelemetry.Record("service_token", "authenticated");
                    Volatile.Write(ref cached, acquired);
                    return acquired.Token;
                }
                finally
                {
                    _ = Interlocked.Increment(ref completedAcquisitions);
                }
            }
            finally
            {
                _ = acquisition.Release();
            }
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            throw;
        }
        catch (Exception exception) when (exception is HttpRequestException or IOException or JsonException or OperationCanceledException or ArgumentException or InvalidOperationException or FormatException)
        {
            IdentityTelemetry.Record("service_token", "provider_unavailable");
            throw new HttpRequestException("Service authority unavailable.");
        }
    }

    public void Dispose()
    {
        acquisition.Dispose();
    }

    private async Task<CachedToken> AcquireAsync(CancellationToken cancellationToken)
    {
        var issuer = new Uri(configuration["Identity:Authority"] ?? "");
        string clientId = configuration["Identity:ClientId"] ?? "";
        string secret = configuration["Identity:ClientSecret"] ?? "";
        if (issuer.UserInfo.Length != 0 || issuer.Query.Length != 0 || issuer.Fragment.Length != 0
            || (issuer.Scheme != Uri.UriSchemeHttps && !(issuer.Scheme == Uri.UriSchemeHttp && issuer.IsLoopback && environment.IsDevelopment()))
            || clientId != "reservations-service" || string.IsNullOrWhiteSpace(secret))
        {
            throw new HttpRequestException("Service authority unavailable.");
        }

        DateTimeOffset started = time.GetUtcNow();
        using var request = new HttpRequestMessage(HttpMethod.Post, issuer.AbsoluteUri.TrimEnd('/') + "/protocol/openid-connect/token")
        {
            Content = new FormUrlEncodedContent(new Dictionary<string, string>
            {
                ["grant_type"] = "client_credentials",
                ["client_id"] = clientId,
                ["client_secret"] = secret
            })
        };
        using HttpClient client = clients.CreateClient(ClientName);
        using HttpResponseMessage response = await client.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, cancellationToken);
        _ = response.EnsureSuccessStatusCode();
        await using Stream stream = await response.Content.ReadAsStreamAsync(cancellationToken);
        byte[] body = new byte[16385];
        int length = 0;
        while (length < body.Length)
        {
            int read = await stream.ReadAsync(body.AsMemory(length), cancellationToken);
            if (read == 0)
            {
                break;
            }

            length += read;
        }

        if (length > 16384)
        {
            throw new HttpRequestException("Service authority unavailable.");
        }

        ServiceTokenResponse token = JsonSerializer.Deserialize(body.AsSpan(0, length), ServiceTokenJsonContext.Default.ServiceTokenResponse)
            ?? throw new HttpRequestException("Service authority unavailable.");
        if (token.TokenType != "Bearer" || token.ExpiresIn is <= 0 or > 120 || !ValidBearer(token.AccessToken))
        {
            throw new HttpRequestException("Service authority unavailable.");
        }

        var acquired = new CachedToken(token.AccessToken!, started.AddSeconds(token.ExpiresIn));
        return acquired.ExpiresAt > time.GetUtcNow()
            ? acquired
            : throw new HttpRequestException("Service authority unavailable.");
    }

    private bool Usable(CachedToken? token)
    {
        return token is not null && token.ExpiresAt - time.GetUtcNow() > TimeSpan.FromSeconds(30);
    }

    private void ValidateTarget(Uri target)
    {
        var configured = new Uri(configuration["InventoryUrl"] ?? "http://inventory");
        if (!target.IsAbsoluteUri || configured.UserInfo.Length != 0 || target.UserInfo.Length != 0
            || configured.Query.Length != 0 || configured.Fragment.Length != 0 || configured.AbsolutePath != "/"
            || configured.Scheme is not ("http" or "https")
            || !string.Equals(configured.GetLeftPart(UriPartial.Authority), target.GetLeftPart(UriPartial.Authority), StringComparison.OrdinalIgnoreCase))
        {
            throw new HttpRequestException("Service authority unavailable.");
        }
    }

    private static bool ValidBearer(string? value)
    {
        return !string.IsNullOrWhiteSpace(value) && value.Length <= 16384
            && value.All(character => char.IsAsciiLetterOrDigit(character) || character is '-' or '.' or '_' or '~' or '+' or '/' or '=');
    }

    private sealed class CachedToken(string token, DateTimeOffset expiresAt)
    {
        public string Token { get; } = token;

        public DateTimeOffset ExpiresAt { get; } = expiresAt;
    }
}

public static class ServiceIdentityRegistration
{
    public static IServiceCollection AddServiceIdentity(this IServiceCollection services)
    {
        services.TryAddSingleton(TimeProvider.System);
        _ = services.AddSingleton<ServiceTokenClient>();
        _ = services.AddHttpClient(ServiceTokenClient.ClientName, client => client.Timeout = TimeSpan.FromSeconds(2))
            .ConfigurePrimaryHttpMessageHandler(() => new SocketsHttpHandler { AllowAutoRedirect = false })
            .RemoveAllLoggers();
        return services;
    }
}

internal sealed record ServiceTokenResponse(
    [property: JsonPropertyName("access_token")] string? AccessToken,
    [property: JsonPropertyName("token_type")] string? TokenType,
    [property: JsonPropertyName("expires_in")] int ExpiresIn)
{
    public override string ToString()
    {
        return nameof(ServiceTokenResponse);
    }
}

[JsonSerializable(typeof(ServiceTokenResponse))]
internal sealed partial class ServiceTokenJsonContext : JsonSerializerContext;
