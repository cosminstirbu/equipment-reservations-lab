using System.Net;
using System.Net.Http.Headers;
using System.Text;
using RabbitMQ.Client;
using RabbitMQ.Client.Exceptions;
using ReservationMessaging;
using Xunit;

namespace Backend.Tests;

public sealed class BrokerContractTests(BrokerAccessFixture fixture) : IClassFixture<BrokerAccessFixture>
{
    [Fact]
    public async Task ReservationTopologyRoutesBothEventsConfirmsAndRejectsUnroutable()
    {
        using var deadline = new CancellationTokenSource(TimeSpan.FromSeconds(15));
        await using IConnection connection = await RabbitConnection.Factory(fixture.Administration, TimeSpan.FromSeconds(3)).CreateConnectionAsync(deadline.Token);
        await using IChannel channel = await connection.CreateChannelAsync(new CreateChannelOptions(true, true), deadline.Token);
        await ReservationTopology.DeclareAsync(channel, deadline.Token);
        _ = await Assert.ThrowsAsync<PublishReturnException>(async () =>
            await channel.BasicPublishAsync(ReservationTopology.Exchange, "unroutable", true, new BasicProperties(), "{}"u8.ToArray(), deadline.Token));
        foreach (string key in new[] { ReservationTopology.Confirmed, ReservationTopology.Cancelled })
        {
            await channel.BasicPublishAsync(ReservationTopology.Exchange, key, true,
                new BasicProperties { Persistent = true }, Encoding.UTF8.GetBytes(key), deadline.Token);
        }

        Assert.Equal(2u, (await channel.QueueDeclarePassiveAsync(ReservationTopology.Queue, deadline.Token)).MessageCount);
        foreach (string key in new[] { ReservationTopology.Confirmed, ReservationTopology.Cancelled })
        {
            BasicGetResult? delivery = await channel.BasicGetAsync(ReservationTopology.Queue, false, deadline.Token);
            Assert.NotNull(delivery);
            Assert.Equal(key, delivery.RoutingKey);
            Assert.Equal(key, Encoding.UTF8.GetString(delivery.Body.Span));
            Assert.True(delivery.BasicProperties.Persistent);
            await channel.BasicAckAsync(delivery.DeliveryTag, false, deadline.Token);
        }
    }
}

public sealed class BrokerAccessTests(BrokerAccessFixture fixture) : IClassFixture<BrokerAccessFixture>
{
    [Fact]
    public async Task WorkerConnectionsConfirmRouteAndManuallyAcknowledgeOrRejectBothEvents()
    {
        using var deadline = new CancellationTokenSource(TimeSpan.FromSeconds(15));
        await using IConnection publisher = await RabbitConnection.Factory(fixture.Connection("reservations"), TimeSpan.FromSeconds(3)).CreateConnectionAsync(deadline.Token);
        await using IConnection consumer = await RabbitConnection.Factory(fixture.Connection("notifications"), TimeSpan.FromSeconds(3)).CreateConnectionAsync(deadline.Token);
        await using IChannel outgoing = await publisher.CreateChannelAsync(new CreateChannelOptions(true, true), deadline.Token);
        await using IChannel incoming = await consumer.CreateChannelAsync(cancellationToken: deadline.Token);
        _ = await Assert.ThrowsAsync<PublishReturnException>(async () =>
            await outgoing.BasicPublishAsync(ReservationTopology.Exchange, "unroutable", true, new BasicProperties(), "{}"u8.ToArray(), deadline.Token));

        foreach (string route in new[] { ReservationTopology.Confirmed, ReservationTopology.Cancelled })
        {
            await outgoing.BasicPublishAsync(ReservationTopology.Exchange, route, true, new BasicProperties { Persistent = true }, Encoding.UTF8.GetBytes(route), deadline.Token);
            BasicGetResult? delivery = await incoming.BasicGetAsync(ReservationTopology.Queue, false, deadline.Token);
            Assert.NotNull(delivery);
            Assert.Equal(route, delivery.RoutingKey);
            Assert.Equal(route, Encoding.UTF8.GetString(delivery.Body.Span));
            Assert.True(delivery.BasicProperties.Persistent);
            if (route == ReservationTopology.Confirmed)
            {
                await incoming.BasicAckAsync(delivery.DeliveryTag, false, deadline.Token);
            }
            else
            {
                await incoming.BasicRejectAsync(delivery.DeliveryTag, false, deadline.Token);
            }
        }

        Assert.Null(await incoming.BasicGetAsync(ReservationTopology.Queue, false, deadline.Token));
    }

    [Theory]
    [InlineData("reservations", "consume")]
    [InlineData("reservations", "unrelated-consume")]
    [InlineData("reservations", "configure")]
    [InlineData("reservations", "bind")]
    [InlineData("reservations", "unrelated-publish")]
    [InlineData("reservations", "default-publish")]
    [InlineData("notifications", "publish")]
    [InlineData("notifications", "unrelated-publish")]
    [InlineData("notifications", "configure")]
    [InlineData("notifications", "bind")]
    [InlineData("notifications", "unrelated-consume")]
    [InlineData("notifications", "default-publish")]
    public async Task WorkerCannotPerformUnrelatedOrReverseOperations(string worker, string operation)
    {
        using var deadline = new CancellationTokenSource(TimeSpan.FromSeconds(15));
        await using IConnection connection = await RabbitConnection.Factory(fixture.Connection(worker), TimeSpan.FromSeconds(3)).CreateConnectionAsync(deadline.Token);
        await using IChannel channel = await connection.CreateChannelAsync(new CreateChannelOptions(true, true), deadline.Token);
        OperationInterruptedException failure = await Assert.ThrowsAnyAsync<OperationInterruptedException>(async () =>
        {
            switch (operation)
            {
                case "consume":
                    _ = await channel.BasicGetAsync(ReservationTopology.Queue, false, deadline.Token);
                    break;
                case "unrelated-consume":
                    _ = await channel.BasicGetAsync("unrelated", false, deadline.Token);
                    break;
                case "configure":
                    _ = await channel.QueueDeclareAsync("unrelated", true, false, false, cancellationToken: deadline.Token);
                    break;
                case "bind":
                    await channel.QueueBindAsync(ReservationTopology.Queue, ReservationTopology.Exchange, "unrelated", cancellationToken: deadline.Token);
                    break;
                default:
                    string exchange = operation switch
                    {
                        "default-publish" => "",
                        "unrelated-publish" => "unrelated",
                        _ => ReservationTopology.Exchange
                    };
                    string route = operation == "default-publish" ? ReservationTopology.Queue : ReservationTopology.Confirmed;
                    await channel.BasicPublishAsync(exchange, route, true, new BasicProperties(), "{}"u8.ToArray(), deadline.Token);
                    break;
            }
        });
        Assert.Equal(403, failure.ShutdownReason!.ReplyCode);
    }

    [Theory]
    [InlineData("reservations", "other-vhost")]
    [InlineData("notifications", "other-vhost")]
    [InlineData("reservations", "management")]
    [InlineData("notifications", "management")]
    public async Task WorkerHasNoOtherVirtualHostOrAdministrationAuthority(string worker, string operation)
    {
        using var deadline = new CancellationTokenSource(TimeSpan.FromSeconds(15));
        if (operation == "other-vhost")
        {
            await fixture.AssertExactAuthorityAsync(worker, deadline.Token);
            ConnectionFactory settings = RabbitConnection.Factory(fixture.Connection(worker), TimeSpan.FromSeconds(3));
            settings.VirtualHost = "/";
            Assert.Equal("/", settings.VirtualHost);
            OperationInterruptedException denial = await Assert.ThrowsAnyAsync<OperationInterruptedException>(async () =>
            {
                await using IConnection connection = await settings.CreateConnectionAsync(deadline.Token);
                await using IChannel channel = await connection.CreateChannelAsync(cancellationToken: deadline.Token);
            });
            Assert.Equal(530, denial.ShutdownReason!.ReplyCode);
            return;
        }

        var credentials = new Uri(fixture.Connection(worker));
        using var client = new HttpClient { BaseAddress = fixture.Management, Timeout = TimeSpan.FromSeconds(5) };
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Basic", Convert.ToBase64String(Encoding.UTF8.GetBytes(Uri.UnescapeDataString(credentials.UserInfo))));
        using HttpResponseMessage response = await client.GetAsync("/api/overview", deadline.Token);
        Assert.True(response.StatusCode is HttpStatusCode.Unauthorized or HttpStatusCode.Forbidden, "Worker must not administer the broker.");
    }
}

