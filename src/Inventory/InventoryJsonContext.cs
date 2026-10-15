using System.Text.Json;
using System.Text.Json.Serialization;

namespace Inventory;

[JsonSourceGenerationOptions(JsonSerializerDefaults.Web)]
[JsonSerializable(typeof(EquipmentItem))]
[JsonSerializable(typeof(EquipmentItem[]))]
internal sealed partial class InventoryJsonContext : JsonSerializerContext
{
}
