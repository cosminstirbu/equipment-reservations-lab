using RabbitMQ.Client;

namespace ReservationMessaging;

public static class RabbitConnection
{
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
}
