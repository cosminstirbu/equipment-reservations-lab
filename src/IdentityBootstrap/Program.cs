using System.Diagnostics;
using IdentityBootstrap;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using OpenTelemetry.Logs;
using OpenTelemetry.Trace;

HostApplicationBuilder builder = Host.CreateApplicationBuilder(args);
builder.AddIdentityBootstrap();
using IHost host = builder.Build();
ILogger logger = host.Services.GetRequiredService<ILoggerFactory>().CreateLogger("IdentityBootstrap");
using var deadline = CancellationTokenSource.CreateLinkedTokenSource(host.Services.GetRequiredService<IHostApplicationLifetime>().ApplicationStopping);
deadline.CancelAfter(TimeSpan.FromSeconds(60));

try
{
    await host.StartAsync(deadline.Token);
    var passwords = new Dictionary<string, string>
    {
        ["employee-a"] = builder.Configuration["EmployeeAPassword"] ?? "",
        ["employee-b"] = builder.Configuration["EmployeeBPassword"] ?? "",
        ["approver"] = builder.Configuration["ApproverPassword"] ?? "",
        ["equipment-staff"] = builder.Configuration["EquipmentStaffPassword"] ?? ""
    };
    var settings = new IdentityProvisioningSettings(builder.Configuration["Identity:Authority"] ?? "", builder.Configuration["WebRoot"] ?? "",
        builder.Configuration["AdminUsername"] ?? "", builder.Configuration["AdminPassword"] ?? "", passwords,
        builder.Configuration["ReservationsClientSecret"] ?? "",
        [.. builder.Configuration.GetSection("DocumentationCallbacks").GetChildren().Select(child => child.Value ?? "")],
        builder.Configuration["Identity:AdministrationEndpoint"], builder.Environment.IsDevelopment());
    using var activities = new ActivitySource("Equipment.IdentityBootstrap");
    using Activity? operation = activities.StartActivity("identity.bootstrap");
    try
    {
        await host.Services.GetRequiredService<IdentityProvisioning>().ReconcileAsync(settings, deadline.Token);
        _ = operation?.SetStatus(ActivityStatusCode.Ok);
        IdentityBootstrapLog.Completed(logger);
        return 0;
    }
    catch (Exception exception)
    {
        _ = operation?.SetStatus(ActivityStatusCode.Error, "bootstrap_failed");
        IdentityBootstrapLog.Failed(logger, exception.GetType().Name);
        return 1;
    }
}
catch (Exception exception)
{
    IdentityBootstrapLog.Failed(logger, exception.GetType().Name);
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
