using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Logging;
using Npgsql;
using RabbitMQ.Client;
using RabbitMQ.Client.Exceptions;
using ReservationMessaging;
using Reservations;
using Xunit;

namespace Integration.Tests;

[Collection("Reservation delivery")]
public sealed class ReservationOutboxTests(ReservationDeliveryFixture infrastructure)
{
    [Fact]
    public async Task PermanentMetadataWriteFailureHaltsWithoutFalsePublishedOrParkingAndRepairsByRestart()
    {
        using var deadline = new CancellationTokenSource(TimeSpan.FromSeconds(60));
        await infrastructure.ResetQueueAsync(deadline.Token);
        await using BookingScenario scenario = await BookingScenario.CreateAsync(infrastructure.Postgres);
        scenario.Clock.Now = DateTimeOffset.UtcNow;
        BookedReservation original = (await (await scenario.BookAsync()).Content.ReadFromJsonAsync<BookedReservation>(cancellationToken: TestContext.Current.CancellationToken))!;
        await using NpgsqlCommand deny = scenario.Database.CreateCommand("CREATE SEQUENCE denied_updates; CREATE FUNCTION deny_metadata() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.published_at IS NOT NULL THEN PERFORM nextval('denied_updates'); RAISE EXCEPTION 'controlled permanent metadata permission' USING ERRCODE='42501'; END IF; RETURN NEW; END $$; CREATE TRIGGER deny_metadata BEFORE UPDATE ON reservation_outbox FOR EACH ROW EXECUTE FUNCTION deny_metadata()");
        _ = await deny.ExecuteNonQueryAsync(deadline.Token);
        IConfigurationRoot configuration = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?> { ["ConnectionStrings:messaging"] = infrastructure.Publisher }).Build();
        var publisher = new ConfigurationPublisher(new ReservationPublisher(configuration));
        var logs = new DeliveryLogCapture();
        using var schedule = new PublicationGate();
        await using NpgsqlDataSource inbox = await infrastructure.Postgres.CreateMigratedDatabaseAsync("notifications");
        using WebApplicationFactory<Notifications.Program> receiver = infrastructure.App<Notifications.Program>(inbox);
        using HttpClient client = receiver.CreateClient();
        using WebApplicationFactory<Reservations.Program> host = ConfigurationHost(scenario.Database, publisher, schedule)
            .WithWebHostBuilder(builder => builder.ConfigureServices(services => services.AddLogging(logging => logging.AddProvider(logs))));
        using HttpClient producer = host.CreateClient();
        ObservedNotification accepted = Assert.Single(await ReservationDeliveryFixture.AwaitInboxAsync(client, 1, deadline.Token));
        while (true)
        {
            await using NpgsqlCommand attempted = scenario.Database.CreateCommand("SELECT is_called FROM denied_updates");
            if ((bool)(await attempted.ExecuteScalarAsync(deadline.Token))!)
            {
                break;
            }

            await Task.Delay(50, deadline.Token);
        }

        _ = await Assert.ThrowsAsync<TimeoutException>(() => schedule.Waiting.Task.WaitAsync(TimeSpan.FromSeconds(1), deadline.Token));
        Assert.Equal(1, publisher.Attempts);
        Assert.Contains(logs.Messages, message => message.Contains("permanent_error", StringComparison.Ordinal));
        Assert.DoesNotContain(logs.Messages, message => message.Contains("controlled permanent metadata", StringComparison.Ordinal) || message.Contains("denied_updates", StringComparison.Ordinal));
        await using NpgsqlCommand pending = scenario.Database.CreateCommand("SELECT published_at IS NULL AND attempt_count=0 AND next_attempt_at < '9999-12-31T23:59:59.999999Z'::timestamptz FROM reservation_outbox WHERE event_id=$1");
        _ = pending.Parameters.AddWithValue(original.ConfirmationEventId);
        Assert.True((bool)(await pending.ExecuteScalarAsync(deadline.Token))!);
        Assert.Equal(original.ConfirmationEventId, accepted.EventId);
        await host.DisposeAsync();
        await using NpgsqlCommand repair = scenario.Database.CreateCommand("DROP TRIGGER deny_metadata ON reservation_outbox");
        _ = await repair.ExecuteNonQueryAsync(deadline.Token);
        using WebApplicationFactory<Reservations.Program> repaired = infrastructure.App<Reservations.Program>(scenario.Database);
        using HttpClient repairedClient = repaired.CreateClient();
        while (true)
        {
            await using NpgsqlCommand published = scenario.Database.CreateCommand("SELECT published_at IS NOT NULL FROM reservation_outbox WHERE event_id=$1");
            _ = published.Parameters.AddWithValue(original.ConfirmationEventId);
            if ((bool)(await published.ExecuteScalarAsync(deadline.Token))!)
            {
                break;
            }

            await Task.Delay(50, deadline.Token);
        }

        Assert.Equal(accepted, Assert.Single((await client.GetFromJsonAsync<ObservedNotification[]>("/api/notifications", deadline.Token))!));
        Assert.Equal(1L, await scenario.CountAsync("reservation_outbox"));
    }

    [Theory]
    [InlineData("permission")]
    [InlineData("authentication")]
    public async Task PermanentRealBrokerConfigurationParksAcrossCyclesAndRestartUntilRepaired(string fault)
    {
        using var deadline = new CancellationTokenSource(TimeSpan.FromSeconds(60));
        await infrastructure.ResetQueueAsync(deadline.Token);
        await using BookingScenario scenario = await BookingScenario.CreateAsync(infrastructure.Postgres);
        scenario.Clock.Now = DateTimeOffset.UtcNow;
        BookedReservation original = (await (await scenario.BookAsync()).Content.ReadFromJsonAsync<BookedReservation>(cancellationToken: TestContext.Current.CancellationToken))!;
        string messaging = infrastructure.Publisher;
        if (fault == "authentication")
        {
            messaging = new UriBuilder(messaging) { Password = "rejected-fixture-password" }.Uri.AbsoluteUri;
        }
        else
        {
            await infrastructure.ChangePublisherPermissionAsync(true, deadline.Token);
        }

        try
        {
            IConfigurationRoot configuration = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?> { ["ConnectionStrings:messaging"] = messaging }).Build();
            var observed = new ConfigurationPublisher(new ReservationPublisher(configuration));
            using var schedule = new PublicationGate();
            using WebApplicationFactory<Reservations.Program> host = ConfigurationHost(scenario.Database, observed, schedule);
            using HttpClient producer = host.CreateClient();
            await schedule.Waiting.Task.WaitAsync(TimeSpan.FromSeconds(10), deadline.Token);
            Assert.Equal(TimeSpan.FromSeconds(10), schedule.FirstDelay);
            Assert.Equal(1, observed.Attempts);
            if (fault == "permission")
            {
                Assert.Equal(403, Assert.IsAssignableFrom<OperationInterruptedException>(observed.Failure).ShutdownReason!.ReplyCode);
            }
            else
            {
                _ = Assert.IsType<BrokerUnreachableException>(observed.Failure);
            }

            schedule.Resume();
            while (schedule.Calls < 2)
            {
                await Task.Delay(50, deadline.Token);
            }

            Assert.Equal(1, observed.Attempts);
            await host.DisposeAsync();
            using var restartedSchedule = new PublicationGate();
            using WebApplicationFactory<Reservations.Program> restarted = ConfigurationHost(scenario.Database, observed, restartedSchedule);
            using HttpClient restartedClient = restarted.CreateClient();
            await restartedSchedule.Waiting.Task.WaitAsync(TimeSpan.FromSeconds(10), deadline.Token);
            Assert.Equal(1, observed.Attempts);
            await restarted.DisposeAsync();
            await infrastructure.ChangePublisherPermissionAsync(false, deadline.Token);
            await using NpgsqlCommand reset = scenario.Database.CreateCommand("UPDATE reservation_outbox SET next_attempt_at=$2 WHERE event_id=$1 AND published_at IS NULL");
            _ = reset.Parameters.AddWithValue(original.ConfirmationEventId);
            _ = reset.Parameters.AddWithValue(DateTimeOffset.UtcNow);
            Assert.Equal(1, await reset.ExecuteNonQueryAsync(deadline.Token));
            await using NpgsqlDataSource inbox = await infrastructure.Postgres.CreateMigratedDatabaseAsync("notifications");
            using WebApplicationFactory<Notifications.Program> receiver = infrastructure.App<Notifications.Program>(inbox);
            using HttpClient client = receiver.CreateClient();
            using WebApplicationFactory<Reservations.Program> repaired = infrastructure.App<Reservations.Program>(scenario.Database);
            using HttpClient repairedClient = repaired.CreateClient();
            Assert.Equal(original.ConfirmationEventId, Assert.Single(await ReservationDeliveryFixture.AwaitInboxAsync(client, 1, deadline.Token)).EventId);
            Assert.Equal(1L, await scenario.CountAsync("reservation_outbox"));
        }
        finally
        {
            using var cleanup = new CancellationTokenSource(TimeSpan.FromSeconds(10));
            await infrastructure.ChangePublisherPermissionAsync(false, cleanup.Token);
        }
    }

    private WebApplicationFactory<Reservations.Program> ConfigurationHost(NpgsqlDataSource database, ConfigurationPublisher publisher, PublicationGate schedule)
    {
        return infrastructure.App<Reservations.Program>(database).WithWebHostBuilder(builder => builder.ConfigureServices(services =>
        {
            _ = services.RemoveAll<IReservationPublisher>();
            _ = services.AddSingleton<IReservationPublisher>(publisher);
            _ = services.RemoveAll<IRecoverySchedule>();
            _ = services.AddSingleton<IRecoverySchedule>(schedule);
        }));
    }

    private sealed class ConfigurationPublisher(IReservationPublisher realPublisher) : IReservationPublisher
    {
        public int Attempts
        {
            get; private set;
        }

        public Exception? Failure
        {
            get; private set;
        }

        public async Task PublishAsync(ReservationEvent message, string? traceparent, string? tracestate, CancellationToken cancellationToken)
        {
            Attempts++;
            try
            {
                await realPublisher.PublishAsync(message, traceparent, tracestate, cancellationToken);
            }
            catch (Exception exception)
            {
                Failure = exception;
                throw;
            }
        }
    }

    [Theory]
    [InlineData("return")]
    [InlineData("nack")]
    [InlineData("timeout")]
    public async Task UnconfirmedProviderOutcomeStaysPendingAndRetryPreservesWholeEnvelope(string fault)
    {
        using var deadline = new CancellationTokenSource(TimeSpan.FromSeconds(60));
        await infrastructure.ResetQueueAsync(deadline.Token);
        await using BookingScenario scenario = await BookingScenario.CreateAsync(infrastructure.Postgres);
        scenario.Clock.Now = DateTimeOffset.UtcNow;
        BookedReservation original = (await (await scenario.BookAsync()).Content.ReadFromJsonAsync<BookedReservation>(cancellationToken: TestContext.Current.CancellationToken))!;
        await using NpgsqlDataSource inbox = await infrastructure.Postgres.CreateMigratedDatabaseAsync("notifications");
        IConfigurationRoot configuration = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?> { ["ConnectionStrings:messaging"] = infrastructure.Publisher }).Build();
        var boundary = new UnconfirmedPublisher(new ReservationPublisher(configuration), infrastructure.Messaging, fault);
        using var schedule = new PublicationGate();
        using WebApplicationFactory<Reservations.Program> sender = infrastructure.App<Reservations.Program>(scenario.Database).WithWebHostBuilder(builder => builder.ConfigureServices(services =>
        {
            _ = services.RemoveAll<IReservationPublisher>();
            _ = services.AddSingleton<IReservationPublisher>(boundary);
            _ = services.RemoveAll<IRecoverySchedule>();
            _ = services.AddSingleton<IRecoverySchedule>(schedule);
        }));
        using HttpClient producer = sender.CreateClient();
        using WebApplicationFactory<Notifications.Program> receiver = infrastructure.App<Notifications.Program>(inbox);
        using HttpClient client = receiver.CreateClient();
        await schedule.Waiting.Task.WaitAsync(TimeSpan.FromSeconds(10), deadline.Token);
        Assert.NotNull(boundary.Failure);
        if (fault != "timeout")
        {
            Assert.True(boundary.Failure is PublishException, $"Expected confirmation failure; broker response: {(boundary.Failure as OperationInterruptedException)?.ShutdownReason}");
            PublishException failure = Assert.IsAssignableFrom<PublishException>(boundary.Failure);
            Assert.Equal(fault == "return", failure.IsReturn);
        }
        else
        {
            _ = Assert.IsAssignableFrom<OperationCanceledException>(boundary.Failure);
        }

        await using NpgsqlCommand pending = scenario.Database.CreateCommand("SELECT published_at IS NULL AND attempt_count=1 FROM reservation_outbox WHERE event_id=$1");
        _ = pending.Parameters.AddWithValue(original.ConfirmationEventId);
        Assert.True((bool)(await pending.ExecuteScalarAsync(deadline.Token))!);
        Assert.Empty((await client.GetFromJsonAsync<ObservedNotification[]>("/api/notifications", deadline.Token))!);
        schedule.Resume();
        Assert.Equal(original.ConfirmationEventId, Assert.Single(await ReservationDeliveryFixture.AwaitInboxAsync(client, 1, deadline.Token)).EventId);
        Assert.Equal(2, boundary.Events.Count);
        Assert.Equal(boundary.Events[0], boundary.Events[1]);
    }

    private sealed class PublicationGate : IRecoverySchedule, IDisposable
    {
        private readonly SemaphoreSlim resume = new(0);

        public TaskCompletionSource Waiting { get; } = new(TaskCreationOptions.RunContinuationsAsynchronously);

        public TimeSpan FirstDelay
        {
            get; private set;
        }

        public int Calls
        {
            get; private set;
        }

        public double Jitter()
        {
            return 0.5;
        }

        public async Task DelayAsync(TimeSpan delay, CancellationToken cancellationToken)
        {
            Calls++;
            if (Calls == 1)
            {
                FirstDelay = delay;
            }

            _ = Waiting.TrySetResult();
            await resume.WaitAsync(cancellationToken);
            await Task.Delay(delay, cancellationToken);
        }

        public void Resume()
        {
            _ = resume.Release();
        }

        public void Dispose()
        {
            resume.Dispose();
        }
    }

    private sealed class UnconfirmedPublisher(IReservationPublisher realPublisher, string messaging, string fault) : IReservationPublisher
    {
        public List<ReservationEvent> Events { get; } = [];

        public Exception? Failure
        {
            get; private set;
        }

        public async Task PublishAsync(ReservationEvent message, string? traceparent, string? tracestate, CancellationToken cancellationToken)
        {
            Events.Add(message);
            if (Events.Count != 1)
            {
                await realPublisher.PublishAsync(message, traceparent, tracestate, cancellationToken);
                return;
            }

            try
            {
                if (fault == "timeout")
                {
                    // A public publisher boundary stall isolates the worker's cancellation budget;
                    // real return/nack frames below independently verify the provider contract.
                    await Task.Delay(Timeout.Infinite, cancellationToken);
                    return;
                }

                await using IConnection connection = await RabbitConnection.Factory(messaging, TimeSpan.FromSeconds(3)).CreateConnectionAsync(cancellationToken);
                await using IChannel channel = await connection.CreateChannelAsync(new CreateChannelOptions(true, true), cancellationToken);
                string routing = "fixture.unroutable";
                if (fault == "nack")
                {
                    _ = await channel.QueueDeclareAsync("fixture-reject", false, true, true, new Dictionary<string, object?> { ["x-max-length"] = 0, ["x-overflow"] = "reject-publish" }, cancellationToken: cancellationToken);
                    routing = "fixture.reject";
                    await channel.QueueBindAsync("fixture-reject", ReservationTopology.Exchange, routing, cancellationToken: cancellationToken);
                }

                var properties = new BasicProperties
                {
                    Persistent = true,
                    ContentType = "application/json",
                    MessageId = message.EventId.ToString(),
                    CorrelationId = message.ReservationId.ToString(),
                    Headers = new Dictionary<string, object?> { ["schema"] = 1 }
                };
                byte[] body = JsonSerializer.SerializeToUtf8Bytes(message, ReservationJsonContext.Default.ReservationEvent);
                await channel.BasicPublishAsync(ReservationTopology.Exchange, routing, true, properties, body, cancellationToken);
            }
            catch (Exception exception)
            {
                Failure = exception;
                throw;
            }
        }
    }

    [Fact]
    public async Task InitialBrokerOutageDoesNotPreventCommittedTransitionsAndRecoveryDeliversStableIds()
    {
        using var deadline = new CancellationTokenSource(TimeSpan.FromSeconds(60));
        await infrastructure.ResetQueueAsync(deadline.Token);
        await infrastructure.StopBrokerAsync(deadline.Token);
        await using BookingScenario scenario = await BookingScenario.CreateAsync(infrastructure.Postgres);
        await using NpgsqlDataSource inbox = await infrastructure.Postgres.CreateMigratedDatabaseAsync("notifications");
        using WebApplicationFactory<Reservations.Program> reservations = scenario.App.WithWebHostBuilder(builder => builder.ConfigureAppConfiguration((context, configuration) =>
        {
            _ = configuration.AddInMemoryCollection(new Dictionary<string, string?> { ["ConnectionStrings:messaging"] = infrastructure.Publisher });
        }).ConfigureServices(services =>
        {
            _ = services.RemoveAll<TimeProvider>();
            _ = services.AddSingleton(TimeProvider.System);
        }));
        using WebApplicationFactory<Notifications.Program> notifications = infrastructure.App<Notifications.Program>(inbox);
        using HttpClient client = reservations.CreateClient();
        using HttpClient receiver = notifications.CreateClient();
        try
        {
            HttpResponseMessage created = await client.PostAsJsonAsync("/api/reservations", new
            {
                equipmentId = "camera-001",
                startAt = "2030-01-02T12:00:00Z",
                endAt = "2030-01-02T13:00:00Z"
            }, deadline.Token);
            Assert.Equal(HttpStatusCode.Created, created.StatusCode);
            BookedReservation original = (await created.Content.ReadFromJsonAsync<BookedReservation>(deadline.Token))!;
            HttpResponseMessage cancelled = await client.PostAsync($"/api/reservations/{original.Id}/cancel", null, deadline.Token);
            Assert.Equal(HttpStatusCode.OK, cancelled.StatusCode);
            BookedReservation saved = (await cancelled.Content.ReadFromJsonAsync<BookedReservation>(deadline.Token))!;
            Assert.Equal(HttpStatusCode.OK, (await receiver.GetAsync("/api/notifications", deadline.Token)).StatusCode);
            Assert.Empty((await receiver.GetFromJsonAsync<ObservedNotification[]>("/api/notifications", deadline.Token))!);
            await using NpgsqlCommand pending = scenario.Database.CreateCommand("SELECT count(*) FROM reservation_outbox WHERE published_at IS NULL");
            Assert.Equal(2L, await pending.ExecuteScalarAsync(deadline.Token));
            while (true)
            {
                await using NpgsqlCommand attempted = scenario.Database.CreateCommand("SELECT EXISTS(SELECT 1 FROM reservation_outbox WHERE attempt_count > 0)");
                if ((bool)(await attempted.ExecuteScalarAsync(deadline.Token))!)
                {
                    break;
                }

                await Task.Delay(100, deadline.Token);
            }

            await infrastructure.StartBrokerAsync(deadline.Token);
            ObservedNotification[] entries = await ReservationDeliveryFixture.AwaitInboxAsync(receiver, 2, deadline.Token);
            Assert.Equal(new[] { original.ConfirmationEventId, saved.CancellationEventId!.Value }.Order(), entries.Select(entry => entry.EventId).Order());
            Assert.All(entries, entry => Assert.Equal(original.Id, entry.ReservationId));
            Assert.Equal("Cancelled", (await client.GetFromJsonAsync<BookedReservation>($"/api/reservations/{original.Id}", deadline.Token))!.Status);
        }
        finally
        {
            using var cleanup = new CancellationTokenSource(TimeSpan.FromSeconds(60));
            await infrastructure.StartBrokerAsync(cleanup.Token);
        }
    }

    [Fact]
    public async Task BrokerAcceptanceBeforePublishedCommitRemainsPendingAndDuplicatesAreDeduplicated()
    {
        using var deadline = new CancellationTokenSource(TimeSpan.FromSeconds(60));
        await infrastructure.ResetQueueAsync(deadline.Token);
        await using BookingScenario scenario = await BookingScenario.CreateAsync(infrastructure.Postgres);
        scenario.Clock.Now = DateTimeOffset.UtcNow;
        BookedReservation booking = (await (await scenario.BookAsync()).Content.ReadFromJsonAsync<BookedReservation>(cancellationToken: TestContext.Current.CancellationToken))!;
        await using NpgsqlCommand trigger = scenario.Database.CreateCommand("CREATE FUNCTION fail_published() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.published_at IS NOT NULL THEN RAISE EXCEPTION 'controlled published commit failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER fail_published BEFORE UPDATE ON reservation_outbox FOR EACH ROW EXECUTE FUNCTION fail_published()");
        _ = await trigger.ExecuteNonQueryAsync(deadline.Token);
        await using NpgsqlDataSource inbox = await infrastructure.Postgres.CreateMigratedDatabaseAsync("notifications");
        using WebApplicationFactory<Notifications.Program> notifications = infrastructure.App<Notifications.Program>(inbox);
        using HttpClient receiver = notifications.CreateClient();
        using (WebApplicationFactory<Reservations.Program> sender = infrastructure.App<Reservations.Program>(scenario.Database))
        using (HttpClient starter = sender.CreateClient())
        {
            ObservedNotification[] first = await ReservationDeliveryFixture.AwaitInboxAsync(receiver, 1, deadline.Token);
            Assert.Equal(booking.ConfirmationEventId, Assert.Single(first).EventId);
            await using NpgsqlCommand pending = scenario.Database.CreateCommand("SELECT published_at FROM reservation_outbox WHERE event_id=$1");
            _ = pending.Parameters.AddWithValue(booking.ConfirmationEventId);
            Assert.Equal(DBNull.Value, await pending.ExecuteScalarAsync(deadline.Token));
        }

        await using NpgsqlCommand repair = scenario.Database.CreateCommand("DROP TRIGGER fail_published ON reservation_outbox");
        _ = await repair.ExecuteNonQueryAsync(deadline.Token);
        using WebApplicationFactory<Reservations.Program> restarted = infrastructure.App<Reservations.Program>(scenario.Database);
        using HttpClient started = restarted.CreateClient();
        while (true)
        {
            await using NpgsqlCommand published = scenario.Database.CreateCommand("SELECT published_at IS NOT NULL FROM reservation_outbox WHERE event_id=$1");
            _ = published.Parameters.AddWithValue(booking.ConfirmationEventId);
            if ((bool)(await published.ExecuteScalarAsync(deadline.Token))!)
            {
                break;
            }

            await Task.Delay(100, deadline.Token);
        }

        Assert.Equal(booking.ConfirmationEventId, Assert.Single((await receiver.GetFromJsonAsync<ObservedNotification[]>("/api/notifications", deadline.Token))!).EventId);
        Assert.Equal(1L, await scenario.CountAsync("reservation_outbox"));
    }
}
