using System.ComponentModel;
using ApiDocumentation;
using IdentityAccess;
using Npgsql;
using ReservationMessaging;

namespace Inventory;

internal static class EquipmentEndpoints
{
    public static void MapEquipmentEndpoints(this IEndpointRouteBuilder endpoints)
    {
        RouteGroupBuilder group = endpoints.MapGroup("/api")
            .RequireAuthorization(IdentityAuthentication.EquipmentRead)
            .WithTags("Equipment");

        MapListEquipment(group);
        MapGetEquipment(group);
    }

    private static void MapListEquipment(RouteGroupBuilder group)
    {
        _ = group.MapGet("/equipment", ListEquipmentAsync)
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
    }

    private static void MapGetEquipment(RouteGroupBuilder group)
    {
        _ = group.MapGet("/equipment/{id}", GetEquipmentAsync)
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
    }

    private static async Task<IResult> ListEquipmentAsync(EquipmentStore store, CancellationToken cancellationToken)
    {
        try
        {
            return Results.Ok(await store.ListAsync(cancellationToken));
        }
        catch (NpgsqlException)
        {
            return Results.Problem(statusCode: 503, title: "Equipment catalog unavailable", detail: "The Inventory database is unavailable. Try refreshing later.");
        }
    }

    private static async Task<IResult> GetEquipmentAsync([Description("Valid identifier of the equipment catalog item to retrieve.")] string id, EquipmentStore store, CancellationToken cancellationToken)
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
    }
}
