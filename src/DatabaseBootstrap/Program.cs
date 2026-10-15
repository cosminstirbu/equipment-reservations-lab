using DatabaseBootstrap;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

HostApplicationBuilder builder = Host.CreateApplicationBuilder(args);
using IHost host = builder.Build();
ILogger logger = host.Services.GetRequiredService<ILoggerFactory>().CreateLogger("DatabaseBootstrap");
using var deadline = new CancellationTokenSource(TimeSpan.FromSeconds(120));

try
{
    string admin = builder.Configuration.GetConnectionString("postgres") ?? throw new InvalidOperationException("PostgreSQL bootstrap is not configured.");
    var passwords = new Dictionary<string, string>
    {
        ["inventory"] = builder.Configuration["InventoryPassword"] ?? "",
        ["reservations"] = builder.Configuration["ReservationsPassword"] ?? "",
        ["notifications"] = builder.Configuration["NotificationsPassword"] ?? ""
    };
    await DatabaseProvisioner.ReconcileAsync(admin, passwords, deadline.Token);
    BootstrapLog.Completed(logger);
    return 0;
}
catch (Exception exception)
{
    BootstrapLog.Failed(logger, exception.GetType().Name);
    return 1;
}
