using System.Text.Json;
using System.Text.Json.Serialization;

namespace HelloMessaging;

[JsonSourceGenerationOptions(JsonSerializerDefaults.Web)]
[JsonSerializable(typeof(ReservationEvent))]
public sealed partial class ReservationJsonContext : JsonSerializerContext
{
}
