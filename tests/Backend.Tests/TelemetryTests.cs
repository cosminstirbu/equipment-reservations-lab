using System.Diagnostics.Metrics;
using HelloMessaging;
using Xunit;

namespace Backend.Tests;

public class TelemetryTests
{
    private static readonly string[] DimensionKeys = ["operation", "outcome"];
    [Fact]
    public void HelloMetricDimensionsAreBoundedAndDoNotContainIdentifiers()
    {
        var measurements = new List<KeyValuePair<string, object?>[]>();
        using var listener = new MeterListener();
        listener.InstrumentPublished = (instrument, meter) =>
        {
            if (instrument.Meter.Name == "Equipment.Hello")
            {
                meter.EnableMeasurementEvents(instrument);
            }
        };
        listener.SetMeasurementEventCallback<long>((_, _, tags, _) => measurements.Add(tags.ToArray()));
        listener.Start();
        HelloTelemetry.Record("publish", "error");
        Assert.Contains(measurements, tags => tags.Any(t => t.Key == "operation" && Equals(t.Value, "publish")));
        Assert.All(measurements, tags => Assert.All(tags, tag => Assert.Contains(tag.Key, DimensionKeys)));
    }
}
