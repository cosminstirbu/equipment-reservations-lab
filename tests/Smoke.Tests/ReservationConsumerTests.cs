using System.Collections.Concurrent;
using System.Diagnostics;
using System.Diagnostics.Metrics;
using System.Net;
using System.Net.Http.Json;
using System.Text.Json.Nodes;
using Backend.Tests;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Notifications;
using Npgsql;
using RabbitMQ.Client;
using ReservationMessaging;
using Xunit;

namespace Smoke.Tests;

[Collection("Reservation delivery")]
public sealed class ReservationConsumerTests(ReservationDeliveryFixture infrastructure)
{
    [Fact]
    public async Task PermanentInboxPermissionFailureHaltsUnackedDeliveryUntilRepairedRestart()
    {
        using var deadline = new CancellationTokenSource(TimeSpan.FromSeconds(60));
        await infrastructure.ResetQueueAsync(deadline.Token);
        await using NpgsqlDataSource inbox = await infrastructure.Postgres.CreateMigratedDatabaseAsync("notifications");
        await using NpgsqlCommand failure = inbox.CreateCommand("CREATE FUNCTION denied_inbox() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'controlled unavailable permission' USING ERRCODE='42501'; END $$; CREATE TRIGGER denied_inbox BEFORE INSERT ON reservation_inbox FOR EACH ROW EXECUTE FUNCTION denied_inbox()");
        _ = await failure.ExecuteNonQueryAsync(deadline.Token);
        using var measured = new DeliveryMeasurements();
        using var schedule = new ControlledDeliverySchedule();
        FailureObservedSubscription? observed = null;
        using WebApplicationFactory<Notifications.Program> app = infrastructure.App<Notifications.Program>(inbox).WithWebHostBuilder(builder => builder.ConfigureServices(services =>
        {
            _ = services.RemoveAll<IRecoverySchedule>();
            _ = services.AddSingleton<IRecoverySchedule>(schedule);
            _ = services.AddSingleton<ReservationSubscription>();
            _ = services.RemoveAll<IReservationSubscription>();
            _ = services.AddSingleton<IReservationSubscription>(provider => observed = new FailureObservedSubscription(provider.GetRequiredService<ReservationSubscription>()));
        }));
        using HttpClient client = app.CreateClient();
        var eventId = Guid.NewGuid();
        var reservationId = Guid.NewGuid();
        await PublishAsync(eventId, reservationId, ReservationDeliveryFixture.Envelope(eventId, reservationId), deadline.Token);
        Assert.Equal(TimeSpan.FromSeconds(10), await schedule.NextAsync(deadline.Token));
        Assert.Equal("42501", await observed!.Failure.Task.WaitAsync(TimeSpan.FromSeconds(10), deadline.Token));
        await measured.ExpectAsync("permanent_error", deadline.Token);
        Assert.Empty((await client.GetFromJsonAsync<ObservedNotification[]>("/api/notifications", deadline.Token))!);
        schedule.Advance();
        using var observation = new CancellationTokenSource(TimeSpan.FromMilliseconds(500));
        _ = await Assert.ThrowsAnyAsync<OperationCanceledException>(() => schedule.NextAsync(observation.Token));
        Assert.Equal(1, observed.Attempts);
        await app.DisposeAsync();
        await using NpgsqlCommand repair = inbox.CreateCommand("DROP TRIGGER denied_inbox ON reservation_inbox");
        _ = await repair.ExecuteNonQueryAsync(deadline.Token);
        var acknowledged = new TaskCompletionSource<bool>(TaskCreationOptions.RunContinuationsAsynchronously);
        using WebApplicationFactory<Notifications.Program> restarted = infrastructure.App<Notifications.Program>(inbox).WithWebHostBuilder(builder => builder.ConfigureServices(services =>
        {
            _ = services.AddSingleton<ReservationSubscription>();
            _ = services.RemoveAll<IReservationSubscription>();
            _ = services.AddSingleton<IReservationSubscription>(provider => new RepairedSubscription(provider.GetRequiredService<ReservationSubscription>(), acknowledged));
        }));
        using HttpClient restartedClient = restarted.CreateClient();
        Assert.Equal(eventId, Assert.Single(await ReservationDeliveryFixture.AwaitInboxAsync(restartedClient, 1, deadline.Token)).EventId);
        Assert.True(await acknowledged.Task.WaitAsync(TimeSpan.FromSeconds(10), deadline.Token));
        await AwaitQueueEmptyAsync(deadline.Token);
        _ = Assert.Single((await restartedClient.GetFromJsonAsync<ObservedNotification[]>("/api/notifications", deadline.Token))!);
    }

    private sealed class FailureObservedSubscription(IReservationSubscription realBroker) : IReservationSubscription
    {
        public int Attempts
        {
            get; private set;
        }

        public TaskCompletionSource<string> Failure { get; } = new(TaskCreationOptions.RunContinuationsAsynchronously);

        public async Task ListenAsync(Func<BrokerDelivery, CancellationToken, Task> receive, Action<bool> readiness, CancellationToken cancellationToken)
        {
            Attempts++;
            try
            {
                await realBroker.ListenAsync(receive, readiness, cancellationToken);
            }
            catch (PostgresException exception)
            {
                _ = Failure.TrySetResult(exception.SqlState);
                throw;
            }
        }
    }

    private sealed class RepairedSubscription(IReservationSubscription realBroker, TaskCompletionSource<bool> acknowledged) : IReservationSubscription
    {
        public Task ListenAsync(Func<BrokerDelivery, CancellationToken, Task> receive, Action<bool> readiness, CancellationToken cancellationToken)
        {
            return realBroker.ListenAsync(async (delivery, token) =>
            {
                await receive(delivery, token);
                _ = acknowledged.TrySetResult(delivery.Redelivered);
            }, readiness, cancellationToken);
        }
    }

    [Fact]
    public async Task ConsumeAndDuplicateDeliveryEmitCorrelatedBoundedSignalsAfterCommit()
    {
        var outcomes = new ConcurrentQueue<string>();
        var spans = new ConcurrentQueue<Activity>();
        using var metrics = new MeterListener();
        metrics.InstrumentPublished = (instrument, listener) =>
        {
            if (instrument.Name == "reservation.delivery.outcomes")
            {
                listener.EnableMeasurementEvents(instrument);
            }
        };
        metrics.SetMeasurementEventCallback<long>((instrument, value, tags, state) =>
        {
            foreach (KeyValuePair<string, object?> tag in tags)
            {
                Assert.True(tag.Key is "operation" or "outcome");
                if (tag.Key == "outcome")
                {
                    outcomes.Enqueue((string)tag.Value!);
                }
            }
        });
        metrics.Start();
        using var traces = new ActivityListener
        {
            ShouldListenTo = source => source.Name == "Equipment.ReservationMessaging",
            Sample = (ref options) => ActivitySamplingResult.AllDataAndRecorded,
            ActivityStopped = activity => spans.Enqueue(activity)
        };
        ActivitySource.AddActivityListener(traces);
        using var deadline = new CancellationTokenSource(TimeSpan.FromSeconds(60));
        await infrastructure.ResetQueueAsync(deadline.Token);
        await using NpgsqlDataSource inbox = await infrastructure.Postgres.CreateMigratedDatabaseAsync("notifications");
        var settled = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        int deliveries = 0;
        using WebApplicationFactory<Notifications.Program> app = infrastructure.App<Notifications.Program>(inbox).WithWebHostBuilder(builder => builder.ConfigureServices(services =>
        {
            _ = services.AddSingleton<ReservationSubscription>();
            _ = services.RemoveAll<IReservationSubscription>();
            _ = services.AddSingleton<IReservationSubscription>(provider => new ObservedSubscription(provider.GetRequiredService<ReservationSubscription>(), () =>
            {
                if (Interlocked.Increment(ref deliveries) == 2)
                {
                    _ = settled.TrySetResult();
                }
            }));
        }));
        using HttpClient client = app.CreateClient();
        var eventId = Guid.NewGuid();
        var reservationId = Guid.NewGuid();
        byte[] body = ReservationDeliveryFixture.Envelope(eventId, reservationId);
        await PublishAsync(eventId, reservationId, body, deadline.Token);
        _ = await ReservationDeliveryFixture.AwaitInboxAsync(client, 1, deadline.Token);
        await PublishAsync(eventId, reservationId, body, deadline.Token);
        await settled.Task.WaitAsync(TimeSpan.FromSeconds(10), deadline.Token);
        await AwaitQueueEmptyAsync(deadline.Token);
        _ = Assert.Single((await client.GetFromJsonAsync<ObservedNotification[]>("/api/notifications", deadline.Token))!);
        Assert.Contains("stored", outcomes);
        Assert.Contains("duplicate", outcomes);
        Assert.Equal(2, spans.Count(activity => activity.OperationName == "reservation.consume"));
        Assert.All(spans, activity =>
        {
            Assert.Equal(eventId.ToString(), activity.GetTagItem("event.id"));
            Assert.Equal(reservationId.ToString(), activity.GetTagItem("reservation.id"));
            Assert.Equal(ActivityStatusCode.Ok, activity.Status);
        });
    }

    private sealed class ObservedSubscription(IReservationSubscription realBroker, Action settled) : IReservationSubscription
    {
        public Task ListenAsync(Func<BrokerDelivery, CancellationToken, Task> receive, Action<bool> readiness, CancellationToken cancellationToken)
        {
            return realBroker.ListenAsync(async (delivery, token) =>
            {
                await receive(delivery, token);
                settled();
            }, readiness, cancellationToken);
        }
    }

    [Fact]
    public async Task DuplicateDeliveryAfterConsumerRestartRetainsOneEntryAndFiniteUtcSnapshot()
    {
        using var deadline = new CancellationTokenSource(TimeSpan.FromSeconds(60));
        await infrastructure.ResetQueueAsync(deadline.Token);
        await using NpgsqlDataSource inbox = await infrastructure.Postgres.CreateMigratedDatabaseAsync("notifications");
        var eventId = Guid.NewGuid();
        var reservationId = Guid.NewGuid();
        byte[] body = ReservationDeliveryFixture.Envelope(eventId, reservationId);
        ObservedNotification original;
        await PublishAsync(eventId, reservationId, body, deadline.Token);
        using (WebApplicationFactory<Notifications.Program> app = infrastructure.App<Notifications.Program>(inbox))
        using (HttpClient client = app.CreateClient())
        {
            Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/api/notifications", deadline.Token)).StatusCode);
            original = Assert.Single(await ReservationDeliveryFixture.AwaitInboxAsync(client, 1, deadline.Token));
            Assert.Equal(eventId, original.EventId);
            Assert.Equal(reservationId, original.ReservationId);
            Assert.Equal(IdentityAuthorityFixture.UserKeyFor(), original.UserKey);
            Assert.Equal("ReservationConfirmed", original.EventType);
            Assert.Equal("Demo Camera", original.EquipmentName);
            Assert.Contains("Demo Camera", original.Message, StringComparison.Ordinal);
            Assert.Equal(TimeSpan.Zero, original.OccurredAt.Offset);
            Assert.Equal(TimeSpan.Zero, original.ReceivedAt.Offset);
        }

        await PublishAsync(eventId, reservationId, body, deadline.Token);
        using WebApplicationFactory<Notifications.Program> restarted = infrastructure.App<Notifications.Program>(inbox);
        using HttpClient receiver = restarted.CreateClient();
        await AwaitQueueEmptyAsync(deadline.Token);
        Assert.Equal(original, Assert.Single((await receiver.GetFromJsonAsync<ObservedNotification[]>("/api/notifications", deadline.Token))!));
        using HttpClient other = IdentityAuthorityFixture.Shared.Authenticate(restarted.CreateClient(), "notifications-api", "employee-b-subject");
        Assert.Empty((await other.GetFromJsonAsync<ObservedNotification[]>("/api/notifications", deadline.Token))!);
    }

    [Theory]
    [InlineData("schema")]
    [InlineData("event_id")]
    [InlineData("type")]
    [InlineData("routing")]
    [InlineData("message_id")]
    [InlineData("offset")]
    [InlineData("precision")]
    [InlineData("interval")]
    [InlineData("name")]
    [InlineData("oversize")]
    [InlineData("traceparent")]
    [InlineData("tracestate")]
    [InlineData("tracestate_newline")]
    [InlineData("content_type")]
    [InlineData("schema_header")]
    [InlineData("malformed_json")]
    [InlineData("unknown_field")]
    [InlineData("user_key_short")]
    [InlineData("user_key_uppercase")]
    [InlineData("user_key_null")]
    [InlineData("token_field")]
    [InlineData("session_field")]
    [InlineData("profile_field")]
    [InlineData("correlation_id")]
    [InlineData("aligned_startAt")]
    [InlineData("aligned_endAt")]
    [InlineData("aligned_occurredAt")]
    [InlineData("truncated_startAt")]
    [InlineData("truncated_endAt")]
    [InlineData("truncated_occurredAt")]
    [InlineData("offsetfree_startAt")]
    [InlineData("offsetfree_endAt")]
    [InlineData("offsetfree_occurredAt")]
    public async Task PoisonIsRejectedWithoutRequeueAndFollowingValidDeliveryProgresses(string fault)
    {
        using var timezone = new UtcTimezoneScope(fault.StartsWith("offsetfree_", StringComparison.Ordinal));
        using var measured = new DeliveryMeasurements();
        using var deadline = new CancellationTokenSource(TimeSpan.FromSeconds(60));
        await infrastructure.ResetQueueAsync(deadline.Token);
        await using NpgsqlDataSource inbox = await infrastructure.Postgres.CreateMigratedDatabaseAsync("notifications");
        using WebApplicationFactory<Notifications.Program> app = infrastructure.App<Notifications.Program>(inbox);
        using HttpClient client = app.CreateClient();
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/api/notifications", deadline.Token)).StatusCode);
        var poisonId = Guid.NewGuid();
        var reservationId = Guid.NewGuid();
        JsonNode invalid = JsonNode.Parse(ReservationDeliveryFixture.Envelope(poisonId, reservationId))!;
        string[] timestampFault = fault.Split('_');
        if (timestampFault.Length == 2 && timestampFault[0] is "aligned" or "truncated" or "offsetfree")
        {
            string hour = timestampFault[1] == "endAt" ? "13" : "12";
            string suffix = timestampFault[0] switch
            {
                "aligned" => ".1234560Z",
                "truncated" => ".12345601Z",
                _ => ".123456"
            };
            invalid[timestampFault[1]] = $"2030-01-02T{hour}:00:00{suffix}";
        }
        switch (fault)
        {
            case "schema":
                invalid["schemaVersion"] = 2;
                break;
            case "event_id":
                invalid["eventId"] = Guid.Empty;
                break;
            case "type":
                invalid["eventType"] = "UnknownEvent";
                break;
            case "offset":
                invalid["startAt"] = "2030-01-02T12:00:00+02:00";
                break;
            case "precision":
                invalid["startAt"] = "2030-01-02T12:00:00.1234567Z";
                break;
            case "interval":
                invalid["endAt"] = "2030-01-02T11:00:00Z";
                break;
            case "name":
                invalid["equipmentName"] = "";
                break;
            case "unknown_field":
                invalid["untrustedText"] = "not accepted";
                break;
            case "user_key_short":
                invalid["userKey"] = new string('a', 63);
                break;
            case "user_key_uppercase":
                invalid["userKey"] = new string('A', 64);
                break;
            case "user_key_null":
                invalid["userKey"] = null;
                break;
            case "token_field":
                invalid["accessToken"] = "untrusted";
                break;
            case "session_field":
                invalid["sessionId"] = "untrusted";
                break;
            case "profile_field":
                invalid["email"] = "untrusted";
                break;
            default:
                break;
        }

        byte[] poison = fault == "oversize" ? new byte[4097] : System.Text.Encoding.UTF8.GetBytes(invalid.ToJsonString());
        if (fault == "malformed_json")
        {
            poison = System.Text.Encoding.UTF8.GetBytes("{invalid");
        }
        var properties = new BasicProperties
        {
            ContentType = fault == "content_type" ? "text/plain" : "application/json",
            MessageId = fault == "message_id" ? Guid.NewGuid().ToString() : poisonId.ToString(),
            CorrelationId = fault == "correlation_id" ? Guid.NewGuid().ToString() : reservationId.ToString(),
            Persistent = true,
            Headers = new Dictionary<string, object?> { ["schema"] = fault == "schema_header" ? 2 : 1 }
        };
        if (fault == "traceparent")
        {
            properties.Headers["traceparent"] = new string('x', 56);
        }

        if (fault is "tracestate" or "tracestate_newline")
        {
            properties.Headers["traceparent"] = "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01";
            properties.Headers["tracestate"] = fault == "tracestate_newline" ? "valid\n=value" : "invalid";
        }

        await using IConnection connection = await RabbitConnection.Factory(infrastructure.Messaging, TimeSpan.FromSeconds(3)).CreateConnectionAsync(deadline.Token);
        await using IChannel channel = await connection.CreateChannelAsync(new CreateChannelOptions(true, true), deadline.Token);
        await channel.BasicPublishAsync("reservations", fault == "routing" ? "reservation.cancelled" : "reservation.confirmed", true, properties, poison, deadline.Token);
        var validId = Guid.NewGuid();
        await PublishAsync(validId, reservationId, ReservationDeliveryFixture.Envelope(validId, reservationId), deadline.Token);
        ObservedNotification[] entries = await ReservationDeliveryFixture.AwaitInboxAsync(client, 1, deadline.Token);
        Assert.Equal(validId, Assert.Single(entries).EventId);
        await AwaitQueueEmptyAsync(deadline.Token);
        _ = Assert.Single((await client.GetFromJsonAsync<ObservedNotification[]>("/api/notifications", deadline.Token))!);
        if (fault == "schema")
        {
            await measured.ExpectAsync("rejected", deadline.Token);
        }
    }

    private sealed class UtcTimezoneScope : IDisposable
    {
        private readonly bool enabled;
        private readonly string? previous;

        public UtcTimezoneScope(bool enabled)
        {
            this.enabled = enabled;
            if (enabled)
            {
                previous = Environment.GetEnvironmentVariable("TZ");
                Environment.SetEnvironmentVariable("TZ", "UTC");
                TimeZoneInfo.ClearCachedData();
                Assert.Equal(TimeSpan.Zero, TimeZoneInfo.Local.BaseUtcOffset);
            }
        }

        public void Dispose()
        {
            if (enabled)
            {
                Environment.SetEnvironmentVariable("TZ", previous);
                TimeZoneInfo.ClearCachedData();
            }
        }
    }

    [Fact]
    public async Task TransientInboxDatabaseFailureIsNotAcknowledgedAndRecoveryStoresIt()
    {
        using var measured = new DeliveryMeasurements();
        using var deadline = new CancellationTokenSource(TimeSpan.FromSeconds(60));
        await infrastructure.ResetQueueAsync(deadline.Token);
        await using NpgsqlDataSource inbox = await infrastructure.Postgres.CreateMigratedDatabaseAsync("notifications");
        await using NpgsqlCommand failure = inbox.CreateCommand("CREATE SEQUENCE inbox_attempts; CREATE FUNCTION unavailable_inbox() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN PERFORM nextval('inbox_attempts'); RAISE EXCEPTION 'controlled unavailable database' USING ERRCODE='08006'; END $$; CREATE TRIGGER unavailable_inbox BEFORE INSERT ON reservation_inbox FOR EACH ROW EXECUTE FUNCTION unavailable_inbox()");
        _ = await failure.ExecuteNonQueryAsync(deadline.Token);
        using WebApplicationFactory<Notifications.Program> app = infrastructure.App<Notifications.Program>(inbox);
        using HttpClient client = app.CreateClient();
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/api/notifications", deadline.Token)).StatusCode);
        var eventId = Guid.NewGuid();
        var reservationId = Guid.NewGuid();
        await PublishAsync(eventId, reservationId, ReservationDeliveryFixture.Envelope(eventId, reservationId), deadline.Token);
        while (true)
        {
            await using NpgsqlCommand attempted = inbox.CreateCommand("SELECT is_called FROM inbox_attempts");
            if ((bool)(await attempted.ExecuteScalarAsync(deadline.Token))!)
            {
                break;
            }

            await Task.Delay(100, deadline.Token);
        }

        await AwaitWorkerUnhealthyAsync(client, deadline.Token);
        await measured.ExpectAsync("retry", deadline.Token);
        Assert.Empty((await client.GetFromJsonAsync<ObservedNotification[]>("/api/notifications", deadline.Token))!);
        await using NpgsqlCommand repair = inbox.CreateCommand("DROP TRIGGER unavailable_inbox ON reservation_inbox");
        _ = await repair.ExecuteNonQueryAsync(deadline.Token);
        Assert.Equal(eventId, Assert.Single(await ReservationDeliveryFixture.AwaitInboxAsync(client, 1, deadline.Token)).EventId);
    }

    private sealed class DeliveryMeasurements : IDisposable
    {
        private readonly MeterListener listener = new();
        private readonly ConcurrentQueue<string> outcomes = new();

        public DeliveryMeasurements()
        {
            listener.InstrumentPublished = (instrument, meter) =>
            {
                if (instrument.Name == "reservation.delivery.outcomes")
                {
                    meter.EnableMeasurementEvents(instrument);
                }
            };
            listener.SetMeasurementEventCallback<long>((instrument, value, tags, state) =>
            {
                foreach (KeyValuePair<string, object?> tag in tags)
                {
                    Assert.True(tag.Key is "operation" or "outcome");
                    if (tag.Key == "outcome")
                    {
                        outcomes.Enqueue((string)tag.Value!);
                    }
                }
            });
            listener.Start();
        }

        public async Task ExpectAsync(string outcome, CancellationToken cancellationToken)
        {
            using var deadline = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
            deadline.CancelAfter(TimeSpan.FromSeconds(5));
            while (!outcomes.Contains(outcome))
            {
                await Task.Delay(50, deadline.Token);
            }
        }

        public void Dispose()
        {
            listener.Dispose();
        }
    }

    [Fact]
    public async Task InboxOrdersSubMillisecondEventsByOccurrenceThenIdAndSurvivesBrokerRestart()
    {
        using var deadline = new CancellationTokenSource(TimeSpan.FromSeconds(60));
        await infrastructure.ResetQueueAsync(deadline.Token);
        await using NpgsqlDataSource inbox = await infrastructure.Postgres.CreateMigratedDatabaseAsync("notifications");
        using WebApplicationFactory<Notifications.Program> app = infrastructure.App<Notifications.Program>(inbox);
        using HttpClient client = app.CreateClient();
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/api/notifications", deadline.Token)).StatusCode);
        var newer = Guid.Parse("ffffffff-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
        var older = Guid.Parse("00000001-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
        var reservationId = Guid.NewGuid();
        var now = DateTimeOffset.Parse("2030-01-01T12:00:00.123001Z", System.Globalization.CultureInfo.InvariantCulture);
        await PublishAsync(older, reservationId, ReservationDeliveryFixture.Envelope(older, reservationId, occurredAt: now), deadline.Token);
        await PublishAsync(newer, reservationId, ReservationDeliveryFixture.Envelope(newer, reservationId, occurredAt: now.AddTicks(10)), deadline.Token);
        Assert.Equal([newer, older], (await ReservationDeliveryFixture.AwaitInboxAsync(client, 2, deadline.Token)).Select(item => item.EventId));
        await infrastructure.StopBrokerAsync(deadline.Token);
        try
        {
            Assert.Equal(2, (await client.GetFromJsonAsync<ObservedNotification[]>("/api/notifications", deadline.Token))!.Length);
        }
        finally
        {
            using var cleanup = new CancellationTokenSource(TimeSpan.FromSeconds(60));
            await infrastructure.StartBrokerAsync(cleanup.Token);
        }

        var afterRestart = Guid.NewGuid();
        await PublishAsync(afterRestart, reservationId, ReservationDeliveryFixture.Envelope(afterRestart, reservationId), deadline.Token);
        Assert.Contains(await ReservationDeliveryFixture.AwaitInboxAsync(client, 3, deadline.Token), item => item.EventId == afterRestart);
    }

    [Fact]
    public async Task InboxCommitBeforeInterruptedAckRedeliversAndRetainsOneIdenticalEntry()
    {
        using var deadline = new CancellationTokenSource(TimeSpan.FromSeconds(60));
        await infrastructure.ResetQueueAsync(deadline.Token);
        await using NpgsqlDataSource inbox = await infrastructure.Postgres.CreateMigratedDatabaseAsync("notifications");
        var eventId = Guid.NewGuid();
        var reservationId = Guid.NewGuid();
        AckDisconnectSubscription? boundary = null;
        using WebApplicationFactory<Notifications.Program> app = infrastructure.App<Notifications.Program>(inbox).WithWebHostBuilder(builder => builder.ConfigureServices(services =>
        {
            _ = services.AddSingleton<ReservationSubscription>();
            _ = services.RemoveAll<IReservationSubscription>();
            _ = services.AddSingleton<IReservationSubscription>(provider =>
            {
                boundary = new AckDisconnectSubscription(provider.GetRequiredService<ReservationSubscription>(), inbox);
                return boundary;
            });
        }));
        using HttpClient client = app.CreateClient();
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/api/notifications", deadline.Token)).StatusCode);
        _ = app.Services.GetRequiredService<IReservationSubscription>();
        AckDisconnectSubscription observed = Assert.IsType<AckDisconnectSubscription>(boundary);
        await PublishAsync(eventId, reservationId, ReservationDeliveryFixture.Envelope(eventId, reservationId), deadline.Token);
        Assert.Equal(1L, await observed.CommittedBeforeAck.Task.WaitAsync(TimeSpan.FromSeconds(10), deadline.Token));
        ObservedNotification original = Assert.Single(await ReservationDeliveryFixture.AwaitInboxAsync(client, 1, deadline.Token));
        Assert.True(await observed.RedeliveryAcknowledged.Task.WaitAsync(TimeSpan.FromSeconds(10), deadline.Token));
        Assert.Equal(original, Assert.Single((await client.GetFromJsonAsync<ObservedNotification[]>("/api/notifications", deadline.Token))!));
        Assert.Equal(eventId, original.EventId);
    }

    private sealed class AckDisconnectSubscription(IReservationSubscription realBroker, NpgsqlDataSource database) : IReservationSubscription
    {
        private int acknowledgements;

        public TaskCompletionSource<long> CommittedBeforeAck { get; } = new(TaskCreationOptions.RunContinuationsAsynchronously);

        public TaskCompletionSource<bool> RedeliveryAcknowledged { get; } = new(TaskCreationOptions.RunContinuationsAsynchronously);

        public Task ListenAsync(Func<BrokerDelivery, CancellationToken, Task> receive, Action<bool> readiness, CancellationToken cancellationToken)
        {
            return realBroker.ListenAsync((delivery, token) => receive(delivery with
            {
                SettleAsync = async (accepted, stopped) =>
                {
                    if (accepted && Interlocked.Increment(ref acknowledgements) == 1)
                    {
                        await using NpgsqlCommand committed = database.CreateCommand("SELECT count(*) FROM reservation_inbox");
                        long rows = (long)(await committed.ExecuteScalarAsync(stopped))!;
                        _ = CommittedBeforeAck.TrySetResult(rows);
                        throw new IOException("Controlled disconnect after inbox commit before ACK");
                    }

                    await delivery.SettleAsync(accepted, stopped);
                    if (accepted)
                    {
                        _ = RedeliveryAcknowledged.TrySetResult(delivery.Redelivered);
                    }
                }
            }, token), readiness, cancellationToken);
        }
    }

    private async Task PublishAsync(Guid eventId, Guid reservationId, byte[] body, CancellationToken cancellationToken)
    {
        await using IConnection connection = await RabbitConnection.Factory(infrastructure.Messaging, TimeSpan.FromSeconds(3)).CreateConnectionAsync(cancellationToken);
        await using IChannel channel = await connection.CreateChannelAsync(new CreateChannelOptions(true, true), cancellationToken);
        var properties = new BasicProperties
        {
            MessageId = eventId.ToString(),
            CorrelationId = reservationId.ToString(),
            ContentType = "application/json",
            Persistent = true,
            Headers = new Dictionary<string, object?> { ["schema"] = 1 }
        };
        await channel.BasicPublishAsync("reservations", "reservation.confirmed", true, properties, body, cancellationToken);
    }

    private async Task AwaitQueueEmptyAsync(CancellationToken cancellationToken)
    {
        await using IConnection connection = await RabbitConnection.Factory(infrastructure.Messaging, TimeSpan.FromSeconds(3)).CreateConnectionAsync(cancellationToken);
        await using IChannel channel = await connection.CreateChannelAsync(cancellationToken: cancellationToken);
        while ((await channel.QueueDeclarePassiveAsync("reservation-notifications", cancellationToken)).MessageCount != 0)
        {
            await Task.Delay(100, cancellationToken);
        }
    }

    private static async Task AwaitWorkerUnhealthyAsync(HttpClient client, CancellationToken cancellationToken)
    {
        while ((await client.GetAsync("/health/workers", cancellationToken)).StatusCode != HttpStatusCode.ServiceUnavailable)
        {
            await Task.Delay(50, cancellationToken);
        }
    }
}
