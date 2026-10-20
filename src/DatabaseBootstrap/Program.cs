using System.Diagnostics;
using DatabaseBootstrap;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using OpenTelemetry.Logs;
using OpenTelemetry.Trace;
using ServiceDefaults;

HostApplicationBuilder builder = Host.CreateApplicationBuilder(args);
builder.AddApplicationTelemetry();
using IHost host = builder.Build();
ILogger logger = host.Services.GetRequiredService<ILoggerFactory>().CreateLogger("DatabaseBootstrap");
using var deadline = new CancellationTokenSource(TimeSpan.FromSeconds(120));

try
{
    await host.StartAsync(deadline.Token);
    using var activities = new ActivitySource("Equipment.DatabaseBootstrap");
    using Activity? activity = activities.StartActivity("database.bootstrap");
    try
    {
        string admin = builder.Configuration.GetConnectionString("postgres") ?? throw new InvalidOperationException("PostgreSQL bootstrap is not configured.");
        var passwords = new Dictionary<string, string>
        {
            ["inventory"] = builder.Configuration["InventoryPassword"] ?? "",
            ["reservations"] = builder.Configuration["ReservationsPassword"] ?? "",
            ["notifications"] = builder.Configuration["NotificationsPassword"] ?? ""
        };
        if (builder.Configuration["KeycloakPassword"] is { } keycloakPassword)
        {
            passwords["keycloak"] = keycloakPassword;
        }

        bool captureSql = !bool.TryParse(builder.Configuration["DatabaseTracing:CaptureSqlText"], out bool capture) || capture;
        await DatabaseProvisioner.ReconcileAsync(admin, passwords, captureSql, deadline.Token);
        BootstrapLog.Completed(logger);
        _ = activity?.SetStatus(ActivityStatusCode.Ok);
        return 0;
    }
    catch (Exception exception)
    {
        _ = activity?.SetStatus(ActivityStatusCode.Error, "bootstrap_failed");
        BootstrapLog.Failed(logger, exception.GetType().Name);
        return 1;
    }
}
catch (Exception exception)
{
    BootstrapLog.Failed(logger, exception.GetType().Name);
    return 1;
}
finally
{
    using var shutdown = new CancellationTokenSource(TimeSpan.FromSeconds(5));
    try
    {
        await host.StopAsync(shutdown.Token);
    }
    catch (OperationCanceledException) when (shutdown.IsCancellationRequested)
    {
        // Host shutdown expiry must not skip the independent exporter drain.
    }
    finally
    {
        _ = host.Services.GetRequiredService<TracerProvider>().Shutdown(3000);
        _ = host.Services.GetRequiredService<LoggerProvider>().Shutdown(3000);
    }
}
