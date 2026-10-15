using System.Globalization;
using System.Text.Json;
using System.Text.RegularExpressions;
using ReservationMessaging;

namespace Reservations;

public static partial class ReservationValidation
{
    [GeneratedRegex(@"\A[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(?:\.[0-9]{1,6})?(?:Z|[+-][0-9]{2}:[0-9]{2})\z", RegexOptions.CultureInvariant, 50)]
    private static partial Regex TimestampPattern();

    public static ReservationInterval Interval(ReservationInput? input, TimeProvider time)
    {
        if (input is null || !EquipmentIdValidation.IsEquipmentId(input.EquipmentId))
        {
            throw new ReservationProblemException(400, "invalid_request", "Select a valid equipment identifier.", "equipmentId");
        }

        DateTimeOffset start = Timestamp(input.StartAt, "startAt");
        DateTimeOffset end = Timestamp(input.EndAt, "endAt");
        if (start >= end)
        {
            throw new ReservationProblemException(400, "invalid_interval", "Start must be before end.", "endAt");
        }

        var interval = new ReservationInterval(input.EquipmentId!, start, end);
        EnsureNotPast(interval, UtcNow(time));
        return interval;
    }

    public static DateTimeOffset UtcNow(TimeProvider time)
    {
        long ticks = time.GetUtcNow().UtcTicks;
        return new DateTimeOffset(ticks - (ticks % 10), TimeSpan.Zero);
    }

    public static void EnsureNotPast(ReservationInterval interval, DateTimeOffset now)
    {
        if (interval.StartAt < now)
        {
            throw new ReservationProblemException(400, "start_in_past", "Start must not be in the past.", "startAt");
        }
    }

    public static async Task<ReservationInput?> ReadRequestAsync(HttpRequest request, CancellationToken cancellationToken)
    {
        if (request.ContentLength > 4096)
        {
            throw new ReservationProblemException(413, "invalid_request", "Request exceeds the 4 KiB limit.");
        }

        try
        {
            byte[] body = await ReadBoundedAsync(request.Body, cancellationToken);
            return JsonSerializer.Deserialize(body, ReservationsJsonContext.Default.ReservationInput);
        }
        catch (JsonException)
        {
            throw new ReservationProblemException(400, "invalid_request", "Use equipmentId, startAt and endAt with valid JSON string values.");
        }
    }

    internal static async Task<byte[]> ReadBoundedAsync(Stream stream, CancellationToken cancellationToken)
    {
        byte[] buffer = new byte[4097];
        int size = 0;
        while (size < buffer.Length)
        {
            int read = await stream.ReadAsync(buffer.AsMemory(size), cancellationToken);
            if (read == 0)
            {
                break;
            }

            size += read;
        }

        if (size > 4096)
        {
            throw new ReservationProblemException(413, "invalid_request", "Payload exceeds the 4 KiB limit.");
        }

        byte[] payload = buffer.AsSpan(0, size).ToArray();
        return payload;
    }

    private static DateTimeOffset Timestamp(string? value, string field)
    {
        if (value is null || value.Length > 40 || !TimestampPattern().IsMatch(value)
            || !DateTimeOffset.TryParse(value, CultureInfo.InvariantCulture, DateTimeStyles.None, out DateTimeOffset timestamp)
            || timestamp == DateTimeOffset.MinValue || timestamp == DateTimeOffset.MaxValue)
        {
            throw new ReservationProblemException(400, "invalid_request", "Use an ISO8601 timestamp with an explicit timezone offset and at most six fractional digits.", field);
        }

        DateTimeOffset normalized = timestamp.ToUniversalTime();
        return normalized;
    }
}
