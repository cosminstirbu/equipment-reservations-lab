using System.Diagnostics;
using Microsoft.Extensions.Diagnostics.HealthChecks;
using RabbitMQ.Client;
using ReservationMessaging;

internal sealed class BrokerReadiness(Func<CancellationToken, Task<string>> publisher, Func<CancellationToken, Task<string>> consumer, Func<CancellationToken, Task<string>> administrator) : IHealthCheck
{
    private long started;
    private bool initialized;

    public async Task<HealthCheckResult> CheckHealthAsync(HealthCheckContext context, CancellationToken cancellationToken = default)
    {
        long beginning = Interlocked.CompareExchange(ref started, TimeProvider.System.GetTimestamp(), 0);
        if (beginning == 0)
        {
            beginning = Volatile.Read(ref started);
        }

        bool previouslyReady = Volatile.Read(ref initialized);
        TimeSpan remaining = TimeSpan.FromSeconds(60) - TimeProvider.System.GetElapsedTime(beginning);
        if (!previouslyReady && remaining <= TimeSpan.Zero)
        {
            return Failed();
        }

        using var startup = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        startup.CancelAfter(previouslyReady ? TimeSpan.FromSeconds(9) : remaining);
        using Activity? operation = BrokerDiagnostics.Activities.StartActivity("broker.readiness");
        int attempt = 0;
        try
        {
            while (true)
            {
                if (await ProbeAsync(startup.Token))
                {
                    Volatile.Write(ref initialized, true);
                    BrokerDiagnostics.RecordReadiness("healthy");
                    _ = operation?.SetStatus(ActivityStatusCode.Ok);
                    return HealthCheckResult.Healthy();
                }

                if (previouslyReady)
                {
                    break;
                }

                BrokerDiagnostics.RecordReadiness("startup_retry");
                double milliseconds = Math.Min(5000, 100 * Math.Pow(2, Math.Min(attempt++, 6))) * (0.5 + Random.Shared.NextDouble());
                await Task.Delay(TimeSpan.FromMilliseconds(milliseconds), startup.Token);
            }
        }
        catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
        {
            // The finite startup/request budget expired; expose only a safe outcome.
        }

        _ = operation?.SetStatus(ActivityStatusCode.Error, "broker_unavailable");
        return Failed();
    }

    private async Task<bool> ProbeAsync(CancellationToken cancellationToken)
    {
        try
        {
            foreach (Func<CancellationToken, Task<string>> account in new[] { publisher, consumer, administrator })
            {
                using var budget = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
                budget.CancelAfter(TimeSpan.FromSeconds(3));
                string settings = await account(budget.Token);
                await using IConnection connection = await RabbitConnection.Factory(settings, TimeSpan.FromSeconds(3)).CreateConnectionAsync(budget.Token);
                await using IChannel channel = await connection.CreateChannelAsync(new CreateChannelOptions(account == publisher, account == publisher), budget.Token);
                if (account == administrator)
                {
                    await channel.ExchangeDeclarePassiveAsync(ReservationTopology.Exchange, budget.Token);
                    _ = await channel.QueueDeclarePassiveAsync(ReservationTopology.Queue, budget.Token);
                }
            }

            return true;
        }
        catch (Exception exception) when (exception is not OperationCanceledException || !cancellationToken.IsCancellationRequested)
        {
            return false;
        }
    }

    private static HealthCheckResult Failed()
    {
        BrokerDiagnostics.RecordReadiness("unhealthy");
        return HealthCheckResult.Unhealthy("Broker workload authority or topology unavailable.");
    }
}
