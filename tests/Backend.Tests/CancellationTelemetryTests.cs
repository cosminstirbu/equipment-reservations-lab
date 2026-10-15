using System.Diagnostics;
using System.Diagnostics.Metrics;
using System.Net;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Npgsql;
using Xunit;

namespace Backend.Tests;

[Collection("PostgreSQL")]
public sealed class CancellationTelemetryTests(PostgresFixture postgres)
{
    private static readonly string[] DimensionKeys = ["operation", "outcome"];

    [Fact]
    public async Task CancellationProducesCorrelatedSavedOutcomeAndSafeGeneratedLogs()
    {
        var outcomes = new List<KeyValuePair<string, object?>[]>();
        var activities = new List<Activity>();
        var logs = new CapturedLogs();
        using var metrics = new MeterListener();
        metrics.InstrumentPublished = (instrument, listener) =>
        {
            if (instrument.Meter.Name == "Equipment.Reservations" && instrument.Name == "reservation.outcomes")
            {
                listener.EnableMeasurementEvents(instrument);
            }
        };
        metrics.SetMeasurementEventCallback<long>((_, _, tags, _) => outcomes.Add(tags.ToArray()));
        metrics.Start();
        using var traces = new ActivityListener
        {
            ShouldListenTo = source => source.Name == "Equipment.Reservations",
            Sample = (ref options) => ActivitySamplingResult.AllDataAndRecorded,
            ActivityStopped = activity => activities.Add(activity)
        };
        ActivitySource.AddActivityListener(traces);
        await using BookingScenario scenario = await BookingScenario.CreateAsync(postgres);
        BookedReservation original = (await (await scenario.BookAsync()).Content.ReadFromJsonAsync<BookedReservation>())!;
        using WebApplicationFactory<Reservations.Program> observed = scenario.App.WithWebHostBuilder(builder => builder.ConfigureServices(services =>
        {
            _ = services.AddLogging(logging => logging.AddProvider(logs));
        }));
        using HttpClient client = observed.CreateClient();
        HttpResponseMessage response = await client.PostAsync($"/api/reservations/{original.Id}/cancel", null);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        BookedReservation cancelled = (await response.Content.ReadFromJsonAsync<BookedReservation>())!;
        Assert.Contains(outcomes, tags => tags.Any(tag => tag.Key == "operation" && Equals(tag.Value, "cancel")) && tags.Any(tag => tag.Key == "outcome" && Equals(tag.Value, "cancelled")));
        Assert.All(outcomes, tags => Assert.All(tags, tag => Assert.Contains(tag.Key, DimensionKeys)));
        Activity activity = Assert.Single(activities, item => item.OperationName == "reservation.cancel");
        Assert.NotNull(activity.ParentId);
        Assert.Equal(cancelled.Id.ToString(), activity.GetTagItem("reservation.id")?.ToString());
        Assert.Equal(cancelled.CancellationEventId.ToString(), activity.GetTagItem("reservation.event_id")?.ToString());
        await using NpgsqlCommand context = scenario.Database.CreateCommand("SELECT traceparent FROM reservation_outbox WHERE event_id=$1");
        _ = context.Parameters.AddWithValue(cancelled.CancellationEventId!.Value);
        Assert.Equal(activity.Id, await context.ExecuteScalarAsync());
        Assert.Contains(logs.Messages, message => message.Contains("cancel completed (cancelled)", StringComparison.Ordinal));
        Assert.DoesNotContain(logs.Messages, message => message.Contains("secret", StringComparison.Ordinal) || message.Contains("startAt", StringComparison.Ordinal));
    }

    private sealed class CapturedLogs : ILoggerProvider
    {
        public List<string> Messages { get; } = [];

        public ILogger CreateLogger(string categoryName)
        {
            return new Capture(Messages);
        }

        public void Dispose()
        {
        }

        private sealed class Capture(List<string> messages) : ILogger
        {
            public IDisposable? BeginScope<TState>(TState state) where TState : notnull
            {
                return null;
            }

            public bool IsEnabled(LogLevel logLevel)
            {
                return true;
            }

            public void Log<TState>(LogLevel logLevel, EventId eventId, TState state, Exception? exception, Func<TState, Exception?, string> formatter)
            {
                messages.Add(formatter(state, exception));
            }
        }
    }
}
