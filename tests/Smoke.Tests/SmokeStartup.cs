using Aspire.Hosting;
using Aspire.Hosting.ApplicationModel;
using Xunit.Sdk;

namespace Smoke.Tests;

internal static class SmokeStartup
{
    public static async Task StartAsync(DistributedApplication app, CancellationToken cancellationToken)
    {
        try
        {
            await app.StartAsync(cancellationToken);
        }
        catch (OperationCanceledException)
        {
            var states = new List<string>();
            foreach (string? name in new[] { "messaging", "inventory", "reservations", "notifications", "web" })
            {
                if (app.ResourceNotifications.TryGetCurrentState(name, out ResourceEvent? resource))
                {
                    states.Add($"{name}: state={resource.Snapshot.State?.Text ?? "unknown"}, health={resource.Snapshot.HealthStatus}");
                }
            }
            throw new XunitException($"Local AppHost startup exceeded the three-minute bound. Check Podman and resource readiness. {string.Join("; ", states)}");
        }
    }
}
