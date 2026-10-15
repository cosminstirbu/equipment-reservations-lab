using RabbitMQ.Client;

namespace HelloMessaging;

public static class ReservationTopology
{
    public const string Exchange = "reservations";
    public const string Queue = "reservation-notifications";
    public const string Confirmed = "reservation.confirmed";
    public const string Cancelled = "reservation.cancelled";

    public static string RoutingKey(string eventType)
    {
        return eventType switch
        {
            "ReservationConfirmed" => Confirmed,
            "ReservationCancelled" => Cancelled,
            _ => throw new InvalidDataException("Unsupported reservation event type.")
        };
    }

    public static async Task DeclareAsync(IChannel channel, CancellationToken cancellationToken)
    {
        await channel.ExchangeDeclareAsync(Exchange, ExchangeType.Direct, true, false, cancellationToken: cancellationToken);
        _ = await channel.QueueDeclareAsync(Queue, true, false, false, cancellationToken: cancellationToken);
        await channel.QueueBindAsync(Queue, Exchange, Confirmed, cancellationToken: cancellationToken);
        await channel.QueueBindAsync(Queue, Exchange, Cancelled, cancellationToken: cancellationToken);
    }
}
