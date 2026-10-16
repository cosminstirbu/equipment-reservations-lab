using System.Net;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using Npgsql;
using Xunit;

namespace Backend.Tests;

[Collection("PostgreSQL")]
public sealed class BookingConcurrencyTests(PostgresFixture postgres)
{
    [Theory]
    [InlineData("2030-01-02T12:00:00Z", "2030-01-02T13:00:00Z")]
    [InlineData("2030-01-02T11:00:00Z", "2030-01-02T14:00:00Z")]
    [InlineData("2030-01-02T12:15:00Z", "2030-01-02T12:45:00Z")]
    [InlineData("2030-01-02T12:30:00Z", "2030-01-02T13:30:00Z")]
    [InlineData("2030-01-02T11:30:00Z", "2030-01-02T12:30:00Z")]
    public async Task ConfirmedOverlapsAreRejectedWithoutAnotherReservationOrEvent(string start, string end)
    {
        await using BookingScenario scenario = await BookingScenario.CreateAsync(postgres);
        Assert.Equal(HttpStatusCode.Created, (await scenario.BookAsync()).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await scenario.BookAsync(start, end)).StatusCode);
        Assert.Equal(1L, await scenario.CountAsync("reservations"));
        Assert.Equal(1L, await scenario.CountAsync("reservation_outbox"));
        Assert.False((await (await scenario.AvailabilityAsync(start, end)).Content.ReadFromJsonAsync<AvailabilityResult>())!.Available);
    }

    [Fact]
    public async Task AdjacentIntervalsAtBothBoundariesAndOtherEquipmentSucceed()
    {
        await using BookingScenario scenario = await BookingScenario.CreateAsync(postgres);
        Assert.Equal(HttpStatusCode.Created, (await scenario.BookAsync()).StatusCode);
        Assert.Equal(HttpStatusCode.Created, (await scenario.BookAsync("2030-01-02T11:00:00Z", "2030-01-02T12:00:00Z")).StatusCode);
        Assert.Equal(HttpStatusCode.Created, (await scenario.BookAsync("2030-01-02T13:00:00Z", "2030-01-02T14:00:00Z")).StatusCode);
        Assert.Equal(HttpStatusCode.Created, (await scenario.BookAsync(equipment: "laptop-001")).StatusCode);
        Assert.Equal(4L, await scenario.CountAsync("reservations"));
        Assert.Equal(4L, await scenario.CountAsync("reservation_outbox"));
    }

    [Fact]
    public async Task SimultaneousOverlappingRequestsHaveExactlyOneCommittedWinner()
    {
        int arrived = 0;
        var gate = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var inventory = new InventoryBoundary
        {
            BeforeReply = async cancellationToken =>
            {
                if (Interlocked.Increment(ref arrived) == 2)
                {
                    gate.SetResult();
                }

                await gate.Task.WaitAsync(TimeSpan.FromSeconds(5), cancellationToken);
            }
        };
        await using BookingScenario scenario = await BookingScenario.CreateAsync(postgres, inventory);
        using HttpClient other = scenario.ClientFor("employee-b-subject");
        HttpResponseMessage[] responses = await Task.WhenAll(scenario.BookAsync(), other.PostAsJsonAsync("/api/reservations", new
        {
            equipmentId = "camera-001",
            startAt = "2030-01-02T12:00:00Z",
            endAt = "2030-01-02T13:00:00Z"
        }));
        Assert.Equal([HttpStatusCode.Created, HttpStatusCode.Conflict], responses.Select(response => response.StatusCode).Order());
        Assert.Equal(1L, await scenario.CountAsync("reservations"));
        Assert.Equal(1L, await scenario.CountAsync("reservation_outbox"));
        BookedReservation[] firstHistory = (await scenario.Client.GetFromJsonAsync<BookedReservation[]>("/api/reservations"))!;
        BookedReservation[] secondHistory = (await other.GetFromJsonAsync<BookedReservation[]>("/api/reservations"))!;
        _ = Assert.Single(firstHistory.Concat(secondHistory));
        await using NpgsqlCommand guard = scenario.Database.CreateCommand("SELECT count(*) FROM pg_constraint WHERE conname='reservations_no_confirmed_overlap' AND contype='x'");
        Assert.Equal(1L, await guard.ExecuteScalarAsync());
    }

    [Fact]
    public async Task StaleAvailableResultCannotOverrideCommittedAllocation()
    {
        await using BookingScenario scenario = await BookingScenario.CreateAsync(postgres);
        Assert.True((await (await scenario.AvailabilityAsync()).Content.ReadFromJsonAsync<AvailabilityResult>())!.Available);
        Assert.Equal(HttpStatusCode.Created, (await scenario.BookAsync()).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await scenario.BookAsync()).StatusCode);
        Assert.Equal(1L, await scenario.CountAsync("reservations"));
    }

    [Fact]
    public async Task OutboxInsertFailureRollsBackTheReservation()
    {
        await using BookingScenario scenario = await BookingScenario.CreateAsync(postgres);
        await using (NpgsqlCommand fault = scenario.Database.CreateCommand("CREATE FUNCTION fail_outbox() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Controlled outbox failure'; END $$; CREATE TRIGGER fail_outbox BEFORE INSERT ON reservation_outbox FOR EACH ROW EXECUTE FUNCTION fail_outbox();"))
        {
            _ = await fault.ExecuteNonQueryAsync();
        }

        Assert.Equal(HttpStatusCode.InternalServerError, (await scenario.BookAsync()).StatusCode);
        Assert.Equal(0L, await scenario.CountAsync("reservations"));
        Assert.Equal(0L, await scenario.CountAsync("reservation_outbox"));
    }

    [Fact]
    public async Task DisconnectedWriteResponseCanBeRecoveredThroughDurableHistory()
    {
        await using BookingScenario scenario = await BookingScenario.CreateAsync(postgres);
        using WebApplicationFactory<Reservations.Program> disconnectedApp = scenario.App.WithWebHostBuilder(builder => builder.ConfigureServices(services =>
        {
            _ = services.AddSingleton<IStartupFilter, DisconnectFilter>();
        }));
        using HttpClient client = disconnectedApp.CreateClient();
        using var deadline = new CancellationTokenSource(TimeSpan.FromSeconds(5));
        Exception? interrupted = await Record.ExceptionAsync(async () =>
        {
            using HttpResponseMessage response = await client.PostAsJsonAsync("/api/reservations", new
            {
                equipmentId = "camera-001",
                startAt = "2030-01-02T12:00:00Z",
                endAt = "2030-01-02T13:00:00Z"
            }, deadline.Token);
            Assert.True((int)response.StatusCode >= 500, "A disconnected write must not be acknowledged as successful.");
        });
        Assert.True(interrupted is null or IOException or HttpRequestException or OperationCanceledException);
        BookedReservation reservation = Assert.Single((await scenario.Client.GetFromJsonAsync<BookedReservation[]>("/api/reservations"))!);
        Assert.NotEqual(Guid.Empty, reservation.Id);
        Assert.NotEqual(Guid.Empty, reservation.ConfirmationEventId);
        Assert.Equal("Confirmed", reservation.Status);
        Assert.Equal(1L, await scenario.CountAsync("reservations"));
    }

    private sealed class DisconnectFilter : IStartupFilter
    {
        public Action<IApplicationBuilder> Configure(Action<IApplicationBuilder> next)
        {
            return application =>
            {
                _ = application.Use(async (context, nextMiddleware) =>
                {
                    if (context.Request.Method != "POST" || context.Request.Path != "/api/reservations")
                    {
                        await nextMiddleware(context);
                        return;
                    }

                    Stream original = context.Response.Body;
                    await using var disconnected = new DisconnectedResponseStream();
                    context.Response.Body = disconnected;
                    try
                    {
                        await nextMiddleware(context);
                    }
                    catch (IOException)
                    {
                        context.Abort();
                    }
                    finally
                    {
                        context.Response.Body = original;
                    }
                });
                next(application);
            };
        }
    }

    private sealed class DisconnectedResponseStream : Stream
    {
        public override bool CanRead => false;

        public override bool CanSeek => false;

        public override bool CanWrite => true;

        public override long Length => throw new NotSupportedException();

        public override long Position
        {
            get => throw new NotSupportedException();
            set => throw new NotSupportedException();
        }

        public override void Flush()
        {
        }

        public override int Read(byte[] buffer, int offset, int count)
        {
            throw new NotSupportedException();
        }

        public override long Seek(long offset, SeekOrigin origin)
        {
            throw new NotSupportedException();
        }

        public override void SetLength(long value)
        {
            throw new NotSupportedException();
        }

        public override void Write(byte[] buffer, int offset, int count)
        {
            throw new IOException("Controlled response disconnection");
        }

        public override ValueTask WriteAsync(ReadOnlyMemory<byte> buffer, CancellationToken cancellationToken = default)
        {
            return ValueTask.FromException(new IOException("Controlled response disconnection"));
        }
    }
}
