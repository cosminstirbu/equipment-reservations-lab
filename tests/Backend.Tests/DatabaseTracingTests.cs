using System.Diagnostics;
using System.Net;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Npgsql;
using OpenTelemetry.Trace;
using Xunit;

namespace Backend.Tests;

[Collection("PostgreSQL")]
public sealed class DatabaseTracingTests(PostgresFixture postgres)
{
    [Fact]
    public async Task EquipmentListExportsNativeDatabaseChildThroughProductionRegistration()
    {
        await using NpgsqlDataSource fixture = await postgres.CreateMigratedDatabaseAsync("inventory");
        using var capture = new DatabaseTelemetryCapture();
        using WebApplicationFactory<Inventory.Program> host = capture.App<Inventory.Program>("inventory", postgres.ConnectionStringFor(fixture));
        host.UseKestrel(0);
        using HttpClient client = host.CreateClient();
        _ = host.Services.GetRequiredService<TracerProvider>();
        using var controlSource = new ActivitySource("Equipment.Reservations");
        using (Activity? control = controlSource.StartActivity("capture.control"))
        {
            Assert.NotNull(control);
        }

        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/api/equipment")).StatusCode);
        await host.DisposeAsync();
        Assert.Null(capture.Spans.Failure);

        DatabaseSpan query = Assert.Single(capture.Spans.Values, span => span.Source == "Npgsql" && span.Kind == ActivityKind.Client && !span.OperationName.StartsWith("CONNECT", StringComparison.Ordinal));
        DatabaseSpan request = Assert.Single(capture.Spans.Values, span => span.Kind == ActivityKind.Server && span.SpanId == query.ParentSpanId);
        Assert.Equal(request.TraceId, query.TraceId);
        Assert.True(query.Duration > TimeSpan.Zero);
        Assert.NotEqual(ActivityStatusCode.Error, query.Status);
    }

    [Fact]
    public async Task BookingCancellationReadsAndHandledConflictExportEveryCommandUnderTheirWorkflow()
    {
        await using NpgsqlDataSource fixture = await postgres.CreateMigratedDatabaseAsync("reservations");
        using var capture = new DatabaseTelemetryCapture();
        using WebApplicationFactory<Reservations.Program> host = capture.App<Reservations.Program>("reservations", postgres.ConnectionStringFor(fixture))
            .WithWebHostBuilder(builder => builder.ConfigureServices(services =>
            {
                _ = services.RemoveAll<TimeProvider>();
                _ = services.AddSingleton<TimeProvider>(new TestTimeProvider(new DateTimeOffset(2030, 1, 1, 0, 0, 0, TimeSpan.Zero)));
                _ = services.AddHttpClient("inventory").ConfigurePrimaryHttpMessageHandler(() => new InventoryBoundary());
            }));
        using HttpClient client = host.CreateClient();
        var input = new
        {
            equipmentId = "camera-001",
            startAt = "2030-01-02T12:00:00Z",
            endAt = "2030-01-02T13:00:00Z"
        };
        using HttpResponseMessage response = await client.PostAsJsonAsync("/api/reservations", input);
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        BookedReservation booked = (await response.Content.ReadFromJsonAsync<BookedReservation>())!;
        Assert.Equal(HttpStatusCode.Conflict, (await client.PostAsJsonAsync("/api/reservations", input)).StatusCode);
        Assert.True((await client.GetAsync("/api/reservations")).IsSuccessStatusCode);
        Assert.True((await client.GetAsync("/api/reservations/" + booked.Id)).IsSuccessStatusCode);
        Assert.True((await client.GetAsync("/api/availability?equipmentId=camera-001&startAt=2030-01-02T12:00:00Z&endAt=2030-01-02T13:00:00Z")).IsSuccessStatusCode);
        Assert.True((await client.PostAsync("/api/reservations/" + booked.Id + "/cancel", null)).IsSuccessStatusCode);
        _ = await client.GetAsync("/health");
        await host.DisposeAsync();

        string[] expected = ["reservation.insert", "outbox.insert.confirmed", "reservation.list", "reservation.find", "reservation.available", "reservation.lock", "reservation.cancel", "outbox.insert.cancelled", "database.health"];
        foreach (string operation in expected)
        {
            Assert.Contains(capture.Spans.Values, span => span.Source == "Npgsql" && Equals(span.Tags.GetValueOrDefault("db.operation.name"), operation));
        }

        DatabaseSpan failed = Assert.Single(capture.Spans.Values, span => span.Source == "Npgsql" && span.Status == ActivityStatusCode.Error);
        Assert.Equal("23P01", failed.Tags["error.type"]);
        DatabaseSpan booking = Assert.Single(capture.Spans.Values, span => span.Name == "reservation.book" && span.Status != ActivityStatusCode.Error);
        Assert.Equal(2, capture.Spans.Values.Count(span => span.Source == "Npgsql" && span.ParentSpanId == booking.SpanId && !span.Name.Contains("connect", StringComparison.Ordinal)));
        Assert.All(capture.Spans.Values.Where(span => span.Source == "Npgsql"), span => Assert.True(span.Duration > TimeSpan.Zero));
    }

    [Fact]
    public async Task InventoryHandledDatabaseFailurePreserves503AndExportsSafeFailure()
    {
        await using NpgsqlDataSource fixture = await postgres.CreateMigratedDatabaseAsync("inventory");
        await using (NpgsqlCommand remove = fixture.CreateCommand("DROP TABLE equipment"))
        {
            _ = await remove.ExecuteNonQueryAsync();
        }

        using var capture = new DatabaseTelemetryCapture();
        using WebApplicationFactory<Inventory.Program> host = capture.App<Inventory.Program>("inventory", postgres.ConnectionStringFor(fixture));
        using HttpClient client = host.CreateClient();
        Assert.Equal(HttpStatusCode.ServiceUnavailable, (await client.GetAsync("/api/equipment")).StatusCode);
        await host.DisposeAsync();
        DatabaseSpan failed = Assert.Single(capture.Spans.Values, span => span.Source == "Npgsql" && span.Status == ActivityStatusCode.Error);
        Assert.Equal("42P01", failed.Tags["error.type"]);
    }
}
