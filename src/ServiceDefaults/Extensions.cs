using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Diagnostics.HealthChecks;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Diagnostics.HealthChecks;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using OpenTelemetry.Logs;
using OpenTelemetry.Metrics;
using OpenTelemetry.Trace;

namespace ServiceDefaults;

public static class Extensions
{
    public static void AddServiceDefaults(this WebApplicationBuilder builder)
    {
        _ = builder.Services.AddProblemDetails();
        _ = builder.Services.AddServiceDiscovery();
        _ = builder.Services.ConfigureHttpClientDefaults(http => http.AddServiceDiscovery());
        _ = builder.Services.AddHealthChecks().AddCheck("self", () => HealthCheckResult.Healthy(), tags: ["live"]);

        _ = builder.Services.AddOpenTelemetry()
            .WithTracing(tracing => tracing
                .SetSampler(new AlwaysOnSampler())
                .AddSource("Equipment.Hello")
                .AddAspNetCoreInstrumentation()
                .AddHttpClientInstrumentation())
            .WithMetrics(metrics => metrics
                .AddMeter("Equipment.Hello")
                .AddAspNetCoreInstrumentation()
                .AddHttpClientInstrumentation()
                .AddRuntimeInstrumentation());
        _ = builder.Logging.AddOpenTelemetry(o =>
        {
            o.IncludeScopes = true;
            o.IncludeFormattedMessage = true;
        });

        if (!string.IsNullOrEmpty(builder.Configuration["OTEL_EXPORTER_OTLP_ENDPOINT"]))
        {
            _ = builder.Services.AddOpenTelemetry()
                .WithTracing(tracing => tracing.AddOtlpExporter())
                .WithMetrics(metrics => metrics.AddOtlpExporter());
            _ = builder.Logging.AddOpenTelemetry(o => o.AddOtlpExporter());
        }

        _ = builder.WebHost.ConfigureKestrel(k => k.Limits.MaxRequestBodySize = 4096);
    }

    public static void MapOperationalEndpoints(this WebApplication app)
    {
        _ = app.UseExceptionHandler();
        _ = app.MapHealthChecks("/alive", new HealthCheckOptions { Predicate = c => c.Tags.Contains("live") });
        _ = app.MapHealthChecks("/health");
    }
}
