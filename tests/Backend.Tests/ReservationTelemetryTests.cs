using System.Collections.Concurrent;
using System.Diagnostics;
using System.Diagnostics.Metrics;
using System.Net;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using HelloMessaging;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Logging;
using Notifications;
using Npgsql;
using Reservations;
using Xunit;

namespace Backend.Tests;

[Collection("PostgreSQL")]
public sealed class ReservationTelemetryTests(PostgresFixture postgres)
{
    private static readonly string[] DependencyDimensions = ["dependency", "outcome"];

    [Fact]
    public async Task SupplementarySavedWorkflowContextCorrelatesPublishAndCommittedConsumerSpans()
    {
        const string parent = "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01";
        var spans = new ConcurrentQueue<Activity>();
        using var listener = new ActivityListener
        {
            ShouldListenTo = source => source.Name is "Equipment.Reservations" or "Equipment.ReservationMessaging",
            Sample = (ref options) => ActivitySamplingResult.AllDataAndRecorded,
            ActivityStopped = activity => spans.Enqueue(activity)
        };
        ActivitySource.AddActivityListener(listener);
        await using BookingScenario scenario = await BookingScenario.CreateAsync(postgres);
        using var request = new HttpRequestMessage(HttpMethod.Post, "/api/reservations")
        {
            Content = JsonContent.Create(new { equipmentId = "camera-001", startAt = "2030-01-02T12:00:00Z", endAt = "2030-01-02T13:00:00Z" })
        };
        _ = request.Headers.TryAddWithoutValidation("traceparent", parent);
        using HttpResponseMessage response = await scenario.Client.SendAsync(request);
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        BookedReservation booked = (await response.Content.ReadFromJsonAsync<BookedReservation>())!;
        Activity workflow = Assert.Single(spans, span => span.OperationName == "reservation.book");
        Assert.Equal("4bf92f3577b34da6a3ce929d0e0e4736", workflow.TraceId.ToString());
        await using NpgsqlCommand saved = scenario.Database.CreateCommand("SELECT traceparent FROM reservation_outbox WHERE event_id=$1");
        _ = saved.Parameters.AddWithValue(booked.ConfirmationEventId);
        Assert.Equal(workflow.Id, await saved.ExecuteScalarAsync());

        var publisher = new AcceptedPublisher();
        using var schedule = new ObservedSchedule();
        using WebApplicationFactory<Reservations.Program> host = scenario.App.WithWebHostBuilder(builder =>
        {
            _ = builder.ConfigureAppConfiguration((context, configuration) => configuration.AddInMemoryCollection(new Dictionary<string, string?> { ["ConnectionStrings:messaging"] = "amqp://fixture:fixture@127.0.0.1:1/" }));
            _ = builder.ConfigureServices(services =>
            {
                _ = services.RemoveAll<IReservationPublisher>();
                _ = services.AddSingleton<IReservationPublisher>(publisher);
                _ = services.RemoveAll<IRecoverySchedule>();
                _ = services.AddSingleton<IRecoverySchedule>(schedule);
            });
        });
        using HttpClient publishing = host.CreateClient();
        await schedule.WaitAsync();
        (ReservationEvent message, string? context) = Assert.Single(publisher.Events);
        Assert.Equal(workflow.Id, context);
        Activity producer = Assert.Single(spans, span => span.OperationName == "reservation.publish");
        Assert.Equal(workflow.Id, producer.ParentId);
        Assert.Equal(workflow.TraceId, producer.TraceId);

        await using NpgsqlDataSource database = await postgres.CreateMigratedDatabaseAsync("notifications");
        var subscription = new ObservedSubscription("none", message, context);
        using WebApplicationFactory<Notifications.Program> consumer = PostgresFixture.Factory<Notifications.Program>(database).WithWebHostBuilder(builder => builder.ConfigureServices(services =>
        {
            _ = services.RemoveAll<IReservationSubscription>();
            _ = services.AddSingleton<IReservationSubscription>(subscription);
        }));
        using HttpClient reading = consumer.CreateClient();
        await subscription.Completed.Task.WaitAsync(TimeSpan.FromSeconds(10));
        Activity consumed = Assert.Single(spans, span => span.OperationName == "reservation.consume");
        Assert.Equal(workflow.Id, consumed.ParentId);
        Assert.Equal(workflow.TraceId, consumed.TraceId);
        Assert.Equal(message.EventId.ToString(), consumed.GetTagItem("event.id"));
        Assert.Equal(message.ReservationId.ToString(), consumed.GetTagItem("reservation.id"));
        Assert.Equal(ActivityStatusCode.Ok, consumed.Status);
        Assert.True(subscription.Acknowledged);
        Assert.Equal(message.EventId, Assert.Single((await reading.GetFromJsonAsync<InboxEntry[]>("/api/notifications"))!).EventId);
    }

    [Theory]
    [InlineData(false, "available")]
    [InlineData(true, "permanent_error")]
    public async Task OutboxSelectionMeasuresOwnDatabaseDependency(bool missingTable, string outcome)
    {
        using var capture = new Measurements();
        using var logs = new CapturedLogs();
        await using BookingScenario scenario = await BookingScenario.CreateAsync(postgres);
        if (missingTable)
        {
            await using NpgsqlCommand fault = scenario.Database.CreateCommand("ALTER TABLE reservation_outbox RENAME TO fixture_outbox");
            _ = await fault.ExecuteNonQueryAsync();
        }

        using var schedule = new ObservedSchedule();
        using WebApplicationFactory<Reservations.Program> host = scenario.App.WithWebHostBuilder(builder =>
        {
            _ = builder.ConfigureAppConfiguration((context, configuration) => configuration.AddInMemoryCollection(new Dictionary<string, string?> { ["ConnectionStrings:messaging"] = "amqp://fixture:fixture@127.0.0.1:1/" }));
            _ = builder.ConfigureServices(services =>
            {
                _ = services.RemoveAll<IRecoverySchedule>();
                _ = services.AddSingleton<IRecoverySchedule>(schedule);
                _ = services.AddLogging(logging => logging.AddProvider(logs));
            });
        });
        using HttpClient client = host.CreateClient();
        if (missingTable)
        {
            using var deadline = new CancellationTokenSource(TimeSpan.FromSeconds(10));
            while (!logs.Messages.Contains("Reservation delivery outbox outcome permanent_error"))
            {
                await Task.Delay(10, deadline.Token);
            }
        }
        else
        {
            await schedule.WaitAsync();
        }

        AssertDependency(capture, "database", outcome);
    }

    [Theory]
    [InlineData(false, "success", HttpStatusCode.OK)]
    [InlineData(true, "persistence_unavailable", HttpStatusCode.ServiceUnavailable)]
    public async Task PublicInboxReadHasCorrelatedOutcomeAndDependencySignals(bool missingTable, string outcome, HttpStatusCode status)
    {
        using var capture = new Measurements();
        using var logs = new CapturedLogs();
        var spans = new ConcurrentQueue<Activity>();
        using var listener = new ActivityListener
        {
            ShouldListenTo = source => source.Name == "Equipment.Notifications",
            Sample = (ref options) => ActivitySamplingResult.AllDataAndRecorded,
            ActivityStopped = activity => spans.Enqueue(activity)
        };
        ActivitySource.AddActivityListener(listener);
        await using NpgsqlDataSource database = await postgres.CreateMigratedDatabaseAsync("notifications");
        if (missingTable)
        {
            await using NpgsqlCommand fault = database.CreateCommand("ALTER TABLE reservation_inbox RENAME TO fixture_inbox");
            _ = await fault.ExecuteNonQueryAsync();
        }

        using WebApplicationFactory<Notifications.Program> host = PostgresFixture.Factory<Notifications.Program>(database).WithWebHostBuilder(builder => builder.ConfigureServices(services => services.AddLogging(logging => logging.AddProvider(logs))));
        using HttpClient client = host.CreateClient();
        Assert.Equal(status, (await client.GetAsync("/api/notifications")).StatusCode);
        Assert.Contains(logs.Messages, message => message == $"Reservation delivery list outcome {outcome}");
        Assert.DoesNotContain(logs.Messages, message => message.Contains("fixture_inbox", StringComparison.Ordinal));
        Assert.Contains(capture.Values, value => value.Name == "notification.outcomes" && value.Tags.Contains(new("outcome", outcome)));
        Assert.Contains(capture.Values, value => value.Name == "notification.duration" && value.Value >= 0);
        AssertDependency(capture, "database", missingTable ? "permanent_error" : "available");
        Activity span = Assert.Single(spans);
        Assert.Equal("notification.list", span.OperationName);
        Assert.NotNull(span.ParentId);
        Assert.Equal(missingTable ? ActivityStatusCode.Error : ActivityStatusCode.Ok, span.Status);
    }

    [Theory]
    [InlineData(false, "available", HttpStatusCode.OK)]
    [InlineData(true, "permanent_error", HttpStatusCode.InternalServerError)]
    public async Task HistoryMeasuresOwnDatabaseDependency(bool missingTable, string outcome, HttpStatusCode status)
    {
        using var capture = new Measurements();
        await using BookingScenario scenario = await BookingScenario.CreateAsync(postgres);
        if (missingTable)
        {
            await using NpgsqlCommand fault = scenario.Database.CreateCommand("ALTER TABLE reservations RENAME TO fixture_reservations");
            _ = await fault.ExecuteNonQueryAsync();
        }

        Assert.Equal(status, (await scenario.Client.GetAsync("/api/reservations")).StatusCode);
        AssertDependency(capture, "database", outcome);
    }

    [Theory]
    [InlineData(false, "available")]
    [InlineData(true, "unavailable")]
    public async Task OutboxMeasuresBrokerDependencyThroughPublicWorker(bool unavailable, string outcome)
    {
        using var capture = new Measurements();
        await using BookingScenario scenario = await BookingScenario.CreateAsync(postgres);
        _ = await scenario.BookAsync();
        using var schedule = new ObservedSchedule();
        using WebApplicationFactory<Reservations.Program> host = scenario.App.WithWebHostBuilder(builder =>
        {
            _ = builder.ConfigureAppConfiguration((context, configuration) => configuration.AddInMemoryCollection(new Dictionary<string, string?> { ["ConnectionStrings:messaging"] = "amqp://fixture:fixture@127.0.0.1:1/" }));
            _ = builder.ConfigureServices(services =>
            {
                _ = services.RemoveAll<IReservationPublisher>();
                _ = services.AddSingleton<IReservationPublisher>(new AcceptedPublisher(unavailable));
                _ = services.RemoveAll<IRecoverySchedule>();
                _ = services.AddSingleton<IRecoverySchedule>(schedule);
            });
        });
        using HttpClient client = host.CreateClient();
        await schedule.WaitAsync();
        AssertDependency(capture, "broker_publish", outcome);
    }

    [Theory]
    [InlineData("none", "database", "available", 1L)]
    [InlineData("none", "broker_ack", "available", 1L)]
    [InlineData("setup", "broker_setup", "unavailable", 0L)]
    [InlineData("database", "database", "permanent_error", 0L)]
    [InlineData("ack", "broker_ack", "unavailable", 1L)]
    public async Task ConsumerMeasuresIndividualDependenciesWithoutFalseAcknowledgement(string fault, string dependency, string outcome, long rows)
    {
        using var capture = new Measurements();
        await using NpgsqlDataSource database = await postgres.CreateMigratedDatabaseAsync("notifications");
        if (fault == "database")
        {
            await using NpgsqlCommand failure = database.CreateCommand("CREATE FUNCTION deny_inbox() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fixture denied' USING ERRCODE='42501'; END $$; CREATE TRIGGER deny_inbox BEFORE INSERT ON reservation_inbox FOR EACH ROW EXECUTE FUNCTION deny_inbox()");
            _ = await failure.ExecuteNonQueryAsync();
        }

        using var schedule = new ObservedSchedule();
        var subscription = new ObservedSubscription(fault);
        using WebApplicationFactory<Notifications.Program> host = PostgresFixture.Factory<Notifications.Program>(database).WithWebHostBuilder(builder => builder.ConfigureServices(services =>
        {
            _ = services.RemoveAll<IReservationSubscription>();
            _ = services.AddSingleton<IReservationSubscription>(subscription);
            _ = services.RemoveAll<IRecoverySchedule>();
            _ = services.AddSingleton<IRecoverySchedule>(schedule);
        }));
        using HttpClient client = host.CreateClient();
        await subscription.Completed.Task.WaitAsync(TimeSpan.FromSeconds(10));
        if (fault != "none")
        {
            await schedule.WaitAsync();
        }

        AssertDependency(capture, dependency, outcome);
        await using NpgsqlCommand count = database.CreateCommand("SELECT count(*) FROM reservation_inbox");
        Assert.Equal(rows, await count.ExecuteScalarAsync());
        Assert.Equal(fault == "none", subscription.Acknowledged);
    }

    private static void AssertDependency(Measurements capture, string dependency, string outcome)
    {
        Assert.Contains(capture.Values, value => value.Name == "reservation.dependency.outcomes" && value.Tags.Contains(new("dependency", dependency)) && value.Tags.Contains(new("outcome", outcome)));
        Assert.Contains(capture.Values, value => value.Name == "reservation.dependency.duration" && value.Value >= 0 && value.Tags.Contains(new("dependency", dependency)));
        Assert.All(capture.Values.Where(value => value.Name.StartsWith("reservation.dependency", StringComparison.Ordinal)), value => Assert.All(value.Tags, tag => Assert.Contains(tag.Key, DependencyDimensions)));
    }

    [Theory]
    [InlineData(false, "available", HttpStatusCode.Created)]
    [InlineData(true, "unavailable", HttpStatusCode.ServiceUnavailable)]
    public async Task PublicBookingMeasuresInventoryDependencyWithoutIdentifierDimensions(bool unavailable, string outcome, HttpStatusCode status)
    {
        using var capture = new Measurements();
        await using BookingScenario scenario = await BookingScenario.CreateAsync(postgres, new InventoryBoundary { Unavailable = unavailable });
        Assert.Equal(status, (await scenario.BookAsync()).StatusCode);
        Assert.Contains(capture.Values, value => value.Name == "reservation.dependency.outcomes" && value.Tags.Contains(new("dependency", "inventory")) && value.Tags.Contains(new("outcome", outcome)));
        Assert.Contains(capture.Values, value => value.Name == "reservation.dependency.duration" && value.Value >= 0);
        Assert.All(capture.Values.Where(value => value.Name.StartsWith("reservation.dependency", StringComparison.Ordinal)), value => Assert.All(value.Tags, tag => Assert.Contains(tag.Key, DependencyDimensions)));
    }

    [Fact]
    public async Task PendingOutboxMetricsIncludeParkedEventsAndClearAfterPublication()
    {
        using var capture = new Measurements();
        await using BookingScenario scenario = await BookingScenario.CreateAsync(postgres);
        BookedReservation booked = (await (await scenario.BookAsync()).Content.ReadFromJsonAsync<BookedReservation>())!;
        Assert.Equal(HttpStatusCode.OK, (await scenario.Client.PostAsync($"/api/reservations/{booked.Id}/cancel", null)).StatusCode);
        await using NpgsqlCommand parked = scenario.Database.CreateCommand("UPDATE reservation_outbox SET next_attempt_at='9999-12-31T23:59:59.999999Z'::timestamptz");
        _ = await parked.ExecuteNonQueryAsync();
        scenario.Clock.Now += TimeSpan.FromMinutes(5);
        var publisher = new AcceptedPublisher();
        using var schedule = new ObservedSchedule();
        using WebApplicationFactory<Reservations.Program> host = scenario.App.WithWebHostBuilder(builder =>
        {
            _ = builder.ConfigureAppConfiguration((context, configuration) => configuration.AddInMemoryCollection(new Dictionary<string, string?> { ["ConnectionStrings:messaging"] = "amqp://fixture:fixture@127.0.0.1:1/" }));
            _ = builder.ConfigureServices(services =>
            {
                _ = services.RemoveAll<IReservationPublisher>();
                _ = services.AddSingleton<IReservationPublisher>(publisher);
                _ = services.RemoveAll<IRecoverySchedule>();
                _ = services.AddSingleton<IRecoverySchedule>(schedule);
            });
        });
        using HttpClient client = host.CreateClient();
        await schedule.WaitAsync();
        capture.ReadGauges();
        Assert.Contains(capture.Values, value => value.Name == "reservation.outbox.pending" && value.Value == 2);
        Assert.Contains(capture.Values, value => value.Name == "reservation.outbox.oldest_age" && value.Value == 300);
        Assert.Equal(0, publisher.Calls);

        await using NpgsqlCommand reset = scenario.Database.CreateCommand("UPDATE reservation_outbox SET next_attempt_at=$1 WHERE published_at IS NULL");
        _ = reset.Parameters.AddWithValue(scenario.Clock.Now);
        Assert.Equal(2, await reset.ExecuteNonQueryAsync());
        schedule.Advance();
        await schedule.WaitAsync();
        capture.Values.Clear();
        capture.ReadGauges();
        Assert.Contains(capture.Values, value => value.Name == "reservation.outbox.pending" && value.Value == 0);
        Assert.Contains(capture.Values, value => value.Name == "reservation.outbox.oldest_age" && value.Value == 0);
        Assert.Equal(2, publisher.Calls);
    }

    private sealed class AcceptedPublisher(bool unavailable = false) : IReservationPublisher
    {
        public ConcurrentQueue<(ReservationEvent Message, string? Parent)> Events { get; } = new();

        public int Calls
        {
            get; private set;
        }

        public Task PublishAsync(ReservationEvent message, string? traceParent, string? traceState, CancellationToken cancellationToken)
        {
            Calls++;
            Events.Enqueue((message, traceParent));
            return unavailable ? throw new IOException("Controlled provider failure") : Task.CompletedTask;
        }
    }

    private sealed class ObservedSubscription(string fault, ReservationEvent? supplied = null, string? parent = null) : IReservationSubscription
    {
        public TaskCompletionSource Completed { get; } = new(TaskCreationOptions.RunContinuationsAsynchronously);

        public bool Acknowledged
        {
            get; private set;
        }

        public async Task ListenAsync(Func<BrokerDelivery, CancellationToken, Task> receive, Action<bool> readiness, CancellationToken cancellationToken)
        {
            try
            {
                if (fault == "setup")
                {
                    throw new IOException("Controlled setup failure");
                }

                readiness(true);
                var occurrence = new DateTimeOffset(2030, 1, 1, 12, 0, 0, TimeSpan.Zero);
                ReservationEvent message = supplied ?? new ReservationEvent(1, Guid.NewGuid(), "ReservationConfirmed", Guid.NewGuid(), "demo-user", "camera-001", "Demo Camera", occurrence.AddDays(1), occurrence.AddDays(1).AddHours(1), occurrence);
                byte[] body = JsonSerializer.SerializeToUtf8Bytes(message, ReservationJsonContext.Default.ReservationEvent);
                var headers = new Dictionary<string, object?> { ["schema"] = 1 };
                if (parent is not null)
                {
                    headers["traceparent"] = Encoding.UTF8.GetBytes(parent);
                }

                var delivery = new BrokerDelivery(false, body, "reservation.confirmed", "application/json", message.EventId.ToString(), message.ReservationId.ToString(), headers, (accepted, token) =>
                {
                    if (fault == "ack")
                    {
                        throw new IOException("Controlled ACK failure");
                    }

                    Acknowledged = accepted;
                    return Task.CompletedTask;
                });
                await receive(delivery, cancellationToken);
            }
            finally
            {
                _ = Completed.TrySetResult();
            }

            await Task.Delay(Timeout.Infinite, cancellationToken);
        }
    }

    private sealed class ObservedSchedule : IRecoverySchedule, IDisposable
    {
        private readonly SemaphoreSlim entered = new(0);
        private readonly SemaphoreSlim resume = new(0);

        public double Jitter()
        {
            return 0.5;
        }

        public async Task DelayAsync(TimeSpan delay, CancellationToken cancellationToken)
        {
            _ = entered.Release();
            await resume.WaitAsync(cancellationToken);
        }

        public async Task WaitAsync()
        {
            Assert.True(await entered.WaitAsync(TimeSpan.FromSeconds(10)), "Worker must reach its public scheduled idle boundary.");
        }

        public void Advance()
        {
            _ = resume.Release();
        }

        public void Dispose()
        {
            entered.Dispose();
            resume.Dispose();
        }
    }

    private sealed class Measurements : IDisposable
    {
        private readonly MeterListener listener = new();

        public ConcurrentQueue<Measurement> Values { get; } = new();

        public Measurements()
        {
            listener.InstrumentPublished = (instrument, current) =>
            {
                if (instrument.Meter.Name.StartsWith("Equipment.Reservation", StringComparison.Ordinal) || instrument.Meter.Name == "Equipment.Notifications")
                {
                    current.EnableMeasurementEvents(instrument);
                }
            };
            listener.SetMeasurementEventCallback<long>((instrument, value, tags, state) => Values.Enqueue(new(instrument.Name, value, tags.ToArray())));
            listener.SetMeasurementEventCallback<double>((instrument, value, tags, state) => Values.Enqueue(new(instrument.Name, value, tags.ToArray())));
            listener.Start();
        }

        public void ReadGauges()
        {
            listener.RecordObservableInstruments();
        }

        public void Dispose()
        {
            listener.Dispose();
        }
    }

    private sealed record Measurement(string Name, double Value, KeyValuePair<string, object?>[] Tags);

    private sealed class CapturedLogs : ILoggerProvider
    {
        public ConcurrentQueue<string> Messages { get; } = new();

        public ILogger CreateLogger(string categoryName)
        {
            return new Capture(Messages);
        }

        public void Dispose()
        {
        }

        private sealed class Capture(ConcurrentQueue<string> messages) : ILogger
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
                messages.Enqueue(formatter(state, exception));
            }
        }
    }
}
