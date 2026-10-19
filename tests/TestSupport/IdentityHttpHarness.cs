using IdentityAccess;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.TestHost;

namespace TestSupport;

internal static class IdentityHttpHarness
{
    internal static async Task<WebApplication> StartAsync(IdentityAuthorityFixture authority, string audience = "reservations-api", Action? mutation = null)
    {
        WebApplicationBuilder builder = WebApplication.CreateBuilder(new WebApplicationOptions { EnvironmentName = "Testing" });
        _ = builder.WebHost.UseTestServer();
        authority.Configure(builder.Configuration);
        _ = builder.Services.AddIdentityAuthentication(builder.Configuration, builder.Environment, audience);
        authority.Configure(builder.Services);
        WebApplication app = builder.Build();
        _ = app.UseAuthentication();
        _ = app.UseAuthorization();
        _ = app.UseOwnershipInputGuard();
        _ = app.MapGet("/human", () => "protected human data").RequireAuthorization(IdentityAuthentication.Human);
        _ = app.MapGet("/employee", () => "protected employee data").RequireAuthorization(IdentityAuthentication.Employee);
        _ = app.MapGet("/equipment", () => "equipment data").RequireAuthorization(IdentityAuthentication.EquipmentRead);
        _ = app.MapGet("/key", (HttpContext context) => IdentityPrincipal.UserKey(context.User)).RequireAuthorization(IdentityAuthentication.Human);
        _ = app.MapGet("/alive", () => "alive").AllowAnonymous();
        _ = app.MapGet("/api/reservations", () => "owned history").RequireAuthorization(IdentityAuthentication.Employee);
        _ = app.MapGet("/api/availability", () => "available").RequireAuthorization(IdentityAuthentication.Human);
        _ = app.MapPost("/api/reservations", () =>
        {
            mutation?.Invoke();
            return Results.Created("/api/reservations/1", "saved");
        }).RequireAuthorization(IdentityAuthentication.Employee);
        _ = app.MapPost("/api/reservations/1/cancel", () =>
        {
            mutation?.Invoke();
            return Results.Ok("cancelled");
        }).RequireAuthorization(IdentityAuthentication.Employee);
        await app.StartAsync();
        return app;
    }
}
