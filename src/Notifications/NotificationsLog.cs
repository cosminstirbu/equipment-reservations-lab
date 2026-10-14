namespace Notifications;

internal static partial class NotificationsLog
{
    [LoggerMessage(EventId = 1, Level = LogLevel.Information, Message = "Hello received {CorrelationId}")]
    internal static partial void Received(ILogger logger, string? correlationId);

    [LoggerMessage(EventId = 2, Level = LogLevel.Warning, Message = "Message broker disconnected; restart the local application")]
    internal static partial void Disconnected(ILogger logger);

    [LoggerMessage(EventId = 3, Level = LogLevel.Warning, Message = "Consumer failed ({FailureType}); restart the local application")]
    internal static partial void ConsumerFailed(ILogger logger, string failureType);
}
