using System.Diagnostics;
using System.Text.Json;
using HelloMessaging;
using RabbitMQ.Client;

namespace Reservations;

public sealed class HelloPublisher(IConfiguration configuration, ILogger<HelloPublisher> logger) : IHelloPublisher
{
    public async Task PublishAsync(HelloRequested hello, CancellationToken cancellationToken)
    {
        using var budget = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        budget.CancelAfter(TimeSpan.FromSeconds(3));

        using Activity? activity = HelloTelemetry.Activities.StartActivity("hello.publish", ActivityKind.Producer);
        _ = (activity?.SetTag("hello.correlation_id", hello.CorrelationId));
        _ = (activity?.SetTag("equipment.id", hello.EquipmentId));
        var watch = Stopwatch.StartNew();

        try
        {
            byte[] body = JsonSerializer.SerializeToUtf8Bytes(hello, MessagingJsonContext.Default.HelloRequested);
            if (body.Length > 4096)
            {
                throw new IOException("Hello event exceeds the size limit");
            }

            string? connectionString = configuration.GetConnectionString("messaging");
            if (string.IsNullOrEmpty(connectionString))
            {
                throw new IOException("Message broker is not configured");
            }

            await using IConnection connection = await RabbitTopology.Factory(connectionString, TimeSpan.FromSeconds(3))
                .CreateConnectionAsync(budget.Token);
            await using IChannel channel = await connection.CreateChannelAsync(new CreateChannelOptions(true, true), budget.Token);
            await RabbitTopology.DeclareAsync(channel, budget.Token);

            var properties = new BasicProperties
            {
                ContentType = "application/json",
                CorrelationId = hello.CorrelationId.ToString(),
                Headers = new Dictionary<string, object?>()
            };

            Activity? context = activity ?? Activity.Current;
            if (context?.Id is { } traceparent)
            {
                properties.Headers["traceparent"] = traceparent;
            }

            if (context?.TraceStateString is { } tracestate)
            {
                properties.Headers["tracestate"] = tracestate;
            }

            await channel.BasicPublishAsync(RabbitTopology.Exchange, RabbitTopology.RoutingKey,
                mandatory: true, properties, body, budget.Token);
            HelloTelemetry.Record("publish", "success");
            ReservationsLog.Published(logger, hello.CorrelationId, hello.EquipmentId);
        }
        catch (Exception)
        {
            _ = (activity?.SetStatus(ActivityStatusCode.Error, "Broker publication failed"));
            HelloTelemetry.Record("publish", "error");
            throw;
        }
        finally
        {
            HelloTelemetry.Latency.Record(watch.Elapsed.TotalMilliseconds,
                new KeyValuePair<string, object?>("operation", "publish"));
        }
    }
}
