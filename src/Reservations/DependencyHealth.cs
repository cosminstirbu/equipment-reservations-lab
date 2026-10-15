using System.Diagnostics;
using Microsoft.Extensions.Diagnostics.HealthChecks;
using RabbitMQ.Client;
using ReservationMessaging;

namespace Reservations;

public sealed class DependencyHealth(IHttpClientFactory clients) : IHealthCheck
{
    public async Task<HealthCheckResult> CheckHealthAsync(HealthCheckContext context, CancellationToken cancellationToken = default)
    {
        long started = Stopwatch.GetTimestamp();
        using var budget = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        budget.CancelAfter(TimeSpan.FromSeconds(3));
        try
        {
            using HttpResponseMessage inventory = await clients.CreateClient("inventory").GetAsync("/health", budget.Token);
            return inventory.IsSuccessStatusCode ? HealthCheckResult.Healthy() : HealthCheckResult.Unhealthy("Inventory unavailable");
        }
        catch (Exception exception) when (exception is HttpRequestException or OperationCanceledException)
        {
            ReservationTelemetry.Dependency("inventory", "unavailable", started);
            return HealthCheckResult.Unhealthy("Inventory unavailable");
        }
    }
}

public sealed class BrokerHealth(IConfiguration configuration) : IHealthCheck
{
    public async Task<HealthCheckResult> CheckHealthAsync(HealthCheckContext context, CancellationToken cancellationToken = default)
    {
        string? broker = configuration.GetConnectionString("messaging");
        if (string.IsNullOrEmpty(broker))
        {
            return HealthCheckResult.Unhealthy("Broker not configured");
        }

        long started = Stopwatch.GetTimestamp();
        using var budget = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        budget.CancelAfter(TimeSpan.FromSeconds(3));
        try
        {
            await using IConnection connection = await RabbitConnection.Factory(broker, TimeSpan.FromSeconds(3)).CreateConnectionAsync(budget.Token);
            return connection.IsOpen ? HealthCheckResult.Healthy() : HealthCheckResult.Unhealthy("Broker unavailable");
        }
        catch (Exception)
        {
            ReservationMessagingTelemetry.Dependency("broker", "unavailable", started);
            return HealthCheckResult.Unhealthy("Broker unavailable");
        }
    }
}
