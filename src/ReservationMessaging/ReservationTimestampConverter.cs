using System.Text.Json;
using System.Text.Json.Serialization;
using System.Text.RegularExpressions;

namespace ReservationMessaging;

public sealed partial class ReservationTimestampConverter : JsonConverter<DateTimeOffset>
{
    public override DateTimeOffset Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
    {
        if (reader.TokenType != JsonTokenType.String || reader.GetString() is not { Length: >= 20 and <= 32 } text
            || !Timestamp().IsMatch(text))
        {
            throw new JsonException("Invalid reservation timestamp.");
        }

        bool parsed = reader.TryGetDateTimeOffset(out DateTimeOffset value);
        return parsed && Valid(value) ? value : throw new JsonException("Invalid reservation timestamp.");
    }

    public override void Write(Utf8JsonWriter writer, DateTimeOffset value, JsonSerializerOptions options)
    {
        if (!Valid(value))
        {
            throw new JsonException("Invalid reservation timestamp.");
        }

        writer.WriteStringValue(value);
    }

    private static bool Valid(DateTimeOffset value)
    {
        return value.Offset == TimeSpan.Zero && value != DateTimeOffset.MinValue && value != DateTimeOffset.MaxValue && value.Ticks % 10 == 0;
    }

    [GeneratedRegex(@"\A[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(?:\.[0-9]{1,6})?(?:Z|[+-]00:00)\z", RegexOptions.CultureInvariant, 50)]
    private static partial Regex Timestamp();
}
