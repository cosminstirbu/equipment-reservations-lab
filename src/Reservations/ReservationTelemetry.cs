using System.Diagnostics;
using System.Diagnostics.Metrics;
using Npgsql;
using Persistence;

namespace Reservations;

public static class ReservationTelemetry
{
    public static readonly ActivitySource Activities = new("Equipment.Reservations");
    private static readonly Meter Meter = new("Equipment.Reservations");
    private static readonly Counter<long> Outcomes = Meter.CreateCounter<long>("reservation.outcomes");
    private static readonly Histogram<double> Duration = Meter.CreateHistogram<double>("reservation.duration", "ms");
    private static readonly Counter<long> Dependencies = Meter.CreateCounter<long>("reservation.dependency.outcomes");
    private static readonly Histogram<double> DependencyDuration = Meter.CreateHistogram<double>("reservation.dependency.duration", "ms");
    private static long pending;
    private static double oldestAge;

    static ReservationTelemetry()
    {
        _ = Meter.CreateObservableGauge("reservation.outbox.pending", () => Volatile.Read(ref pending));
        _ = Meter.CreateObservableGauge("reservation.outbox.oldest_age", () => Volatile.Read(ref oldestAge), "s");
    }

    public static void OutboxSnapshot(long count, double seconds)
    {
        Volatile.Write(ref pending, count);
        Volatile.Write(ref oldestAge, Math.Max(0, seconds));
    }

    public static void Dependency(string dependency, string outcome, long started)
    {
        var tags = new TagList { { "dependency", dependency }, { "outcome", outcome } };
        Dependencies.Add(1, tags);
        DependencyDuration.Record(Stopwatch.GetElapsedTime(started).TotalMilliseconds, tags);
    }

    public static async Task<T> DatabaseAsync<T>(Func<CancellationToken, Task<T>> operation, CancellationToken cancellationToken)
    {
        long started = Stopwatch.GetTimestamp();
        string outcome = "available";
        try
        {
            return await operation(cancellationToken);
        }
        catch (NpgsqlException exception)
        {
            outcome = DatabaseFailure.IsPermanent(exception) ? "permanent_error" : "unavailable";
            throw;
        }
        catch (OperationCanceledException)
        {
            outcome = "cancelled";
            throw;
        }
        finally
        {
            Dependency("database", outcome, started);
        }
    }

    public static void Record(string operation, string outcome, double milliseconds)
    {
        var tags = new TagList { { "operation", operation }, { "outcome", outcome } };
        Outcomes.Add(1, tags);
        Duration.Record(milliseconds, tags);
    }
}
