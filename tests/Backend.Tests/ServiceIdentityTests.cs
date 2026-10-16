using System.Collections.Concurrent;
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using IdentityAccess;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using Npgsql;
using Xunit;

namespace Backend.Tests;

[Collection("PostgreSQL")]
public sealed class ServiceIdentityTests(PostgresFixture postgres)
{
    [Fact]
    public async Task ConcurrentReadsAcquireOneServiceTokenAndNeverForwardBrowserAuthority()
    {
        var tokens = new ServiceTokenBoundary();
        var authorities = new ConcurrentQueue<string?>();
        await using BookingScenario scenario = await BookingScenario.CreateAsync(postgres, new InventoryBoundary
        {
            InspectRequest = request => authorities.Enqueue(request.Headers.Authorization?.Parameter)
        });
        await using WebApplicationFactory<Reservations.Program> app = ServiceApp(scenario, tokens);
        using HttpClient client = app.CreateClient();
        using HttpResponseMessage first = await client.GetAsync(AvailabilityPath);
        Assert.Equal(HttpStatusCode.OK, first.StatusCode);
        HttpResponseMessage[] replies = await Task.WhenAll(Enumerable.Range(0, 8).Select(_ => client.GetAsync(AvailabilityPath)));
        foreach (HttpResponseMessage reply in replies)
        {
            using (reply)
            {
                Assert.Equal(HttpStatusCode.OK, reply.StatusCode);
            }
        }

        Assert.Equal(1, tokens.Calls);
        Assert.Equal(9, authorities.Count);
        Assert.All(authorities, token => Assert.True(token == tokens.AccessToken, "Inventory must receive only the dedicated service authority."));
        Assert.Equal(0L, await scenario.CountAsync("reservations"));
        Assert.Equal(0L, await scenario.CountAsync("reservation_outbox"));
    }

    [Fact]
    public async Task ConcurrentInitialReadsUseSingleFlightAcquisition()
    {
        var entered = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var release = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var tokens = new ServiceTokenBoundary
        {
            BeforeReply = token =>
            {
                _ = entered.TrySetResult();
                return release.Task.WaitAsync(token);
            }
        };
        await using BookingScenario scenario = await BookingScenario.CreateAsync(postgres);
        await using WebApplicationFactory<Reservations.Program> app = ServiceApp(scenario, tokens);
        using HttpClient client = app.CreateClient();
        Task<HttpResponseMessage[]> pending = Task.WhenAll(Enumerable.Range(0, 8).Select(_ => client.GetAsync(AvailabilityPath)));
        await entered.Task.WaitAsync(TimeSpan.FromSeconds(5));
        release.SetResult();
        HttpResponseMessage[] replies = await pending;
        foreach (HttpResponseMessage reply in replies)
        {
            using (reply)
            {
                Assert.Equal(HttpStatusCode.OK, reply.StatusCode);
            }
        }

        Assert.Equal(1, tokens.Calls);
    }

    [Fact]
    public async Task ConcurrentFailedAcquisitionIsSharedAndLaterExplicitActionCanTryAgain()
    {
        var entered = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var release = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var tokens = new ServiceTokenBoundary
        {
            Status = HttpStatusCode.ServiceUnavailable,
            BeforeReply = token =>
            {
                _ = entered.TrySetResult();
                return release.Task.WaitAsync(token);
            }
        };
        await using BookingScenario scenario = await BookingScenario.CreateAsync(postgres);
        await using WebApplicationFactory<Reservations.Program> app = ServiceApp(scenario, tokens);
        using HttpClient client = app.CreateClient();
        using HttpResponseMessage history = await client.GetAsync("/api/reservations");
        Assert.Equal(HttpStatusCode.OK, history.StatusCode);

        Task<HttpResponseMessage> pending = client.GetAsync(AvailabilityPath);
        await entered.Task.WaitAsync(TimeSpan.FromSeconds(5));
        ServiceTokenClient authority = app.Services.GetRequiredService<ServiceTokenClient>();
        Task<string>[] waiters = [.. Enumerable.Range(0, 7).Select(_ => authority.GetTokenAsync(new Uri("http://inventory"), CancellationToken.None))];
        Assert.All(waiters, waiter => Assert.False(waiter.IsCompleted));
        release.SetResult();
        using HttpResponseMessage reply = await pending;
        Assert.Equal(HttpStatusCode.ServiceUnavailable, reply.StatusCode);
        foreach (Task<string> waiter in waiters)
        {
            HttpRequestException failure = await Assert.ThrowsAsync<HttpRequestException>(() => waiter);
            Assert.Equal("Service authority unavailable.", failure.Message);
        }

        Assert.Equal(1, tokens.Calls);
        Assert.Equal(0, scenario.Inventory.Calls);
        Assert.Equal(0L, await scenario.CountAsync("reservations"));
        Assert.Equal(0L, await scenario.CountAsync("reservation_outbox"));
        tokens.Status = HttpStatusCode.OK;
        using HttpResponseMessage recovered = await client.GetAsync(AvailabilityPath);
        Assert.Equal(HttpStatusCode.OK, recovered.StatusCode);
        Assert.Equal(2, tokens.Calls);
    }

    [Fact]
    public async Task RefreshMarginAndExpiredAcquisitionFailureNeverUseCachedAuthority()
    {
        var tokens = new ServiceTokenBoundary();
        await using BookingScenario scenario = await BookingScenario.CreateAsync(postgres);
        await using WebApplicationFactory<Reservations.Program> app = ServiceApp(scenario, tokens);
        using HttpClient client = app.CreateClient();
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync(AvailabilityPath)).StatusCode);
        scenario.Clock.Now = scenario.Clock.Now.AddSeconds(89);
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync(AvailabilityPath)).StatusCode);
        Assert.Equal(1, tokens.Calls);
        scenario.Clock.Now = scenario.Clock.Now.AddSeconds(2);
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync(AvailabilityPath)).StatusCode);
        Assert.Equal(2, tokens.Calls);
        int inventoryCalls = scenario.Inventory.Calls;
        scenario.Clock.Now = scenario.Clock.Now.AddSeconds(121);
        tokens.Status = HttpStatusCode.ServiceUnavailable;
        await AssertUnavailableAsync(scenario, client);
        Assert.Equal(3, tokens.Calls);
        Assert.Equal(inventoryCalls, scenario.Inventory.Calls);
    }

    [Theory]
    [InlineData(HttpStatusCode.Unauthorized)]
    [InlineData(HttpStatusCode.Forbidden)]
    [InlineData(HttpStatusCode.InternalServerError)]
    public async Task RejectedAcquisitionIsNotRetriedAndHasNoDurableEffects(HttpStatusCode status)
    {
        var tokens = new ServiceTokenBoundary { Status = status };
        await using BookingScenario scenario = await BookingScenario.CreateAsync(postgres);
        await using WebApplicationFactory<Reservations.Program> app = ServiceApp(scenario, tokens);
        using HttpClient client = app.CreateClient();
        await AssertUnavailableAsync(scenario, client);
        Assert.Equal(1, tokens.Calls);
        Assert.Equal(0, scenario.Inventory.Calls);
    }

    [Theory]
    [InlineData("", "Bearer", 120)]
    [InlineData("boundary-service-authority", "Basic", 120)]
    [InlineData("boundary-service-authority", "Bearer", 0)]
    [InlineData("boundary-service-authority", "Bearer", -1)]
    public async Task InvalidTokenContractsCannotReachInventory(string authority, string type, int lifetime)
    {
        var tokens = new ServiceTokenBoundary { AccessToken = authority, TokenType = type, ExpiresIn = lifetime };
        await using BookingScenario scenario = await BookingScenario.CreateAsync(postgres);
        await using WebApplicationFactory<Reservations.Program> app = ServiceApp(scenario, tokens);
        using HttpClient client = app.CreateClient();
        await AssertUnavailableAsync(scenario, client);
        Assert.Equal(1, tokens.Calls);
        Assert.Equal(0, scenario.Inventory.Calls);
    }

    [Theory]
    [InlineData(HttpStatusCode.Unauthorized)]
    [InlineData(HttpStatusCode.Forbidden)]
    public async Task InventoryAuthorityRejectionIsNotReplayed(HttpStatusCode status)
    {
        var tokens = new ServiceTokenBoundary();
        await using BookingScenario scenario = await BookingScenario.CreateAsync(postgres, new InventoryBoundary { FailureStatus = status });
        await using WebApplicationFactory<Reservations.Program> app = ServiceApp(scenario, tokens);
        using HttpClient client = app.CreateClient();
        await AssertUnavailableAsync(scenario, client);
        Assert.Equal(1, tokens.Calls);
        Assert.Equal(1, scenario.Inventory.Calls);
    }

    [Fact]
    public async Task ForeignInventoryOriginIsRejectedBeforeAuthorityOrNetworkAccess()
    {
        var tokens = new ServiceTokenBoundary();
        await using BookingScenario scenario = await BookingScenario.CreateAsync(postgres);
        await using WebApplicationFactory<Reservations.Program> app = ServiceApp(scenario, tokens).WithWebHostBuilder(builder => builder.ConfigureServices(services =>
            services.AddHttpClient("inventory", client => client.BaseAddress = new Uri("https://unrelated.invalid"))));
        using HttpClient client = app.CreateClient();
        await AssertUnavailableAsync(scenario, client);
        Assert.Equal(0, tokens.Calls);
        Assert.Equal(0, scenario.Inventory.Calls);
    }

    [Fact]
    public async Task StalledAcquisitionIsBoundedAndDoesNotReachInventory()
    {
        var tokens = new ServiceTokenBoundary { Stall = true };
        await using BookingScenario scenario = await BookingScenario.CreateAsync(postgres);
        await using WebApplicationFactory<Reservations.Program> app = ServiceApp(scenario, tokens);
        using HttpClient client = app.CreateClient();
        await AssertUnavailableAsync(scenario, client).WaitAsync(TimeSpan.FromSeconds(5));
        Assert.Equal(1, tokens.Calls);
        Assert.True(tokens.Cancelled);
        Assert.Equal(0, scenario.Inventory.Calls);
    }

    [Theory]
    [InlineData("equipment.read", "reservations-service", HttpStatusCode.OK)]
    [InlineData("", "reservations-service", HttpStatusCode.Forbidden)]
    [InlineData("equipment.write", "reservations-service", HttpStatusCode.Forbidden)]
    [InlineData("equipment.read", "unrelated-service", HttpStatusCode.Forbidden)]
    public async Task ActualInventoryRoutesRequireExactDedicatedServiceGrant(string role, string workload, HttpStatusCode expected)
    {
        await using NpgsqlDataSource database = await postgres.CreateMigratedDatabaseAsync("inventory");
        await using WebApplicationFactory<Inventory.Program> app = PostgresFixture.Factory<Inventory.Program>(database);
        using HttpClient client = app.CreateClient();
        string[] grants = role.Length == 0 ? [] : [role];
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", IdentityAuthorityFixture.Shared.Token(
            audience: "inventory-api", kind: "service", client: workload, roles: [], serviceRoles: grants));
        Assert.Equal(expected, (await client.GetAsync("/api/equipment")).StatusCode);
        Assert.Equal(expected, (await client.GetAsync("/api/equipment/camera-001")).StatusCode);
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task ActualHumanRoutesDenyServiceIdentityEvenWithEmployeeRealmGrant(bool employee)
    {
        await using BookingScenario scenario = await BookingScenario.CreateAsync(postgres);
        using HttpClient reservations = scenario.App.CreateClient();
        string[] roles = employee ? ["Employee"] : [];
        reservations.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", IdentityAuthorityFixture.Shared.Token(
            kind: "service", client: "reservations-service", roles: roles, serviceRoles: ["equipment.read"]));
        Assert.Equal(HttpStatusCode.Forbidden, (await reservations.GetAsync(AvailabilityPath)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await reservations.GetAsync("/api/reservations")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await reservations.PostAsJsonAsync("/api/reservations", new
        {
        })).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await reservations.PostAsync($"/api/reservations/{Guid.NewGuid()}/cancel", null)).StatusCode);
        await using NpgsqlDataSource database = await postgres.CreateMigratedDatabaseAsync("notifications");
        await using WebApplicationFactory<Notifications.Program> notificationsApp = PostgresFixture.Factory<Notifications.Program>(database);
        using HttpClient notifications = notificationsApp.CreateClient();
        notifications.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", IdentityAuthorityFixture.Shared.Token(
            audience: "notifications-api", kind: "service", client: "reservations-service", roles: roles, serviceRoles: ["equipment.read"]));
        Assert.Equal(HttpStatusCode.Forbidden, (await notifications.GetAsync("/api/notifications")).StatusCode);
        Assert.Equal(0, scenario.Inventory.Calls);
        Assert.Equal(0L, await scenario.CountAsync("reservations"));
        Assert.Equal(0L, await scenario.CountAsync("reservation_outbox"));
    }

    private const string AvailabilityPath = "/api/availability?equipmentId=camera-001&startAt=2030-01-02T12:00:00Z&endAt=2030-01-02T13:00:00Z";

    private static WebApplicationFactory<Reservations.Program> ServiceApp(BookingScenario scenario, ServiceTokenBoundary tokens)
    {
        return scenario.App.WithWebHostBuilder(builder =>
        {
            _ = builder.UseSetting("Identity:ClientId", "reservations-service");
            _ = builder.UseSetting("Identity:ClientSecret", "fixture-service-credential");
            _ = builder.UseSetting("InventoryUrl", "http://inventory");
            _ = builder.ConfigureServices(services => services.AddHttpClient("identity-service-token").ConfigurePrimaryHttpMessageHandler(() => tokens));
        });
    }

    private static async Task AssertUnavailableAsync(BookingScenario scenario, HttpClient client)
    {
        using HttpResponseMessage response = await client.PostAsJsonAsync("/api/reservations", new
        {
            equipmentId = "camera-001",
            startAt = "2030-01-02T12:00:00Z",
            endAt = "2030-01-02T13:00:00Z"
        });
        Assert.Equal(HttpStatusCode.ServiceUnavailable, response.StatusCode);
        using var problem = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("inventory_unavailable", problem.RootElement.GetProperty("code").GetString());
        Assert.Equal(0L, await scenario.CountAsync("reservations"));
        Assert.Equal(0L, await scenario.CountAsync("reservation_outbox"));
    }
}

internal sealed class ServiceTokenBoundary : HttpMessageHandler
{
    private int calls;

    public int Calls => calls;

    public string AccessToken { get; init; } = "boundary-service-authority";

    public string TokenType { get; init; } = "Bearer";

    public int ExpiresIn { get; init; } = 120;

    public HttpStatusCode Status { get; set; } = HttpStatusCode.OK;

    public bool Stall
    {
        get; init;
    }

    public bool Cancelled
    {
        get; private set;
    }

    public Func<CancellationToken, Task>? BeforeReply
    {
        get; init;
    }

    protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
    {
        _ = Interlocked.Increment(ref calls);
        Assert.Equal(HttpMethod.Post, request.Method);
        Assert.Equal(IdentityAuthorityFixture.Shared.Authority + "/protocol/openid-connect/token", request.RequestUri!.AbsoluteUri);
        string body = await request.Content!.ReadAsStringAsync(cancellationToken);
        Assert.True(body.Contains("grant_type=client_credentials", StringComparison.Ordinal));
        Assert.True(body.Contains("client_id=reservations-service", StringComparison.Ordinal));
        Assert.True(body.Contains("client_secret=fixture-service-credential", StringComparison.Ordinal));
        try
        {
            if (BeforeReply is not null)
            {
                await BeforeReply(cancellationToken);
            }

            if (Stall)
            {
                await Task.Delay(Timeout.Infinite, cancellationToken);
            }
        }
        catch (OperationCanceledException)
        {
            Cancelled = true;
            throw;
        }

        return new HttpResponseMessage(Status) { Content = JsonContent.Create(new { access_token = AccessToken, token_type = TokenType, expires_in = ExpiresIn }) };
    }
}
