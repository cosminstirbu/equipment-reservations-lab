using System.Globalization;
using RabbitMQ.Client;
using RabbitMQ.Client.Exceptions;

using var deadline = new CancellationTokenSource(TimeSpan.FromSeconds(120));
var factory = new ConnectionFactory
{
    HostName = Required("BROKER_HOST"),
    Port = int.Parse(Required("BROKER_PORT"), CultureInfo.InvariantCulture),
    VirtualHost = "equipment",
    UserName = Required("BROKER_USER"),
    Password = Required("BROKER_PASSWORD"),
    AutomaticRecoveryEnabled = false,
    TopologyRecoveryEnabled = false,
    RequestedConnectionTimeout = TimeSpan.FromSeconds(5)
};

await using IConnection connection = await factory.CreateConnectionAsync(deadline.Token);
if (Required("BROKER_MODE") == "denied")
{
    await DeniedAsync(async channel =>
        await channel.BasicPublishAsync("reservations", "reservation.confirmed", true,
            new BasicProperties(), "fixture-only"u8.ToArray(), deadline.Token));
    await DeniedAsync(async channel =>
        _ = await channel.BasicGetAsync("reservation-notifications", false, deadline.Token));
    await DeniedAsync(async channel =>
        _ = await channel.QueueDeleteAsync("reservation-notifications", false, false, deadline.Token));
    Console.WriteLine("denied");
    return;
}

await using IChannel channel = await connection.CreateChannelAsync(new CreateChannelOptions(true, true), deadline.Token);
await channel.BasicPublishAsync("reservations", "reservation.confirmed", true,
    new BasicProperties { Persistent = true }, "fixture-only"u8.ToArray(), deadline.Token);
Console.WriteLine("published");
if (await Console.In.ReadLineAsync(deadline.Token) != "get")
{
    throw new InvalidOperationException("Expected the fixed fixture get command.");
}

BasicGetResult delivery = await channel.BasicGetAsync("reservation-notifications", false, deadline.Token)
    ?? throw new InvalidOperationException("Fixture delivery was missing.");
Console.WriteLine("unacked");
if (await Console.In.ReadLineAsync(deadline.Token) != "ack")
{
    throw new InvalidOperationException("Expected the fixed fixture ack command.");
}

await channel.BasicAckAsync(delivery.DeliveryTag, false, deadline.Token);
Console.WriteLine("acked");
_ = await Console.In.ReadLineAsync(deadline.Token);

async Task DeniedAsync(Func<IChannel, Task> operation)
{
    await using IChannel restricted = await connection.CreateChannelAsync(new CreateChannelOptions(true, true), deadline.Token);
    try
    {
        await operation(restricted);
    }
    catch (OperationInterruptedException exception) when (exception.ShutdownReason?.ReplyCode == 403)
    {
        return;
    }

    throw new InvalidOperationException("The monitor unexpectedly received resource authority.");
}

static string Required(string name)
{
    return Environment.GetEnvironmentVariable(name)
        ?? throw new InvalidOperationException("A required fixture input is missing.");
}
