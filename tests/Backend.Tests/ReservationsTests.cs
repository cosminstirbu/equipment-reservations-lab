using System.Net;
using System.Net.Http.Json;
using HelloMessaging;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Npgsql;
using Xunit;

namespace Backend.Tests;

[Collection("PostgreSQL")]
public class ReservationsTests(PostgresFixture postgres)
{
    [Fact]
    public async Task ConfirmedEquipmentReturnsDistinctIdsAfterPublish()
    {
        await using NpgsqlDataSource database = await postgres.CreateMigratedDatabaseAsync("reservations");
        var publisher = new Publisher();
        using WebApplicationFactory<Reservations.Program> app = Factory(database, publisher);
        using HttpClient client = app.CreateClient();
        var ids = new List<Guid>();
        for (int i = 0; i < 2; i++)
        {
            HttpResponseMessage response = await client.PostAsJsonAsync("/api/hellos", new
            {
                equipmentId = "camera-001"
            });
            Assert.Equal(HttpStatusCode.Accepted, response.StatusCode);
            ids.Add((await response.Content.ReadFromJsonAsync<Result>())!.CorrelationId);
        }

        Assert.All(ids, id => Assert.NotEqual(Guid.Empty, id));
        Assert.NotEqual(ids[0], ids[1]);
        Assert.Equal(ids, publisher.Events.Select(e => e.CorrelationId));
        Assert.All(publisher.Events, e => Assert.Equal("Demo Camera", e.EquipmentName));
    }

    [Theory]
    [InlineData("unknown", 404)]
    [InlineData("", 400)]
    [InlineData("bad id", 400)]
    public async Task RejectionDoesNotPublish(string id, int status)
    {
        await using NpgsqlDataSource database = await postgres.CreateMigratedDatabaseAsync("reservations");
        var publisher = new Publisher();
        using WebApplicationFactory<Reservations.Program> app = Factory(database, publisher);
        using HttpClient client = app.CreateClient();
        Assert.Equal(status, (int)(await client.PostAsJsonAsync("/api/hellos", new
        {
            equipmentId = id
        })).StatusCode);
        Assert.Empty(publisher.Events);
    }

    [Fact]
    public async Task OversizedAndMalformedRequestsDoNotPublish()
    {
        await using NpgsqlDataSource database = await postgres.CreateMigratedDatabaseAsync("reservations");
        var publisher = new Publisher();
        using WebApplicationFactory<Reservations.Program> app = Factory(database, publisher);
        using HttpClient client = app.CreateClient();
        Assert.Equal(HttpStatusCode.RequestEntityTooLarge, (await client.PostAsJsonAsync("/api/hellos", new
        {
            equipmentId = new string('a', 5000)
        })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsync("/api/hellos", new StringContent("{", System.Text.Encoding.UTF8, "application/json"))).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync("/api/hellos", new
        {
        })).StatusCode);
        Assert.Empty(publisher.Events);
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task DependencyFailureIsSafeAndNotRetried(bool broker)
    {
        await using NpgsqlDataSource database = await postgres.CreateMigratedDatabaseAsync("reservations");
        var publisher = new Publisher { Fail = broker };
        var http = new InventoryBoundary { Fail = !broker };
        using WebApplicationFactory<Reservations.Program> app = Factory(database, publisher, http);
        using HttpClient client = app.CreateClient();
        HttpResponseMessage response = await client.PostAsJsonAsync("/api/hellos", new
        {
            equipmentId = "camera-001"
        });
        Assert.Equal(HttpStatusCode.ServiceUnavailable, response.StatusCode);
        Assert.DoesNotContain("secret", await response.Content.ReadAsStringAsync());
        Assert.Equal(1, http.Calls);
        Assert.Equal(broker ? 1 : 0, publisher.Calls);
    }

    [Fact]
    public async Task PublisherStallCancelsWithinThreeSecondsWithoutRetry()
    {
        await using NpgsqlDataSource database = await postgres.CreateMigratedDatabaseAsync("reservations");
        var publisher = new Publisher { Stall = true };
        using WebApplicationFactory<Reservations.Program> app = Factory(database, publisher);
        using HttpClient client = app.CreateClient();
        var start = System.Diagnostics.Stopwatch.StartNew();
        Assert.Equal(HttpStatusCode.ServiceUnavailable, (await client.PostAsJsonAsync("/api/hellos", new
        {
            equipmentId = "camera-001"
        })).StatusCode);
        Assert.InRange(start.Elapsed.TotalSeconds, 2, 5);
        Assert.Equal(1, publisher.Calls);
    }

    [Fact]
    public async Task InventoryStallCancelsWithinBudgetWithoutPublish()
    {
        await using NpgsqlDataSource database = await postgres.CreateMigratedDatabaseAsync("reservations");
        var publisher = new Publisher();
        var http = new InventoryBoundary { Stall = true };
        using WebApplicationFactory<Reservations.Program> app = Factory(database, publisher, http);
        using HttpClient client = app.CreateClient();
        var start = System.Diagnostics.Stopwatch.StartNew();
        Assert.Equal(HttpStatusCode.ServiceUnavailable, (await client.PostAsJsonAsync("/api/hellos", new
        {
            equipmentId = "camera-001"
        })).StatusCode);
        Assert.InRange(start.Elapsed.TotalSeconds, 2, 5);
        Assert.Empty(publisher.Events);
        Assert.Equal(1, http.Calls);
    }

    private static WebApplicationFactory<Reservations.Program> Factory(NpgsqlDataSource database, Publisher publisher, InventoryBoundary? http = null)
    {
        return PostgresFixture.Factory<Reservations.Program>(database).WithWebHostBuilder(builder => builder.ConfigureServices(services =>
        {
            _ = services.RemoveAll<IHelloPublisher>();
            _ = services.AddSingleton<IHelloPublisher>(publisher);
            _ = services.AddHttpClient("inventory", c => c.BaseAddress = new Uri("http://inventory")).ConfigurePrimaryHttpMessageHandler(() => http ?? new InventoryBoundary());
        }));
    }

    private sealed record Result(Guid CorrelationId);

    private sealed class Publisher : IHelloPublisher
    {
        public List<HelloRequested> Events { get; } = [];

        public bool Fail, Stall;

        public int Calls;

        public async Task PublishAsync(HelloRequested hello, CancellationToken ct)
        {
            Calls++;
            if (Stall)
            {
                await Task.Delay(Timeout.Infinite, ct);
            }

            if (Fail)
            {
                throw new IOException("secret broker failure");
            }

            Events.Add(hello);
        }
    }

    private sealed class InventoryBoundary : HttpMessageHandler
    {
        public bool Fail, Stall;

        public int Calls;

        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
        {
            Calls++;
            if (Stall)
            {
                await Task.Delay(Timeout.Infinite, ct);
            }

            if (Fail)
            {
                throw new HttpRequestException("secret upstream failure");
            }

            var response = new HttpResponseMessage(HttpStatusCode.NotFound);
            if (request.RequestUri!.AbsolutePath.EndsWith("camera-001", StringComparison.Ordinal))
            {
                response.StatusCode = HttpStatusCode.OK;
                response.Content = JsonContent.Create(new Equipment("camera-001", "Demo Camera"));
            }

            return response;
        }
    }
}
