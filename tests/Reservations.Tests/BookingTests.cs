using System.Net;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using Xunit;

namespace Reservations.Tests;

[Collection("Application behavior")]
public sealed class BookingTests(PostgresFixture postgres)
{
    [Fact]
    public async Task ValidBookingIsImmediatelyConfirmedAndSurvivesApiRestart()
    {
        await using BookingScenario scenario = await BookingScenario.CreateAsync(postgres);
        HttpResponseMessage response = await scenario.BookAsync("2030-01-02T14:00:00+02:00", "2030-01-02T15:00:00+02:00");
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        BookedReservation result = (await response.Content.ReadFromJsonAsync<BookedReservation>(cancellationToken: TestContext.Current.CancellationToken))!;
        Assert.Equal("Confirmed", result.Status);
        Assert.Matches("^[0-9a-f]{64}$", result.UserKey);
        Assert.Equal("Demo Camera", result.EquipmentName);
        Assert.Equal(DateTimeOffset.Parse("2030-01-02T12:00:00Z", System.Globalization.CultureInfo.InvariantCulture), result.StartAt);
        Assert.Equal(TimeSpan.Zero, result.StartAt.Offset);
        Assert.NotEqual(Guid.Empty, result.Id);
        Assert.NotEqual(Guid.Empty, result.ConfirmationEventId);
        Assert.Null(result.CancelledAt);
        Assert.Null(result.CancellationEventId);
        Assert.Equal($"/api/reservations/{result.Id}", response.Headers.Location!.OriginalString);
        Assert.Equal(1L, await scenario.CountAsync("reservations"));
        Assert.Equal(1L, await scenario.CountAsync("reservation_outbox"));

        using WebApplicationFactory<Program> restarted = PostgresFixture.Factory<Program>(scenario.Database);
        using HttpClient client = restarted.CreateClient();
        Assert.Equal(result, await client.GetFromJsonAsync<BookedReservation>($"/api/reservations/{result.Id}", cancellationToken: TestContext.Current.CancellationToken));
        Assert.Equal(result, Assert.Single((await client.GetFromJsonAsync<BookedReservation[]>("/api/reservations", cancellationToken: TestContext.Current.CancellationToken))!));
    }

    [Theory]
    [InlineData("2030-01-02T12:00:00", "2030-01-02T13:00:00Z", "invalid_request")]
    [InlineData("2030-01-02 12:00:00Z", "2030-01-02T13:00:00Z", "invalid_request")]
    [InlineData("2030-01-02T12:00:00.1234567Z", "2030-01-02T13:00:00Z", "invalid_request")]
    [InlineData("2030-01-02T12:00:00+24:00", "2030-01-02T13:00:00Z", "invalid_request")]
    [InlineData("0001-01-01T00:00:00Z", "2030-01-02T13:00:00Z", "invalid_request")]
    [InlineData("9999-12-31T23:59:59.9999999Z", "9999-12-31T23:59:59.9999999Z", "invalid_request")]
    [InlineData("2030-02-30T12:00:00Z", "2030-03-01T13:00:00Z", "invalid_request")]
    [InlineData("2030-01-02T12:00:00Z", "2030-01-02T12:00:00Z", "invalid_interval")]
    [InlineData("2030-01-02T13:00:00Z", "2030-01-02T12:00:00Z", "invalid_interval")]
    [InlineData("2030-01-01T11:59:59.999999Z", "2030-01-02T13:00:00Z", "start_in_past")]
    public async Task InvalidDatesHaveNoReservationOrEvent(string start, string end, string code)
    {
        await using BookingScenario scenario = await BookingScenario.CreateAsync(postgres);
        HttpResponseMessage response = await scenario.BookAsync(start, end);
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        using var problem = JsonDocument.Parse(await response.Content.ReadAsStringAsync(TestContext.Current.CancellationToken));
        Assert.Equal(code, problem.RootElement.GetProperty("code").GetString());
        Assert.Equal(0L, await scenario.CountAsync("reservations"));
        Assert.Equal(0L, await scenario.CountAsync("reservation_outbox"));
        Assert.Equal(0, scenario.Inventory.Calls);
    }

    [Theory]
    [InlineData("2030-01-01T12:00:00Z")]
    [InlineData("2030-01-02T12:00:00.123456Z")]
    public async Task ClockEqualityAndMicrosecondPrecisionAreAccepted(string start)
    {
        await using BookingScenario scenario = await BookingScenario.CreateAsync(postgres);
        Assert.Equal(HttpStatusCode.Created, (await scenario.BookAsync(start)).StatusCode);
    }

    [Theory]
    [InlineData("unknown", HttpStatusCode.NotFound, "equipment_not_found")]
    [InlineData("projector-001", HttpStatusCode.BadRequest, "equipment_not_operational")]
    [InlineData("bad id", HttpStatusCode.BadRequest, "invalid_request")]
    public async Task IneligibleEquipmentNeverAllocates(string id, HttpStatusCode expected, string code)
    {
        await using BookingScenario scenario = await BookingScenario.CreateAsync(postgres);
        HttpResponseMessage response = await scenario.BookAsync(equipment: id);
        Assert.Equal(expected, response.StatusCode);
        using var problem = JsonDocument.Parse(await response.Content.ReadAsStringAsync(TestContext.Current.CancellationToken));
        Assert.Equal(code, problem.RootElement.GetProperty("code").GetString());
        Assert.Equal(0L, await scenario.CountAsync("reservations"));
        Assert.Equal(0L, await scenario.CountAsync("reservation_outbox"));
    }

    [Theory]
    [InlineData("{")]
    [InlineData("null")]
    [InlineData("{}")]
    // lang=json
    [InlineData("{\"equipmentId\":\"camera-001\",\"startAt\":null,\"endAt\":\"2030-01-02T13:00:00Z\"}")]
    // lang=json
    [InlineData("{\"equipmentId\":\"camera-001\",\"startAt\":\"2030-01-02T12:00:00Z\",\"endAt\":\"2030-01-02T13:00:00Z\",\"demoUserId\":\"other\"}")]
    public async Task MalformedMissingAndUnexpectedFieldsAreRejected(string body)
    {
        await using BookingScenario scenario = await BookingScenario.CreateAsync(postgres);
        HttpResponseMessage response = await scenario.Client.PostAsync("/api/reservations", new StringContent(body, Encoding.UTF8, "application/json"), TestContext.Current.CancellationToken);
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal(0L, await scenario.CountAsync("reservations"));
        Assert.Equal(0L, await scenario.CountAsync("reservation_outbox"));
    }

    [Fact]
    public async Task OversizedBodyIsRejectedBeforeCallingInventory()
    {
        await using BookingScenario scenario = await BookingScenario.CreateAsync(postgres);
        HttpResponseMessage response = await scenario.Client.PostAsync("/api/reservations", new StringContent(new string('x', 4097), Encoding.UTF8, "application/json"), TestContext.Current.CancellationToken);
        Assert.Equal(HttpStatusCode.RequestEntityTooLarge, response.StatusCode);
        Assert.Equal(0, scenario.Inventory.Calls);
        Assert.Equal(0L, await scenario.CountAsync("reservations"));
    }

    [Theory]
    // lang=json
    [InlineData("{\"id\":\"different\",\"name\":\"Demo\",\"operational\":true}")]
    // lang=json
    [InlineData("{\"id\":\"camera-001\",\"name\":\"Demo\"}")]
    // lang=json
    [InlineData("{\"id\":\"camera-001\",\"name\":\"Demo\",\"operational\":\"yes\"}")]
    // lang=json
    [InlineData("{\"id\":\"camera-001\",\"name\":\"\",\"operational\":true}")]
    [InlineData("{")]
    public async Task UnusableInventoryResponsesFailSafelyWithoutAllocating(string body)
    {
        await using BookingScenario scenario = await BookingScenario.CreateAsync(postgres, new InventoryBoundary { ResponseBody = body });
        await AssertDependencyFailureAsync(scenario);
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task InventoryUnavailableOrTimeoutDoesNotRetryOrAllocate(bool stall)
    {
        await using BookingScenario scenario = await BookingScenario.CreateAsync(postgres, new InventoryBoundary { Unavailable = !stall, Stall = stall });
        await AssertDependencyFailureAsync(scenario);
    }

    [Fact]
    public async Task InventoryOversizedResponseFailsSafely()
    {
        await using BookingScenario scenario = await BookingScenario.CreateAsync(postgres, new InventoryBoundary { ResponseBody = new string('x', 4097) });
        await AssertDependencyFailureAsync(scenario);
    }

    [Fact]
    public async Task AvailabilityUsesUtcAndRemainsAdvisoryWithoutAllocating()
    {
        await using BookingScenario scenario = await BookingScenario.CreateAsync(postgres);
        HttpResponseMessage response = await scenario.AvailabilityAsync("2030-01-02T14:00:00+02:00", "2030-01-02T15:00:00+02:00");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        AvailabilityResult result = (await response.Content.ReadFromJsonAsync<AvailabilityResult>(cancellationToken: TestContext.Current.CancellationToken))!;
        Assert.True(result.Available);
        Assert.True(result.Advisory);
        Assert.Equal(TimeSpan.Zero, result.StartAt.Offset);
        Assert.Equal(0L, await scenario.CountAsync("reservations"));
        Assert.Equal(0L, await scenario.CountAsync("reservation_outbox"));
    }

    private static async Task AssertDependencyFailureAsync(BookingScenario scenario)
    {
        HttpResponseMessage response = await scenario.BookAsync();
        Assert.Equal(HttpStatusCode.ServiceUnavailable, response.StatusCode);
        string body = await response.Content.ReadAsStringAsync();
        Assert.DoesNotContain("secret", body);
        using var problem = JsonDocument.Parse(body);
        Assert.Equal("inventory_unavailable", problem.RootElement.GetProperty("code").GetString());
        Assert.Equal(1, scenario.Inventory.Calls);
        Assert.Equal(0L, await scenario.CountAsync("reservations"));
        Assert.Equal(0L, await scenario.CountAsync("reservation_outbox"));
    }
}
