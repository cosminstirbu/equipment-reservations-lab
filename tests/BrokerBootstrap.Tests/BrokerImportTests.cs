using System.Net;
using RabbitMQ.Client;
using RabbitMQ.Client.Exceptions;
using ReservationMessaging;
using Xunit;

namespace BrokerBootstrap.Tests;

[Collection("Reservation delivery")]
public sealed class BrokerImportTests(ReservationDeliveryFixture infrastructure)
{
    [Fact]
    public async Task CoreImportRetainsProtectedFilesCredentialsGrantsAndDurableDataAcrossNormalBoot()
    {
        using var deadline = new CancellationTokenSource(TimeSpan.FromSeconds(60));
        await infrastructure.ResetQueueAsync(deadline.Token);
        string publisherAuthority = infrastructure.Publisher;
        string consumerAuthority = infrastructure.Consumer;
        await infrastructure.AssertProtectedFilesAsync(deadline.Token);
        byte[] body = "retained-broker-contract"u8.ToArray();
        await using (IConnection connection = await RabbitConnection.Factory(infrastructure.Publisher, TimeSpan.FromSeconds(3)).CreateConnectionAsync(deadline.Token))
        await using (IChannel channel = await connection.CreateChannelAsync(new CreateChannelOptions(true, true), deadline.Token))
        {
            await channel.BasicPublishAsync(ReservationTopology.Exchange, ReservationTopology.Confirmed, true, new BasicProperties { Persistent = true }, body, deadline.Token);
        }

        await infrastructure.StopBrokerAsync(deadline.Token);
        try
        {
            _ = await Assert.ThrowsAsync<BrokerUnreachableException>(async () =>
            {
                await using IConnection unavailable = await RabbitConnection.Factory(publisherAuthority, TimeSpan.FromSeconds(3)).CreateConnectionAsync(deadline.Token);
            });
        }
        finally
        {
            using var cleanup = new CancellationTokenSource(TimeSpan.FromSeconds(60));
            await infrastructure.StartBrokerAsync(cleanup.Token);
        }

        Assert.True(publisherAuthority == infrastructure.Publisher && consumerAuthority == infrastructure.Consumer,
            "Published broker authority must remain stable across restart.");
        await infrastructure.AssertProtectedFilesAsync(deadline.Token);

        await using IConnection consumer = await RabbitConnection.Factory(consumerAuthority, TimeSpan.FromSeconds(3)).CreateConnectionAsync(deadline.Token);
        await using IChannel incoming = await consumer.CreateChannelAsync(cancellationToken: deadline.Token);
        BasicGetResult? retained = await incoming.BasicGetAsync(ReservationTopology.Queue, false, deadline.Token);
        Assert.NotNull(retained);
        Assert.Equal(body, retained.Body.ToArray());
        Assert.True(retained.BasicProperties.Persistent);
        await incoming.BasicAckAsync(retained.DeliveryTag, false, deadline.Token);
        Assert.Null(await incoming.BasicGetAsync(ReservationTopology.Queue, false, deadline.Token));

        await using IConnection publisher = await RabbitConnection.Factory(publisherAuthority, TimeSpan.FromSeconds(3)).CreateConnectionAsync(deadline.Token);
        await using IChannel outgoing = await publisher.CreateChannelAsync(cancellationToken: deadline.Token);
        OperationInterruptedException deniedRead = await Assert.ThrowsAnyAsync<OperationInterruptedException>(async () =>
            _ = await outgoing.BasicGetAsync(ReservationTopology.Queue, false, deadline.Token));
        Assert.Equal(403, deniedRead.ShutdownReason!.ReplyCode);

        await using IChannel deniedPublish = await consumer.CreateChannelAsync(new CreateChannelOptions(true, true), deadline.Token);
        OperationInterruptedException deniedWrite = await Assert.ThrowsAnyAsync<OperationInterruptedException>(async () =>
            await deniedPublish.BasicPublishAsync(ReservationTopology.Exchange, ReservationTopology.Confirmed, true, new BasicProperties(), body, deadline.Token));
        Assert.Equal(403, deniedWrite.ShutdownReason!.ReplyCode);
    }
}

[Collection("Reservation delivery")]
public sealed class BrokerStartupTests
{
    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task ActualScopedCredentialsSupportConfiguredReservedAndUnicodeCharacters(bool shortOverride)
    {
        var fixture = new BrokerAccessFixture();
        string publisherPassword = (shortOverride ? "" : Guid.NewGuid().ToString("N")) + ":/@?#%+&=ü";
        string consumerPassword = (shortOverride ? "" : Guid.NewGuid().ToString("N")) + "é:/%+?#=&@";
        try
        {
            await fixture.InitializeWithPasswordsAsync(publisherPassword, consumerPassword);
            using var deadline = new CancellationTokenSource(TimeSpan.FromSeconds(15));
            await using IConnection sender = await RabbitConnection.Factory(fixture.Connection("reservations"), TimeSpan.FromSeconds(3)).CreateConnectionAsync(deadline.Token);
            await using IConnection receiver = await RabbitConnection.Factory(fixture.Connection("notifications"), TimeSpan.FromSeconds(3)).CreateConnectionAsync(deadline.Token);
            await using IChannel outgoing = await sender.CreateChannelAsync(new CreateChannelOptions(true, true), deadline.Token);
            await using IChannel incoming = await receiver.CreateChannelAsync(cancellationToken: deadline.Token);
            byte[] body = "configured-credential-contract"u8.ToArray();
            await outgoing.BasicPublishAsync(ReservationTopology.Exchange, ReservationTopology.Cancelled, true, new BasicProperties(), body, deadline.Token);
            BasicGetResult? delivery = await incoming.BasicGetAsync(ReservationTopology.Queue, false, deadline.Token);
            Assert.NotNull(delivery);
            Assert.Equal(body, delivery.Body.ToArray());
            await incoming.BasicAckAsync(delivery.DeliveryTag, false, deadline.Token);
            await fixture.AssertExactAuthorityAsync("reservations", deadline.Token);
            await fixture.AssertExactAuthorityAsync("notifications", deadline.Token);
        }
        finally
        {
            await fixture.DisposeAsync();
        }
    }

    [Fact]
    public async Task ImportedProviderFilesAndPublishedAuthoritySurviveRestart()
    {
        var fixture = new BrokerAccessFixture();
        try
        {
            await fixture.InitializeAsync();
            using var deadline = new CancellationTokenSource(TimeSpan.FromSeconds(60));
            await fixture.AssertProtectedFilesAsync(deadline.Token);
            string authority = fixture.Connection("reservations");
            Uri management = fixture.Management;
            using var originalClient = new HttpClient { BaseAddress = management, Timeout = TimeSpan.FromSeconds(5) };
            Assert.Equal(HttpStatusCode.Unauthorized, (await originalClient.GetAsync("/api/overview", deadline.Token)).StatusCode);
            await fixture.StopAsync(deadline.Token);
            try
            {
                _ = await Assert.ThrowsAsync<HttpRequestException>(() => originalClient.GetAsync("/api/overview", deadline.Token));
                _ = await Assert.ThrowsAsync<BrokerUnreachableException>(async () =>
                {
                    await using IConnection unavailable = await RabbitConnection.Factory(authority, TimeSpan.FromSeconds(3)).CreateConnectionAsync(deadline.Token);
                });
            }
            finally
            {
                using var cleanup = new CancellationTokenSource(TimeSpan.FromSeconds(60));
                await fixture.RestartAsync(cleanup.Token);
            }

            Assert.Equal(management, fixture.Management);
            Assert.True(authority == fixture.Connection("reservations"), "Published broker authority must remain stable across restart.");
            Assert.Equal(HttpStatusCode.Unauthorized, (await originalClient.GetAsync("/api/overview", deadline.Token)).StatusCode);
            await using IConnection recovered = await RabbitConnection.Factory(authority, TimeSpan.FromSeconds(3)).CreateConnectionAsync(deadline.Token);
            await fixture.AssertExactAuthorityAsync("reservations", deadline.Token);
            await fixture.AssertExactAuthorityAsync("notifications", deadline.Token);
            await fixture.AssertProtectedFilesAsync(deadline.Token);
        }
        finally
        {
            await fixture.DisposeAsync();
        }

    }

    [Theory]
    [InlineData("malformed")]
    [InlineData("unreadable")]
    public async Task FailedCoreImportRejectsStartupAndReportsNoHashMaterial(string failure)
    {
        var fixture = new BrokerAccessFixture();
        try
        {
            await fixture.InitializeWithFailureAsync(failure);
            using var deadline = new CancellationTokenSource(TimeSpan.FromSeconds(15));
            await fixture.AssertImportRejectedAsync(deadline.Token);
        }
        finally
        {
            await fixture.DisposeAsync();
        }
    }
}
