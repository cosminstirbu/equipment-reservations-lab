namespace Notifications;

public sealed record InboxEntry(Guid EventId, Guid ReservationId, string UserKey, string EquipmentId, string EquipmentName, string EventType, DateTimeOffset StartAt, DateTimeOffset EndAt, DateTimeOffset OccurredAt, DateTimeOffset ReceivedAt, string Message);
