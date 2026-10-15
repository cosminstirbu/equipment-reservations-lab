namespace Reservations;

internal static partial class ReservationsLog
{
    [LoggerMessage(EventId = 20, Level = LogLevel.Information, Message = "Reservation delivery {Operation} outcome {Outcome}")]
    internal static partial void Delivery(ILogger logger, string operation, string outcome);

}
