using System.Diagnostics;
using System.Text;
using HelloMessaging;
using RabbitMQ.Client;
using RabbitMQ.Client.Events;

namespace Notifications;

public sealed class ConsumerStatus
{
    public bool Ready
    {
        get; set;
    }
}

public sealed class HelloConsumer(IConfiguration configuration, NotificationStore store, ConsumerStatus status, ILogger<HelloConsumer> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        string? connectionString = configuration.GetConnectionString("messaging");
        if (string.IsNullOrEmpty(connectionString))
        {
            return;
        }

        try
        {
            using var init = CancellationTokenSource.CreateLinkedTokenSource(stoppingToken);
            init.CancelAfter(TimeSpan.FromSeconds(5));

            await using IConnection connection = await RabbitTopology.Factory(connectionString, TimeSpan.FromSeconds(5))
                .CreateConnectionAsync(init.Token);
            await using IChannel channel = await connection.CreateChannelAsync(cancellationToken: init.Token);
            await RabbitTopology.DeclareAsync(channel, init.Token);
            await channel.BasicQosAsync(0, 1, false, init.Token);

            var disconnected = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
            connection.ConnectionShutdownAsync += (_, _) =>
            {
                status.Ready = false;
                _ = disconnected.TrySetResult();
                return Task.CompletedTask;
            };

            var consumer = new AsyncEventingBasicConsumer(channel);
            consumer.ReceivedAsync += async (sender, delivery) =>
            {
                var parent = default(ActivityContext);
                if (delivery.BasicProperties.Headers is { } headers && headers.TryGetValue("traceparent", out object? trace))
                {
                    string? traceparent = trace is byte[] bytes ? Encoding.UTF8.GetString(bytes) : trace?.ToString();
                    string? tracestate = headers.TryGetValue("tracestate", out object? state) && state is byte[] stateBytes
                        ? Encoding.UTF8.GetString(stateBytes)
                        : null;
                    _ = ActivityContext.TryParse(traceparent, tracestate, true, out parent);
                }

                using Activity? activity = HelloTelemetry.Activities.StartActivity("hello.consume", ActivityKind.Consumer, parent);
                using var deliveryBudget = CancellationTokenSource.CreateLinkedTokenSource(stoppingToken);
                deliveryBudget.CancelAfter(TimeSpan.FromSeconds(5));
                bool accepted = store.TryReceive(delivery.Body);
                if (accepted)
                {
                    _ = (activity?.SetTag("hello.correlation_id", delivery.BasicProperties.CorrelationId));
                    await channel.BasicAckAsync(delivery.DeliveryTag, false, deliveryBudget.Token);
                    NotificationsLog.Received(logger, delivery.BasicProperties.CorrelationId);
                }
                else
                {
                    await channel.BasicRejectAsync(delivery.DeliveryTag, false, deliveryBudget.Token);
                }

                HelloTelemetry.Record("consume", accepted ? "success" : "rejected");
            };

            _ = await channel.BasicConsumeAsync(RabbitTopology.Queue, false, consumer, init.Token);
            status.Ready = true;
            await disconnected.Task.WaitAsync(stoppingToken);
            HelloTelemetry.Record("consumer", "unavailable");
            NotificationsLog.Disconnected(logger);
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
        {
        }
        catch (Exception ex)
        {
            HelloTelemetry.Record("consumer", "error");
            NotificationsLog.ConsumerFailed(logger, ex.GetType().Name);
        }
        finally
        {
            status.Ready = false;
        }
    }
}
