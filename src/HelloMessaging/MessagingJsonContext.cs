using System.Text.Json;
using System.Text.Json.Serialization;

namespace HelloMessaging;

[JsonSourceGenerationOptions(JsonSerializerDefaults.Web)]
[JsonSerializable(typeof(Equipment))]
[JsonSerializable(typeof(Equipment[]))]
[JsonSerializable(typeof(HelloRequested))]
public partial class MessagingJsonContext : JsonSerializerContext
{
}
