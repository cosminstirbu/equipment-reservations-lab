using System.Diagnostics;
using ApiDocumentation;
using IdentityAccess;
using Npgsql;
using Persistence;
using ReservationMessaging;

namespace Notifications;

internal static class NotificationEndpoints
{
    public static void MapNotificationEndpoints(this IEndpointRouteBuilder endpoints)
    {
        RouteGroupBuilder group = endpoints.MapGroup("/api")
            .RequireAuthorization(IdentityAuthentication.Human)
            .WithTags("Notifications");

        MapListNotifications(group);
    }

    private static void MapListNotifications(RouteGroupBuilder group)
    {
        _ = group.MapGet("/notifications", ListNotificationsAsync)
            .DescribeBusinessOperation<InboxEntry[]>("ListNotifications", "List my notifications", "Notifications", "Returns only the authenticated owner's reservation notifications, most recent source event first. Requires a validated human identity; no additional role required.", 200, 400, 503)
            .AddOpenApiOperationTransformer((operation, _, _) =>
            {
                operation.Responses!["200"].Description = "The current owner's inbox entries; the array may be empty.";
                operation.Responses["400"].Description = "Caller-supplied ownership fields are rejected with Problem Details.";
                operation.Responses["401"].Description = "Authentication is missing or invalid; the response has no body.";
                operation.Responses["403"].Description = "The identity is not permitted to read the inbox; the response has no body.";
                operation.Responses["503"].Description = "Notification storage is unavailable; returns Problem Details.";
                return Task.CompletedTask;
            });
    }

    private static async Task<IResult> ListNotificationsAsync(HttpContext context, ReservationInbox inbox, ILogger<Program> logger, CancellationToken stopped)
    {
        using Activity? activity = NotificationTelemetry.Activities.StartActivity("notification.list");
        long started = Stopwatch.GetTimestamp();
        string outcome = "success";
        string dependency = "available";
        using var budget = CancellationTokenSource.CreateLinkedTokenSource(stopped);
        budget.CancelAfter(TimeSpan.FromSeconds(8));
        try
        {
            string userKey = IdentityPrincipal.UserKey(context.User);
            IReadOnlyList<InboxEntry> entries = await inbox.ListAsync(userKey, budget.Token);
            _ = activity?.SetStatus(ActivityStatusCode.Ok);
            return Results.Ok(entries);
        }
        catch (Exception exception) when (exception is NpgsqlException || (exception is OperationCanceledException && !stopped.IsCancellationRequested))
        {
            outcome = "persistence_unavailable";
            dependency = DatabaseFailure.IsPermanent(exception) ? "permanent_error" : "unavailable";
            _ = activity?.SetStatus(ActivityStatusCode.Error, outcome);
            return Results.Problem(statusCode: 503, title: "Notification storage is unavailable.", extensions: new Dictionary<string, object?> { ["code"] = "persistence_unavailable" });
        }
        catch (OperationCanceledException)
        {
            outcome = "cancelled";
            dependency = "cancelled";
            throw;
        }
        finally
        {
            ReservationMessagingTelemetry.Dependency("database", dependency, started);
            NotificationTelemetry.Record("list", outcome, started);
            NotificationsLog.Delivery(logger, "list", outcome);
        }
    }
}
