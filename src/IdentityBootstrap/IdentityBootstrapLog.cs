using Microsoft.Extensions.Logging;

namespace IdentityBootstrap;

internal static partial class IdentityBootstrapLog
{
    [LoggerMessage(EventId = 6201, Level = LogLevel.Information, Message = "Identity provisioning completed")]
    internal static partial void Completed(ILogger logger);

    [LoggerMessage(EventId = 6202, Level = LogLevel.Error, Message = "Identity provisioning failed with {FailureType}")]
    internal static partial void Failed(ILogger logger, string failureType);
}
