using System.Text.Json;
using System.Text.Json.Serialization;

[JsonSourceGenerationOptions(JsonSerializerDefaults.Web)]
[JsonSerializable(typeof(HelloInput))]
[JsonSerializable(typeof(HelloResult))]
internal sealed partial class ReservationsJsonContext : JsonSerializerContext
{
}

internal sealed record HelloResult(Guid CorrelationId);
