using System.Threading.Channels;
using Xunit;

namespace BrokerBootstrap.Tests;

public sealed class DatabaseProvisioningTests
{
    [Fact]
    public async Task HealthyFourSlotBacklogCanTakeMoreThanOneMinuteToAdmitAllScenarios()
    {
        var clock = new ControlledClock();
        using var gate = new DatabaseProvisioning(clock);
        using var deadline = CancellationTokenSource.CreateLinkedTokenSource(TestContext.Current.CancellationToken);
        deadline.CancelAfter(TimeSpan.FromSeconds(10));
        var admitted = Channel.CreateUnbounded<int>();
        TaskCompletionSource<int>[] work = [.. Enumerable.Range(0, 17)
            .Select(_ => new TaskCompletionSource<int>(TaskCreationOptions.RunContinuationsAsynchronously))];
        Task<int>[] scenarios = [.. work.Select((completion, index) => gate.RunAsync(async token =>
        {
            Assert.True(admitted.Writer.TryWrite(index));
            return await completion.Task.WaitAsync(token);
        }, deadline.Token))];

        try
        {
            for (int wave = 0; wave < 2; wave++)
            {
                int[] active = new int[4];
                for (int slot = 0; slot < active.Length; slot++)
                {
                    active[slot] = await admitted.Reader.ReadAsync(deadline.Token);
                }

                Assert.False(admitted.Reader.TryRead(out _));
                clock.Advance(TimeSpan.FromSeconds(20));
                foreach (int index in active)
                {
                    work[index].SetResult(index);
                }

                _ = await Task.WhenAll(active.Select(index => scenarios[index]));
            }

            for (int slot = 0; slot < 4; slot++)
            {
                _ = await admitted.Reader.ReadAsync(deadline.Token);
            }

            clock.Advance(TimeSpan.FromSeconds(21));
            for (int index = 0; index < work.Length; index++)
            {
                _ = work[index].TrySetResult(index);
            }

            int[] results = await Task.WhenAll(scenarios);
            Assert.Equal(Enumerable.Range(0, 17), results);
        }
        finally
        {
            for (int index = 0; index < work.Length; index++)
            {
                _ = work[index].TrySetResult(index);
            }

            Task cleanup = Task.WhenAll(scenarios);
            await cleanup.ConfigureAwait(ConfigureAwaitOptions.SuppressThrowing | ConfigureAwaitOptions.ContinueOnCapturedContext);
        }
    }

    [Fact]
    public async Task ActiveProvisioningHasItsOwnOneMinuteDeadline()
    {
        var clock = new ControlledClock();
        using var gate = new DatabaseProvisioning(clock);
        var work = new TaskCompletionSource<int>(TaskCreationOptions.RunContinuationsAsynchronously);
        Task<int> scenario = gate.RunAsync(work.Task.WaitAsync, TestContext.Current.CancellationToken);
        clock.Advance(TimeSpan.FromSeconds(60));
        try
        {
            TimeoutException error = await Assert.ThrowsAsync<TimeoutException>(() => scenario.WaitAsync(TimeSpan.FromSeconds(2), TestContext.Current.CancellationToken));
            Assert.Contains("active provisioning", error.Message, StringComparison.Ordinal);
        }
        finally
        {
            _ = work.TrySetResult(0);
            Task cleanup = scenario;
            await cleanup.ConfigureAwait(ConfigureAwaitOptions.SuppressThrowing | ConfigureAwaitOptions.ContinueOnCapturedContext);
        }

        Assert.Equal(42, await gate.RunAsync(_ => Task.FromResult(42), TestContext.Current.CancellationToken));
    }

    [Fact]
    public async Task FailedOperationReleasesCapacityAndPreservesItsFailure()
    {
        using var gate = new DatabaseProvisioning();
        var failure = new InvalidOperationException("controlled setup failure");
        for (int attempt = 0; attempt < 4; attempt++)
        {
            InvalidOperationException actual = await Assert.ThrowsAsync<InvalidOperationException>(() => gate.RunAsync<int>(_ => throw failure, TestContext.Current.CancellationToken));
            Assert.Same(failure, actual);
        }

        Assert.Equal(42, await gate.RunAsync(_ => Task.FromResult(42), TestContext.Current.CancellationToken).WaitAsync(TimeSpan.FromSeconds(2), TestContext.Current.CancellationToken));
    }

    [Fact]
    public async Task CancelledAdmissionDoesNotEnterProvisioning()
    {
        using var gate = new DatabaseProvisioning();
        using var cancellation = new CancellationTokenSource();
        cancellation.Cancel();
        bool entered = false;
        _ = await Assert.ThrowsAnyAsync<OperationCanceledException>(() => gate.RunAsync(_ =>
        {
            entered = true;
            return Task.FromResult(42);
        }, cancellation.Token));
        Assert.False(entered);
    }

    [Fact]
    public async Task StalledAdmissionFailsAfterFiveMinutesWithSafeProgressDiagnostic()
    {
        var clock = new ControlledClock();
        using var gate = new DatabaseProvisioning(clock);
        var release = new TaskCompletionSource<int>(TaskCreationOptions.RunContinuationsAsynchronously);
        Task<int>[] active = [.. Enumerable.Range(0, 4).Select(_ => gate.RunAsync(_ => release.Task, TestContext.Current.CancellationToken))];
        Task<int> queued = gate.RunAsync(_ => Task.FromResult(42), TestContext.Current.CancellationToken);
        try
        {
            clock.Advance(TimeSpan.FromMinutes(5));
            TimeoutException error = await Assert.ThrowsAsync<TimeoutException>(() => queued);
            Assert.Contains("admission exceeded 5 minutes", error.Message, StringComparison.Ordinal);
            Assert.Contains("waitedMs=300000", error.Message, StringComparison.Ordinal);
            Assert.Contains("active=4", error.Message, StringComparison.Ordinal);
            Assert.Contains("completedWhileWaiting=0", error.Message, StringComparison.Ordinal);
            Assert.Null(error.InnerException);
        }
        finally
        {
            release.SetResult(0);
            _ = await Task.WhenAll(active);
        }
    }

    private sealed class ControlledClock : TimeProvider
    {
        private readonly Lock synchronization = new();
        private readonly List<ControlledTimer> timers = [];
        private long ticks;

        public override long TimestampFrequency => TimeSpan.TicksPerSecond;

        public override long GetTimestamp()
        {
            lock (synchronization)
            {
                return ticks;
            }
        }

        public override ITimer CreateTimer(TimerCallback callback, object? state, TimeSpan dueTime, TimeSpan period)
        {
            lock (synchronization)
            {
                var timer = new ControlledTimer(this, callback, state);
                timers.Add(timer);
                _ = timer.Change(dueTime, period);
                return timer;
            }
        }

        public void Advance(TimeSpan duration)
        {
            ControlledTimer[] scheduled;
            lock (synchronization)
            {
                ticks += duration.Ticks;
                scheduled = [.. timers];
            }

            foreach (ControlledTimer timer in scheduled)
            {
                timer.Fire();
            }
        }

        private sealed class ControlledTimer(ControlledClock clock, TimerCallback callback, object? state) : ITimer
        {
            private long due;
            private bool disposed;

            public bool Change(TimeSpan dueTime, TimeSpan period)
            {
                lock (clock.synchronization)
                {
                    due = dueTime == Timeout.InfiniteTimeSpan ? long.MaxValue : clock.ticks + dueTime.Ticks;
                    return !disposed;
                }
            }

            public void Fire()
            {
                lock (clock.synchronization)
                {
                    if (disposed || due > clock.ticks)
                    {
                        return;
                    }

                    due = long.MaxValue;
                }

                callback(state);
            }

            public void Dispose()
            {
                lock (clock.synchronization)
                {
                    disposed = true;
                }
            }

            public ValueTask DisposeAsync()
            {
                Dispose();
                return ValueTask.CompletedTask;
            }
        }
    }
}
