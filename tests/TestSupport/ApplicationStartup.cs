namespace TestSupport;

internal static class ApplicationStartup
{
    private static readonly SemaphoreSlim Capacity = new(4);

    public static async Task<T> RunAsync<T>(Func<Task<T>> start, CancellationToken cancellationToken)
    {
        if (!await Capacity.WaitAsync(TimeSpan.FromSeconds(60), cancellationToken))
        {
            throw new TimeoutException("Application host startup did not acquire setup capacity.");
        }

        try
        {
            // Framework startup can synchronously wait for work queued to the ThreadPool.
            // Keep that wait on a bounded dedicated thread; requests use their normal scheduler.
            return await Task.Factory.StartNew(start, cancellationToken,
                TaskCreationOptions.LongRunning, TaskScheduler.Default).Unwrap();
        }
        finally
        {
            _ = Capacity.Release();
        }
    }
}
