using System.Collections.Concurrent;
using System.Diagnostics;
using System.Diagnostics.Metrics;
using System.Net;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using Npgsql;
using Xunit;

namespace Reservations.Tests;

// The activity and meter listeners observe process-wide sources. All cases in
// this class assert those signals and therefore run exclusively in this process.
[TestClass(DisableParallelization = true)]
[Collection("Database telemetry and recovery")]
public sealed class ReservationEndpointFailureTests(PostgresFixture postgres)
{
    [Fact]
    public async Task OutboxSchemaFailureRollsBackBookingAndReportsSafeFailureUntilRepaired()
    {
        using var deadline = new CancellationTokenSource(TimeSpan.FromSeconds(60));
        await using BookingScenario scenario = await BookingScenario.CreateAsync(postgres);
        using var signals = new FailureSignals();
        await using NpgsqlCommand breakSchema = scenario.Database.CreateCommand("ALTER TABLE reservation_outbox RENAME TO unavailable_outbox");
        _ = await breakSchema.ExecuteNonQueryAsync(deadline.Token);
        try
        {
            using HttpResponseMessage response = await scenario.BookAsync();
            await AssertProblemAsync(response, HttpStatusCode.InternalServerError, "unexpected_error", deadline.Token);
            signals.AssertFailure("book", "unexpected_error", "permanent_error");
            Assert.Equal(0L, await scenario.CountAsync("reservations"));
            await using NpgsqlCommand pending = scenario.Database.CreateCommand("SELECT count(*) FROM unavailable_outbox");
            Assert.Equal(0L, (long)(await pending.ExecuteScalarAsync(deadline.Token))!);
        }
        finally
        {
            await using NpgsqlCommand repair = scenario.Database.CreateCommand("ALTER TABLE unavailable_outbox RENAME TO reservation_outbox");
            _ = await repair.ExecuteNonQueryAsync(deadline.Token);
        }

        using HttpResponseMessage recovered = await scenario.BookAsync();
        Assert.Equal(HttpStatusCode.Created, recovered.StatusCode);
        Assert.Equal(1L, await scenario.CountAsync("reservations"));
        Assert.Equal(1L, await scenario.CountAsync("reservation_outbox"));
    }

    [Fact]
    public async Task UnreachablePostgresReturnsSafeStorageProblemAndDatabaseFailureTelemetry()
    {
        using var deadline = new CancellationTokenSource(TimeSpan.FromSeconds(30));
        using var signals = new FailureSignals();
        // The real Npgsql client attempts a connection to an isolated missing socket.
        // No provider exception is manufactured by a request stream or a delegate.
        await using var unavailable = NpgsqlDataSource.Create($"Host=/private/tmp/reservations-missing-{Guid.NewGuid():N};Timeout=1;Pooling=false");
        using WebApplicationFactory<Program> app = PostgresFixture.Factory<Program>(unavailable);
        using HttpClient client = app.CreateClient();

        using HttpResponseMessage response = await client.GetAsync("/api/reservations", deadline.Token);

        await AssertProblemAsync(response, HttpStatusCode.ServiceUnavailable, "persistence_unavailable", deadline.Token);
        signals.AssertFailure("list", "persistence_unavailable", "unavailable");
    }

    [Fact]
    public async Task RequestBudgetCancelsRealBlockedDatabaseWorkAndConnectionRecovers()
    {
        using var deadline = new CancellationTokenSource(TimeSpan.FromSeconds(45));
        await using NpgsqlDataSource database = await postgres.CreateMigratedDatabaseAsync("reservations");
        var settings = new NpgsqlConnectionStringBuilder(postgres.ConnectionStringFor(database))
        {
            // Let the production request budget, rather than the driver's command
            // timeout, cancel the statement while PostgreSQL waits on the table lock.
            CommandTimeout = 0
        };
        await using var requestDatabase = NpgsqlDataSource.Create(settings.ConnectionString);
        using WebApplicationFactory<Program> app = PostgresFixture.Factory<Program>(requestDatabase);
        using HttpClient client = app.CreateClient();
        using var signals = new FailureSignals();
        await using NpgsqlConnection connection = await database.OpenConnectionAsync(deadline.Token);
        await using NpgsqlTransaction transaction = await connection.BeginTransactionAsync(deadline.Token);
        await using var lockTable = new NpgsqlCommand("LOCK TABLE reservations IN ACCESS EXCLUSIVE MODE", connection, transaction);
        _ = await lockTable.ExecuteNonQueryAsync(deadline.Token);
        try
        {
            using HttpResponseMessage response = await client.GetAsync("/api/reservations", deadline.Token);
            await AssertProblemAsync(response, HttpStatusCode.ServiceUnavailable, "persistence_unavailable", deadline.Token);
            signals.AssertFailure("list", "persistence_unavailable", "cancelled");
        }
        finally
        {
            await transaction.RollbackAsync(deadline.Token);
        }

        using HttpResponseMessage recovered = await client.GetAsync("/api/reservations", deadline.Token);
        Assert.Equal(HttpStatusCode.OK, recovered.StatusCode);
        using JsonDocument history = await JsonDocument.ParseAsync(await recovered.Content.ReadAsStreamAsync(deadline.Token), cancellationToken: deadline.Token);
        Assert.Empty(history.RootElement.EnumerateArray());
    }

    private static async Task AssertProblemAsync(HttpResponseMessage response, HttpStatusCode status, string code, CancellationToken cancellationToken)
    {
        Assert.Equal(status, response.StatusCode);
        string body = await response.Content.ReadAsStringAsync(cancellationToken);
        using var problem = JsonDocument.Parse(body);
        Assert.Equal(code, problem.RootElement.GetProperty("code").GetString());
        Assert.DoesNotContain("unavailable_outbox", body);
        Assert.DoesNotContain("reservations-missing-", body);
        Assert.DoesNotContain("Npgsql", body);
    }

    private sealed class FailureSignals : IDisposable
    {
        private readonly ConcurrentQueue<Activity> activities = new();
        private readonly ConcurrentQueue<KeyValuePair<string, object?>[]> dependencies = new();
        private readonly ActivityListener traces;
        private readonly MeterListener metrics = new();

        public FailureSignals()
        {
            traces = new ActivityListener
            {
                ShouldListenTo = source => source.Name == "Equipment.Reservations",
                Sample = (ref _) => ActivitySamplingResult.AllDataAndRecorded,
                ActivityStopped = activities.Enqueue
            };
            ActivitySource.AddActivityListener(traces);
            metrics.InstrumentPublished = (instrument, listener) =>
            {
                if (instrument.Meter.Name == "Equipment.Reservations" && instrument.Name == "reservation.dependency.outcomes")
                {
                    listener.EnableMeasurementEvents(instrument);
                }
            };
            metrics.SetMeasurementEventCallback<long>((_, _, tags, _) => dependencies.Enqueue(tags.ToArray()));
            metrics.Start();
        }

        public void AssertFailure(string operation, string code, string databaseOutcome)
        {
            Activity activity = Assert.Single(activities, activity => activity.OperationName == "reservation." + operation);
            Assert.Equal(ActivityStatusCode.Error, activity.Status);
            Assert.Equal(code, activity.StatusDescription);
            Assert.Contains(dependencies, tags =>
                tags.Any(tag => tag.Key == "dependency" && Equals(tag.Value, "database"))
                && tags.Any(tag => tag.Key == "outcome" && Equals(tag.Value, databaseOutcome)));
        }

        public void Dispose()
        {
            traces.Dispose();
            metrics.Dispose();
        }
    }
}
