using System.Diagnostics;
using OpenTelemetry;

namespace ServiceDefaults;

internal sealed class HttpTelemetryPrivacyProcessor : BaseProcessor<Activity>
{
    private static readonly string[] PrivateHttpFields = ["url.full", "url.query", "http.url", "http.target", "user_agent.original"];

    public override void OnEnd(Activity activity)
    {
        // Run before export, after native HTTP instrumentation has added tags.
        // Method, matched route, status, timing and W3C relationships remain.
        foreach (string field in PrivateHttpFields)
        {
            _ = activity.SetTag(field, null);
        }
    }
}
