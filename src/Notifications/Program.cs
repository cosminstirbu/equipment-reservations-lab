using System.Diagnostics;
using HelloMessaging;
using Microsoft.Extensions.Diagnostics.HealthChecks;
using Notifications;
using Npgsql;
using Persistence;
using ServiceDefaults;

WebApplicationBuilder builder = WebApplication.CreateBuilder(args);
builder.AddServiceDefaults();
builder.AddDatabase("notifications");
builder.Services.ConfigureHttpJsonOptions(options =>
    options.SerializerOptions.TypeInfoResolverChain.Insert(0, NotificationsJsonContext.Default));

builder.Services.AddSingleton(TimeProvider.System);
builder.Services.AddSingleton<NotificationStore>();
builder.Services.AddSingleton<ReservationInbox>();
builder.Services.AddSingleton<ConsumerStatus>();
builder.Services.AddHostedService<HelloConsumer>();
builder.Services.AddSingleton<IRecoverySchedule, RecoverySchedule>();
builder.Services.AddSingleton<IReservationSubscription, ReservationSubscription>();
builder.Services.AddSingleton<ReservationConsumerStatus>();
builder.Services.AddHostedService<ReservationConsumer>();
builder.Services.AddHealthChecks()
    .AddCheck<ReservationConsumerHealth>("reservation-consumer", tags: ["worker"])
    .Add(new HealthCheckRegistration(
        "consumer",
        services => new ConsumerHealth(services.GetRequiredService<ConsumerStatus>()),
        null,
        ["worker"]));

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

app.MapGet("/api/notifications/{id}", (string id, NotificationStore store) =>
{
    if (!Guid.TryParse(id, out Guid correlationId) || correlationId == Guid.Empty)
    {
        return Results.Problem(statusCode: 400, title: "Invalid correlation ID");
    }

    Notification? notification = store.Find(correlationId);
    return notification is not null
        ? Results.Ok(notification)
        : Results.Problem(statusCode: 404, title: "Notification pending or expired");
});

app.Run();

namespace Notifications
{
    public partial class Program
    {
    }
}

internal sealed class ConsumerHealth(ConsumerStatus status) : IHealthCheck
{
    public Task<HealthCheckResult> CheckHealthAsync(HealthCheckContext context, CancellationToken ct = default)
    {
        return Task.FromResult(status.Ready
            ? HealthCheckResult.Healthy()
            : HealthCheckResult.Unhealthy("Consumer unavailable"));
    }
}
