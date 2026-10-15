using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Diagnostics.HealthChecks;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Diagnostics.HealthChecks;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Npgsql;
using OpenTelemetry.Logs;
using OpenTelemetry.Metrics;
using OpenTelemetry.Trace;
using Persistence;

namespace ServiceDefaults;

public static class Extensions
{
    public static void AddServiceDefaults(this WebApplicationBuilder builder)
    {
        _ = builder.Services.AddProblemDetails();
        _ = builder.Services.AddServiceDiscovery();
        _ = builder.Services.ConfigureHttpClientDefaults(http => http.AddServiceDiscovery());
        _ = builder.Services.AddHealthChecks().AddCheck("self", () => HealthCheckResult.Healthy(), tags: ["live"]);

        builder.AddApplicationTelemetry();

        _ = builder.WebHost.ConfigureKestrel(k => k.Limits.MaxRequestBodySize = 4096);
    }

    public static void AddApplicationTelemetry(this IHostApplicationBuilder builder)
    {
        if (builder.Services.Any(service => service.ServiceType == typeof(TelemetryRegistration)))
        {
            return;
        }

        _ = builder.Services.AddSingleton<TelemetryRegistration>();

        // These framework information messages contain raw request URLs or local
        // startup paths. Apply the policy to console and OTLP providers alike.
        _ = builder.Logging.AddFilter("Microsoft.AspNetCore.Hosting.Diagnostics", LogLevel.Warning);
        _ = builder.Logging.AddFilter("Microsoft.Hosting.Lifetime", LogLevel.Warning);
        _ = builder.Logging.AddFilter("System.Net.Http.HttpClient", LogLevel.Warning);

        _ = builder.Services.AddOpenTelemetry()
            .WithTracing(tracing => tracing
                .SetSampler(new AlwaysOnSampler())
                .AddProcessor(new HttpTelemetryPrivacyProcessor())
                .AddProcessor(new DatabaseTelemetryPrivacyProcessor())
                .AddNpgsql()
                .AddSource("Equipment.Hello", "Equipment.Reservations", "Equipment.ReservationMessaging", "Equipment.Notifications", "Equipment.DatabaseBootstrap")
                .AddAspNetCoreInstrumentation()
                .AddHttpClientInstrumentation())
            .WithMetrics(metrics => metrics
                .AddMeter("Equipment.Hello", "Equipment.Reservations", "Equipment.ReservationMessaging", "Equipment.Notifications", "Equipment.DatabaseBootstrap")
                .AddAspNetCoreInstrumentation()
                .AddHttpClientInstrumentation()
                .AddRuntimeInstrumentation());
        _ = builder.Logging.AddOpenTelemetry(o =>
        {
            // Activity TraceId/SpanId still correlate logs without request scopes,
            // which can carry untrusted paths or other request metadata.
            o.IncludeScopes = false;
            o.IncludeFormattedMessage = true;
        });

        if (!string.IsNullOrEmpty(builder.Configuration["OTEL_EXPORTER_OTLP_ENDPOINT"]))
        {
            _ = builder.Services.AddOpenTelemetry()
                .WithTracing(tracing => tracing.AddOtlpExporter())
                .WithMetrics(metrics => metrics.AddOtlpExporter());
            _ = builder.Logging.AddOpenTelemetry(o => o.AddOtlpExporter());
        }
    }

    public static void AddDatabase(this WebApplicationBuilder builder, string name, IEnumerable<DatabaseCommand>? commands = null)
    {
        _ = builder.Services.AddSingleton(_ =>
        {
            string connection = builder.Configuration.GetConnectionString(name) ?? throw new InvalidOperationException("Own database connection is not configured.");
            bool captureSql = !bool.TryParse(builder.Configuration["DatabaseTracing:CaptureSqlText"], out bool capture) || capture;
            return DatabaseTracing.Create(connection, name, captureSql, commands: commands);
        });
        _ = builder.Services.AddHealthChecks().AddCheck<DatabaseHealth>("database");
    }

    private sealed class TelemetryRegistration;

    public static void MapOperationalEndpoints(this WebApplication app)
    {
        _ = app.UseExceptionHandler();
        _ = app.MapHealthChecks("/alive", new HealthCheckOptions { Predicate = c => c.Tags.Contains("live") });
        _ = app.MapHealthChecks("/health", new HealthCheckOptions { Predicate = check => !check.Tags.Contains("worker") });
        _ = app.MapHealthChecks("/health/workers", new HealthCheckOptions { Predicate = check => check.Tags.Contains("worker") });
    }
}

internal sealed class DatabaseHealth(NpgsqlDataSource source) : IHealthCheck
{
    public async Task<HealthCheckResult> CheckHealthAsync(HealthCheckContext context, CancellationToken cancellationToken = default)
    {
        using var budget = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        budget.CancelAfter(TimeSpan.FromSeconds(5));
        try
        {
            await using NpgsqlCommand command = source.CreateCommand(DatabaseTracing.HealthSql);
            _ = await command.ExecuteScalarAsync(budget.Token);
            return HealthCheckResult.Healthy();
        }
        catch (Exception exception) when (exception is NpgsqlException or OperationCanceledException)
        {
            return HealthCheckResult.Unhealthy("Database unavailable");
        }
    }
}
