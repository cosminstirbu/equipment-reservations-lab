using Microsoft.Extensions.Logging;

namespace IdentityAccess;

internal static partial class IdentityLog
{
    [LoggerMessage(EventId = 6101, Level = LogLevel.Information, Message = "API authentication outcome {Outcome}")]
    internal static partial void Authentication(ILogger logger, string outcome);
}
