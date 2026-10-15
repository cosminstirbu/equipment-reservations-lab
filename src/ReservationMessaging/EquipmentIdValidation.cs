namespace ReservationMessaging;

public static class EquipmentIdValidation
{
    public static bool IsEquipmentId(string? id)
    {
        return id is { Length: > 0 and <= 64 } && id.All(c => char.IsAsciiLetterOrDigit(c) || c is '-' or '_');
    }
}
