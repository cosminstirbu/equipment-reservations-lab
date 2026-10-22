using System.Net.Sockets;
using RabbitMQ.Client.Exceptions;

namespace TestSupport;

public static class BrokerReadiness
{
    public static async Task<T> ConnectAsync<T>(Func<CancellationToken, Task<T>> connect, CancellationToken cancellationToken)
    {
        using var deadline = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        deadline.CancelAfter(TimeSpan.FromSeconds(60));
        for (int attempt = 1; attempt <= 12; attempt++)
        {
            cancellationToken.ThrowIfCancellationRequested();
            if (deadline.IsCancellationRequested)
            {
                throw Exhausted(attempt - 1);
            }

            using var connection = CancellationTokenSource.CreateLinkedTokenSource(deadline.Token);
            connection.CancelAfter(TimeSpan.FromSeconds(5));
            try
            {
                return await connect(connection.Token);
            }
            catch (Exception exception)
            {
                cancellationToken.ThrowIfCancellationRequested();
                bool attemptExpired = exception is OperationCanceledException && connection.IsCancellationRequested;
                if (!attemptExpired && !IsTransient(exception))
                {
                    throw new InvalidOperationException("RabbitMQ AMQP readiness failed: permanent connection rejection.");
                }
            }

            if (attempt == 12 || deadline.IsCancellationRequested)
            {
                throw Exhausted(attempt);
            }

            double milliseconds = Math.Min(2000, 100 * Math.Pow(2, attempt - 1));
            milliseconds *= 0.8 + (Random.Shared.NextDouble() * 0.2);
            try
            {
                await Task.Delay(TimeSpan.FromMilliseconds(milliseconds), deadline.Token);
            }
            catch (OperationCanceledException)
            {
                cancellationToken.ThrowIfCancellationRequested();
                throw Exhausted(attempt);
            }
        }

        throw Exhausted(12);
    }

    private static TimeoutException Exhausted(int attempts)
    {
        return new TimeoutException($"RabbitMQ AMQP readiness exhausted after {attempts} attempts (maximum 12 attempts / 60 seconds); transport or handshake timeout.");
    }

    private static bool IsTransient(Exception exception)
    {
        return exception switch
        {
            AuthenticationFailureException or PossibleAuthenticationFailureException => false,
            AggregateException aggregate => aggregate.InnerExceptions.Count > 0 && aggregate.InnerExceptions.All(IsTransient),
            BrokerUnreachableException or ConnectFailureException => exception.InnerException is not null && IsTransient(exception.InnerException),
            SocketException socket => socket.SocketErrorCode is SocketError.ConnectionRefused or SocketError.ConnectionReset or SocketError.ConnectionAborted or SocketError.TimedOut,
            EndOfStreamException or TimeoutException => true,
            IOException { InnerException: not null } io => IsTransient(io.InnerException!),
            _ => false
        };
    }
}
