using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.IdentityModel.Tokens;

namespace IdentityAccess;

public static class IdentityAuthentication
{
    public const string Human = "human";
    public const string Employee = "employee";
    public const string EquipmentRead = "equipment-read";
    public const string MetadataClient = "identity-metadata";

    public static IServiceCollection AddIdentityAuthentication(this IServiceCollection services, IConfiguration configuration, IHostEnvironment environment, string audience)
    {
        string authority = configuration["Identity:Authority"] ?? throw new InvalidOperationException("Identity authority is required.");
        if (!Uri.TryCreate(authority, UriKind.Absolute, out Uri? issuer)
            || issuer.UserInfo.Length != 0 || issuer.Query.Length != 0 || issuer.Fragment.Length != 0
            || (issuer.Scheme != Uri.UriSchemeHttps && !(issuer.Scheme == Uri.UriSchemeHttp && issuer.IsLoopback && environment.IsDevelopment())))
        {
            throw new InvalidOperationException("Identity authority must use HTTPS, or Development loopback HTTP.");
        }

        ArgumentException.ThrowIfNullOrWhiteSpace(audience);
        _ = services.AddHttpClient(MetadataClient, client => client.Timeout = TimeSpan.FromSeconds(3)).RemoveAllLoggers();
        _ = services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme).AddJwtBearer(options =>
        {
            options.Authority = authority;
            options.Audience = audience;
            options.MapInboundClaims = false;
            options.RequireHttpsMetadata = issuer.Scheme == Uri.UriSchemeHttps;
            options.IncludeErrorDetails = false;
            options.TokenValidationParameters = new TokenValidationParameters
            {
                ValidateIssuer = true,
                ValidIssuer = authority,
                IssuerValidator = (value, _, _) => string.Equals(value, authority, StringComparison.Ordinal)
                    ? value
                    : throw new SecurityTokenInvalidIssuerException("Access authority issuer is invalid."),
                ValidateAudience = true,
                ValidAudience = audience,
                IgnoreTrailingSlashWhenValidatingAudience = false,
                RequireAudience = true,
                ValidateIssuerSigningKey = true,
                RequireSignedTokens = true,
                ValidAlgorithms = [SecurityAlgorithms.RsaSha256],
                ValidateLifetime = true,
                RequireExpirationTime = true,
                ClockSkew = TimeSpan.FromSeconds(5)
            };
            options.Events = new JwtBearerEvents
            {
                OnTokenValidated = context =>
                {
                    if (context.Principal is null || !IdentityPrincipal.HasValidSubject(context.Principal)
                        || !IdentityPrincipal.HasValue(context.Principal, "typ", "Bearer"))
                    {
                        context.Fail("Access authority is invalid.");
                        return Task.CompletedTask;
                    }

                    ILogger logger = context.HttpContext.RequestServices.GetRequiredService<ILoggerFactory>().CreateLogger("IdentityAccess");
                    IdentityLog.Authentication(logger, "authenticated");
                    IdentityTelemetry.Record("authentication", "authenticated");
                    return Task.CompletedTask;
                },
                OnChallenge = context =>
                {
                    ILogger logger = context.HttpContext.RequestServices.GetRequiredService<ILoggerFactory>().CreateLogger("IdentityAccess");
                    IdentityLog.Authentication(logger, "unauthorized");
                    IdentityTelemetry.Record("authentication", "unauthorized");
                    return Task.CompletedTask;
                },
                OnForbidden = context =>
                {
                    ILogger logger = context.HttpContext.RequestServices.GetRequiredService<ILoggerFactory>().CreateLogger("IdentityAccess");
                    IdentityLog.Authentication(logger, "forbidden");
                    IdentityTelemetry.Record("authorization", "forbidden");
                    return Task.CompletedTask;
                }
            };
        });
        _ = services.AddOptions<JwtBearerOptions>(JwtBearerDefaults.AuthenticationScheme).Configure<IHttpClientFactory>((options, clients) => options.Backchannel = clients.CreateClient(MetadataClient));
        _ = services.AddAuthorizationBuilder()
            .AddPolicy(Human, policy => policy.RequireAuthenticatedUser().RequireAssertion(context => IdentityPrincipal.IsHuman(context.User)))
            .AddPolicy(Employee, policy => policy.RequireAuthenticatedUser().RequireAssertion(context => IdentityPrincipal.IsHuman(context.User) && IdentityPrincipal.HasRealmRole(context.User, "Employee")))
            .AddPolicy(EquipmentRead, policy => policy.RequireAuthenticatedUser().RequireAssertion(context => IdentityPrincipal.IsHuman(context.User) || IdentityPrincipal.CanReadEquipment(context.User)));
        return services;
    }
}
