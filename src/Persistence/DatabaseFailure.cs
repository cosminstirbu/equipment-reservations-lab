using Npgsql;

namespace Persistence;

public static class DatabaseFailure
{
    public static bool IsPermanent(Exception exception)
    {
        // Unknown SQLSTATEs remain uncertain; never infer disposition from server text.
        return exception switch
        {
            PostgresException postgres => postgres.SqlState.StartsWith("28", StringComparison.Ordinal)
                || postgres.SqlState.StartsWith("42", StringComparison.Ordinal)
                || postgres.SqlState is PostgresErrorCodes.InvalidCatalogName or PostgresErrorCodes.InvalidSchemaName,
            AggregateException aggregate => aggregate.InnerExceptions.Any(IsPermanent),
            { InnerException: { } inner } => IsPermanent(inner),
            _ => false
        };
    }
}
