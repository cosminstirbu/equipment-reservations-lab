using System.Net;
using Docker.DotNet;
using Xunit;

namespace Persistence.Tests;

public sealed class ContainerStartupTests
{
    private const string Collision = /*lang=json*/ """{"message":"failed to set up container networking: driver failed programming external connectivity on endpoint fixture (opaque): failed to listen on TCP socket: address already in use"}""";

    [Fact]
    public async Task InitialPublicationRecoversFromOneDaemonListenCollision()
    {
        int attempts = 0;
        await ContainerStartup.StartAsync(_ => ++attempts == 1
            ? Task.FromException(new DockerApiException(HttpStatusCode.InternalServerError, Collision))
            : Task.CompletedTask, TestContext.Current.CancellationToken);
        Assert.Equal(2, attempts);
    }

    [Fact]
    public async Task RepeatedCollisionPreservesLastFailureAndStopsAfterTwoAttempts()
    {
        int attempts = 0;
        var failure = new DockerApiException(HttpStatusCode.InternalServerError, Collision);
        DockerApiException actual = await Assert.ThrowsAsync<DockerApiException>(() => ContainerStartup.StartAsync(_ =>
        {
            attempts++;
            return Task.FromException(failure);
        }, TestContext.Current.CancellationToken));
        Assert.Same(failure, actual);
        Assert.Equal(2, attempts);
    }

    [Theory]
    [InlineData(401, Collision)]
    [InlineData(403, Collision)]
    [InlineData(503, Collision)]
    [InlineData(500, "not JSON")]
    [InlineData(500, "{}")]
    [InlineData(500, /*lang=json*/ """{"message":1}""")]
    [InlineData(500, "null")]
    [InlineData(500, /*lang=json*/ """{"message":"address already in use"}""")]
    [InlineData(500, /*lang=json*/ """{"message":"failed to set up container networking: permission denied"}""")]
    public async Task OtherDaemonFailuresAreNotRetried(int status, string body)
    {
        int attempts = 0;
        var failure = new DockerApiException((HttpStatusCode)status, body);
        DockerApiException actual = await Assert.ThrowsAsync<DockerApiException>(() => ContainerStartup.StartAsync(_ =>
        {
            attempts++;
            return Task.FromException(failure);
        }, TestContext.Current.CancellationToken));
        Assert.Same(failure, actual);
        Assert.Equal(1, attempts);
    }

    [Fact]
    public async Task NonDaemonFailureIsNotRetried()
    {
        int attempts = 0;
        var failure = new TimeoutException();
        TimeoutException actual = await Assert.ThrowsAsync<TimeoutException>(() => ContainerStartup.StartAsync(_ =>
        {
            attempts++;
            return Task.FromException(failure);
        }, TestContext.Current.CancellationToken));
        Assert.Same(failure, actual);
        Assert.Equal(1, attempts);
    }

    [Fact]
    public async Task CancellationBeforeStartupPreventsAnyAttempt()
    {
        using var cancellation = new CancellationTokenSource();
        cancellation.Cancel();
        int attempts = 0;
        _ = await Assert.ThrowsAnyAsync<OperationCanceledException>(() => ContainerStartup.StartAsync(_ =>
        {
            attempts++;
            return Task.CompletedTask;
        }, cancellation.Token));
        Assert.Equal(0, attempts);
    }

    [Fact]
    public async Task CancellationAfterCollisionPreventsRetry()
    {
        using var cancellation = new CancellationTokenSource();
        int attempts = 0;
        Task start = ContainerStartup.StartAsync(_ =>
        {
            attempts++;
            return Task.FromException(new DockerApiException(HttpStatusCode.InternalServerError, Collision));
        }, cancellation.Token);
        cancellation.Cancel();
        _ = await Assert.ThrowsAnyAsync<OperationCanceledException>(() => start);
        Assert.Equal(1, attempts);
    }
}
