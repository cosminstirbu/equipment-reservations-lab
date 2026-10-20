using ApiDocumentation;
using IdentityAccess;
using ReservationMessaging;
using Reservations;
using ServiceDefaults;

WebApplicationBuilder builder = WebApplication.CreateBuilder(args);
builder.AddServiceDefaults();
builder.AddApiDocumentation();
builder.AddReservationDocumentation();
_ = builder.Services.AddIdentityAuthentication(builder.Configuration, builder.Environment, "reservations-api");
builder.AddDatabase("reservations", ReservationStore.Commands.Concat(OutboxWorker.Commands));
builder.Services.AddSingleton(TimeProvider.System);
_ = builder.Services.AddServiceIdentity();
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
}).ConfigurePrimaryHttpMessageHandler(() => new SocketsHttpHandler { AllowAutoRedirect = false }).RemoveAllLoggers();
builder.Services.AddHealthChecks()
    .AddCheck<DependencyHealth>("dependencies")
    .AddCheck<BrokerHealth>("broker", tags: ["worker"]);

WebApplication app = builder.Build();
_ = app.UseAuthentication();
_ = app.UseAuthorization();
app.MapOperationalEndpoints();
app.MapApiDocumentation();
app.UseBrowserWriteGuard();
_ = app.UseOwnershipInputGuard();
app.MapReservationEndpoints();

app.Run();

namespace Reservations
{
    public partial class Program
    {
    }
}
