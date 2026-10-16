using System.Text.Json;
using RabbitMQ.Client;
using ReservationMessaging;

namespace Reservations;

public interface IReservationPublisher
{
    Task PublishAsync(ReservationEvent message, string? traceparent, string? tracestate, CancellationToken cancellationToken);
}

public sealed class ReservationPublisher(IConfiguration configuration) : IReservationPublisher
{
    public async Task PublishAsync(ReservationEvent message, string? traceparent, string? tracestate, CancellationToken cancellationToken)
    {
        if (!ReservationEventValidation.Valid(message))
        {
            throw new InvalidDataException("Invalid reservation envelope.");
        }

        byte[] body = JsonSerializer.SerializeToUtf8Bytes(message, ReservationJsonContext.Default.ReservationEvent);
        if (body.Length > 4096)
        {
            throw new InvalidDataException("Reservation envelope exceeds 4 KiB.");
        }

        var headers = new Dictionary<string, object?> { ["schema"] = 1 };
        if (traceparent is not null)
        {
            headers["traceparent"] = traceparent;
        }

        if (tracestate is not null)
        {
            headers["tracestate"] = tracestate;
        }

        if (!ReservationEventValidation.TryContext(headers, out _))
        {
            throw new InvalidDataException("Invalid reservation trace context.");
        }

        string connectionString = configuration.GetConnectionString("messaging")
            ?? throw new InvalidDataException("Message broker is not configured.");
        using var budget = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        budget.CancelAfter(TimeSpan.FromSeconds(3));
        await using IConnection connection = await RabbitConnection.Factory(connectionString, TimeSpan.FromSeconds(3)).CreateConnectionAsync(budget.Token);
        await using IChannel channel = await connection.CreateChannelAsync(new CreateChannelOptions(true, true), budget.Token);
        var properties = new BasicProperties
        {
            ContentType = "application/json",
            Persistent = true,
            MessageId = message.EventId.ToString(),
            CorrelationId = message.ReservationId.ToString(),
            Headers = headers
        };
        await channel.BasicPublishAsync(ReservationTopology.Exchange, ReservationTopology.RoutingKey(message.EventType), true, properties, body, budget.Token);
    }
}
