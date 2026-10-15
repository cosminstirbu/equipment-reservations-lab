using System.Diagnostics;
using System.Diagnostics.Metrics;

namespace Notifications;

public static class NotificationTelemetry
{
    public static readonly ActivitySource Activities = new("Equipment.Notifications");
    private static readonly Meter Meter = new("Equipment.Notifications");
    private static readonly Counter<long> Outcomes = Meter.CreateCounter<long>("notification.outcomes");
    private static readonly Histogram<double> Duration = Meter.CreateHistogram<double>("notification.duration", "ms");

    public static void Record(string operation, string outcome, long started)
    {
        var tags = new TagList { { "operation", operation }, { "outcome", outcome } };
        Outcomes.Add(1, tags);
        Duration.Record(Stopwatch.GetElapsedTime(started).TotalMilliseconds, tags);
    }
}
