using System.Text.Json;
using HelloMessaging;
using Reservations;
using ServiceDefaults;

WebApplicationBuilder builder = WebApplication.CreateBuilder(args);
builder.AddServiceDefaults();
builder.AddDatabase("reservations", ReservationStore.Commands.Concat(OutboxWorker.Commands));
builder.Services.AddSingleton(TimeProvider.System);
builder.Services.AddSingleton<InventoryClient>();
builder.Services.AddSingleton<ReservationStore>();
builder.Services.AddSingleton<IRecoverySchedule, RecoverySchedule>();
builder.Services.AddSingleton<IReservationPublisher, ReservationPublisher>();
builder.Services.AddHostedService<OutboxWorker>();
builder.Services.ConfigureHttpJsonOptions(options =>
{
    options.SerializerOptions.TypeInfoResolverChain.Insert(0, MessagingJsonContext.Default);
    options.SerializerOptions.TypeInfoResolverChain.Insert(0, ReservationsJsonContext.Default);
});

builder.Services.AddHttpClient("inventory", c =>
{
    c.BaseAddress = new Uri(builder.Configuration["InventoryUrl"] ?? "http://inventory");
    c.Timeout = TimeSpan.FromSeconds(3);
}).RemoveAllLoggers();
builder.Services.AddSingleton<IHelloPublisher, HelloPublisher>();
builder.Services.AddHealthChecks()
    .AddCheck<DependencyHealth>("dependencies")
    .AddCheck<BrokerHealth>("broker", tags: ["worker"]);

WebApplication app = builder.Build();
app.MapOperationalEndpoints();
app.UseBrowserWriteGuard();
app.MapReservations();

app.MapPost("/api/hellos", async (
    HttpRequest request,
    IHttpClientFactory clients,
    IHelloPublisher publisher,
    ILogger<Reservations.Program> logger,
    CancellationToken stopped) =>
{
    using var budget = CancellationTokenSource.CreateLinkedTokenSource(stopped);
    budget.CancelAfter(TimeSpan.FromSeconds(8));

    HelloInput? input;
    try
    {
        if (request.ContentLength > 4096)
        {
            return Results.Problem(statusCode: 413, title: "Request too large");
        }

        using var body = new MemoryStream();
        byte[] buffer = new byte[4097];
        int size = 0;
        while (size < buffer.Length)
        {
            int read = await request.Body.ReadAsync(buffer.AsMemory(size), budget.Token);
            if (read == 0)
            {
                break;
            }

            size += read;
        }

        if (size > 4096)
        {
            return Results.Problem(statusCode: 413, title: "Request too large");
        }

        input = JsonSerializer.Deserialize(buffer.AsSpan(0, size), ReservationsJsonContext.Default.HelloInput);
    }
    catch (JsonException)
    {
        return Results.Problem(statusCode: 400, title: "Invalid hello request");
    }

    if (!HelloValidation.IsEquipmentId(input?.EquipmentId))
    {
        return Results.Problem(statusCode: 400, title: "Invalid equipment ID", detail: "Use a nonempty ASCII identifier up to 64 characters.");
    }

    try
    {
        using HttpResponseMessage response = await clients.CreateClient("inventory")
            .GetAsync($"/api/equipment/{input!.EquipmentId}", budget.Token);
        if (response.StatusCode == System.Net.HttpStatusCode.NotFound)
        {
            return Results.Problem(statusCode: 404, title: "Equipment not found");
        }

        _ = response.EnsureSuccessStatusCode();
        Equipment? item = await response.Content.ReadFromJsonAsync(MessagingJsonContext.Default.Equipment, budget.Token);
        if (item is null || item.Id != input.EquipmentId || string.IsNullOrWhiteSpace(item.Name))
        {
            throw new HttpRequestException();
        }

        var hello = new HelloRequested(Guid.NewGuid(), item.Id, item.Name, DateTimeOffset.UtcNow);
        using var publishBudget = CancellationTokenSource.CreateLinkedTokenSource(budget.Token);
        publishBudget.CancelAfter(TimeSpan.FromSeconds(3));
        await publisher.PublishAsync(hello, publishBudget.Token);
        return Results.Accepted(value: new HelloResult(hello.CorrelationId));
    }
    catch (Exception ex) when (ex is HttpRequestException
        or IOException
        or OperationCanceledException
        or RabbitMQ.Client.Exceptions.RabbitMQClientException
        or JsonException)
    {
        ReservationsLog.DependencyFailed(logger, ex.GetType().Name);
        HelloTelemetry.Record("request", "error");
        return Results.Problem(
            statusCode: 503,
            title: "Unable to send hello",
            detail: "Inventory or the message broker is unavailable. Check the local services and try a new send.");
    }
});

app.Run();

internal sealed record HelloInput(string? EquipmentId);

namespace Reservations
{
    public partial class Program
    {
    }
}
