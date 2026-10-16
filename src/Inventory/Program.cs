using IdentityAccess;
using Inventory;
using Npgsql;
using ReservationMessaging;
using ServiceDefaults;

WebApplicationBuilder builder = WebApplication.CreateBuilder(args);
builder.AddServiceDefaults();
_ = builder.Services.AddIdentityAuthentication(builder.Configuration, builder.Environment, "inventory-api");
builder.AddDatabase("inventory", EquipmentStore.Commands);
builder.Services.AddSingleton<EquipmentStore>();
builder.Services.ConfigureHttpJsonOptions(options =>
    options.SerializerOptions.TypeInfoResolverChain.Insert(0, InventoryJsonContext.Default));

WebApplication app = builder.Build();
_ = app.UseAuthentication();
_ = app.UseAuthorization();
_ = app.UseOwnershipInputGuard();
app.MapOperationalEndpoints();

app.MapGet("/api/equipment", async (EquipmentStore store, CancellationToken cancellationToken) =>
{
    try
    {
        return Results.Ok(await store.ListAsync(cancellationToken));
    }
    catch (NpgsqlException)
    {
        return Results.Problem(statusCode: 503, title: "Equipment catalog unavailable", detail: "The Inventory database is unavailable. Try refreshing later.");
    }
}).RequireAuthorization(IdentityAuthentication.EquipmentRead);
app.MapGet("/api/equipment/{id}", async (string id, EquipmentStore store, CancellationToken cancellationToken) =>
{
    if (!EquipmentIdValidation.IsEquipmentId(id))
    {
        return Results.Problem(statusCode: 400, title: "Invalid equipment ID");
    }

    try
    {
        EquipmentItem? item = await store.FindAsync(id, cancellationToken);
        return item is null
            ? Results.Problem(statusCode: 404, title: "Equipment not found")
            : Results.Ok(item);
    }
    catch (NpgsqlException)
    {
        return Results.Problem(statusCode: 503, title: "Equipment unavailable", detail: "The Inventory database is unavailable. Try refreshing later.");
    }
}).RequireAuthorization(IdentityAuthentication.EquipmentRead);

app.Run();

namespace Inventory
{
    public partial class Program
    {
    }
}
