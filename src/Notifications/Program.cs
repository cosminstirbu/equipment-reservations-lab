using ApiDocumentation;
using IdentityAccess;
using Notifications;
using ReservationMessaging;
using ServiceDefaults;

WebApplicationBuilder builder = WebApplication.CreateBuilder(args);
builder.AddServiceDefaults();
builder.AddApiDocumentation();
_ = builder.Services.AddIdentityAuthentication(builder.Configuration, builder.Environment, "notifications-api");
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
_ = app.UseAuthentication();
_ = app.UseAuthorization();
_ = app.UseOwnershipInputGuard();
app.MapOperationalEndpoints();
app.MapApiDocumentation();

app.MapNotificationEndpoints();

app.Run();

namespace Notifications
{
    public partial class Program
    {
    }
}
