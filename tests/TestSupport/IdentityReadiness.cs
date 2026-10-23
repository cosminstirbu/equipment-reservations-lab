using System.Net;

namespace TestSupport;

internal static class IdentityReadiness
{
    internal static async Task WaitAsync(Func<CancellationToken, Task<HttpStatusCode>> authenticate, CancellationToken cancellationToken)
    {
        using var deadline = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        deadline.CancelAfter(TimeSpan.FromSeconds(60));
        for (int attempt = 1; attempt <= 8; attempt++)
        {
            cancellationToken.ThrowIfCancellationRequested();
            if (deadline.IsCancellationRequested)
            {
                break;
            }

            using var request = CancellationTokenSource.CreateLinkedTokenSource(deadline.Token);
            request.CancelAfter(TimeSpan.FromSeconds(5));
            HttpStatusCode? status = null;
            try
            {
                status = await authenticate(request.Token);
            }
            catch (Exception exception)
            {
                cancellationToken.ThrowIfCancellationRequested();
                bool timeout = exception is TimeoutException || (exception is OperationCanceledException && request.IsCancellationRequested);
                bool transient = exception is HttpRequestException { HttpRequestError: HttpRequestError.ConnectionError };
                if (!timeout && !transient)
                {
                    throw new InvalidOperationException("Identity fixture authentication readiness failed: non-transient transport or response failure.");
                }
            }

            if (status == HttpStatusCode.OK)
            {
                return;
            }

            if (status is not null and not (HttpStatusCode.RequestTimeout or HttpStatusCode.TooManyRequests
                or HttpStatusCode.BadGateway or HttpStatusCode.ServiceUnavailable or HttpStatusCode.GatewayTimeout))
            {
                throw new InvalidOperationException($"Identity fixture authentication readiness rejected (HTTP {(int)status}).");
            }

            if (attempt == 8 || deadline.IsCancellationRequested)
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

        throw new TimeoutException("Identity fixture authentication readiness exhausted (maximum 8 attempts / 60 seconds); no provisioning or user login was retried.");
    }
}
