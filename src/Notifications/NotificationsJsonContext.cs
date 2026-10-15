using System.Text.Json;
using System.Text.Json.Serialization;

namespace Notifications;

[JsonSourceGenerationOptions(JsonSerializerDefaults.Web)]
[JsonSerializable(typeof(InboxEntry[]))]
internal sealed partial class NotificationsJsonContext : JsonSerializerContext
{
}
