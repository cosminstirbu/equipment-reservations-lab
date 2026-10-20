using System.ComponentModel;
using System.Diagnostics;
using ApiDocumentation;
using IdentityAccess;
using Microsoft.OpenApi;
using Npgsql;

namespace Reservations;

internal static class ReservationEndpoints
{
    public static void MapReservations(this WebApplication app)
    {
        _ = app.MapPost("/api/reservations", (HttpRequest request, InventoryClient inventory, ReservationStore store, TimeProvider time) =>
            ExecuteAsync(request, "book", async cancellationToken =>
            {
                ReservationInput? input = await ReservationValidation.ReadRequestAsync(request, cancellationToken);
                ReservationInterval interval = ReservationValidation.Interval(input, time);
                string equipmentName = await inventory.OperationalNameAsync(interval.EquipmentId, cancellationToken);
                string userKey = IdentityPrincipal.UserKey(request.HttpContext.User);
                Reservation result = await ReservationTelemetry.DatabaseAsync(token => store.ConfirmAsync(interval, equipmentName, userKey, token), cancellationToken);
                return Results.Created($"/api/reservations/{result.Id}", result);
            })).RequireAuthorization(IdentityAuthentication.Employee)
            .DescribeBusinessOperation<Reservation>("CreateReservation", "Reserve equipment", "Reservations", "Employee role required. JSON body limited to 4 KiB; no duplicate, additional or ownership fields; timestamps require an explicit offset and at most six fractional digits, start before end and not past. Authorization 403 is empty; browser guard 403 returns Problem Details.", 201, 400, 404, 409, 413, 415, 500, 503)
            .Accepts<ReservationInput>("application/json")
            .AddOpenApiOperationTransformer((operation, _, _) =>
            {
                operation.RequestBody!.Description = "The equipment and interval to reserve. Supply exactly equipmentId, startAt and endAt as non-null strings; JSON is limited to 4 KiB. Duplicate, additional and ownership fields are rejected.";
                operation.Responses!["201"].Description = "The confirmed reservation belonging to the caller; Location identifies its relative API URL.";
                ((OpenApiResponse)operation.Responses["201"]).Headers = new Dictionary<string, IOpenApiHeader>
                {
                    ["Location"] = new OpenApiHeader { Description = "Relative URL of the created reservation.", Schema = new OpenApiSchema { Type = JsonSchemaType.String } }
                };
                operation.Responses["400"].Description = "The JSON fields, interval or caller-supplied ownership fields are invalid, or equipment is not operational; returns Problem Details.";
                operation.Responses["401"].Description = "Authentication is missing or invalid; the response has no body.";
                operation.Responses["403"].Description = "Authorization denial has no body; browser-write rejection may return Problem Details.";
                ((OpenApiResponse)operation.Responses["403"]).Content = new Dictionary<string, OpenApiMediaType>
                {
                    ["application/problem+json"] = new OpenApiMediaType { Schema = operation.Responses["400"].Content!["application/problem+json"].Schema }
                };
                operation.Responses["404"].Description = "The equipment was not found; returns Problem Details.";
                operation.Responses["409"].Description = "The interval conflicts with a confirmed reservation; returns Problem Details.";
                operation.Responses["413"].Description = "The request exceeds the 4 KiB limit; returns Problem Details.";
                operation.Responses["415"].Description = "The request is not application/json; returns Problem Details.";
                operation.Responses["500"].Description = "An unexpected reservation storage error occurred; refresh history before retrying a write. Returns Problem Details.";
                operation.Responses["503"].Description = "Equipment or reservation storage is unavailable; refresh history before retrying a write. Returns Problem Details.";
                return Task.CompletedTask;
            });

        _ = app.MapGet("/api/availability", (HttpRequest request, InventoryClient inventory, ReservationStore store, TimeProvider time) =>
            ExecuteAsync(request, "availability", async cancellationToken =>
            {
                if (request.Query.Keys.Any(key => key is not ("equipmentId" or "startAt" or "endAt")))
                {
                    throw new ReservationProblemException(400, "invalid_request", "Use equipmentId, startAt and endAt query fields.");
                }

                var input = new ReservationInput(request.Query["equipmentId"], request.Query["startAt"], request.Query["endAt"]);
                ReservationInterval interval = ReservationValidation.Interval(input, time);
                _ = await inventory.OperationalNameAsync(interval.EquipmentId, cancellationToken);
                bool available = await ReservationTelemetry.DatabaseAsync(token => store.AvailableAsync(interval, token), cancellationToken);
                return Results.Ok(new Availability(interval.EquipmentId, interval.StartAt, interval.EndAt, available));
            })).RequireAuthorization(IdentityAuthentication.Human)
            .DescribeBusinessOperation<Availability>("GetAvailability", "Check equipment availability", "Availability", "Checks an interval without locking or reserving equipment; the result is advisory. Validated human identity; no additional role required. Exactly equipmentId, startAt and endAt query strings; start before end and not past.", 200, 400, 404, 500, 503)
            .AddOpenApiOperationTransformer((operation, _, _) =>
            {
                operation.Parameters =
                [
                    new OpenApiParameter { Name = "equipmentId", In = ParameterLocation.Query, Required = true, Description = "Valid equipment identifier. No additional query fields are accepted.", Schema = new OpenApiSchema { Type = JsonSchemaType.String } },
                    new OpenApiParameter { Name = "startAt", In = ParameterLocation.Query, Required = true, Description = "Inclusive start: ISO8601 with explicit timezone offset and at most six fractional digits; not past and before endAt.", Schema = new OpenApiSchema { Type = JsonSchemaType.String } },
                    new OpenApiParameter { Name = "endAt", In = ParameterLocation.Query, Required = true, Description = "Exclusive end: ISO8601 with explicit timezone offset and at most six fractional digits; after startAt.", Schema = new OpenApiSchema { Type = JsonSchemaType.String } }
                ];
                operation.Responses!["200"].Description = "Advisory equipment availability for the requested interval; no reservation is created.";
                operation.Responses["400"].Description = "The query fields, interval or caller-supplied ownership fields are invalid, or equipment is not operational; returns Problem Details.";
                operation.Responses["401"].Description = "Authentication is missing or invalid; the response has no body.";
                operation.Responses["403"].Description = "The identity is not permitted to check availability; the response has no body.";
                operation.Responses["404"].Description = "The equipment was not found; returns Problem Details.";
                operation.Responses["500"].Description = "An unexpected reservation storage error occurred; returns Problem Details.";
                operation.Responses["503"].Description = "Equipment or reservation storage is unavailable; returns Problem Details.";
                return Task.CompletedTask;
            });

        _ = app.MapPost("/api/reservations/{id}/cancel", (HttpRequest request, [Description("Nonempty GUID identifying a reservation owned by the authenticated caller.")] string id, ReservationStore store) =>
            ExecuteAsync(request, "cancel", async cancellationToken =>
            {
                if (!Guid.TryParse(id, out Guid reservationId) || reservationId == Guid.Empty)
                {
                    throw new ReservationProblemException(400, "invalid_request", "Use a valid reservation identifier.");
                }

                string userKey = IdentityPrincipal.UserKey(request.HttpContext.User);
                Reservation result = await ReservationTelemetry.DatabaseAsync(token => store.CancelAsync(reservationId, userKey, token), cancellationToken);
                return Results.Ok(result);
            })).RequireAuthorization(IdentityAuthentication.Employee)
            .DescribeBusinessOperation<Reservation>("CancelReservation", "Cancel my reservation", "Reservations", "Cancels the caller's reservation before its start; repeating a completed cancellation returns the cancelled reservation. Employee role required. Nonempty GUID id. Empty or JSON null body only; authorization 403 is empty, browser guard 403 returns Problem Details.", 200, 400, 404, 409, 413, 500, 503)
            .AddOpenApiOperationTransformer((operation, _, _) =>
            {
                operation.Responses!["200"].Description = "The caller's cancelled reservation, including an already completed cancellation.";
                operation.Responses["400"].Description = "The identifier, body or caller-supplied ownership fields are invalid; returns Problem Details.";
                operation.Responses["401"].Description = "Authentication is missing or invalid; the response has no body.";
                operation.Responses["403"].Description = "Authorization denial has no body; browser-write rejection may return Problem Details.";
                ((OpenApiResponse)operation.Responses["403"]).Content = new Dictionary<string, OpenApiMediaType>
                {
                    ["application/problem+json"] = new OpenApiMediaType { Schema = operation.Responses["400"].Content!["application/problem+json"].Schema }
                };
                operation.Responses["404"].Description = "The reservation does not exist or belongs to another owner; returns Problem Details.";
                operation.Responses["409"].Description = "The reservation has started and cannot be cancelled; returns Problem Details.";
                operation.Responses["413"].Description = "The request exceeds the 4 KiB limit; returns Problem Details.";
                operation.Responses["500"].Description = "An unexpected reservation storage error occurred; refresh history before retrying a write. Returns Problem Details.";
                operation.Responses["503"].Description = "Reservation storage is unavailable; refresh history before retrying a write. Returns Problem Details.";
                return Task.CompletedTask;
            });

        _ = app.MapGet("/api/reservations", (HttpRequest request, ReservationStore store) =>
            ExecuteAsync(request, "list", async cancellationToken => Results.Ok(await ReservationTelemetry.DatabaseAsync(token => store.ListAsync(IdentityPrincipal.UserKey(request.HttpContext.User), token), cancellationToken))))
            .RequireAuthorization(IdentityAuthentication.Employee)
            .DescribeBusinessOperation<Reservation[]>("ListReservations", "List my reservations", "Reservations", "Returns only reservations belonging to the authenticated caller, including confirmed and cancelled reservations. Employee role required.", 200, 400, 500, 503)
            .AddOpenApiOperationTransformer((operation, _, _) =>
            {
                operation.Responses!["200"].Description = "The caller's reservation history; the array may be empty.";
                operation.Responses["400"].Description = "Caller-supplied ownership fields are rejected with Problem Details.";
                operation.Responses["401"].Description = "Authentication is missing or invalid; the response has no body.";
                operation.Responses["403"].Description = "The identity lacks the Employee role; the response has no body.";
                operation.Responses["500"].Description = "An unexpected reservation storage error occurred; returns Problem Details.";
                operation.Responses["503"].Description = "Reservation storage is unavailable; returns Problem Details.";
                return Task.CompletedTask;
            });

        _ = app.MapGet("/api/reservations/{id}", (HttpRequest request, [Description("Nonempty GUID identifying a reservation owned by the authenticated caller.")] string id, ReservationStore store) =>
            ExecuteAsync(request, "get", async cancellationToken =>
            {
                if (!Guid.TryParse(id, out Guid reservationId) || reservationId == Guid.Empty)
                {
                    throw new ReservationProblemException(400, "invalid_request", "Use a valid reservation identifier.");
                }

                string userKey = IdentityPrincipal.UserKey(request.HttpContext.User);
                Reservation result = await ReservationTelemetry.DatabaseAsync(token => store.FindAsync(reservationId, userKey, token), cancellationToken)
                    ?? throw new ReservationProblemException(404, "reservation_not_found", "Reservation was not found.");

                return Results.Ok(result);
            })).RequireAuthorization(IdentityAuthentication.Employee)
            .DescribeBusinessOperation<Reservation>("GetReservation", "Find my reservation", "Reservations", "Returns a reservation only when it belongs to the authenticated caller. Employee role required. Nonempty GUID id.", 200, 400, 404, 500, 503)
            .AddOpenApiOperationTransformer((operation, _, _) =>
            {
                operation.Responses!["200"].Description = "The reservation matching the identifier and authenticated owner.";
                operation.Responses["400"].Description = "The identifier is invalid or caller-supplied ownership fields are present; returns Problem Details.";
                operation.Responses["401"].Description = "Authentication is missing or invalid; the response has no body.";
                operation.Responses["403"].Description = "The identity lacks the Employee role; the response has no body.";
                operation.Responses["404"].Description = "The reservation does not exist or belongs to another owner; returns Problem Details.";
                operation.Responses["500"].Description = "An unexpected reservation storage error occurred; returns Problem Details.";
                operation.Responses["503"].Description = "Reservation storage is unavailable; returns Problem Details.";
                return Task.CompletedTask;
            });
    }

    private static async Task<IResult> ExecuteAsync(HttpRequest request, string operationName, Func<CancellationToken, Task<IResult>> operation)
    {
        using Activity? activity = ReservationTelemetry.Activities.StartActivity("reservation." + operationName);
        var watch = Stopwatch.StartNew();
        string outcome = "error";
        ILogger<Program> logger = request.HttpContext.RequestServices.GetRequiredService<ILogger<Program>>();
        using var budget = CancellationTokenSource.CreateLinkedTokenSource(request.HttpContext.RequestAborted);
        budget.CancelAfter(TimeSpan.FromSeconds(8));
        try
        {
            IResult result = await operation(budget.Token);
            outcome = operationName switch
            {
                "book" => "created",
                "cancel" => "cancelled",
                _ => "success"
            };
            ReservationLog.Completed(logger, operationName, outcome);
            return result;
        }
        catch (ReservationProblemException problem)
        {
            outcome = problem.Code;
            _ = (activity?.SetStatus(ActivityStatusCode.Error, outcome));
            ReservationLog.Rejected(logger, operationName, outcome);
            return Problem(problem);
        }
        catch (BadHttpRequestException exception) when (exception.StatusCode == 413)
        {
            outcome = "invalid_request";
            _ = (activity?.SetStatus(ActivityStatusCode.Error, outcome));
            ReservationLog.Rejected(logger, operationName, outcome);
            return Problem(new ReservationProblemException(413, "invalid_request", "Request exceeds the 4 KiB limit."));
        }
        catch (PostgresException)
        {
            outcome = "unexpected_error";
            _ = (activity?.SetStatus(ActivityStatusCode.Error, outcome));
            ReservationLog.Rejected(logger, operationName, outcome);
            return Problem(new ReservationProblemException(500, "unexpected_error", "Reservation operation failed. Refresh history before trying a write again."));
        }
        catch (Exception exception) when (exception is NpgsqlException
            || (exception is OperationCanceledException && !request.HttpContext.RequestAborted.IsCancellationRequested))
        {
            outcome = "persistence_unavailable";
            _ = (activity?.SetStatus(ActivityStatusCode.Error, outcome));
            ReservationLog.Rejected(logger, operationName, outcome);
            return Problem(new ReservationProblemException(503, "persistence_unavailable", "Reservation storage is unavailable. Refresh history before trying a write again."));
        }
        finally
        {
            ReservationTelemetry.Record(operationName, outcome, watch.Elapsed.TotalMilliseconds);
        }
    }

    private static IResult Problem(ReservationProblemException problem)
    {
        return Results.Problem(statusCode: problem.Status, title: problem.Message,
            extensions: new Dictionary<string, object?> { ["code"] = problem.Code, ["field"] = problem.Field });
    }
}
