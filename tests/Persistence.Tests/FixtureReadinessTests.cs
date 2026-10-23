using Npgsql;
using Xunit;

namespace Persistence.Tests;

public sealed class FixtureReadinessTests(PostgresFixture postgres)
{
    [Fact]
    public async Task TransientConnectionTimeoutRecoversBeforeReturningTheRuntimeSession()
    {
        int attempts = 0;
        object expected = new();
        object actual = await DatabaseReadiness.ConnectAsync(_ => ++attempts < 3
            ? Task.FromException<object>(new TimeoutException("PRIVATE provider diagnostic"))
            : Task.FromResult(expected), TestContext.Current.CancellationToken);
        Assert.Same(expected, actual);
        Assert.Equal(3, attempts);
    }

    [Fact]
    public async Task PermanentDatabaseAuthenticationFailureIsNeverRetried()
    {
        int attempts = 0;
        var rejected = new PostgresException("PRIVATE credentials", "FATAL", "FATAL", "28P01");
        InvalidOperationException actual = await Assert.ThrowsAsync<InvalidOperationException>(() => DatabaseReadiness.ConnectAsync(_ =>
        {
            attempts++;
            return Task.FromException<object>(rejected);
        }, TestContext.Current.CancellationToken));
        Assert.DoesNotContain("PRIVATE", actual.ToString(), StringComparison.Ordinal);
        Assert.Equal(1, attempts);
    }

    [Fact]
    public async Task ExhaustedConnectionReadinessIsBoundedAndDoesNotExposeProviderDetails()
    {
        int attempts = 0;
        TimeoutException failure = await Assert.ThrowsAsync<TimeoutException>(() => DatabaseReadiness.ConnectAsync(_ =>
        {
            attempts++;
            return Task.FromException<object>(new TimeoutException("PRIVATE provider diagnostic"));
        }, TestContext.Current.CancellationToken));
        Assert.Equal(5, attempts);
        Assert.DoesNotContain("PRIVATE", failure.ToString(), StringComparison.Ordinal);
    }

    [Fact]
    public async Task CallerCancellationStopsReadinessBeforeOpeningAConnection()
    {
        using var caller = new CancellationTokenSource();
        caller.Cancel();
        int attempts = 0;
        _ = await Assert.ThrowsAnyAsync<OperationCanceledException>(() => DatabaseReadiness.ConnectAsync(_ =>
        {
            attempts++;
            return Task.FromResult(new object());
        }, caller.Token));
        Assert.Equal(0, attempts);
    }

    [Fact]
    public async Task MigratedDatabaseRetainsAnAuthenticatedRuntimeSessionBeforeRequestsStart()
    {
        await using NpgsqlDataSource database = await postgres.CreateMigratedDatabaseAsync("reservations");
        var observerSettings = new NpgsqlConnectionStringBuilder(postgres.ConnectionStringFor(database))
        {
            ApplicationName = "fixture-readiness-observer",
            Pooling = false,
            Timeout = 30
        };
        await using var observer = new NpgsqlConnection(observerSettings.ConnectionString);
        await observer.OpenAsync(TestContext.Current.CancellationToken);
        await using var sessions = new NpgsqlCommand("SELECT count(*) FROM pg_stat_activity WHERE datname=current_database() AND application_name=$1 AND state='idle'", observer);
        _ = sessions.Parameters.AddWithValue("equipment-fixture-runtime");
        Assert.True((long)(await sessions.ExecuteScalarAsync(TestContext.Current.CancellationToken))! > 0,
            "Migrated fixture must establish the runtime datasource's authenticated session before returning it to requests.");
    }
}
