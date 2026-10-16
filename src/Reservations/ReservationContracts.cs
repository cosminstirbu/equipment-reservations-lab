using System.Text.Json.Serialization;

namespace Reservations;

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record ReservationInput(string? EquipmentId, string? StartAt, string? EndAt);

public sealed record ReservationInterval(string EquipmentId, DateTimeOffset StartAt, DateTimeOffset EndAt);

public sealed record Reservation(Guid Id, string UserKey, string EquipmentId, string EquipmentName, DateTimeOffset StartAt, DateTimeOffset EndAt, string Status, DateTimeOffset ConfirmedAt, DateTimeOffset? CancelledAt, Guid ConfirmationEventId, Guid? CancellationEventId);

public sealed record Availability(string EquipmentId, DateTimeOffset StartAt, DateTimeOffset EndAt, bool Available, bool Advisory = true);

internal sealed record InventoryItem(string? Id, string? Name, bool? Operational);

public sealed class ReservationProblemException(int status, string code, string message, string? field = null) : Exception(message)
{
    public int Status { get; } = status;

    public string Code { get; } = code;

    public string? Field { get; } = field;
}
