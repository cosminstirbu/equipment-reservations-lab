using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using Npgsql;
using Xunit;

namespace Backend.Tests;

[Collection("PostgreSQL")]
public sealed class CancellationTests(PostgresFixture postgres)
{
    [Fact]
    public async Task FutureCancellationPersistsSnapshotsReleasesAllocationAndDoesNotCallInventory()
    {
        await using BookingScenario scenario = await BookingScenario.CreateAsync(postgres);
        BookedReservation original = (await (await scenario.BookAsync()).Content.ReadFromJsonAsync<BookedReservation>())!;
        int inventoryCalls = scenario.Inventory.Calls;
        HttpResponseMessage response = await CancelAsync(scenario, original.Id);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        BookedReservation cancelled = (await response.Content.ReadFromJsonAsync<BookedReservation>())!;
        Assert.Equal(original with
        {
            Status = "Cancelled",
            CancelledAt = scenario.Clock.Now,
            CancellationEventId = cancelled.CancellationEventId
        }, cancelled);
        _ = Assert.NotNull(cancelled.CancellationEventId);
        Assert.NotEqual(Guid.Empty, cancelled.CancellationEventId);
        Assert.NotEqual(cancelled.ConfirmationEventId, cancelled.CancellationEventId);
        Assert.Equal(inventoryCalls, scenario.Inventory.Calls);
        Assert.Equal(1L, await scenario.CountAsync("reservations"));
        Assert.Equal(2L, await scenario.CountAsync("reservation_outbox"));

        using WebApplicationFactory<Reservations.Program> restarted = PostgresFixture.Factory<Reservations.Program>(scenario.Database);
        using HttpClient client = restarted.CreateClient();
        Assert.Equal(cancelled, await client.GetFromJsonAsync<BookedReservation>($"/api/reservations/{original.Id}"));
        Assert.Equal(cancelled, Assert.Single((await client.GetFromJsonAsync<BookedReservation[]>("/api/reservations"))!));
        Assert.Equal(HttpStatusCode.Created, (await scenario.BookAsync()).StatusCode);
        Assert.Equal(2, (await scenario.Client.GetFromJsonAsync<BookedReservation[]>("/api/reservations"))!.Length);
    }

    [Theory]
    [InlineData(-1, HttpStatusCode.OK)]
    [InlineData(0, HttpStatusCode.Conflict)]
    [InlineData(1, HttpStatusCode.Conflict)]
    public async Task OnlyBeforeStartCanConfirmedReservationTransition(int microsecondsFromStart, HttpStatusCode expected)
    {
        await using BookingScenario scenario = await BookingScenario.CreateAsync(postgres);
        BookedReservation original = (await (await scenario.BookAsync()).Content.ReadFromJsonAsync<BookedReservation>())!;
        scenario.Clock.Now = original.StartAt.AddTicks(microsecondsFromStart * 10);
        HttpResponseMessage response = await CancelAsync(scenario, original.Id);
        Assert.Equal(expected, response.StatusCode);
        BookedReservation stored = (await scenario.Client.GetFromJsonAsync<BookedReservation>($"/api/reservations/{original.Id}"))!;
        if (expected == HttpStatusCode.OK)
        {
            Assert.Equal("Cancelled", stored.Status);
            Assert.Equal(scenario.Clock.Now, stored.CancelledAt);
            Assert.Equal(2L, await scenario.CountAsync("reservation_outbox"));
            return;
        }

        using var problem = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("cancellation_started", problem.RootElement.GetProperty("code").GetString());
        Assert.Equal(original, stored);
        Assert.Equal(1L, await scenario.CountAsync("reservation_outbox"));
    }

    [Fact]
    public async Task RepeatedCancelledRequestsAfterOriginalStartReturnIdenticalTransition()
    {
        await using BookingScenario scenario = await BookingScenario.CreateAsync(postgres);
        BookedReservation original = (await (await scenario.BookAsync()).Content.ReadFromJsonAsync<BookedReservation>())!;
        HttpResponseMessage first = await CancelAsync(scenario, original.Id);
        Assert.Equal(HttpStatusCode.OK, first.StatusCode);
        BookedReservation cancelled = (await first.Content.ReadFromJsonAsync<BookedReservation>())!;
        scenario.Clock.Now = original.EndAt.AddDays(2);
        HttpResponseMessage repeated = await CancelAsync(scenario, original.Id);
        Assert.Equal(HttpStatusCode.OK, repeated.StatusCode);
        Assert.Equal(cancelled, await repeated.Content.ReadFromJsonAsync<BookedReservation>());
        Assert.Equal(2L, await scenario.CountAsync("reservation_outbox"));
    }

    [Theory]
    [InlineData("bad-id", HttpStatusCode.BadRequest, "invalid_request")]
    [InlineData("00000000-0000-0000-0000-000000000000", HttpStatusCode.BadRequest, "invalid_request")]
    [InlineData("f0b1fa66-d883-4cc8-917c-68fc35a52a51", HttpStatusCode.NotFound, "reservation_not_found")]
    public async Task MissingOrMalformedReservationHasSafeErrorAndNoEffects(string id, HttpStatusCode expected, string code)
    {
        await using BookingScenario scenario = await BookingScenario.CreateAsync(postgres);
        HttpResponseMessage response = await scenario.Client.PostAsync($"/api/reservations/{id}/cancel", null);
        Assert.Equal(expected, response.StatusCode);
        using var problem = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal(code, problem.RootElement.GetProperty("code").GetString());
        Assert.Equal(0, scenario.Inventory.Calls);
        Assert.Equal(0L, await scenario.CountAsync("reservations"));
        Assert.Equal(0L, await scenario.CountAsync("reservation_outbox"));
    }

    [Fact]
    public async Task FailedCancellationEventInsertRollsBackStateAndRetainsAllocation()
    {
        await using BookingScenario scenario = await BookingScenario.CreateAsync(postgres);
        BookedReservation original = (await (await scenario.BookAsync()).Content.ReadFromJsonAsync<BookedReservation>())!;
        await using NpgsqlCommand trigger = scenario.Database.CreateCommand("CREATE FUNCTION reject_cancellation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.event_type='ReservationCancelled' THEN RAISE EXCEPTION 'controlled failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER reject_cancellation BEFORE INSERT ON reservation_outbox FOR EACH ROW EXECUTE FUNCTION reject_cancellation()");
        _ = await trigger.ExecuteNonQueryAsync();
        HttpResponseMessage response = await CancelAsync(scenario, original.Id);
        Assert.Equal(HttpStatusCode.InternalServerError, response.StatusCode);
        Assert.Equal(original, await scenario.Client.GetFromJsonAsync<BookedReservation>($"/api/reservations/{original.Id}"));
        Assert.Equal(1L, await scenario.CountAsync("reservation_outbox"));
        Assert.Equal(HttpStatusCode.Conflict, (await scenario.BookAsync()).StatusCode);
    }

    [Fact]
    public async Task HistoryKeepsBothStatusesInConfirmedAtDescendingThenIdOrder()
    {
        await using BookingScenario scenario = await BookingScenario.CreateAsync(postgres);
        var originals = new List<BookedReservation>();
        foreach (string equipment in new[] { "camera-001", "laptop-001" })
        {
            originals.Add((await (await scenario.BookAsync(equipment: equipment)).Content.ReadFromJsonAsync<BookedReservation>())!);
        }

        scenario.Clock.Now = scenario.Clock.Now.AddSeconds(1);
        originals.Add((await (await scenario.BookAsync("2030-01-03T12:00:00Z", "2030-01-03T13:00:00Z")).Content.ReadFromJsonAsync<BookedReservation>())!);
        Assert.Equal(HttpStatusCode.OK, (await CancelAsync(scenario, originals[0].Id)).StatusCode);
        BookedReservation[] history = (await scenario.Client.GetFromJsonAsync<BookedReservation[]>("/api/reservations"))!;
        Assert.Equal(originals.OrderByDescending(item => item.ConfirmedAt).ThenBy(item => item.Id).Select(item => item.Id), history.Select(item => item.Id));
        Assert.Contains(history, item => item.Status == "Cancelled");
        Assert.Contains(history, item => item.Status == "Confirmed");
    }

    internal static Task<HttpResponseMessage> CancelAsync(BookingScenario scenario, Guid id)
    {
        return scenario.Client.PostAsync($"/api/reservations/{id}/cancel", null);
    }
}
