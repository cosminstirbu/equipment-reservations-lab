using Aspire.Hosting;
using Aspire.Hosting.ApplicationModel;
using Aspire.Hosting.Testing;
using Xunit.Sdk;

namespace Smoke.Tests;

internal static class SmokeStartup
{
    public static void IsolateStorage(IDistributedApplicationTestingBuilder builder)
    {
        foreach (IResource resource in builder.Resources)
        {
            foreach (ContainerMountAnnotation mount in resource.Annotations.OfType<ContainerMountAnnotation>().Where(mount => mount.Type == ContainerMountType.Volume).ToArray())
            {
                _ = resource.Annotations.Remove(mount);
            }
        }
    }

    public static async Task StartAsync(DistributedApplication app, CancellationToken cancellationToken)
    {
        try
        {
            await app.StartAsync(cancellationToken);
        }
        catch (OperationCanceledException)
        {
            var states = new List<string>();
            foreach (string? name in new[] { "postgres", "database-bootstrap", "messaging", "inventory", "reservations", "notifications", "web" })
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
