namespace TestSupport;

internal sealed class DatabaseProvisioning(TimeProvider? timeProvider = null) : IDisposable
{
    private readonly SemaphoreSlim capacity = new(4);
    private readonly TimeProvider clock = timeProvider ?? TimeProvider.System;
    private int active;
    private int pending;
    private int completed;

    public async Task<T> RunAsync<T>(Func<CancellationToken, Task<T>> provision, CancellationToken cancellationToken)
    {
        long queuedAt = clock.GetTimestamp();
        int completedBeforeWaiting = Volatile.Read(ref completed);
        using var timeout = new CancellationTokenSource(TimeSpan.FromMinutes(5), clock);
        using var waiting = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken, timeout.Token);
        _ = Interlocked.Increment(ref pending);
        try
        {
            await capacity.WaitAsync(waiting.Token);
        }
        catch (OperationCanceledException)
        {
            cancellationToken.ThrowIfCancellationRequested();
            long waitedMilliseconds = (long)clock.GetElapsedTime(queuedAt).TotalMilliseconds;
            int progress = Volatile.Read(ref completed) - completedBeforeWaiting;
            throw new TimeoutException($"Database setup admission exceeded 5 minutes; waitedMs={waitedMilliseconds}; active={Volatile.Read(ref active)}; pending={Volatile.Read(ref pending)}; completedWhileWaiting={progress}.");
        }
        finally
        {
            _ = Interlocked.Decrement(ref pending);
        }

        _ = Interlocked.Increment(ref active);
        using var operationTimeout = new CancellationTokenSource(TimeSpan.FromSeconds(60), clock);
        using var operation = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken, operationTimeout.Token);
        try
        {
            return await provision(operation.Token);
        }
        catch (OperationCanceledException) when (operationTimeout.IsCancellationRequested && !cancellationToken.IsCancellationRequested)
        {
            throw new TimeoutException("Database active provisioning exceeded 60 seconds; phase=database creation or migration.");
        }
        finally
        {
            _ = Interlocked.Decrement(ref active);
            _ = Interlocked.Increment(ref completed);
            _ = capacity.Release();
        }
    }

    public void Dispose()
    {
        capacity.Dispose();
    }
}
