using System.Net;
using System.Net.Http.Json;
using Npgsql;
using Xunit;

namespace Reservations.Tests;

[Collection("Application behavior")]
public sealed class CancellationConcurrencyTests(PostgresFixture postgres)
{
    [Fact]
    public async Task ForeignCancellationCannotJoinOwnersConcurrentIdempotentTransition()
    {
        await using BookingScenario scenario = await BookingScenario.CreateAsync(postgres);
        BookedReservation original = (await (await scenario.BookAsync()).Content.ReadFromJsonAsync<BookedReservation>(cancellationToken: TestContext.Current.CancellationToken))!;
        using HttpClient other = scenario.ClientFor("employee-b-subject");
        HttpResponseMessage[] responses = await Task.WhenAll(
            scenario.Client.PostAsync($"/api/reservations/{original.Id}/cancel", null, TestContext.Current.CancellationToken),
            other.PostAsync($"/api/reservations/{original.Id}/cancel", null, TestContext.Current.CancellationToken));
        Assert.Equal(HttpStatusCode.OK, responses[0].StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, responses[1].StatusCode);
        BookedReservation cancelled = (await responses[0].Content.ReadFromJsonAsync<BookedReservation>(cancellationToken: TestContext.Current.CancellationToken))!;
        scenario.Clock.Now = original.EndAt;
        Assert.Equal(cancelled, await (await scenario.Client.PostAsync($"/api/reservations/{original.Id}/cancel", null, TestContext.Current.CancellationToken)).Content.ReadFromJsonAsync<BookedReservation>(cancellationToken: TestContext.Current.CancellationToken));
        Assert.Equal(2L, await scenario.CountAsync("reservation_outbox"));
        Assert.Equal(1L, await scenario.CountAsync("reservations"));
    }

    [Fact]
    public async Task ConcurrentCancellationReturnsOneStableEventAndTimestamp()
    {
        await using BookingScenario scenario = await BookingScenario.CreateAsync(postgres);
        BookedReservation original = (await (await scenario.BookAsync()).Content.ReadFromJsonAsync<BookedReservation>(cancellationToken: TestContext.Current.CancellationToken))!;
        await using NpgsqlConnection blocker = await scenario.Database.OpenConnectionAsync(TestContext.Current.CancellationToken);
        await using NpgsqlTransaction transaction = await blocker.BeginTransactionAsync(TestContext.Current.CancellationToken);
        await using var locked = new NpgsqlCommand("SELECT id FROM reservations WHERE id=$1 FOR UPDATE", blocker, transaction);
        _ = locked.Parameters.AddWithValue(original.Id);
        _ = await locked.ExecuteScalarAsync(TestContext.Current.CancellationToken);
        using var deadline = new CancellationTokenSource(TimeSpan.FromSeconds(10));
        Task<HttpResponseMessage>[] requests = [.. Enumerable.Range(0, 6).Select(_ => scenario.Client.PostAsync($"/api/reservations/{original.Id}/cancel", null, deadline.Token))];
        await WaitForLockAsync(scenario, requests[0], deadline.Token, requests.Length);
        await transaction.CommitAsync(TestContext.Current.CancellationToken);
        HttpResponseMessage[] responses = await Task.WhenAll(requests);
        Assert.All(responses, response => Assert.Equal(HttpStatusCode.OK, response.StatusCode));
        BookedReservation[] results = await Task.WhenAll(responses.Select(async response => (await response.Content.ReadFromJsonAsync<BookedReservation>())!));
        Assert.All(results, result => Assert.Equal(results[0], result));
        Assert.Equal("Cancelled", results[0].Status);
        Assert.Equal(2L, await scenario.CountAsync("reservation_outbox"));
    }

    [Fact]
    public async Task CancellationSamplesClockAfterObtainingRowLock()
    {
        await using BookingScenario scenario = await BookingScenario.CreateAsync(postgres);
        BookedReservation original = (await (await scenario.BookAsync()).Content.ReadFromJsonAsync<BookedReservation>(cancellationToken: TestContext.Current.CancellationToken))!;
        await using NpgsqlConnection blocker = await scenario.Database.OpenConnectionAsync(TestContext.Current.CancellationToken);
        await using NpgsqlTransaction transaction = await blocker.BeginTransactionAsync(TestContext.Current.CancellationToken);
        await using var locked = new NpgsqlCommand("SELECT id FROM reservations WHERE id=$1 FOR UPDATE", blocker, transaction);
        _ = locked.Parameters.AddWithValue(original.Id);
        _ = await locked.ExecuteScalarAsync(TestContext.Current.CancellationToken);
        using var deadline = new CancellationTokenSource(TimeSpan.FromSeconds(10));
        Task<HttpResponseMessage> cancellation = scenario.Client.PostAsync($"/api/reservations/{original.Id}/cancel", null, deadline.Token);
        await WaitForLockAsync(scenario, cancellation, deadline.Token);
        scenario.Clock.Now = original.StartAt;
        await transaction.CommitAsync(TestContext.Current.CancellationToken);
        Assert.Equal(HttpStatusCode.Conflict, (await cancellation).StatusCode);
        Assert.Equal(original, await scenario.Client.GetFromJsonAsync<BookedReservation>($"/api/reservations/{original.Id}", cancellationToken: TestContext.Current.CancellationToken));
        Assert.Equal(1L, await scenario.CountAsync("reservation_outbox"));
    }

    [Fact]
    public async Task CompetingBookingCanSucceedOnlyAfterCancellationCommits()
    {
        await using BookingScenario scenario = await BookingScenario.CreateAsync(postgres);
        BookedReservation original = (await (await scenario.BookAsync()).Content.ReadFromJsonAsync<BookedReservation>(cancellationToken: TestContext.Current.CancellationToken))!;
        await using NpgsqlConnection gate = await scenario.Database.OpenConnectionAsync(TestContext.Current.CancellationToken);
        await using var gateLock = new NpgsqlCommand("SELECT pg_advisory_lock(780021)", gate);
        _ = await gateLock.ExecuteNonQueryAsync(TestContext.Current.CancellationToken);
        await using NpgsqlCommand trigger = scenario.Database.CreateCommand("CREATE FUNCTION pause_cancellation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.event_type='ReservationCancelled' THEN PERFORM pg_advisory_xact_lock(780021); END IF; RETURN NEW; END $$; CREATE TRIGGER pause_cancellation BEFORE INSERT ON reservation_outbox FOR EACH ROW EXECUTE FUNCTION pause_cancellation()");
        _ = await trigger.ExecuteNonQueryAsync(TestContext.Current.CancellationToken);
        using var deadline = new CancellationTokenSource(TimeSpan.FromSeconds(10));
        Task<HttpResponseMessage> cancellation = scenario.Client.PostAsync($"/api/reservations/{original.Id}/cancel", null, deadline.Token);
        await WaitForLockAsync(scenario, cancellation, deadline.Token);
        Assert.Equal("Confirmed", (await scenario.Client.GetFromJsonAsync<BookedReservation>($"/api/reservations/{original.Id}", cancellationToken: TestContext.Current.CancellationToken))!.Status);
        Task<HttpResponseMessage> booking = scenario.BookAsync();
        await WaitForLockAsync(scenario, booking, deadline.Token, 2);
        Assert.False(booking.IsCompleted, "New allocation must not complete while cancellation is uncommitted.");
        await using var release = new NpgsqlCommand("SELECT pg_advisory_unlock(780021)", gate);
        _ = await release.ExecuteNonQueryAsync(TestContext.Current.CancellationToken);
        Assert.Equal(HttpStatusCode.OK, (await cancellation).StatusCode);
        Assert.Equal(HttpStatusCode.Created, (await booking).StatusCode);
        BookedReservation[] history = (await scenario.Client.GetFromJsonAsync<BookedReservation[]>("/api/reservations", cancellationToken: TestContext.Current.CancellationToken))!;
        _ = Assert.Single(history, item => item.Status == "Confirmed");
        _ = Assert.Single(history, item => item.Status == "Cancelled");
        Assert.Equal(3L, await scenario.CountAsync("reservation_outbox"));
    }

    private static async Task WaitForLockAsync(BookingScenario scenario, Task<HttpResponseMessage> request, CancellationToken cancellationToken, int waiters = 1)
    {
        while (true)
        {
            Assert.False(request.IsCompleted, "Request completed instead of waiting for the controlled database lock.");
            await using NpgsqlCommand pending = scenario.Database.CreateCommand("SELECT count(*) FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock'");
            if ((long)(await pending.ExecuteScalarAsync(cancellationToken))! >= waiters)
            {
                return;
            }

            await Task.Delay(TimeSpan.FromMilliseconds(20), cancellationToken);
        }
    }
}
