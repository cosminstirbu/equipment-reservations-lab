using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using Notifications;
using Npgsql;
using ReservationMessaging;
using Xunit;

namespace Backend.Tests;

[Collection("PostgreSQL")]
public sealed class NotificationOwnershipTests(PostgresFixture postgres)
{
    [Theory]
    [InlineData("Employee")]
    [InlineData("Approver")]
    [InlineData("EquipmentStaff")]
    [InlineData("")]
    public async Task EveryHumanReceivesOnlyItsDurableRecipientSnapshotAcrossSessions(string role)
    {
        await using NpgsqlDataSource database = await postgres.CreateMigratedDatabaseAsync("notifications");
        var inbox = new ReservationInbox(database, TimeProvider.System);
        ReservationEvent first = Event(Key("owner-a"));
        ReservationEvent second = Event(Key("owner-b"));
        Assert.True(await inbox.ReceiveAsync(first, CancellationToken.None));
        Assert.True(await inbox.ReceiveAsync(second, CancellationToken.None));
        Assert.False(await inbox.ReceiveAsync(first, CancellationToken.None));

        using WebApplicationFactory<Notifications.Program> host = PostgresFixture.Factory<Notifications.Program>(database);
        using HttpClient owner = Client(host, "owner-a", role);
        InboxEntry saved = Assert.Single((await owner.GetFromJsonAsync<InboxEntry[]>("/api/notifications"))!);
        Assert.Equal(first.EventId, saved.EventId);
        using HttpClient other = Client(host, "owner-b", role);
        Assert.Equal(second.EventId, Assert.Single((await other.GetFromJsonAsync<InboxEntry[]>("/api/notifications"))!).EventId);
        using HttpClient unknown = Client(host, "same-display-different-opaque-subject", role);
        Assert.Empty((await unknown.GetFromJsonAsync<InboxEntry[]>("/api/notifications"))!);

        owner.Dispose();
        using HttpClient renewed = Client(host, "owner-a", role);
        Assert.Equal(saved, Assert.Single((await renewed.GetFromJsonAsync<InboxEntry[]>("/api/notifications"))!));
        using var document = JsonDocument.Parse(await renewed.GetStringAsync("/api/notifications"));
        Assert.Equal(first.UserKey, Assert.Single(document.RootElement.EnumerateArray()).GetProperty("userKey").GetString());
    }

    [Theory]
    [InlineData("header")]
    [InlineData("query")]
    public async Task ForgedIdentityInputsCannotReadAnothersInbox(string vector)
    {
        await using NpgsqlDataSource database = await postgres.CreateMigratedDatabaseAsync("notifications");
        var inbox = new ReservationInbox(database, TimeProvider.System);
        _ = await inbox.ReceiveAsync(Event(Key("owner-a")), CancellationToken.None);
        using WebApplicationFactory<Notifications.Program> host = PostgresFixture.Factory<Notifications.Program>(database);
        using HttpClient other = Client(host, "owner-b", "Employee");
        if (vector == "header")
        {
            other.DefaultRequestHeaders.Add("X-User-Key", Key("owner-a"));
        }

        string path = vector == "query" ? "/api/notifications?userKey=" + Key("owner-a") : "/api/notifications";
        Assert.Equal(HttpStatusCode.BadRequest, (await other.GetAsync(path)).StatusCode);
        await using NpgsqlCommand count = database.CreateCommand("SELECT count(*) FROM reservation_inbox");
        Assert.Equal(1L, await count.ExecuteScalarAsync());
    }

    private static HttpClient Client(WebApplicationFactory<Notifications.Program> host, string subject, string role)
    {
        HttpClient client = host.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", IdentityAuthorityFixture.Shared.Token(subject: subject, audience: "notifications-api", roles: role.Length == 0 ? [] : [role]));
        return client;
    }

    private static string Key(string subject)
    {
        return Convert.ToHexStringLower(SHA256.HashData(JsonSerializer.SerializeToUtf8Bytes(new[] { IdentityAuthorityFixture.Issuer, subject })));
    }

    private static ReservationEvent Event(string userKey)
    {
        var occurred = new DateTimeOffset(2030, 1, 1, 12, 0, 0, TimeSpan.Zero);
        return new ReservationEvent(1, Guid.NewGuid(), "ReservationConfirmed", Guid.NewGuid(), userKey, "camera-001", "Demo Camera", occurred.AddDays(1), occurred.AddDays(2), occurred);
    }
}
