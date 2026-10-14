using HelloMessaging;
using Microsoft.Extensions.Diagnostics.HealthChecks;
using RabbitMQ.Client;

namespace Reservations;

public sealed class DependencyHealth(IConfiguration configuration, IHttpClientFactory clients) : IHealthCheck
{
    public async Task<HealthCheckResult> CheckHealthAsync(HealthCheckContext context, CancellationToken cancellationToken = default)
    {
        string? broker = configuration.GetConnectionString("messaging");
        if (string.IsNullOrEmpty(broker))
        {
            return HealthCheckResult.Unhealthy("Broker not configured");
        }

        using var budget = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        budget.CancelAfter(TimeSpan.FromSeconds(3));
        try
        {
            using HttpResponseMessage inventory = await clients.CreateClient("inventory").GetAsync("/health", budget.Token);
            if (!inventory.IsSuccessStatusCode)
            {
                return HealthCheckResult.Unhealthy("Inventory unavailable");
            }

            await using IConnection connection = await RabbitTopology.Factory(broker, TimeSpan.FromSeconds(3)).CreateConnectionAsync(budget.Token);
            return connection.IsOpen ? HealthCheckResult.Healthy() : HealthCheckResult.Unhealthy("Broker unavailable");
        }
        catch (Exception)
        {
            HelloTelemetry.Record("readiness", "unavailable");
            return HealthCheckResult.Unhealthy("Local dependency unavailable");
        }
    }
}
