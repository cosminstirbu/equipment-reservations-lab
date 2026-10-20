using Microsoft.OpenApi;

namespace Reservations;

internal static class ReservationDocumentation
{
    private static readonly string[] AvailabilityParameters = ["equipmentId", "startAt", "endAt"];

    public static void AddReservationDocumentation(this WebApplicationBuilder builder)
    {
        _ = builder.Services.AddOpenApi("v1", options =>
        {
            _ = options.AddSchemaTransformer((schema, context, _) =>
            {
                if (context.JsonTypeInfo.Type == typeof(ReservationInput))
                {
                    schema.Required = new HashSet<string>(StringComparer.Ordinal) { "equipmentId", "startAt", "endAt" };
                    schema.AdditionalPropertiesAllowed = false;
                    foreach ((string name, IOpenApiSchema value) in schema.Properties!)
                    {
                        if (value is OpenApiSchema property)
                        {
                            property.Type = JsonSchemaType.String;
                            property.Description = name == "equipmentId" ? "Valid equipment identifier." : "ISO8601 with explicit timezone offset and at most six fractional digits; start before end, not past.";
                        }
                    }
                }

                return Task.CompletedTask;
            });
            _ = options.AddOperationTransformer((operation, _, _) =>
            {
                if (operation.OperationId == "GetAvailability")
                {
                    operation.Parameters = [.. AvailabilityParameters.Select(name => new OpenApiParameter
                    {
                        Name = name,
                        In = ParameterLocation.Query,
                        Required = true,
                        Description = name == "equipmentId" ? "Valid equipment identifier. No additional query fields." : "ISO8601 with explicit timezone offset and at most six fractional digits; start before end, not past.",
                        Schema = new OpenApiSchema { Type = JsonSchemaType.String }
                    })];
                }

                if (operation.OperationId == "CreateReservation")
                {
                    ((OpenApiResponse)operation.Responses!["201"]).Headers = new Dictionary<string, IOpenApiHeader>
                    {
                        ["Location"] = new OpenApiHeader { Description = "Relative URL of the created reservation.", Schema = new OpenApiSchema { Type = JsonSchemaType.String } }
                    };
                }

                if (operation.OperationId is "CreateReservation" or "CancelReservation")
                {
                    operation.Responses!["403"].Description = "Empty when authorization is denied; browser-write rejection returns optional Problem Details.";
                    ((OpenApiResponse)operation.Responses["403"]).Content = new Dictionary<string, OpenApiMediaType>
                    {
                        ["application/problem+json"] = new OpenApiMediaType { Schema = operation.Responses["400"].Content!["application/problem+json"].Schema }
                    };
                }

                return Task.CompletedTask;
            });
        });
    }
}
