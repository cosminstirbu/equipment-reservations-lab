using HelloMessaging;
using RabbitMQ.Client;
using RabbitMQ.Client.Events;

namespace Notifications;

public sealed record BrokerDelivery(bool Redelivered, ReadOnlyMemory<byte> Body, string RoutingKey, string? ContentType, string? MessageId, string? CorrelationId, IDictionary<string, object?>? Headers, Func<bool, CancellationToken, Task> SettleAsync);

public interface IReservationSubscription
{
    Task ListenAsync(Func<BrokerDelivery, CancellationToken, Task> receive, Action<bool> readiness, CancellationToken cancellationToken);
}

public sealed class ReservationSubscription(IConfiguration configuration) : IReservationSubscription
{
    public async Task ListenAsync(Func<BrokerDelivery, CancellationToken, Task> receive, Action<bool> readiness, CancellationToken cancellationToken)
    {
        string connectionString = configuration.GetConnectionString("messaging")
            ?? throw new InvalidDataException("Message broker is not configured.");
        await using IConnection connection = await RabbitTopology.Factory(connectionString, TimeSpan.FromSeconds(5)).CreateConnectionAsync(cancellationToken);
        await using IChannel channel = await connection.CreateChannelAsync(cancellationToken: cancellationToken);
        await ReservationTopology.DeclareAsync(channel, cancellationToken);
        await channel.BasicQosAsync(0, 1, false, cancellationToken);
        var disconnected = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        connection.ConnectionShutdownAsync += (_, _) =>
        {
            readiness(false);
            _ = disconnected.TrySetResult();
            return Task.CompletedTask;
        };
        channel.ChannelShutdownAsync += (_, _) =>
        {
            readiness(false);
            _ = disconnected.TrySetResult();
            return Task.CompletedTask;
        };
        var consumer = new AsyncEventingBasicConsumer(channel);
        consumer.ReceivedAsync += async (_, delivery) =>
        {
            try
            {
                await receive(new BrokerDelivery(delivery.Redelivered, delivery.Body, delivery.RoutingKey,
                    delivery.BasicProperties.ContentType, delivery.BasicProperties.MessageId, delivery.BasicProperties.CorrelationId, delivery.BasicProperties.Headers,
                    async (accepted, stopped) =>
                    {
                        if (accepted)
                        {
                            await channel.BasicAckAsync(delivery.DeliveryTag, false, stopped);
                        }
                        else
                        {
                            await channel.BasicRejectAsync(delivery.DeliveryTag, false, stopped);
                        }
                    }), cancellationToken);
            }
            catch (Exception exception)
            {
                readiness(false);
                _ = disconnected.TrySetException(exception);
            }
        };
        try
        {
            _ = await channel.BasicConsumeAsync(ReservationTopology.Queue, false, consumer, cancellationToken);
            readiness(true);
            await disconnected.Task.WaitAsync(cancellationToken);
        }
        finally
        {
            readiness(false);
        }
    }
}
