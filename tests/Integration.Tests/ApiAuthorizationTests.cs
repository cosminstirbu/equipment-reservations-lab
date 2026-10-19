using System.Net;
using System.Net.Http.Headers;
using Microsoft.AspNetCore.Mvc.Testing;
using Npgsql;
using Xunit;

namespace Integration.Tests;

[Collection("Application behavior")]
public sealed class ApiAuthorizationTests(PostgresFixture postgres)
{
    [Theory]
    [InlineData("inventory")]
    [InlineData("reservations")]
    [InlineData("notifications")]
    public async Task ActualApplicationRoutesRequireValidPerApiBearerBeforeRequestValidation(string service)
    {
        await using NpgsqlDataSource database = await postgres.CreateMigratedDatabaseAsync(service);
        switch (service)
        {
            case "inventory":
                await AssertAuthorityAsync<Inventory.Program>(database, [(HttpMethod.Get, "/api/equipment"), (HttpMethod.Get, "/api/equipment/camera-001")]);
                break;
            case "notifications":
                await AssertAuthorityAsync<Notifications.Program>(database, [(HttpMethod.Get, "/api/notifications")]);
                break;
            default:
                await AssertAuthorityAsync<Reservations.Program>(database,
                [
                    (HttpMethod.Get, "/api/reservations"), (HttpMethod.Get, "/api/reservations/11111111-1111-1111-1111-111111111111"),
                    (HttpMethod.Get, "/api/availability"), (HttpMethod.Post, "/api/reservations"),
                    (HttpMethod.Post, "/api/reservations/11111111-1111-1111-1111-111111111111/cancel")
                ]);
                break;
        }
    }

    [Theory]
    [InlineData("Approver")]
    [InlineData("EquipmentStaff")]
    public async Task NonEmployeeHumansCanCheckAvailabilityButAllReservationOperationsAreForbidden(string role)
    {
        await using BookingScenario scenario = await BookingScenario.CreateAsync(postgres);
        scenario.Client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", IdentityAuthorityFixture.Shared.Token(roles: [role]));
        Assert.Equal(HttpStatusCode.OK, (await scenario.AvailabilityAsync()).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await scenario.BookAsync()).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await scenario.Client.GetAsync("/api/reservations", TestContext.Current.CancellationToken)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await scenario.Client.GetAsync("/api/reservations/11111111-1111-1111-1111-111111111111", TestContext.Current.CancellationToken)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await scenario.Client.PostAsync("/api/reservations/11111111-1111-1111-1111-111111111111/cancel", null, TestContext.Current.CancellationToken)).StatusCode);
        Assert.Equal(0, await scenario.CountAsync("reservations"));
        Assert.Equal(0, await scenario.CountAsync("reservation_outbox"));
    }

    private static async Task AssertAuthorityAsync<TProgram>(NpgsqlDataSource database, (HttpMethod Method, string Path)[] routes) where TProgram : class
    {
        using WebApplicationFactory<TProgram> app = PostgresFixture.Factory<TProgram>(database);
        using HttpClient client = app.CreateClient();
        foreach (string fault in new[] { "missing", "malformed", "wrong-audience" })
        {
            client.DefaultRequestHeaders.Authorization = fault switch
            {
                "missing" => null,
                "malformed" => new AuthenticationHeaderValue("Bearer", "invalid"),
                _ => new AuthenticationHeaderValue("Bearer", IdentityAuthorityFixture.Shared.Token(audience: "unrelated-api"))
            };
            _ = client.DefaultRequestHeaders.Remove("X-Owner-Key");
            client.DefaultRequestHeaders.Add("X-Owner-Key", "forged");
            foreach ((HttpMethod method, string path) in routes)
            {
                using var request = new HttpRequestMessage(method, path);
                Assert.Equal(HttpStatusCode.Unauthorized, (await client.SendAsync(request)).StatusCode);
            }
        }

        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/alive")).StatusCode);
    }
}

