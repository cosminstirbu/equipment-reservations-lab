using System.Net;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Primitives;
using Xunit;

namespace Reservations.Tests;

[Collection("Application behavior")]
public sealed class ReservationFailureBoundaryTests(PostgresFixture postgres)
{
    [Theory]
    [InlineData("/api/availability?unexpected=value")]
    [InlineData("/api/reservations/not-a-guid")]
    [InlineData("/api/reservations/00000000-0000-0000-0000-000000000000")]
    public async Task InvalidReadRequestsReturnInputProblemsBeforeDependencies(string path)
    {
        await using BookingScenario scenario = await BookingScenario.CreateAsync(postgres);
        using HttpResponseMessage response = await scenario.Client.GetAsync(path, TestContext.Current.CancellationToken);
        await AssertProblemAsync(response, HttpStatusCode.BadRequest, "invalid_request");
        Assert.Equal(0, scenario.Inventory.Calls);
        Assert.Equal(0L, await scenario.CountAsync("reservation_outbox"));
    }

    [Theory]
    [InlineData("application/json; charset")]
    [InlineData("application/json; charset=utf-8; extra=value")]
    [InlineData("application/json; charset=utf-8; charset=utf-8")]
    public async Task InvalidMediaParametersAreRejectedBeforeDependencies(string media)
    {
        await using BookingScenario scenario = await BookingScenario.CreateAsync(postgres);
        using var content = new ByteArrayContent(Encoding.UTF8.GetBytes("{}"));
        _ = content.Headers.TryAddWithoutValidation("Content-Type", media);
        using HttpResponseMessage response = await scenario.Client.PostAsync("/api/reservations", content, TestContext.Current.CancellationToken);
        await AssertProblemAsync(response, HttpStatusCode.UnsupportedMediaType, "unsupported_media_type");
        Assert.Equal(0, scenario.Inventory.Calls);
    }

    [Fact]
    public async Task OversizedHostIsRejectedBeforeDependencies()
    {
        await using BookingScenario scenario = await BookingScenario.CreateAsync(postgres);
        using var request = new HttpRequestMessage(HttpMethod.Post, "/api/reservations");
        request.Headers.Host = new string('a', 129);
        using HttpResponseMessage response = await scenario.Client.SendAsync(request, TestContext.Current.CancellationToken);
        await AssertProblemAsync(response, HttpStatusCode.Forbidden, "browser_write_forbidden");
        Assert.Equal(0, scenario.Inventory.Calls);
    }

    [Theory]
    [InlineData("null")]
    // lang=json
    [InlineData("{\"id\":\"camera-001\",\"name\":null,\"operational\":true}")]
    public async Task NullInventoryContractsCannotAllocate(string body)
    {
        await using BookingScenario scenario = await BookingScenario.CreateAsync(postgres, new InventoryBoundary { ResponseBody = body });
        using HttpResponseMessage response = await scenario.BookAsync();
        await AssertProblemAsync(response, HttpStatusCode.ServiceUnavailable, "inventory_unavailable");
        Assert.Equal(0L, await scenario.CountAsync("reservations"));
    }

    [Theory]
    [InlineData("scheme")]
    [InlineData("duplicate-host")]
    [InlineData("unicode-host")]
    [InlineData("duplicate-content-type")]
    public async Task InvalidTransportMetadataIsRejectedBeforeInventory(string fault)
    {
        await using BookingScenario scenario = await BookingScenario.CreateAsync(postgres);
        HttpContext result = await scenario.App.Server.SendAsync(context =>
        {
            context.Request.Method = "POST";
            context.Request.Path = "/api/reservations";
            context.Request.Host = new HostString("localhost");
            context.Request.ContentType = "application/json";
            context.Request.Headers.Authorization = scenario.Client.DefaultRequestHeaders.Authorization!.ToString();
            switch (fault)
            {
                case "scheme":
                    context.Request.Scheme = "ftp";
                    break;
                case "duplicate-host":
                    context.Request.Headers.Host = new StringValues(["localhost", "localhost"]);
                    break;
                case "unicode-host":
                    context.Request.Headers.Host = "locálhost";
                    break;
                default:
                    context.Request.Headers.ContentType = new StringValues(["application/json", "application/json"]);
                    break;
            }
        }, TestContext.Current.CancellationToken);

        Assert.Equal(fault == "duplicate-content-type" ? 415 : 403, result.Response.StatusCode);
        Assert.Equal(0, scenario.Inventory.Calls);
        Assert.Equal(0L, await scenario.CountAsync("reservation_outbox"));
    }

    [Fact]
    public async Task MissingInventoryBaseAddressFailsWithoutAllocating()
    {
        await using BookingScenario scenario = await BookingScenario.CreateAsync(postgres);
        using WebApplicationFactory<Program> app = scenario.App.WithWebHostBuilder(builder => builder.ConfigureServices(services =>
        {
            _ = services.AddHttpClient("inventory", client => client.BaseAddress = null);
        }));
        using HttpClient client = app.CreateClient();
        // lang=json
        const string body = "{\"equipmentId\":\"camera-001\",\"startAt\":\"2030-01-02T12:00:00Z\",\"endAt\":\"2030-01-02T13:00:00Z\"}";
        using var content = new StringContent(body, Encoding.UTF8, "application/json");
        using HttpResponseMessage response = await client.PostAsync("/api/reservations", content, TestContext.Current.CancellationToken);
        await AssertProblemAsync(response, HttpStatusCode.ServiceUnavailable, "inventory_unavailable");
        Assert.Equal(0, scenario.Inventory.Calls);
        Assert.Equal(0L, await scenario.CountAsync("reservations"));
        Assert.Equal(0L, await scenario.CountAsync("reservation_outbox"));
    }

    [Fact]
    public async Task CallerCancellationDuringInventoryRequestPropagatesWithoutAllocating()
    {
        var entered = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var inventory = new InventoryBoundary
        {
            BeforeReply = async token =>
            {
                entered.SetResult();
                await Task.Delay(Timeout.InfiniteTimeSpan, token);
            }
        };
        await using BookingScenario scenario = await BookingScenario.CreateAsync(postgres, inventory);
        using var cancellation = CancellationTokenSource.CreateLinkedTokenSource(TestContext.Current.CancellationToken);
        // lang=json
        const string body = "{\"equipmentId\":\"camera-001\",\"startAt\":\"2030-01-02T12:00:00Z\",\"endAt\":\"2030-01-02T13:00:00Z\"}";
        using var content = new StringContent(body, Encoding.UTF8, "application/json");
        Task<HttpResponseMessage> request = scenario.Client.PostAsync("/api/reservations", content, cancellation.Token);
        await entered.Task.WaitAsync(TestContext.Current.CancellationToken);
        await cancellation.CancelAsync();
        _ = await Assert.ThrowsAnyAsync<OperationCanceledException>(() => request);
        Assert.Equal(0L, await scenario.CountAsync("reservations"));
        Assert.Equal(0L, await scenario.CountAsync("reservation_outbox"));
    }

    private static async Task AssertProblemAsync(HttpResponseMessage response, HttpStatusCode status, string code)
    {
        Assert.Equal(status, response.StatusCode);
        using JsonDocument problem = await JsonDocument.ParseAsync(await response.Content.ReadAsStreamAsync(TestContext.Current.CancellationToken), cancellationToken: TestContext.Current.CancellationToken);
        Assert.Equal(code, problem.RootElement.GetProperty("code").GetString());
    }


}
