using RabbitMQ.Client;

namespace HelloMessaging;

public static class RabbitTopology
{
    public const string Exchange = "hello";
    public const string Queue = "hello-notifications";
    public const string RoutingKey = "hello.requested";

    public static ConnectionFactory Factory(string connectionString, TimeSpan timeout)
    {
        return new()
        {
            Uri = new Uri(connectionString),
            AutomaticRecoveryEnabled = false,
            TopologyRecoveryEnabled = false,
            RequestedConnectionTimeout = timeout,
            ContinuationTimeout = timeout
        };
    }

    public static async Task DeclareAsync(IChannel channel, CancellationToken cancellationToken)
    {
        await channel.ExchangeDeclareAsync(Exchange, ExchangeType.Direct, durable: false,
            autoDelete: false, cancellationToken: cancellationToken);
        _ = await channel.QueueDeclareAsync(Queue, durable: true, exclusive: false,
            autoDelete: false, arguments: new Dictionary<string, object?>
            {
                ["x-message-ttl"] = 30000,
                ["x-max-length"] = 1000,
                ["x-overflow"] = "reject-publish"
            }, cancellationToken: cancellationToken);
        await channel.QueueBindAsync(Queue, Exchange, RoutingKey, cancellationToken: cancellationToken);
    }
}
