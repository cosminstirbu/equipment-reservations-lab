using System.Diagnostics;
using Npgsql;
using Xunit;

namespace Reservations.Tests;

[Collection("Application behavior")]
public sealed class UntracedCancellationTests(PostgresFixture postgres)
{
    [Fact]
    public async Task CancellationAndIdempotentRetryPersistWithoutAnAmbientActivity()
    {
        await using NpgsqlDataSource database = await postgres.CreateMigratedDatabaseAsync("reservations");
        var clock = new TestTimeProvider(new DateTimeOffset(2030, 1, 1, 12, 0, 0, TimeSpan.Zero));
        var store = new ReservationStore(database, clock);
        var interval = new ReservationInterval("camera-001", clock.Now.AddDays(1), clock.Now.AddDays(1).AddHours(1));
        string userKey = new('a', 64);
        Activity? previous = Activity.Current;
        Activity.Current = null;
        try
        {
            Reservation original = await store.ConfirmAsync(interval, "Camera", userKey, TestContext.Current.CancellationToken);
            Reservation cancelled = await store.CancelAsync(original.Id, userKey, TestContext.Current.CancellationToken);
            Reservation retried = await store.CancelAsync(original.Id, userKey, TestContext.Current.CancellationToken);

            Assert.Equal("Cancelled", cancelled.Status);
            Assert.Equal(clock.Now, cancelled.CancelledAt);
            _ = Assert.NotNull(cancelled.CancellationEventId);
            Assert.Equal(cancelled, retried);
            Assert.Equal(cancelled, await store.FindAsync(original.Id, userKey, TestContext.Current.CancellationToken));
            await using NpgsqlCommand events = database.CreateCommand("SELECT count(*), bool_and(traceparent IS NULL AND tracestate IS NULL) FROM reservation_outbox");
            await using NpgsqlDataReader reader = await events.ExecuteReaderAsync(TestContext.Current.CancellationToken);
            Assert.True(await reader.ReadAsync(TestContext.Current.CancellationToken));
            Assert.Equal(2L, reader.GetInt64(0));
            Assert.True(reader.GetBoolean(1));
        }
        finally
        {
            Activity.Current = previous;
        }
    }
}
