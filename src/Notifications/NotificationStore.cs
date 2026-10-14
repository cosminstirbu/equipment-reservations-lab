using System.Text.Json;
using HelloMessaging;

namespace Notifications;

public sealed record Notification(Guid CorrelationId, string Message);

public sealed class NotificationStore(TimeProvider time)
{
    private readonly Lock gate = new();
    private readonly LinkedList<(Notification Notification, DateTimeOffset Expires)> messages = [];
    private readonly Dictionary<Guid, LinkedListNode<(Notification Notification, DateTimeOffset Expires)>> byId = [];

    public bool TryReceive(ReadOnlyMemory<byte> body)
    {
        if (body.Length > 4096)
        {
            return false;
        }

        HelloRequested? hello;
        try
        {
            hello = JsonSerializer.Deserialize<HelloRequested>(body.Span, JsonSerializerOptions.Web);
        }
        catch (JsonException)
        {
            return false;
        }

        if (hello is null
            || hello.CorrelationId == Guid.Empty
            || !HelloValidation.IsEquipmentId(hello.EquipmentId)
            || string.IsNullOrWhiteSpace(hello.EquipmentName)
            || hello.EquipmentName.Length > 256
            || hello.RequestedAt == default)
        {
            return false;
        }

        lock (gate)
        {
            Purge();
            if (byId.Remove(hello.CorrelationId, out LinkedListNode<(Notification Notification, DateTimeOffset Expires)>? existing))
            {
                messages.Remove(existing);
            }

            while (messages.Count >= 1000)
            {
                RemoveFirst();
            }

            LinkedListNode<(Notification Notification, DateTimeOffset Expires)> node = messages.AddLast((
                new Notification(hello.CorrelationId, $"Hello received for {hello.EquipmentName}"),
                time.GetUtcNow() + TimeSpan.FromMinutes(5)));
            byId[hello.CorrelationId] = node;
        }

        return true;
    }

    public Notification? Find(Guid id)
    {
        lock (gate)
        {
            Purge();
            return byId.TryGetValue(id, out LinkedListNode<(Notification Notification, DateTimeOffset Expires)>? node)
                ? node.Value.Notification
                : null;
        }
    }

    private void Purge()
    {
        while (messages.First is { } node && node.Value.Expires <= time.GetUtcNow())
        {
            RemoveFirst();
        }
    }

    private void RemoveFirst()
    {
        LinkedListNode<(Notification Notification, DateTimeOffset Expires)> first = messages.First!;
        _ = byId.Remove(first.Value.Notification.CorrelationId);
        messages.RemoveFirst();
    }
}
