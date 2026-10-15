using System.Net;
using System.Net.Http.Json;
using System.Text;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Npgsql;

namespace Backend.Tests;

internal sealed class BookingScenario : IAsyncDisposable
{
    private BookingScenario(NpgsqlDataSource database, InventoryBoundary inventory)
    {
        Database = database;
        Inventory = inventory;
        Clock = new TestTimeProvider(new DateTimeOffset(2030, 1, 1, 12, 0, 0, TimeSpan.Zero));
        App = PostgresFixture.Factory<Reservations.Program>(database).WithWebHostBuilder(builder => builder.ConfigureServices(services =>
        {
            _ = services.RemoveAll<TimeProvider>();
            _ = services.AddSingleton<TimeProvider>(Clock);
            _ = services.AddHttpClient("inventory", client => client.BaseAddress = new Uri("http://inventory"))
                .ConfigurePrimaryHttpMessageHandler(() => inventory);
        }));
        Client = App.CreateClient();
    }

    public NpgsqlDataSource Database
    {
        get;
    }

    public InventoryBoundary Inventory
    {
        get;
    }

    public TestTimeProvider Clock
    {
        get;
    }

    public WebApplicationFactory<Reservations.Program> App
    {
        get;
    }

    public HttpClient Client
    {
        get;
    }

    public static async Task<BookingScenario> CreateAsync(PostgresFixture postgres, InventoryBoundary? inventory = null)
    {
        NpgsqlDataSource database = await postgres.CreateMigratedDatabaseAsync("reservations");
        return new BookingScenario(database, inventory ?? new InventoryBoundary());
    }

    public Task<HttpResponseMessage> BookAsync(string start = "2030-01-02T12:00:00Z", string end = "2030-01-02T13:00:00Z", string equipment = "camera-001")
    {
        return Client.PostAsJsonAsync("/api/reservations", new
        {
            equipmentId = equipment,
            startAt = start,
            endAt = end
        });
    }

    public Task<HttpResponseMessage> AvailabilityAsync(string start = "2030-01-02T12:00:00Z", string end = "2030-01-02T13:00:00Z", string equipment = "camera-001")
    {
        return Client.GetAsync($"/api/availability?equipmentId={Uri.EscapeDataString(equipment)}&startAt={Uri.EscapeDataString(start)}&endAt={Uri.EscapeDataString(end)}");
    }

    public async Task<long> CountAsync(string table)
    {
        string sql = table switch
        {
            "reservations" => "SELECT count(*) FROM reservations",
            "reservation_outbox" => "SELECT count(*) FROM reservation_outbox",
            _ => throw new ArgumentException("Unknown fixture table.", nameof(table))
        };
        await using NpgsqlCommand command = Database.CreateCommand(sql);
        return (long)(await command.ExecuteScalarAsync())!;
    }

    public async ValueTask DisposeAsync()
    {
        Client.Dispose();
        await App.DisposeAsync();
        await Database.DisposeAsync();
    }
}

internal sealed class InventoryBoundary : HttpMessageHandler
{
    private int calls;

    public int Calls => calls;

    public HttpStatusCode? FailureStatus
    {
        get; init;
    }

    public string? ResponseBody
    {
        get; init;
    }

    public bool Unavailable
    {
        get; init;
    }

    public bool Stall
    {
        get; init;
    }

    public Func<CancellationToken, Task>? BeforeReply
    {
        get; init;
    }

    protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
    {
        _ = Interlocked.Increment(ref calls);
        if (BeforeReply is not null)
        {
            await BeforeReply(cancellationToken);
        }

        if (Stall)
        {
            await Task.Delay(Timeout.Infinite, cancellationToken);
        }

        if (Unavailable)
        {
            throw new HttpRequestException("secret upstream fault");
        }

        if (FailureStatus is { } status)
        {
            return new HttpResponseMessage(status);
        }

        string id = request.RequestUri!.Segments[^1];
        return id == "unknown" ? new HttpResponseMessage(HttpStatusCode.NotFound) : SuccessfulResponse(id);
    }

    private HttpResponseMessage SuccessfulResponse(string id)
    {
        return new HttpResponseMessage(HttpStatusCode.OK)
        {
            Content = ResponseBody is { } body
            ? new StringContent(body, Encoding.UTF8, "application/json")
            : JsonContent.Create(new
            {
                id,
                name = id == "laptop-001" ? "Demo Laptop" : "Demo Camera",
                operational = id != "projector-001"
            })
        };
    }
}

internal sealed record BookedReservation(Guid Id, string DemoUserId, string EquipmentId, string EquipmentName, DateTimeOffset StartAt, DateTimeOffset EndAt, string Status, DateTimeOffset ConfirmedAt, DateTimeOffset? CancelledAt, Guid ConfirmationEventId, Guid? CancellationEventId);

internal sealed record AvailabilityResult(string EquipmentId, DateTimeOffset StartAt, DateTimeOffset EndAt, bool Available, bool Advisory);
