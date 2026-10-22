using System.Net;
using System.Net.Sockets;
using RabbitMQ.Client;
using RabbitMQ.Client.Exceptions;
using Xunit;

namespace BrokerBootstrap.Tests;

public sealed class BrokerReadinessTests
{
    [Fact]
    public async Task RealClientRecoversWhenTcpListenerClosesBeforeAmqpStart()
    {
        using var deadline = CancellationTokenSource.CreateLinkedTokenSource(TestContext.Current.CancellationToken);
        deadline.CancelAfter(TimeSpan.FromSeconds(15));
        using var listener = new TcpListener(IPAddress.Loopback, 0);
        listener.Start();
        var factory = new ConnectionFactory
        {
            HostName = "127.0.0.1",
            Port = ((IPEndPoint)listener.LocalEndpoint).Port,
            AutomaticRecoveryEnabled = false
        };
        Task closedBeforeStart = CloseBeforeStartAsync(listener, deadline.Token);
        object ready = new();
        int attempts = 0;
        object result = await BrokerReadiness.ConnectAsync(async token => ++attempts == 1
            ? await factory.CreateConnectionAsync(token)
            : ready, deadline.Token);

        await closedBeforeStart;
        Assert.Same(ready, result);
    }

    [Theory]
    [InlineData("handshake")]
    [InlineData("refused")]
    [InlineData("reset")]
    [InlineData("timeout")]
    public async Task ConnectionBecomesReadyAfterTransientStartupFailure(string fault)
    {
        object ready = new();
        int attempts = 0;
        object result = await BrokerReadiness.ConnectAsync(_ => ++attempts == 1
            ? Task.FromException<object>(Failure(fault))
            : Task.FromResult(ready), TestContext.Current.CancellationToken);

        Assert.Same(ready, result);
    }

    [Theory]
    [InlineData("authentication")]
    [InlineData("mixed")]
    [InlineData("unknown")]
    public async Task PermanentFailureIsNotRetriedOrDisclosed(string fault)
    {
        int attempts = 0;
        Exception cause = fault switch
        {
            "authentication" => new AuthenticationFailureException("private-password"),
            "mixed" => new AggregateException(new EndOfStreamException(), new AuthenticationFailureException("private-password")),
            _ => new InvalidOperationException("private-password")
        };
        Exception error = await Assert.ThrowsAnyAsync<Exception>(() => BrokerReadiness.ConnectAsync(_ =>
        {
            attempts++;
            return Task.FromException<object>(new BrokerUnreachableException(cause));
        }, TestContext.Current.CancellationToken));

        Assert.Equal(1, attempts);
        Assert.Contains("RabbitMQ AMQP readiness", error.Message, StringComparison.Ordinal);
        Assert.DoesNotContain("private-password", error.ToString(), StringComparison.Ordinal);
        Assert.Null(error.InnerException);
    }

    [Fact]
    public async Task CancellationBeforeStartupPreventsConnectionAttempt()
    {
        using var cancellation = new CancellationTokenSource();
        cancellation.Cancel();
        int attempts = 0;
        _ = await Assert.ThrowsAnyAsync<OperationCanceledException>(() => BrokerReadiness.ConnectAsync(_ =>
        {
            attempts++;
            return Task.FromResult(new object());
        }, cancellation.Token));

        Assert.Equal(0, attempts);
    }

    [Fact]
    public async Task CancellationDuringTransientFailureStopsReadiness()
    {
        using var cancellation = new CancellationTokenSource();
        int attempts = 0;
        _ = await Assert.ThrowsAnyAsync<OperationCanceledException>(() => BrokerReadiness.ConnectAsync(_ =>
        {
            attempts++;
            cancellation.Cancel();
            return Task.FromException<object>(Failure("handshake"));
        }, cancellation.Token));

        Assert.Equal(1, attempts);
    }

    [Fact]
    public async Task UnrelatedOperationCancellationIsPermanentAndSafe()
    {
        int attempts = 0;
        Exception error = await Assert.ThrowsAsync<InvalidOperationException>(() => BrokerReadiness.ConnectAsync(_ => ++attempts == 1
            ? Task.FromException<object>(new OperationCanceledException("private-endpoint"))
            : Task.FromResult(new object()), TestContext.Current.CancellationToken));

        Assert.Equal(1, attempts);
        Assert.DoesNotContain("private-endpoint", error.ToString(), StringComparison.Ordinal);
    }

    [Fact]
    public async Task StalledConnectionAttemptIsCancelledBeforeReadinessCanSucceed()
    {
        object ready = new();
        int attempts = 0;
        object result = await BrokerReadiness.ConnectAsync(async token =>
        {
            if (++attempts == 1)
            {
                await Task.Delay(Timeout.InfiniteTimeSpan, token);
            }

            return ready;
        }, TestContext.Current.CancellationToken);

        Assert.Same(ready, result);
    }

    [Fact]
    public async Task RepeatedStartupFailureStopsWithBoundedSafeDiagnostic()
    {
        int attempts = 0;
        TimeoutException error = await Assert.ThrowsAsync<TimeoutException>(() => BrokerReadiness.ConnectAsync(_ =>
        {
            attempts++;
            return Task.FromException<object>(Failure("handshake"));
        }, TestContext.Current.CancellationToken));

        Assert.Equal(12, attempts);
        Assert.Contains("12 attempts", error.Message, StringComparison.Ordinal);
        Assert.DoesNotContain("private-endpoint", error.ToString(), StringComparison.Ordinal);
        Assert.Null(error.InnerException);
    }

    private static BrokerUnreachableException Failure(string fault)
    {
        Exception cause = fault switch
        {
            "handshake" => new IOException("connection.start was never received: private-endpoint", new EndOfStreamException()),
            "refused" => new SocketException((int)SocketError.ConnectionRefused),
            "reset" => new SocketException((int)SocketError.ConnectionReset),
            _ => new TimeoutException("private-endpoint")
        };
        return new BrokerUnreachableException(new AggregateException(cause));
    }

    private static async Task CloseBeforeStartAsync(TcpListener listener, CancellationToken cancellationToken)
    {
        using TcpClient socket = await listener.AcceptTcpClientAsync(cancellationToken);
        byte[] header = new byte[8];
        await socket.GetStream().ReadExactlyAsync(header, cancellationToken);
        Assert.Equal(new byte[] { 65, 77, 81, 80, 0, 0, 9, 1 }, header);
    }
}
