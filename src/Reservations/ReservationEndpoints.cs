using System.Diagnostics;
using ApiDocumentation;
using IdentityAccess;
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
            .Accepts<ReservationInput>("application/json");

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
            .DescribeBusinessOperation<Availability>("GetAvailability", "Check equipment availability", "Availability", "Validated human identity; no additional role required. Exactly equipmentId, startAt and endAt query strings; start before end and not past.", 200, 400, 404, 500, 503);

        _ = app.MapPost("/api/reservations/{id}/cancel", (HttpRequest request, string id, ReservationStore store) =>
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
            .DescribeBusinessOperation<Reservation>("CancelReservation", "Cancel my reservation", "Reservations", "Employee role required. Nonempty GUID id. Empty or JSON null body only; authorization 403 is empty, browser guard 403 returns Problem Details.", 200, 400, 404, 409, 413, 500, 503);

        _ = app.MapGet("/api/reservations", (HttpRequest request, ReservationStore store) =>
            ExecuteAsync(request, "list", async cancellationToken => Results.Ok(await ReservationTelemetry.DatabaseAsync(token => store.ListAsync(IdentityPrincipal.UserKey(request.HttpContext.User), token), cancellationToken))))
            .RequireAuthorization(IdentityAuthentication.Employee)
            .DescribeBusinessOperation<Reservation[]>("ListReservations", "List my reservations", "Reservations", "Employee role required.", 200, 400, 500, 503);

        _ = app.MapGet("/api/reservations/{id}", (HttpRequest request, string id, ReservationStore store) =>
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
            .DescribeBusinessOperation<Reservation>("GetReservation", "Find my reservation", "Reservations", "Employee role required. Nonempty GUID id.", 200, 400, 404, 500, 503);
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
