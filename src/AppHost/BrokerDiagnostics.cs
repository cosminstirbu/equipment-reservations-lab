using System.Diagnostics;
using System.Diagnostics.Metrics;
using Microsoft.Extensions.Logging;

internal static partial class BrokerDiagnostics
{
    public const string Name = "Equipment.BrokerBootstrap";
    public static ActivitySource Activities { get; } = new(Name);
    private static readonly Meter Meter = new(Name);
    private static readonly Counter<long> Preparations = Meter.CreateCounter<long>("broker.preparation", "{attempt}");
    private static readonly Counter<long> Readiness = Meter.CreateCounter<long>("broker.readiness", "{attempt}");

    public static async Task<string> PrepareAsync(Func<CancellationToken, Task<string>> prepare, ILogger logger, CancellationToken cancellationToken)
    {
        using Activity? operation = Activities.StartActivity("broker.prepare");
        try
        {
            string result = await prepare(cancellationToken);
            Preparations.Add(1, new KeyValuePair<string, object?>("outcome", "success"));
            _ = operation?.SetStatus(ActivityStatusCode.Ok);
            Prepared(logger);
            return result;
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            Preparations.Add(1, new KeyValuePair<string, object?>("outcome", "cancelled"));
            _ = operation?.SetStatus(ActivityStatusCode.Error, "preparation_cancelled");
            throw;
        }
        catch (Exception)
        {
            Preparations.Add(1, new KeyValuePair<string, object?>("outcome", "failure"));
            _ = operation?.SetStatus(ActivityStatusCode.Error, "preparation_failed");
            PreparationFailed(logger);
            throw new InvalidOperationException("Broker definitions preparation failed.");
        }
    }

    public static void RecordReadiness(string outcome)
    {
        Readiness.Add(1, new KeyValuePair<string, object?>("outcome", outcome));
    }

    [LoggerMessage(EventId = 6301, Level = LogLevel.Information, Message = "Broker definitions prepared")]
    private static partial void Prepared(ILogger logger);

    [LoggerMessage(EventId = 6302, Level = LogLevel.Error, Message = "Broker definitions preparation failed")]
    private static partial void PreparationFailed(ILogger logger);
}
