namespace Reservations;

internal static partial class ReservationLog
{
    [LoggerMessage(10, LogLevel.Information, "Reservation {Operation} completed ({Outcome})")]
    public static partial void Completed(ILogger logger, string operation, string outcome);

    [LoggerMessage(11, LogLevel.Warning, "Reservation {Operation} rejected ({Outcome})")]
    public static partial void Rejected(ILogger logger, string operation, string outcome);
}
