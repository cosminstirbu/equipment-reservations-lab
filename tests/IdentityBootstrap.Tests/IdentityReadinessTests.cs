using System.Net;
using Xunit;

namespace IdentityBootstrap.Tests;

public sealed class IdentityReadinessTests
{
    [Fact]
    public async Task TemporaryProviderUnavailabilityMustRecoverBeforeSetupIsReady()
    {
        int attempts = 0;
        await IdentityReadiness.WaitAsync(_ => Task.FromResult(++attempts < 3
            ? HttpStatusCode.ServiceUnavailable : HttpStatusCode.OK), TestContext.Current.CancellationToken);
        Assert.Equal(3, attempts);
    }

    [Fact]
    public async Task ColdAuthenticationTimeoutRecoversBeforeAnyProvisioningOrLogin()
    {
        int attempts = 0;
        await IdentityReadiness.WaitAsync(_ => ++attempts == 1
            ? Task.FromException<HttpStatusCode>(new TimeoutException("PRIVATE response"))
            : Task.FromResult(HttpStatusCode.OK), TestContext.Current.CancellationToken);
        Assert.Equal(2, attempts);
    }

    [Theory]
    [InlineData(HttpStatusCode.Unauthorized)]
    [InlineData(HttpStatusCode.Forbidden)]
    [InlineData(HttpStatusCode.BadRequest)]
    public async Task InvalidAuthorityFailsImmediately(HttpStatusCode status)
    {
        int attempts = 0;
        InvalidOperationException failure = await Assert.ThrowsAsync<InvalidOperationException>(() => IdentityReadiness.WaitAsync(_ =>
        {
            attempts++;
            return Task.FromResult(status);
        }, TestContext.Current.CancellationToken));
        Assert.Contains($"HTTP {(int)status}", failure.Message, StringComparison.Ordinal);
        Assert.Equal(1, attempts);
    }

    [Fact]
    public async Task CancelledCallerCannotStartAuthentication()
    {
        using var caller = new CancellationTokenSource();
        caller.Cancel();
        int attempts = 0;
        _ = await Assert.ThrowsAnyAsync<OperationCanceledException>(() => IdentityReadiness.WaitAsync(_ =>
        {
            attempts++;
            return Task.FromResult(HttpStatusCode.OK);
        }, caller.Token));
        Assert.Equal(0, attempts);
    }

    [Fact]
    public async Task RepeatedTransportTimeoutIsBoundedAndPrivate()
    {
        int attempts = 0;
        TimeoutException failure = await Assert.ThrowsAsync<TimeoutException>(() => IdentityReadiness.WaitAsync(_ =>
        {
            attempts++;
            return Task.FromException<HttpStatusCode>(new TimeoutException("PRIVATE provider response"));
        }, TestContext.Current.CancellationToken));
        Assert.Equal(8, attempts);
        Assert.DoesNotContain("PRIVATE", failure.ToString(), StringComparison.Ordinal);
    }
}
