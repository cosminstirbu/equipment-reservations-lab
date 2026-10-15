using System.Diagnostics;
using Npgsql;
using OpenTelemetry;
using Persistence;

namespace ServiceDefaults;

internal sealed class DatabaseTelemetryPrivacyProcessor : BaseProcessor<Activity>
{
    private readonly ActivityListener exceptions = new()
    {
        ShouldListenTo = source => source.Name == "Npgsql",
        ExceptionRecorder = RecordException
    };

    public DatabaseTelemetryPrivacyProcessor()
    {
        // This listener never samples. Removing production collection must still
        // disable database spans; it exists only to sanitize immutable events.
        ActivitySource.AddActivityListener(exceptions);
    }

    public override void OnEnd(Activity activity)
    {
        if (activity.Source.Name != "Npgsql")
        {
            return;
        }

        DatabaseOperation operation = DatabaseTracing.Describe(activity);
        string? failure = activity.GetCustomProperty("Equipment.DatabaseFailure") as string;
        foreach (KeyValuePair<string, object?> tag in activity.TagObjects.ToArray())
        {
            _ = activity.SetTag(tag.Key, null);
        }

        activity.DisplayName = "postgresql." + operation.Operation;
        _ = activity.SetTag("db.system.name", "postgresql");
        _ = activity.SetTag("db.namespace", operation.Database);
        _ = activity.SetTag("db.operation.name", operation.Operation);
        if (operation.Sql is not null)
        {
            _ = activity.SetTag("db.query.text", operation.Sql);
        }

        if (activity.Status == ActivityStatusCode.Error)
        {
            string category = failure ?? "database_error";
            _ = activity.SetTag("error.type", category);
            _ = activity.SetStatus(ActivityStatusCode.Error, category);
        }
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing)
        {
            exceptions.Dispose();
        }

        base.Dispose(disposing);
    }

    private static void RecordException(Activity activity, Exception exception, ref TagList tags)
    {
        string category = exception switch
        {
            PostgresException postgres when IsSqlState(postgres.SqlState) => postgres.SqlState,
            OperationCanceledException => "cancelled",
            TimeoutException => "timeout",
            _ => "database_error"
        };
        activity.SetCustomProperty("Equipment.DatabaseFailure", category);
        tags = new TagList
        {
            { "exception.type", exception is PostgresException ? "Npgsql.PostgresException" : "database_error" },
            { "exception.message", "Database operation failed" },
            { "exception.stacktrace", "[redacted]" },
            { "error.type", category }
        };
    }

    private static bool IsSqlState(string value)
    {
        return value.Length == 5 && value.All(character => character is (>= '0' and <= '9') or (>= 'A' and <= 'Z'));
    }
}
