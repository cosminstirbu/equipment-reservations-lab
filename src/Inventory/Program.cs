using System.ComponentModel;
using ApiDocumentation;
using IdentityAccess;
using Inventory;
using Npgsql;
using ReservationMessaging;
using ServiceDefaults;

WebApplicationBuilder builder = WebApplication.CreateBuilder(args);
builder.AddServiceDefaults();
builder.AddApiDocumentation();
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
app.MapApiDocumentation();

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
}).RequireAuthorization(IdentityAuthentication.EquipmentRead)
    .DescribeBusinessOperation<EquipmentItem[]>("ListEquipment", "List equipment", "Equipment", "Returns catalog equipment, including its operational state. Requires a validated human identity, or reservations-service with equipment.read.", 200, 400, 503)
    .AddOpenApiOperationTransformer((operation, _, _) =>
    {
        operation.Responses!["200"].Description = "Equipment catalog items, ordered by identifier; the array may be empty.";
        operation.Responses["400"].Description = "Caller-supplied ownership fields are rejected with Problem Details.";
        operation.Responses["401"].Description = "Authentication is missing or invalid; the response has no body.";
        operation.Responses["403"].Description = "The identity lacks equipment read access; the response has no body.";
        operation.Responses["503"].Description = "Equipment storage is unavailable; returns Problem Details.";
        return Task.CompletedTask;
    });

app.MapGet("/api/equipment/{id}", async ([Description("Valid identifier of the equipment catalog item to retrieve.")] string id, EquipmentStore store, CancellationToken cancellationToken) =>
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
}).RequireAuthorization(IdentityAuthentication.EquipmentRead)
    .DescribeBusinessOperation<EquipmentItem>("GetEquipment", "Find equipment", "Equipment", "Returns one catalog item, including its operational state. Requires a validated human identity, or reservations-service with equipment.read. Equipment id must be a valid equipment identifier.", 200, 400, 404, 503)
    .AddOpenApiOperationTransformer((operation, _, _) =>
    {
        operation.Responses!["200"].Description = "The equipment catalog item matching the identifier.";
        operation.Responses["400"].Description = "The equipment identifier is invalid or caller-supplied ownership fields are present; returns Problem Details.";
        operation.Responses["401"].Description = "Authentication is missing or invalid; the response has no body.";
        operation.Responses["403"].Description = "The identity lacks equipment read access; the response has no body.";
        operation.Responses["404"].Description = "No equipment matches the identifier; returns Problem Details.";
        operation.Responses["503"].Description = "Equipment storage is unavailable; returns Problem Details.";
        return Task.CompletedTask;
    });

app.Run();

namespace Inventory
{
    public partial class Program
    {
    }
}
