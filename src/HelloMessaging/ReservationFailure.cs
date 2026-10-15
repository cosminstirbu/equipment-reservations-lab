using RabbitMQ.Client.Exceptions;

namespace HelloMessaging;

public static class ReservationFailure
{
    public static bool IsPermanent(Exception exception)
    {
        // Configuration, authorization and invalid protocol operations require repair.
        // Forced disconnects, resource pressure and internal broker errors remain uncertain.
        return exception switch
        {
            InvalidDataException or ArgumentException or InvalidOperationException or FormatException or AuthenticationFailureException => true,
            OperationInterruptedException { ShutdownReason.ReplyCode: 311 or 402 or 403 or 404 or 405 or 406 or 501 or 502 or 503 or 504 or 505 or 530 or 540 } => true,
            AggregateException aggregate => aggregate.InnerExceptions.Any(IsPermanent),
            { InnerException: { } inner } => IsPermanent(inner),
            _ => false
        };
    }
}
