using System.Diagnostics;
using Notifications;
using Npgsql;
using Persistence;
using ReservationMessaging;
using ServiceDefaults;

WebApplicationBuilder builder = WebApplication.CreateBuilder(args);
builder.AddServiceDefaults();
builder.AddDatabase("notifications", ReservationInbox.Commands);
builder.Services.ConfigureHttpJsonOptions(options =>
    options.SerializerOptions.TypeInfoResolverChain.Insert(0, NotificationsJsonContext.Default));

builder.Services.AddSingleton(TimeProvider.System);
builder.Services.AddSingleton<ReservationInbox>();
builder.Services.AddSingleton<IRecoverySchedule, RecoverySchedule>();
builder.Services.AddSingleton<IReservationSubscription, ReservationSubscription>();
builder.Services.AddSingleton<ReservationConsumerStatus>();
builder.Services.AddHostedService<ReservationConsumer>();
builder.Services.AddHealthChecks()
    .AddCheck<ReservationConsumerHealth>("reservation-consumer", tags: ["worker"]);

WebApplication app = builder.Build();
app.MapOperationalEndpoints();

app.MapGet("/api/notifications", async (ReservationInbox inbox, ILogger<Notifications.Program> logger, CancellationToken stopped) =>
{
    using Activity? activity = NotificationTelemetry.Activities.StartActivity("notification.list");
    long started = Stopwatch.GetTimestamp();
    string outcome = "success";
    string dependency = "available";
    using var budget = CancellationTokenSource.CreateLinkedTokenSource(stopped);
    budget.CancelAfter(TimeSpan.FromSeconds(8));
    try
    {
        IReadOnlyList<InboxEntry> entries = await inbox.ListAsync(budget.Token);
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
});

app.Run();

namespace Notifications
{
    public partial class Program
    {
    }
}
