using System.ComponentModel;
using System.Text.Json.Serialization;

namespace Reservations;

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
[Description("The three required, non-null string fields for a reservation. Additional fields are rejected.")]
public sealed record ReservationInput(
    [property: Description("Valid identifier of the equipment to reserve.")] string? EquipmentId,
    [property: Description("Inclusive interval start: ISO8601 with an explicit timezone offset and at most six fractional digits; must not be in the past and must precede endAt.")] string? StartAt,
    [property: Description("Exclusive interval end: ISO8601 with an explicit timezone offset and at most six fractional digits; must follow startAt.")] string? EndAt);

public sealed record ReservationInterval(string EquipmentId, DateTimeOffset StartAt, DateTimeOffset EndAt);

[Description("A reservation belonging to the authenticated owner, including its confirmation and cancellation lifecycle.")]
public sealed record Reservation(
    [property: Description("Unique identifier of the reservation.")] Guid Id,
    [property: Description("Stable owner identifier derived from the authenticated identity; callers cannot choose it.")] string UserKey,
    [property: Description("Identifier of the reserved equipment.")] string EquipmentId,
    [property: Description("Equipment display name captured when the reservation was confirmed.")] string EquipmentName,
    [property: Description("Inclusive start of the reserved interval.")] DateTimeOffset StartAt,
    [property: Description("Exclusive end of the reserved interval; an adjacent reservation can start at this time.")] DateTimeOffset EndAt,
    [property: Description("Current reservation state: Confirmed or Cancelled.")] string Status,
    [property: Description("Timestamp when the reservation was confirmed.")] DateTimeOffset ConfirmedAt,
    [property: Description("Timestamp when the reservation was cancelled; null until cancelled.")] DateTimeOffset? CancelledAt,
    [property: Description("Identifier of the reservation confirmation event.")] Guid ConfirmationEventId,
    [property: Description("Identifier of the reservation cancellation event; null until cancelled.")] Guid? CancellationEventId);

[Description("An advisory availability result for an equipment interval; checking does not lock or reserve equipment.")]
public sealed record Availability(
    [property: Description("Identifier of the equipment checked.")] string EquipmentId,
    [property: Description("Inclusive start of the checked interval.")] DateTimeOffset StartAt,
    [property: Description("Exclusive end of the checked interval.")] DateTimeOffset EndAt,
    [property: Description("Whether no confirmed reservation overlaps the checked interval at the time of the check.")] bool Available,
    [property: Description("Always true: the result is advisory and does not lock or reserve equipment.")] bool Advisory = true);

internal sealed record InventoryItem(string? Id, string? Name, bool? Operational);

public sealed class ReservationProblemException(int status, string code, string message, string? field = null) : Exception(message)
{
    public int Status { get; } = status;

    public string Code { get; } = code;

    public string? Field { get; } = field;
}
