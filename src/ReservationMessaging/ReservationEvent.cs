using System.Text.Json.Serialization;

namespace ReservationMessaging;

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record ReservationEvent(int SchemaVersion, Guid EventId, string EventType, Guid ReservationId, string UserKey, string EquipmentId, string EquipmentName,
    [property: JsonConverter(typeof(ReservationTimestampConverter))] DateTimeOffset StartAt,
    [property: JsonConverter(typeof(ReservationTimestampConverter))] DateTimeOffset EndAt,
    [property: JsonConverter(typeof(ReservationTimestampConverter))] DateTimeOffset OccurredAt);
