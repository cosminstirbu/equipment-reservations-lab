using System.Diagnostics;
using System.Threading.Channels;
using Npgsql;
using Persistence;
using ReservationMessaging;

namespace Reservations;

internal sealed class OutboxListener(NpgsqlDataSource database, IRecoverySchedule schedule, ILogger logger) : IDisposable
{
    internal const string ListenSql = "LISTEN reservation_outbox_changed";
    internal const string UnlistenSql = "UNLISTEN reservation_outbox_changed";
    private readonly Channel<bool> signals = Channel.CreateBounded<bool>(new BoundedChannelOptions(1)
    {
        SingleReader = true,
        FullMode = BoundedChannelFullMode.DropWrite
    });
    private readonly TaskCompletionSource ready = new(TaskCreationOptions.RunContinuationsAsynchronously);
    private readonly CancellationTokenSource terminal = new();
    private int listening;
    private string cause = "startup";

    internal bool IsListening => Volatile.Read(ref listening) == 1;

    internal CancellationToken TerminalToken => terminal.Token;

    internal Task Ready => ready.Task;

    internal void ConsumeSignal()
    {
        _ = signals.Reader.TryRead(out _);
    }

    internal async Task<string> WaitAsync(CancellationToken cancellationToken)
    {
        _ = await signals.Reader.ReadAsync(cancellationToken);
        return Volatile.Read(ref cause);
    }

    internal async Task RunAsync(CancellationToken cancellationToken)
    {
        int failures = 0;
        bool established = false;
        try
        {
            while (!cancellationToken.IsCancellationRequested)
            {
                try
                {
                    await ListenAsync(established, cancellationToken);
                }
                catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
                {
                    break;
                }
                catch (Exception exception)
                {
                    bool wasListening = Interlocked.Exchange(ref listening, 0) == 1;
                    if (DatabaseFailure.IsPermanent(exception))
                    {
                        Transition("permanent_error");
                        await terminal.CancelAsync();
                        return;
                    }

                    established = true;
                    Transition("unavailable");
                    _ = ready.TrySetResult();
                    if (wasListening)
                    {
                        Signal("degraded_poll");
                    }

                    if (wasListening)
                    {
                        failures = 0;
                        continue;
                    }

                    failures++;
                    int attempt = (failures - 1) % 3;
                    TimeSpan delay = attempt == 2
                        ? TimeSpan.FromSeconds(10)
                        : TimeSpan.FromSeconds(Math.Pow(2, attempt) * (0.75 + (schedule.Jitter() * 0.5)));
                    await schedule.DelayAsync(delay, cancellationToken);
                }
            }
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
        }
        finally
        {
            Volatile.Write(ref listening, 0);
            _ = ready.TrySetResult();
            if (cancellationToken.IsCancellationRequested)
            {
                Transition("cancelled");
            }
        }
    }

    private async Task ListenAsync(bool reconnecting, CancellationToken cancellationToken)
    {
        NpgsqlConnection? connection = null;
        try
        {
            using (Activity? activity = ReservationTelemetry.Activities.StartActivity("outbox.listen", ActivityKind.Internal, default(ActivityContext)))
            using (var budget = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken))
            {
                budget.CancelAfter(TimeSpan.FromSeconds(3));
                try
                {
                    connection = await ReservationTelemetry.DatabaseAsync(token => database.OpenConnectionAsync(token).AsTask(), budget.Token);
                    connection.Notification += Receive;
                    await using var command = new NpgsqlCommand(ListenSql, connection) { CommandTimeout = 3 };
                    _ = await ReservationTelemetry.DatabaseAsync(command.ExecuteNonQueryAsync, budget.Token);
                    _ = activity?.SetStatus(ActivityStatusCode.Ok);
                }
                catch
                {
                    _ = activity?.SetStatus(ActivityStatusCode.Error);
                    throw;
                }
            }

            Volatile.Write(ref listening, 1);
            Transition(reconnecting ? "recovered" : "listening");
            _ = ready.TrySetResult();
            Signal(reconnecting ? "reconnect" : "startup");
            while (!cancellationToken.IsCancellationRequested)
            {
                _ = await connection.WaitAsync(TimeSpan.FromSeconds(30), cancellationToken);
            }
        }
        finally
        {
            if (connection is not null)
            {
                connection.Notification -= Receive;
                try
                {
                    if (connection.State == System.Data.ConnectionState.Open)
                    {
                        using var cleanup = new CancellationTokenSource(TimeSpan.FromSeconds(3));
                        await using var unlisten = new NpgsqlCommand(UnlistenSql, connection) { CommandTimeout = 3 };
                        _ = await ReservationTelemetry.DatabaseAsync(unlisten.ExecuteNonQueryAsync, cleanup.Token);
                    }
                }
                catch (NpgsqlException)
                {
                    // A broken session is discarded by Npgsql; cleanup must preserve the original fault.
                }
                catch (OperationCanceledException)
                {
                }
                finally
                {
                    await connection.DisposeAsync();
                }
            }
        }
    }

    private void Receive(object sender, NpgsqlNotificationEventArgs notification)
    {
        if (notification.Channel == "reservation_outbox_changed")
        {
            Signal("notification");
        }
    }

    private void Signal(string wakeCause)
    {
        Volatile.Write(ref cause, wakeCause);
        _ = signals.Writer.TryWrite(true);
    }

    private void Transition(string outcome)
    {
        ReservationTelemetry.ListenerTransition(outcome);
        ReservationsLog.Listener(logger, outcome);
    }

    public void Dispose()
    {
        terminal.Dispose();
    }
}
