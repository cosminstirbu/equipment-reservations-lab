using Npgsql;

namespace TestSupport;

internal static class DatabaseReadiness
{
    internal static async Task<T> ConnectAsync<T>(Func<CancellationToken, Task<T>> connect, CancellationToken cancellationToken)
    {
        using var deadline = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        deadline.CancelAfter(TimeSpan.FromSeconds(20));
        for (int attempt = 1; attempt <= 5; attempt++)
        {
            cancellationToken.ThrowIfCancellationRequested();
            if (deadline.IsCancellationRequested)
            {
                break;
            }

            using var connection = CancellationTokenSource.CreateLinkedTokenSource(deadline.Token);
            connection.CancelAfter(TimeSpan.FromSeconds(3));
            try
            {
                return await connect(connection.Token);
            }
            catch (Exception exception)
            {
                cancellationToken.ThrowIfCancellationRequested();
                bool timeout = exception is OperationCanceledException && connection.IsCancellationRequested;
                bool transient = exception is TimeoutException or NpgsqlException { IsTransient: true };
                if (!timeout && !transient)
                {
                    throw new InvalidOperationException("Fixture database connection readiness failed: non-transient handshake failure.");
                }
            }

            if (attempt == 5 || deadline.IsCancellationRequested)
            {
                break;
            }

            double milliseconds = Math.Min(1000, 100 * Math.Pow(2, attempt - 1)) * (0.8 + (Random.Shared.NextDouble() * 0.2));
            try
            {
                await Task.Delay(TimeSpan.FromMilliseconds(milliseconds), deadline.Token);
            }
            catch (OperationCanceledException)
            {
                cancellationToken.ThrowIfCancellationRequested();
                break;
            }
        }

        throw new TimeoutException("Fixture database connection readiness exhausted (maximum 5 attempts / 20 seconds); no application request was retried.");
    }
}
