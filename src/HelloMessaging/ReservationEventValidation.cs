using System.Diagnostics;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace HelloMessaging;

public static partial class ReservationEventValidation
{
    private static readonly UTF8Encoding StrictUtf8 = new(false, true);

    public static bool Valid(ReservationEvent? message)
    {
        return message is not null && message.SchemaVersion == 1
            && message.EventId != Guid.Empty && message.ReservationId != Guid.Empty
            && message.EventType is "ReservationConfirmed" or "ReservationCancelled"
            && message.DemoUserId == "demo-user"
            && HelloValidation.IsEquipmentId(message.EquipmentId)
            && !string.IsNullOrWhiteSpace(message.EquipmentName) && message.EquipmentName.Length <= 256
            && FiniteUtc(message.StartAt) && FiniteUtc(message.EndAt) && FiniteUtc(message.OccurredAt)
            && message.StartAt < message.EndAt;
    }

    public static bool TryRead(ReadOnlyMemory<byte> body, string routingKey, string? contentType, string? messageId, string? correlationId,
        IDictionary<string, object?>? headers, out ReservationEvent? message, out ActivityContext context)
    {
        message = null;
        context = default;
        if (body.Length is 0 or > 4096 || contentType != "application/json"
            || headers is null || !headers.TryGetValue("schema", out object? schema) || schema is not int version || version != 1
            || !TryContext(headers, out context))
        {
            return false;
        }

        try
        {
            message = JsonSerializer.Deserialize(body.Span, ReservationJsonContext.Default.ReservationEvent);
            return Valid(message)
                && Guid.TryParse(messageId, out Guid identity) && identity == message!.EventId
                && Guid.TryParse(correlationId, out Guid reservationId) && reservationId == message.ReservationId
                && routingKey == ReservationTopology.RoutingKey(message.EventType);
        }
        catch (JsonException)
        {
            return false;
        }
    }

    public static bool TryContext(IDictionary<string, object?> headers, out ActivityContext context)
    {
        context = default;
        if (!headers.TryGetValue("traceparent", out object? traceparent))
        {
            return !headers.ContainsKey("tracestate");
        }

        if (!Text(traceparent, 55, out string? parent)
            || parent!.Length != 55)
        {
            return false;
        }

        string? state = null;
        return (!headers.TryGetValue("tracestate", out object? value)
                || (Text(value, 512, out state) && ValidState(state!)))
            && ActivityContext.TryParse(parent, state, true, out context);
    }

    public static bool ValidState(string value)
    {
        if (value.Length is 0 or > 512)
        {
            return false;
        }

        string[] members = value.Split(',');
        var keys = new HashSet<string>(StringComparer.Ordinal);
        if (members.Length > 32)
        {
            return false;
        }

        foreach (string member in members)
        {
            string[] pair = member.TrimStart(' ', '\t').Split('=');
            if (pair.Length != 2 || !StateKey().IsMatch(pair[0]) || !keys.Add(pair[0])
                || pair[1].Length is 0 or > 256 || pair[1][^1] == ' '
                || pair[1].Any(character => character is < ' ' or > '~' or ',' or '='))
            {
                return false;
            }
        }

        return true;
    }

    private static bool Text(object? value, int limit, out string? text)
    {
        text = null;
        try
        {
            text = value switch
            {
                string item when item.Length <= limit => item,
                byte[] bytes when bytes.Length <= limit => StrictUtf8.GetString(bytes),
                _ => null
            };
            return text is not null;
        }
        catch (DecoderFallbackException)
        {
            return false;
        }
    }

    private static bool FiniteUtc(DateTimeOffset value)
    {
        return value.Offset == TimeSpan.Zero && value != DateTimeOffset.MinValue && value != DateTimeOffset.MaxValue && value.Ticks % 10 == 0;
    }

    [GeneratedRegex(@"\A(?:[a-z][a-z0-9_*/-]{0,255}|[a-z0-9][a-z0-9_*/-]{0,240}@[a-z][a-z0-9_*/-]{0,13})\z", RegexOptions.CultureInvariant, 50)]
    private static partial Regex StateKey();
}
