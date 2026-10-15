using System.Text.Json;
using System.Text.Json.Serialization;

namespace ReservationMessaging;

[JsonSourceGenerationOptions(JsonSerializerDefaults.Web)]
[JsonSerializable(typeof(ReservationEvent))]
public sealed partial class ReservationJsonContext : JsonSerializerContext
{
}
