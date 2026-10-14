using System.Net;
using System.Text;
using System.Text.Json;
using HelloMessaging;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using Notifications;
using Xunit;

namespace Backend.Tests;

public class NotificationsTests
{
    [Fact]
    public async Task DeliveredEventIsAccessibleThroughPublicHTTP()
    {
        using var app = new WebApplicationFactory<Notifications.Program>();
        using HttpClient client = app.CreateClient();
        NotificationStore store = app.Services.GetRequiredService<NotificationStore>();
        var id = Guid.NewGuid();
        Assert.True(store.TryReceive(Event(id)));
        HttpResponseMessage response = await client.GetAsync($"/api/notifications/{id}");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var json = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal(id, json.RootElement.GetProperty("correlationId").GetGuid());
        Assert.Equal("Hello received for Demo Camera", json.RootElement.GetProperty("message").GetString());
        Assert.Equal(HttpStatusCode.BadRequest, (await client.GetAsync("/api/notifications/not-a-guid")).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.GetAsync($"/api/notifications/{Guid.Empty}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync($"/api/notifications/{Guid.NewGuid()}")).StatusCode);
    }

    [Fact]
    public void ConsumerBoundaryRejectsInvalidPayloadAndExpiresAndEvicts()
    {
        var time = new Clock();
        var store = new NotificationStore(time);
        Assert.False(store.TryReceive(Encoding.UTF8.GetBytes("invalid")));
        Assert.False(store.TryReceive(new byte[4097]));
        Assert.False(store.TryReceive(Event(Guid.Empty)));
        var oldest = Guid.NewGuid();
        Assert.True(store.TryReceive(Event(oldest)));
        for (int i = 0; i < 1000; i++)
        {
            Assert.True(store.TryReceive(Event(Guid.NewGuid())));
        }

        Assert.Null(store.Find(oldest));
        var last = Guid.NewGuid();
        Assert.True(store.TryReceive(Event(last)));
        Assert.NotNull(store.Find(last));
        time.Now += TimeSpan.FromMinutes(5);
        Assert.Null(store.Find(last));
    }

    [Fact]
    public void ConcurrentDeliveryAndLookupRemainAtomicAndBounded()
    {
        var store = new NotificationStore(TimeProvider.System);
        Guid[] ids = [.. Enumerable.Range(0, 2000).Select(_ => Guid.NewGuid())];
        _ = Parallel.ForEach(ids, id =>
        {
            Assert.True(store.TryReceive(Event(id)));
            _ = store.Find(id);
        });
        Assert.Equal(1000, ids.Count(id => store.Find(id) is not null));
    }

    internal static byte[] Event(Guid id)
    {
        return JsonSerializer.SerializeToUtf8Bytes(new HelloRequested(id, "camera-001", "Demo Camera", DateTimeOffset.UtcNow), JsonSerializerOptions.Web);
    }

    private sealed class Clock : TimeProvider
    {
        public DateTimeOffset Now = DateTimeOffset.UtcNow;

        public override DateTimeOffset GetUtcNow()
        {
            return Now;
        }
    }
}
