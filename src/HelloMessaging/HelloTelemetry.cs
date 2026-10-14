using System.Diagnostics;
using System.Diagnostics.Metrics;

namespace HelloMessaging;

public static class HelloTelemetry
{
    public static readonly ActivitySource Activities = new("Equipment.Hello");
    public static readonly Meter Meter = new("Equipment.Hello");
    private static readonly Counter<long> Outcomes = Meter.CreateCounter<long>("hello.outcomes");
    public static readonly Histogram<double> Latency = Meter.CreateHistogram<double>("hello.duration", unit: "ms");
    public static void Record(string operation, string outcome)
    {
        Outcomes.Add(1, new KeyValuePair<string, object?>("operation", operation), new KeyValuePair<string, object?>("outcome", outcome));
    }
}
