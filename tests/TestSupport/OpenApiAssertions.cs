using System.Text;
using System.Text.Json;
using Microsoft.OpenApi;
using Xunit;

namespace TestSupport;

public static class OpenApiAssertions
{
    private static readonly string[] AvailabilityFields = ["advisory", "available", "endAt", "equipmentId", "startAt"];
    private static readonly string[] InputFields = ["endAt", "equipmentId", "startAt"];

    public static async Task AssertDocumentAsync(string json, string service)
    {
        await SpectralValidation.AssertValidAsync(json, service, TestContext.Current.CancellationToken);

        using var stream = new MemoryStream(Encoding.UTF8.GetBytes(json));
        Microsoft.OpenApi.Reader.ReadResult result = await OpenApiDocument.LoadAsync(stream, "json", cancellationToken: TestContext.Current.CancellationToken);
        Assert.NotNull(result.Diagnostic);
        Assert.Empty(result.Diagnostic.Errors);
        Assert.NotNull(result.Document);
        Assert.Empty(result.Document.Validate(ValidationRuleSet.GetDefaultRuleSet()));
        using var parsed = JsonDocument.Parse(json);
        JsonElement root = parsed.RootElement;
        Assert.StartsWith("3.1.", root.GetProperty("openapi").GetString());
        (string, string, string, string)[] expected = service switch
        {
            "Inventory" => [("/api/equipment", "get", "ListEquipment", "200,400,401,403,503"), ("/api/equipment/{id}", "get", "GetEquipment", "200,400,401,403,404,503")],
            "Notifications" => [("/api/notifications", "get", "ListNotifications", "200,400,401,403,503")],
            _ => [("/api/reservations", "post", "CreateReservation", "201,400,401,403,404,409,413,415,500,503"), ("/api/availability", "get", "GetAvailability", "200,400,401,403,404,500,503"), ("/api/reservations", "get", "ListReservations", "200,400,401,403,500,503"), ("/api/reservations/{id}", "get", "GetReservation", "200,400,401,403,404,500,503"), ("/api/reservations/{id}/cancel", "post", "CancelReservation", "200,400,401,403,404,409,413,500,503")]
        };
        JsonElement paths = root.GetProperty("paths");
        Assert.Equal(expected.Length, paths.EnumerateObject().Sum(path => path.Value.EnumerateObject().Count()));
        foreach ((string path, string method, string id, string statuses) in expected)
        {
            JsonElement operation = paths.GetProperty(path).GetProperty(method);
            Assert.Equal(id, operation.GetProperty("operationId").GetString());
            AssertDescription(operation, id);
            if (operation.TryGetProperty("parameters", out JsonElement parameters))
            {
                foreach (JsonElement parameter in parameters.EnumerateArray())
                {
                    AssertDescription(parameter, id + " parameter " + parameter.GetProperty("name").GetString());
                }
            }
            if (operation.TryGetProperty("requestBody", out JsonElement requestBody))
            {
                AssertDescription(requestBody, id + " request body");
            }
            Assert.False(string.IsNullOrWhiteSpace(operation.GetProperty("summary").GetString()));
            Assert.NotEmpty(operation.GetProperty("tags").EnumerateArray());
            Assert.Contains(operation.GetProperty("security").EnumerateArray(), requirement => requirement.TryGetProperty("DocumentationOAuth", out _));
            JsonElement responses = operation.GetProperty("responses");
            foreach (JsonProperty response in responses.EnumerateObject())
            {
                AssertDescription(response.Value, id + " response " + response.Name);
                if (response.Value.TryGetProperty("headers", out JsonElement headers))
                {
                    foreach (JsonProperty header in headers.EnumerateObject())
                    {
                        AssertDescription(header.Value, id + " response header " + header.Name);
                    }
                }
            }
            Assert.Equal(statuses.Split(',').Order(), responses.EnumerateObject().Select(response => response.Name).Order());
            Assert.False(responses.GetProperty("401").TryGetProperty("content", out _));
            Assert.True(responses.GetProperty(method == "post" && id == "CreateReservation" ? "201" : "200").GetProperty("content").TryGetProperty("application/json", out _));
        }

        foreach ((string path, string method, string id, _) in expected)
        {
            JsonElement operation = paths.GetProperty(path).GetProperty(method);
            JsonElement responses = operation.GetProperty("responses");
            JsonElement body = responses.GetProperty(id == "CreateReservation" ? "201" : "200").GetProperty("content").GetProperty("application/json").GetProperty("schema");
            string responseType = id switch
            {
                "GetAvailability" => "Availability",
                "ListNotifications" => "InboxEntry",
                "ListEquipment" or "GetEquipment" => "EquipmentItem",
                _ => "Reservation"
            };
            if (id is "ListEquipment" or "ListReservations" or "ListNotifications")
            {
                Assert.Equal("array", body.GetProperty("type").GetString());
                body = body.GetProperty("items");
            }

            Assert.Equal("#/components/schemas/" + responseType, body.GetProperty("$ref").GetString());
            if (path.Contains("{id}", StringComparison.Ordinal))
            {
                JsonElement parameter = Assert.Single(operation.GetProperty("parameters").EnumerateArray());
                Assert.Equal("id", parameter.GetProperty("name").GetString());
                Assert.Equal("path", parameter.GetProperty("in").GetString());
                Assert.True(parameter.GetProperty("required").GetBoolean());
                Assert.Equal("string", parameter.GetProperty("schema").GetProperty("type").GetString());
            }

            if (method == "get")
            {
                Assert.False(operation.TryGetProperty("requestBody", out _));
            }

            if (id == "CancelReservation")
            {
                Assert.False(operation.TryGetProperty("requestBody", out _));
            }

            if (id == "CreateReservation")
            {
                JsonElement inputBody = operation.GetProperty("requestBody");
                Assert.True(inputBody.GetProperty("required").GetBoolean());
                Assert.Equal("#/components/schemas/ReservationInput", inputBody.GetProperty("content").GetProperty("application/json").GetProperty("schema").GetProperty("$ref").GetString());
            }

            if (method == "get")
            {
                Assert.False(responses.GetProperty("403").TryGetProperty("content", out _));
            }
            else
            {
                Assert.True(responses.GetProperty("403").GetProperty("content").TryGetProperty("application/problem+json", out _));
                string forbidden = responses.GetProperty("403").GetProperty("description").GetString()!;
                Assert.Contains("no body", forbidden, StringComparison.OrdinalIgnoreCase);
                Assert.Contains("browser", forbidden, StringComparison.OrdinalIgnoreCase);
            }

            foreach (JsonProperty response in responses.EnumerateObject().Where(response => response.Name is not ("200" or "201" or "401" or "403")))
            {
                Assert.True(response.Value.GetProperty("content").TryGetProperty("application/problem+json", out _));
            }

            if (service == "Inventory")
            {
                Assert.Contains(operation.GetProperty("security").EnumerateArray(), requirement => requirement.TryGetProperty("ServiceBearer", out _));
            }
        }

        JsonElement schemas = root.GetProperty("components").GetProperty("schemas");
        string[] describedModels = service switch
        {
            "Inventory" => ["EquipmentItem", "ProblemDetails"],
            "Notifications" => ["InboxEntry", "ProblemDetails"],
            _ => ["ReservationInput", "Reservation", "Availability", "ProblemDetails"]
        };
        foreach (string model in describedModels)
        {
            JsonElement schema = schemas.GetProperty(model);
            AssertDescription(schema, model);
            foreach (JsonProperty property in schema.GetProperty("properties").EnumerateObject())
            {
                AssertDescription(property.Value, model + "." + property.Name);
            }
        }

        JsonElement problem = schemas.GetProperty("ProblemDetails");
        Assert.True(problem.GetProperty("properties").TryGetProperty("code", out _));
        Assert.True(problem.GetProperty("properties").TryGetProperty("field", out _));
        if (problem.TryGetProperty("required", out JsonElement requiredProblemFields))
        {
            Assert.DoesNotContain(requiredProblemFields.EnumerateArray(), value => value.GetString() is "code" or "field");
        }
        string shape = service switch
        {
            "Inventory" => "EquipmentItem",
            "Notifications" => "InboxEntry",
            _ => "Reservation"
        };
        string[] properties = service switch
        {
            "Inventory" => ["id", "name", "operational"],
            "Notifications" => ["eventId", "reservationId", "userKey", "equipmentId", "equipmentName", "eventType", "startAt", "endAt", "occurredAt", "receivedAt", "message"],
            _ => ["id", "userKey", "equipmentId", "equipmentName", "startAt", "endAt", "status", "confirmedAt", "cancelledAt", "confirmationEventId", "cancellationEventId"]
        };
        Assert.Equal(properties.Order(), schemas.GetProperty(shape).GetProperty("properties").EnumerateObject().Select(property => property.Name).Order());
        if (service == "Reservations")
        {
            JsonElement reservationProperties = schemas.GetProperty("Reservation").GetProperty("properties");
            foreach (string field in new[] { "cancelledAt", "cancellationEventId" })
            {
                Assert.Contains("null", reservationProperties.GetProperty(field).GetProperty("description").GetString(), StringComparison.OrdinalIgnoreCase);
            }
            Assert.Contains("advisory", schemas.GetProperty("Availability").GetProperty("properties").GetProperty("advisory").GetProperty("description").GetString(), StringComparison.OrdinalIgnoreCase);
            JsonElement input = schemas.GetProperty("ReservationInput");
            foreach (string field in new[] { "startAt", "endAt" })
            {
                string description = input.GetProperty("properties").GetProperty(field).GetProperty("description").GetString()!;
                Assert.Contains("offset", description, StringComparison.OrdinalIgnoreCase);
                Assert.Contains("six", description, StringComparison.OrdinalIgnoreCase);
            }
            Assert.Equal(InputFields, input.GetProperty("required").EnumerateArray().Select(value => value.GetString()).Order());
            Assert.False(input.GetProperty("additionalProperties").GetBoolean());
            JsonElement availability = paths.GetProperty("/api/availability").GetProperty("get");
            Assert.Equal(InputFields, availability.GetProperty("parameters").EnumerateArray().Select(value => value.GetProperty("name").GetString()).Order());
            Assert.All(availability.GetProperty("parameters").EnumerateArray(), parameter => Assert.True(parameter.GetProperty("required").GetBoolean()));
            Assert.True(paths.GetProperty("/api/reservations").GetProperty("post").GetProperty("responses").GetProperty("201").GetProperty("headers").TryGetProperty("Location", out _));
        }

        foreach (JsonProperty property in schemas.GetProperty(shape).GetProperty("properties").EnumerateObject())
        {
            JsonElement types = property.Value.GetProperty("type");
            bool nullable = property.Name is "cancelledAt" or "cancellationEventId";
            if (nullable)
            {
                Assert.Contains(types.EnumerateArray(), type => type.GetString() == "null");
            }
            else
            {
                Assert.Equal(property.Name == "operational" ? "boolean" : "string", types.GetString());
            }

            if (property.Name.EndsWith("At", StringComparison.Ordinal))
            {
                Assert.Equal("date-time", property.Value.GetProperty("format").GetString());
            }
        }

        if (service == "Reservations")
        {
            Assert.Equal(AvailabilityFields, schemas.GetProperty("Availability").GetProperty("properties").EnumerateObject().Select(property => property.Name).Order());
            foreach (JsonElement parameter in paths.GetProperty("/api/availability").GetProperty("get").GetProperty("parameters").EnumerateArray())
            {
                Assert.Equal("query", parameter.GetProperty("in").GetString());
                Assert.Equal("string", parameter.GetProperty("schema").GetProperty("type").GetString());
            }
        }

        JsonElement oauth = root.GetProperty("components").GetProperty("securitySchemes").GetProperty("DocumentationOAuth");
        Assert.Equal("oauth2", oauth.GetProperty("type").GetString());
        Assert.True(oauth.GetProperty("flows").GetProperty("authorizationCode").GetProperty("scopes").TryGetProperty("openid", out _));
        Assert.All(paths.EnumerateObject(), path => Assert.StartsWith("/api/", path.Name));
    }

    private static void AssertDescription(JsonElement element, string location)
    {
        Assert.True(element.TryGetProperty("description", out JsonElement description)
            && !string.IsNullOrWhiteSpace(description.GetString()), $"Missing description for {location}.");
    }
}
