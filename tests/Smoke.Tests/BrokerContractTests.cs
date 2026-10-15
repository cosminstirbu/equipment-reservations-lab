using Aspire.Hosting;
using Aspire.Hosting.ApplicationModel;
using Aspire.Hosting.Testing;
using RabbitMQ.Client;
using RabbitMQ.Client.Exceptions;
using ReservationMessaging;
using Xunit;

namespace Smoke.Tests;

public class BrokerContractTests
{
    [Fact]
    public async Task ReservationTopologyRoutesBothEventsConfirmsAndRejectsUnroutable()
    {
        using var deadline = new CancellationTokenSource(TimeSpan.FromMinutes(3));
        Environment.SetEnvironmentVariable("ASPIRE_CONTAINER_RUNTIME", "podman");
        IDistributedApplicationTestingBuilder builder = await DistributedApplicationTestingBuilder.CreateAsync<Projects.AppHost>(["--environment=Development"], deadline.Token);
        RabbitMQServerResource broker = Assert.Single(builder.Resources.OfType<RabbitMQServerResource>());
        EndpointAnnotation endpoint = Assert.Single(broker.Annotations.OfType<EndpointAnnotation>());
        Assert.Equal("tcp", endpoint.Name);
        Assert.Equal(5672, endpoint.TargetPort);
        foreach (IResource? resource in builder.Resources.Where(r => r.Name is "postgres" or "database-bootstrap" or "inventory" or "reservations" or "notifications" or "web" or "web-installer").ToArray())
        {
            _ = builder.Resources.Remove(resource);
        }

        SmokeStartup.IsolateStorage(builder);
        await using DistributedApplication app = await builder.BuildAsync(deadline.Token);
        await SmokeStartup.StartAsync(app, deadline.Token);
        _ = await app.ResourceNotifications.WaitForResourceHealthyAsync("messaging", deadline.Token);
        string? connectionString = await app.GetConnectionStringAsync("messaging", deadline.Token);
        await using IConnection connection = await RabbitConnection.Factory(connectionString!, TimeSpan.FromSeconds(3)).CreateConnectionAsync(deadline.Token);
        await using IChannel channel = await connection.CreateChannelAsync(new CreateChannelOptions(true, true), deadline.Token);
        await ReservationTopology.DeclareAsync(channel, deadline.Token);
        _ = await Assert.ThrowsAsync<PublishReturnException>(async () =>
            await channel.BasicPublishAsync(ReservationTopology.Exchange, "unroutable", true, new BasicProperties(), "{}"u8.ToArray(), deadline.Token));

        foreach (string key in new[] { ReservationTopology.Confirmed, ReservationTopology.Cancelled })
        {
            await channel.BasicPublishAsync(ReservationTopology.Exchange, key, true,
                new BasicProperties { Persistent = true }, System.Text.Encoding.UTF8.GetBytes(key), deadline.Token);
        }

        Assert.Equal(2u, (await channel.QueueDeclarePassiveAsync(ReservationTopology.Queue, deadline.Token)).MessageCount);
        foreach (string key in new[] { ReservationTopology.Confirmed, ReservationTopology.Cancelled })
        {
            BasicGetResult? delivery = await channel.BasicGetAsync(ReservationTopology.Queue, false, deadline.Token);
            Assert.NotNull(delivery);
            Assert.Equal(key, delivery.RoutingKey);
            Assert.Equal(key, System.Text.Encoding.UTF8.GetString(delivery.Body.Span));
            Assert.True(delivery.BasicProperties.Persistent);
            await channel.BasicAckAsync(delivery.DeliveryTag, false, deadline.Token);
        }
    }
}
