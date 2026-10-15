using Microsoft.Extensions.Logging;

namespace DatabaseBootstrap;

internal static partial class BootstrapLog
{
    [LoggerMessage(1, LogLevel.Information, "Database provisioning and migrations completed")]
    public static partial void Completed(ILogger logger);

    [LoggerMessage(2, LogLevel.Error, "Database provisioning failed ({FailureType})")]
    public static partial void Failed(ILogger logger, string failureType);
}
