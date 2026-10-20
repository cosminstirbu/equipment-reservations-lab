using Microsoft.Extensions.Logging;

namespace BrokerBootstrap;

internal static partial class BrokerBootstrapLog
{
    [LoggerMessage(EventId = 6301, Level = LogLevel.Information, Message = "Broker definitions prepared")]
    internal static partial void Completed(ILogger logger);

    [LoggerMessage(EventId = 6302, Level = LogLevel.Error, Message = "Broker definitions preparation failed ({FailureType})")]
    internal static partial void Failed(ILogger logger, string failureType);
}
