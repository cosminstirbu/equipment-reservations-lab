using System.Diagnostics.Metrics;

namespace IdentityAccess;

internal static class IdentityTelemetry
{
    private static readonly Meter Meter = new("Equipment.IdentityAccess");
    private static readonly Counter<long> Outcomes = Meter.CreateCounter<long>("identity.outcomes");

    internal static void Record(string operation, string outcome)
    {
        Outcomes.Add(1, new KeyValuePair<string, object?>("operation", operation), new KeyValuePair<string, object?>("outcome", outcome));
    }
}
