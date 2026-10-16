using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using ServiceDefaults;

namespace IdentityBootstrap;

public static class IdentityBootstrapRegistration
{
    public static void AddIdentityBootstrap(this IHostApplicationBuilder builder)
    {
        builder.AddApplicationTelemetry();
        _ = builder.Services.AddHttpClient<IdentityProvisioning>(client => client.Timeout = TimeSpan.FromSeconds(5))
            .RemoveAllLoggers()
            .ConfigurePrimaryHttpMessageHandler(() => new SocketsHttpHandler { AllowAutoRedirect = false });
        _ = builder.Services.AddOpenTelemetry().WithTracing(tracing => tracing.AddSource("Equipment.IdentityBootstrap"));
    }
}
