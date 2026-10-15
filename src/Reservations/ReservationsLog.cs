namespace Reservations;

internal static partial class ReservationsLog
{
    [LoggerMessage(EventId = 20, Level = LogLevel.Information, Message = "Reservation delivery {Operation} outcome {Outcome}")]
    internal static partial void Delivery(ILogger logger, string operation, string outcome);

    [LoggerMessage(EventId = 1, Level = LogLevel.Information, Message = "Hello published {CorrelationId} for {EquipmentId}")]
    internal static partial void Published(ILogger logger, Guid correlationId, string equipmentId);

    [LoggerMessage(EventId = 2, Level = LogLevel.Warning, Message = "Hello dependency operation failed ({FailureType})")]
    internal static partial void DependencyFailed(ILogger logger, string failureType);
}
