using System.Diagnostics;
using System.Text;
using System.Text.Json;
using ReservationMessaging;
using Xunit;

namespace Reservations.Tests;

// These public, deterministic wire-contract validators need no provider or service host.
public sealed class ReservationMessagingContractTests
{
    private const string Parent = "00-0123456789abcdef0123456789abcdef-0123456789abcdef-01";

    [Theory]
    [InlineData("vendor=value")]
    [InlineData("vendor=value, \tother=another")]
    [InlineData("tenant@vendor=value")]
    public void ValidTraceStatePreservesRemoteContext(string state)
    {
        var headers = new Dictionary<string, object?>
        {
            ["traceparent"] = Encoding.UTF8.GetBytes(Parent),
            ["tracestate"] = Encoding.UTF8.GetBytes(state)
        };

        Assert.True(ReservationEventValidation.ValidState(state));
        Assert.True(ReservationEventValidation.TryContext(headers, out ActivityContext context));
        Assert.True(context.IsRemote);
        Assert.Equal(state, context.TraceState);
        Assert.Equal("0123456789abcdef0123456789abcdef", context.TraceId.ToString());
    }

    [Theory]
    [InlineData("")]
    [InlineData("vendor=")]
    [InlineData("Vendor=value")]
    [InlineData("vendor=value ")]
    [InlineData("vendor=value=extra")]
    [InlineData("vendor=value,vendor=duplicate")]
    [InlineData("vendor=\u001f")]
    [InlineData("vendor=\u007f")]
    [InlineData("vendor=é")]
    [InlineData("vendor=value,")]
    public void InvalidTraceStateIsRejected(string state)
    {
        Assert.False(ReservationEventValidation.ValidState(state));
        Assert.False(ReservationEventValidation.TryContext(new Dictionary<string, object?>
        {
            ["traceparent"] = Parent,
            ["tracestate"] = state
        }, out _));
    }

    [Fact]
    public void TraceStateEnforcesMemberAndLengthLimits()
    {
        string members = string.Join(',', Enumerable.Range(0, 32).Select(index => $"v{index}=x"));
        Assert.True(ReservationEventValidation.ValidState(members));
        Assert.False(ReservationEventValidation.ValidState(members + ",extra=x"));
        Assert.True(ReservationEventValidation.ValidState("v=" + new string('x', 256)));
        Assert.False(ReservationEventValidation.ValidState("v=" + new string('x', 257)));
        Assert.False(ReservationEventValidation.ValidState(new string('x', 513)));
    }

    [Fact]
    public void TraceHeadersRejectInvalidTypesLengthsAndUtf8()
    {
        object?[] invalidParents = [null, 1, "short", new string('x', 56), new byte[56], new byte[] { 0xff }, new string('x', 55)];
        foreach (object? parent in invalidParents)
        {
            Assert.False(ReservationEventValidation.TryContext(new Dictionary<string, object?> { ["traceparent"] = parent }, out _));
        }

        Assert.False(ReservationEventValidation.TryContext(new Dictionary<string, object?> { ["tracestate"] = "v=x" }, out _));
        Assert.True(ReservationEventValidation.TryContext(new Dictionary<string, object?>(), out ActivityContext empty));
        Assert.Equal(default, empty);
        Assert.True(ReservationEventValidation.TryContext(new Dictionary<string, object?> { ["traceparent"] = Parent }, out _));
        Assert.False(ReservationEventValidation.TryContext(new Dictionary<string, object?>
        {
            ["traceparent"] = Parent,
            ["tracestate"] = new byte[] { 0xff }
        }, out _));
    }

    [Fact]
    public void EnvelopeRequiresMatchingIdentityRoutingAndSchema()
    {
        ReservationEvent message = Message();
        byte[] body = JsonSerializer.SerializeToUtf8Bytes(message, ReservationJsonContext.Default.ReservationEvent);
        Assert.True(Read(body, message));
        Assert.False(Read([], message));
        Assert.False(Read(new byte[4097], message));
        Assert.False(Read(Encoding.UTF8.GetBytes("{"), message));
        Assert.False(Read(body, message, contentType: "text/plain"));
        Assert.False(Read(body, message, headers: []));
        Assert.False(Read(body, message, headers: new Dictionary<string, object?> { ["schema"] = "1" }));
        Assert.False(Read(body, message, headers: new Dictionary<string, object?> { ["schema"] = 2 }));
        Assert.False(Read(body, message, messageId: "invalid"));
        Assert.False(Read(body, message, messageId: Guid.NewGuid().ToString()));
        Assert.False(Read(body, message, correlationId: "invalid"));
        Assert.False(Read(body, message, correlationId: Guid.NewGuid().ToString()));
        Assert.False(Read(body, message, routingKey: ReservationTopology.Cancelled));
        Assert.False(ReservationEventValidation.TryRead(body, ReservationTopology.Confirmed, "application/json", message.EventId.ToString(), message.ReservationId.ToString(), null, out _, out _));
        _ = Assert.Throws<InvalidDataException>(() => ReservationTopology.RoutingKey("unknown"));
    }

    [Fact]
    public void EnvelopeValidationRejectsEachInvalidContractField()
    {
        ReservationEvent message = Message();
        ReservationEvent?[] invalid =
        [
            null, message with { SchemaVersion = 2 }, message with { EventId = Guid.Empty },
            message with { ReservationId = Guid.Empty }, message with { EventType = "unknown" },
            message with { UserKey = null! }, message with { UserKey = "short" }, message with { UserKey = new string('A', 64) },
            message with { UserKey = new string('g', 64) }, message with { UserKey = new string('/', 64) },
            message with { EquipmentId = "bad id" }, message with { EquipmentName = " " },
            message with { EquipmentName = new string('x', 257) },
            message with { StartAt = DateTimeOffset.MinValue }, message with { EndAt = DateTimeOffset.MaxValue },
            message with { OccurredAt = message.OccurredAt.AddTicks(1) },
            message with { StartAt = message.StartAt.ToOffset(TimeSpan.FromHours(1)) },
            message with { EndAt = message.StartAt }
        ];

        Assert.All(invalid, item => Assert.False(ReservationEventValidation.Valid(item)));
        Assert.True(ReservationEventValidation.Valid(message));
        Assert.True(ReservationEventValidation.Valid(message with
        {
            EventType = "ReservationCancelled"
        }));
    }

    [Theory]
    [InlineData("null")]
    [InlineData("123")]
    [InlineData("\"short\"")]
    [InlineData("\"2030-02-30T12:00:00Z\"")]
    [InlineData("\"2030-01-01T12:00:00+01:00\"")]
    [InlineData("\"2030-01-01T12:00:00.1234567Z\"")]
    [InlineData("\"0001-01-01T00:00:00Z\"")]
    public void InvalidWireTimestampThrowsJsonException(string timestamp)
    {
        var options = new JsonSerializerOptions();
        options.Converters.Add(new ReservationTimestampConverter());
        _ = Assert.Throws<JsonException>(() => JsonSerializer.Deserialize<DateTimeOffset>(timestamp, options));
    }

    [Fact]
    public void InvalidTimestampCannotBePublished()
    {
        ReservationEvent message = Message();
        DateTimeOffset[] invalid = [DateTimeOffset.MinValue, DateTimeOffset.MaxValue, message.StartAt.AddTicks(1), message.StartAt.ToOffset(TimeSpan.FromHours(1))];
        foreach (DateTimeOffset timestamp in invalid)
        {
            _ = Assert.Throws<JsonException>(() => JsonSerializer.Serialize(message with { StartAt = timestamp }, ReservationJsonContext.Default.ReservationEvent));
        }
    }

    internal static ReservationEvent Message()
    {
        var start = new DateTimeOffset(2030, 1, 2, 12, 0, 0, TimeSpan.Zero);
        return new ReservationEvent(1, Guid.NewGuid(), "ReservationConfirmed", Guid.NewGuid(), new string('a', 64), "camera-001", "Camera", start, start.AddHours(1), start.AddDays(-1));
    }

    private static bool Read(byte[] body, ReservationEvent message, string contentType = "application/json", string? messageId = null,
        string? correlationId = null, string routingKey = ReservationTopology.Confirmed, Dictionary<string, object?>? headers = null)
    {
        return ReservationEventValidation.TryRead(body, routingKey, contentType, messageId ?? message.EventId.ToString(),
            correlationId ?? message.ReservationId.ToString(), headers ?? new Dictionary<string, object?> { ["schema"] = 1 }, out _, out _);
    }
}
