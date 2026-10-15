using ReservationMessaging;
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
    options.SerializerOptions.TypeInfoResolverChain.Insert(0, ReservationsJsonContext.Default);
});

builder.Services.AddHttpClient("inventory", c =>
{
    c.BaseAddress = new Uri(builder.Configuration["InventoryUrl"] ?? "http://inventory");
    c.Timeout = TimeSpan.FromSeconds(3);
}).RemoveAllLoggers();
builder.Services.AddHealthChecks()
    .AddCheck<DependencyHealth>("dependencies")
    .AddCheck<BrokerHealth>("broker", tags: ["worker"]);

WebApplication app = builder.Build();
app.MapOperationalEndpoints();
app.UseBrowserWriteGuard();
app.MapReservations();

app.Run();

namespace Reservations
{
    public partial class Program
    {
    }
}
