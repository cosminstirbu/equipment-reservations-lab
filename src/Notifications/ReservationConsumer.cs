using System.Diagnostics;
using Microsoft.Extensions.Diagnostics.HealthChecks;
using Persistence;
using ReservationMessaging;

namespace Notifications;

public sealed class ReservationConsumerStatus
{
    private int ready;

    public bool Ready
    {
        get => Volatile.Read(ref ready) != 0;
        set => Volatile.Write(ref ready, value ? 1 : 0);
    }
}

public sealed class ReservationConsumer(IReservationSubscription subscription, ReservationInbox inbox, IRecoverySchedule schedule, ReservationConsumerStatus status, ILogger<ReservationConsumer> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        int failures = 0;
        try
        {
            while (!stoppingToken.IsCancellationRequested)
            {
                bool permanent = false;
                bool connected = false;
                long started = Stopwatch.GetTimestamp();
                using var setup = CancellationTokenSource.CreateLinkedTokenSource(stoppingToken);
                setup.CancelAfter(TimeSpan.FromSeconds(5));
                try
                {
                    await subscription.ListenAsync(async (delivery, token) =>
                    {
                        await ReceiveAsync(delivery, token);
                        failures = 0;
                    }, ready =>
                    {
                        status.Ready = ready;
                        if (ready)
                        {
                            if (!connected)
                            {
                                ReservationMessagingTelemetry.Dependency("broker_setup", "available", started);
                                connected = true;
                            }

                            setup.CancelAfter(Timeout.InfiniteTimeSpan);
                        }
                    }, setup.Token);
                }
                catch (Exception exception) when (!stoppingToken.IsCancellationRequested)
                {
                    permanent = DatabaseFailure.IsPermanent(exception) || ReservationFailure.IsPermanent(exception);
                    if (!connected)
                    {
                        ReservationMessagingTelemetry.Dependency("broker_setup", permanent ? "permanent_error" : "unavailable", started);
                    }

                    if (permanent)
                    {
                        NotificationsLog.Delivery(logger, "connect", "permanent_error");
                    }
                }
                finally
                {
                    status.Ready = false;
                }

                failures++;
                TimeSpan delay = permanent || failures % 3 == 0
                    ? TimeSpan.FromSeconds(10)
                    : TimeSpan.FromSeconds(Math.Min(4, Math.Pow(2, (failures - 1) % 3) * (0.75 + (schedule.Jitter() * 0.5))));
                await schedule.DelayAsync(delay, stoppingToken);
                if (permanent)
                {
                    return;
                }
            }
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
        {
        }
    }

    private async Task ReceiveAsync(BrokerDelivery delivery, CancellationToken cancellationToken)
    {
        long started = Stopwatch.GetTimestamp();
        bool valid = ReservationEventValidation.TryRead(delivery.Body, delivery.RoutingKey, delivery.ContentType, delivery.MessageId, delivery.CorrelationId,
            delivery.Headers, out ReservationEvent? message, out ActivityContext context);
        using Activity? activity = ReservationMessagingTelemetry.Activities.StartActivity("reservation.consume", ActivityKind.Consumer, context);
        if (message is not null)
        {
            _ = activity?.SetTag("event.id", message.EventId.ToString());
            _ = activity?.SetTag("reservation.id", message.ReservationId.ToString());
        }

        try
        {
            string outcome = "rejected";
            if (valid)
            {
                using var persistence = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
                persistence.CancelAfter(TimeSpan.FromSeconds(5));
                outcome = await PersistAsync(message!, persistence.Token) ? "stored" : "duplicate";
            }

            using var acknowledgement = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
            acknowledgement.CancelAfter(TimeSpan.FromSeconds(3));
            await SettleAsync(delivery, valid, acknowledgement.Token);
            _ = activity?.SetStatus(valid ? ActivityStatusCode.Ok : ActivityStatusCode.Error);
            ReservationMessagingTelemetry.Record("consume", outcome, started);
            NotificationsLog.Delivery(logger, "consume", outcome);
        }
        catch (Exception exception) when (!cancellationToken.IsCancellationRequested)
        {
            _ = activity?.SetStatus(ActivityStatusCode.Error);
            string outcome = DatabaseFailure.IsPermanent(exception) || ReservationFailure.IsPermanent(exception) ? "permanent_error" : "retry";
            ReservationMessagingTelemetry.Record("consume", outcome, started);
            NotificationsLog.Delivery(logger, "consume", outcome);
            throw;
        }
    }

    private async Task<bool> PersistAsync(ReservationEvent message, CancellationToken cancellationToken)
    {
        long started = Stopwatch.GetTimestamp();
        string outcome = "available";
        try
        {
            return await inbox.ReceiveAsync(message, cancellationToken);
        }
        catch (Exception exception)
        {
            outcome = DatabaseFailure.IsPermanent(exception) ? "permanent_error" : "unavailable";
            throw;
        }
        finally
        {
            ReservationMessagingTelemetry.Dependency("database", outcome, started);
        }
    }

    private static async Task SettleAsync(BrokerDelivery delivery, bool accepted, CancellationToken cancellationToken)
    {
        long started = Stopwatch.GetTimestamp();
        string outcome = "available";
        try
        {
            await delivery.SettleAsync(accepted, cancellationToken);
        }
        catch (Exception exception)
        {
            outcome = ReservationFailure.IsPermanent(exception) ? "permanent_error" : "unavailable";
            throw;
        }
        finally
        {
            ReservationMessagingTelemetry.Dependency("broker_ack", outcome, started);
        }
    }
}

internal sealed class ReservationConsumerHealth(ReservationConsumerStatus status) : IHealthCheck
{
    public Task<HealthCheckResult> CheckHealthAsync(HealthCheckContext context, CancellationToken cancellationToken = default)
    {
        return Task.FromResult(status.Ready ? HealthCheckResult.Healthy() : HealthCheckResult.Unhealthy("Reservation consumer unavailable"));
    }
}
