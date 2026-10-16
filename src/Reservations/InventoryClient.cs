using System.Diagnostics;
using System.Net;
using System.Net.Http.Headers;
using System.Text.Json;
using IdentityAccess;
using ReservationMessaging;

namespace Reservations;

public sealed class InventoryClient(IHttpClientFactory clients, ServiceTokenClient tokens)
{
    public async Task<string> OperationalNameAsync(string equipmentId, CancellationToken cancellationToken)
    {
        long started = Stopwatch.GetTimestamp();
        string outcome = "available";
        using var budget = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        budget.CancelAfter(TimeSpan.FromSeconds(3));
        try
        {
            using HttpClient client = clients.CreateClient("inventory");
            var target = new Uri(client.BaseAddress ?? throw new HttpRequestException("Inventory unavailable."), "/api/equipment/" + equipmentId);
            using var request = new HttpRequestMessage(HttpMethod.Get, target);
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", await tokens.GetTokenAsync(target, budget.Token));
            using HttpResponseMessage response = await client.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, budget.Token);
            if (response.StatusCode == HttpStatusCode.NotFound)
            {
                throw new ReservationProblemException(404, "equipment_not_found", "Equipment was not found.", "equipmentId");
            }

            _ = response.EnsureSuccessStatusCode();
            await using Stream stream = await response.Content.ReadAsStreamAsync(budget.Token);
            byte[] body = await ReservationValidation.ReadBoundedAsync(stream, budget.Token);
            InventoryItem? item = JsonSerializer.Deserialize(body, ReservationsJsonContext.Default.InventoryItem);
            if (item is null || item.Id != equipmentId || !EquipmentIdValidation.IsEquipmentId(item.Id)
                || string.IsNullOrWhiteSpace(item.Name) || item.Name.Length > 256 || item.Operational is null)
            {
                throw new HttpRequestException("Invalid Inventory contract");
            }

            EnsureOperational(item.Operational.Value);
            return item.Name;
        }
        catch (ReservationProblemException problem) when (problem.Status == 413)
        {
            outcome = "unavailable";
            throw new ReservationProblemException(503, "inventory_unavailable", "Inventory returned an unusable response. No reservation was created.");
        }
        catch (Exception exception) when (exception is HttpRequestException or IOException or JsonException
            || (exception is OperationCanceledException && !cancellationToken.IsCancellationRequested))
        {
            outcome = "unavailable";
            throw new ReservationProblemException(503, "inventory_unavailable", "Inventory is unavailable. No reservation was created; try again later.");
        }
        catch (OperationCanceledException)
        {
            outcome = "cancelled";
            throw;
        }
        finally
        {
            ReservationTelemetry.Dependency("inventory", outcome, started);
        }
    }

    private static void EnsureOperational(bool operational)
    {
        if (!operational)
        {
            throw new ReservationProblemException(400, "equipment_not_operational", "This equipment is not operational.", "equipmentId");
        }
    }
}
