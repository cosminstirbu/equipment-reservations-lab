using System.ComponentModel;

namespace Notifications;

[Description("A reservation notification in the authenticated owner's inbox.")]
public sealed record InboxEntry(
    [property: Description("Identifier of the source reservation event; repeated deliveries produce one inbox entry.")] Guid EventId,
    [property: Description("Identifier of the reservation described by the notification.")] Guid ReservationId,
    [property: Description("Stable authenticated owner identifier associated with the reservation.")] string UserKey,
    [property: Description("Identifier of the reserved equipment.")] string EquipmentId,
    [property: Description("Equipment display name carried by the reservation event.")] string EquipmentName,
    [property: Description("Source event type: ReservationConfirmed or ReservationCancelled.")] string EventType,
    [property: Description("Inclusive start of the reservation interval.")] DateTimeOffset StartAt,
    [property: Description("Exclusive end of the reservation interval.")] DateTimeOffset EndAt,
    [property: Description("Timestamp when the source confirmation or cancellation occurred.")] DateTimeOffset OccurredAt,
    [property: Description("Timestamp when Notifications stored the event in the inbox; distinct from source occurrence time.")] DateTimeOffset ReceivedAt,
    [property: Description("Human-readable confirmation or cancellation message.")] string Message);
