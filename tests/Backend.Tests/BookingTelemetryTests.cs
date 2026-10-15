using System.Diagnostics;
using System.Diagnostics.Metrics;
using System.Net;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Xunit;

namespace Backend.Tests;

[Collection("PostgreSQL")]
public sealed class BookingTelemetryTests(PostgresFixture postgres)
{
    private static readonly string[] DimensionKeys = ["operation", "outcome"];

    [Fact]
    public async Task BookingAndConflictProduceCorrelatedBoundedOutcomeSignals()
    {
        var outcomes = new List<KeyValuePair<string, object?>[]>();
        var activities = new List<Activity>();
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
        Assert.Equal(HttpStatusCode.Created, (await scenario.BookAsync()).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await scenario.BookAsync()).StatusCode);
        Assert.Contains(outcomes, tags => tags.Any(tag => tag.Key == "outcome" && Equals(tag.Value, "created")));
        Assert.Contains(outcomes, tags => tags.Any(tag => tag.Key == "outcome" && Equals(tag.Value, "booking_conflict")));
        Assert.All(outcomes, tags => Assert.All(tags, tag => Assert.Contains(tag.Key, DimensionKeys)));
        Assert.Contains(activities, activity => activity.OperationName == "reservation.book" && activity.ParentId is not null);
        Assert.Contains(activities, activity => activity.Status == ActivityStatusCode.Error);
    }

    [Fact]
    public async Task HandledInventoryFailureIsObservableWithoutSecretOrPayloadLogging()
    {
        var logs = new CapturedLogs();
        await using BookingScenario scenario = await BookingScenario.CreateAsync(postgres, new InventoryBoundary { Unavailable = true });
        using WebApplicationFactory<Reservations.Program> observedApp = PostgresFixture.Factory<Reservations.Program>(scenario.Database).WithWebHostBuilder(builder => builder.ConfigureServices(services =>
        {
            _ = services.AddLogging(logging => logging.AddProvider(logs));
            _ = services.AddHttpClient("inventory", client => client.BaseAddress = new Uri("http://inventory"))
                .ConfigurePrimaryHttpMessageHandler(() => new InventoryBoundary { Unavailable = true });
        }));
        using HttpClient client = observedApp.CreateClient();
        HttpResponseMessage response = await client.PostAsJsonAsync("/api/reservations", new
        {
            equipmentId = "camera-001",
            startAt = "2030-01-02T12:00:00Z",
            endAt = "2030-01-02T13:00:00Z"
        });
        Assert.Equal(HttpStatusCode.ServiceUnavailable, response.StatusCode);
        Assert.Contains(logs.Messages, message => message.Contains("inventory_unavailable", StringComparison.Ordinal));
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
