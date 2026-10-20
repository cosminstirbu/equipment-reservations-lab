using Microsoft.OpenApi;

namespace Reservations;

internal static class ReservationDocumentation
{
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
                    foreach (IOpenApiSchema value in schema.Properties!.Values)
                    {
                        if (value is OpenApiSchema property)
                        {
                            property.Type = JsonSchemaType.String;
                        }
                    }
                }

                return Task.CompletedTask;
            });
        });
    }
}
