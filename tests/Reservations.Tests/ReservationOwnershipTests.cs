using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text.Json;
using Xunit;

namespace Reservations.Tests;

[Collection("Application behavior")]
public sealed class ReservationOwnershipTests(PostgresFixture postgres)
{
    [Fact]
    public async Task HistoryAndDetailBelongOnlyToValidatedIssuerAndSubject()
    {
        await using BookingScenario scenario = await BookingScenario.CreateAsync(postgres);
        using HttpClient other = scenario.ClientFor("employee-b-subject");
        using HttpResponseMessage created = await scenario.BookAsync();
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        JsonElement reservation = await created.Content.ReadFromJsonAsync<JsonElement>(cancellationToken: TestContext.Current.CancellationToken);
        Guid id = reservation.GetProperty("id").GetGuid();
        string expected = Convert.ToHexStringLower(SHA256.HashData(JsonSerializer.SerializeToUtf8Bytes(new[] { IdentityAuthorityFixture.Issuer, IdentityAuthorityFixture.EmployeeSubject })));
        Assert.Equal(expected, reservation.GetProperty("userKey").GetString());
        JsonElement own = await scenario.Client.GetFromJsonAsync<JsonElement>("/api/reservations", cancellationToken: TestContext.Current.CancellationToken);
        Assert.Equal(id, Assert.Single(own.EnumerateArray()).GetProperty("id").GetGuid());
        JsonElement foreign = await other.GetFromJsonAsync<JsonElement>("/api/reservations", cancellationToken: TestContext.Current.CancellationToken);
        Assert.Empty(foreign.EnumerateArray());
        Assert.True(JsonElement.DeepEquals(reservation, await scenario.Client.GetFromJsonAsync<JsonElement>($"/api/reservations/{id}", cancellationToken: TestContext.Current.CancellationToken)));
        Assert.Equal(1L, await scenario.CountAsync("reservations"));
        Assert.Equal(1L, await scenario.CountAsync("reservation_outbox"));
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task ForeignAndUnknownReservationHaveIdenticalNotFoundResponses(bool cancel)
    {
        await using BookingScenario scenario = await BookingScenario.CreateAsync(postgres);
        using HttpClient other = scenario.ClientFor("employee-b-subject");
        BookedReservation reservation = (await (await scenario.BookAsync()).Content.ReadFromJsonAsync<BookedReservation>(cancellationToken: TestContext.Current.CancellationToken))!;
        string suffix = cancel ? "/cancel" : "";
        using HttpResponseMessage foreign = cancel
            ? await other.PostAsync($"/api/reservations/{reservation.Id}{suffix}", null, TestContext.Current.CancellationToken) : await other.GetAsync($"/api/reservations/{reservation.Id}", TestContext.Current.CancellationToken);
        using HttpResponseMessage unknown = cancel
            ? await other.PostAsync($"/api/reservations/{Guid.NewGuid()}{suffix}", null, TestContext.Current.CancellationToken) : await other.GetAsync($"/api/reservations/{Guid.NewGuid()}", TestContext.Current.CancellationToken);
        Assert.Equal(HttpStatusCode.NotFound, foreign.StatusCode);
        Assert.Equal(unknown.StatusCode, foreign.StatusCode);
        JsonElement missingProblem = await unknown.Content.ReadFromJsonAsync<JsonElement>(cancellationToken: TestContext.Current.CancellationToken);
        JsonElement foreignProblem = await foreign.Content.ReadFromJsonAsync<JsonElement>(cancellationToken: TestContext.Current.CancellationToken);
        foreach (string field in new[] { "type", "title", "status", "code" })
        {
            Assert.True(JsonElement.DeepEquals(missingProblem.GetProperty(field), foreignProblem.GetProperty(field)));
        }

        Assert.False(string.IsNullOrEmpty(missingProblem.GetProperty("traceId").GetString()));
        Assert.False(string.IsNullOrEmpty(foreignProblem.GetProperty("traceId").GetString()));
        Assert.Equal(reservation, await scenario.Client.GetFromJsonAsync<BookedReservation>($"/api/reservations/{reservation.Id}", cancellationToken: TestContext.Current.CancellationToken));
        Assert.Equal(1L, await scenario.CountAsync("reservation_outbox"));
    }

    [Theory]
    [InlineData("Approver")]
    [InlineData("EquipmentStaff")]
    [InlineData("")]
    public async Task OtherHumanRolesSeeBooleanAvailabilityButCannotUseReservationPaths(string role)
    {
        await using BookingScenario scenario = await BookingScenario.CreateAsync(postgres);
        BookedReservation reservation = (await (await scenario.BookAsync()).Content.ReadFromJsonAsync<BookedReservation>(cancellationToken: TestContext.Current.CancellationToken))!;
        using HttpClient reader = scenario.App.CreateClient();
        reader.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", IdentityAuthorityFixture.Shared.Token(subject: "other-human", roles: role.Length == 0 ? [] : [role]));
        using HttpResponseMessage availability = await reader.GetAsync("/api/availability?equipmentId=camera-001&startAt=2030-01-02T12:00:00Z&endAt=2030-01-02T13:00:00Z", TestContext.Current.CancellationToken);
        Assert.Equal(HttpStatusCode.OK, availability.StatusCode);
        JsonElement advisory = await availability.Content.ReadFromJsonAsync<JsonElement>(cancellationToken: TestContext.Current.CancellationToken);
        Assert.False(advisory.GetProperty("available").GetBoolean());
        Assert.Equal(5, advisory.EnumerateObject().Count());
        Assert.Equal(HttpStatusCode.Forbidden, (await reader.GetAsync("/api/reservations", TestContext.Current.CancellationToken)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await reader.GetAsync($"/api/reservations/{reservation.Id}", TestContext.Current.CancellationToken)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await reader.PostAsync($"/api/reservations/{reservation.Id}/cancel", null, TestContext.Current.CancellationToken)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await reader.PostAsJsonAsync("/api/reservations", new
        {
            equipmentId = "laptop-001",
            startAt = "2030-01-02T12:00:00Z",
            endAt = "2030-01-02T13:00:00Z"
        }, cancellationToken: TestContext.Current.CancellationToken)).StatusCode);
        Assert.Equal(1L, await scenario.CountAsync("reservations"));
        Assert.Equal(1L, await scenario.CountAsync("reservation_outbox"));
    }

    [Fact]
    public async Task ExplicitCombinedEmployeeRoleCanBookOnlyItsOwnHistory()
    {
        await using BookingScenario scenario = await BookingScenario.CreateAsync(postgres);
        using HttpClient combined = scenario.App.CreateClient();
        combined.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", IdentityAuthorityFixture.Shared.Token(subject: "combined-human", roles: ["Employee", "Approver", "EquipmentStaff"]));
        Assert.Equal(HttpStatusCode.Created, (await combined.PostAsJsonAsync("/api/reservations", new
        {
            equipmentId = "camera-001",
            startAt = "2030-01-02T12:00:00Z",
            endAt = "2030-01-02T13:00:00Z"
        }, cancellationToken: TestContext.Current.CancellationToken)).StatusCode);
        JsonElement own = await combined.GetFromJsonAsync<JsonElement>("/api/reservations", cancellationToken: TestContext.Current.CancellationToken);
        _ = Assert.Single(own.EnumerateArray());
        JsonElement other = await scenario.Client.GetFromJsonAsync<JsonElement>("/api/reservations", cancellationToken: TestContext.Current.CancellationToken);
        Assert.Empty(other.EnumerateArray());
    }

    [Theory]
    [InlineData("body")]
    [InlineData("header")]
    [InlineData("query")]
    [InlineData("cancel")]
    public async Task ForgedOwnerInputsAreRejectedByActualRoutesWithoutEffects(string vector)
    {
        await using BookingScenario scenario = await BookingScenario.CreateAsync(postgres);
        BookedReservation reservation = (await (await scenario.BookAsync()).Content.ReadFromJsonAsync<BookedReservation>(cancellationToken: TestContext.Current.CancellationToken))!;
        using HttpClient other = scenario.ClientFor("employee-b-subject");
        if (vector == "header")
        {
            other.DefaultRequestHeaders.Add("X-User-Key", "forged");
        }

        using HttpResponseMessage response = vector switch
        {
            "body" => await other.PostAsJsonAsync("/api/reservations", new { equipmentId = "laptop-001", startAt = "2030-01-02T12:00:00Z", endAt = "2030-01-02T13:00:00Z", userKey = "forged" }, cancellationToken: TestContext.Current.CancellationToken),
            "cancel" => await other.PostAsJsonAsync($"/api/reservations/{reservation.Id}/cancel", new { userKey = "forged" }, cancellationToken: TestContext.Current.CancellationToken),
            "query" => await other.GetAsync("/api/reservations?userKey=forged", TestContext.Current.CancellationToken),
            _ => await other.GetAsync($"/api/reservations/{reservation.Id}", TestContext.Current.CancellationToken)
        };
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal(reservation, await scenario.Client.GetFromJsonAsync<BookedReservation>($"/api/reservations/{reservation.Id}", cancellationToken: TestContext.Current.CancellationToken));
        Assert.Equal(1L, await scenario.CountAsync("reservations"));
        Assert.Equal(1L, await scenario.CountAsync("reservation_outbox"));
    }
}
