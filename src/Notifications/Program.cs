using Microsoft.Extensions.Diagnostics.HealthChecks;
using Notifications;
using ServiceDefaults;

WebApplicationBuilder builder = WebApplication.CreateBuilder(args);
builder.AddServiceDefaults();
builder.Services.ConfigureHttpJsonOptions(options =>
    options.SerializerOptions.TypeInfoResolverChain.Insert(0, NotificationsJsonContext.Default));

builder.Services.AddSingleton(TimeProvider.System);
builder.Services.AddSingleton<NotificationStore>();
builder.Services.AddSingleton<ConsumerStatus>();
builder.Services.AddHostedService<HelloConsumer>();
builder.Services.AddHealthChecks()
    .Add(new HealthCheckRegistration(
        "consumer",
        services => new ConsumerHealth(services.GetRequiredService<ConsumerStatus>()),
        null,
        null));

WebApplication app = builder.Build();
app.MapOperationalEndpoints();

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
