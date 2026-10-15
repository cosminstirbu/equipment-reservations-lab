using System.Text.Json;
using System.Text.Json.Serialization;
using Reservations;

[JsonSourceGenerationOptions(JsonSerializerDefaults.Web)]
[JsonSerializable(typeof(ReservationInput))]
[JsonSerializable(typeof(Reservation))]
[JsonSerializable(typeof(Reservation[]))]
[JsonSerializable(typeof(Availability))]
[JsonSerializable(typeof(InventoryItem))]
internal sealed partial class ReservationsJsonContext : JsonSerializerContext
{
}
