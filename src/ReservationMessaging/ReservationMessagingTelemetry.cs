using System.Diagnostics;
using System.Diagnostics.Metrics;

namespace ReservationMessaging;

public static class ReservationMessagingTelemetry
{
    public static readonly ActivitySource Activities = new("Equipment.ReservationMessaging");
    private static readonly Meter Meter = new("Equipment.ReservationMessaging");
    private static readonly Counter<long> Outcomes = Meter.CreateCounter<long>("reservation.delivery.outcomes");
    private static readonly Histogram<double> Duration = Meter.CreateHistogram<double>("reservation.delivery.duration", "ms");
    private static readonly Counter<long> Dependencies = Meter.CreateCounter<long>("reservation.dependency.outcomes");
    private static readonly Histogram<double> DependencyDuration = Meter.CreateHistogram<double>("reservation.dependency.duration", "ms");

    public static void Dependency(string dependency, string outcome, long started)
    {
        var tags = new TagList { { "dependency", dependency }, { "outcome", outcome } };
        Dependencies.Add(1, tags);
        DependencyDuration.Record(Stopwatch.GetElapsedTime(started).TotalMilliseconds, tags);
    }

    public static void Record(string operation, string outcome, long started)
    {
        var tags = new TagList { { "operation", operation }, { "outcome", outcome } };
        Outcomes.Add(1, tags);
        Duration.Record(Stopwatch.GetElapsedTime(started).TotalMilliseconds, tags);
    }
}
