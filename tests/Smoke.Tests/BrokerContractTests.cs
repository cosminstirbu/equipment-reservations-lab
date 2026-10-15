using Aspire.Hosting;
using Aspire.Hosting.ApplicationModel;
using Aspire.Hosting.Testing;
using HelloMessaging;
using RabbitMQ.Client;
using RabbitMQ.Client.Exceptions;
using Xunit;

namespace Smoke.Tests;

public class BrokerContractTests
{
    [Fact]
    public async Task FixedTopologyRoutesConfirmsRejectsUnroutableAndCapsQueue()
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
        await using IConnection connection = await RabbitTopology.Factory(connectionString!, TimeSpan.FromSeconds(3)).CreateConnectionAsync(deadline.Token);
        await using IChannel channel = await connection.CreateChannelAsync(new CreateChannelOptions(true, true), deadline.Token);
        await RabbitTopology.DeclareAsync(channel, deadline.Token);
        _ = await Assert.ThrowsAsync<PublishReturnException>(async () => await channel.BasicPublishAsync(RabbitTopology.Exchange, "unroutable", true, new BasicProperties(), "{}"u8.ToArray(), deadline.Token));
        for (int i = 0; i < 1000; i++)
        {
            await channel.BasicPublishAsync(RabbitTopology.Exchange, RabbitTopology.RoutingKey, true, new BasicProperties(), "{}"u8.ToArray(), deadline.Token);
        }

        _ = await Assert.ThrowsAnyAsync<PublishException>(async () => await channel.BasicPublishAsync(RabbitTopology.Exchange, RabbitTopology.RoutingKey, true, new BasicProperties(), "{}"u8.ToArray(), deadline.Token));
        Assert.Equal(1000u, (await channel.QueueDeclarePassiveAsync(RabbitTopology.Queue, deadline.Token)).MessageCount);
        BasicGetResult? invalid = await channel.BasicGetAsync(RabbitTopology.Queue, false, deadline.Token);
        Assert.NotNull(invalid);
        await channel.BasicRejectAsync(invalid.DeliveryTag, false, deadline.Token);
        Assert.Equal(999u, (await channel.QueueDeclarePassiveAsync(RabbitTopology.Queue, deadline.Token)).MessageCount);
        // Real broker TTL is checked by bounded observation, supplementing clock-controlled store tests.
        using var expiry = CancellationTokenSource.CreateLinkedTokenSource(deadline.Token);
        expiry.CancelAfter(TimeSpan.FromSeconds(35));
        while ((await channel.QueueDeclarePassiveAsync(RabbitTopology.Queue, expiry.Token)).MessageCount > 0)
        {
            await Task.Delay(250, expiry.Token);
        }
    }
}
