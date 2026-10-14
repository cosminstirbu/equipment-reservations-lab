using HelloMessaging;
using ServiceDefaults;

WebApplicationBuilder builder = WebApplication.CreateBuilder(args);
builder.AddServiceDefaults();
builder.Services.ConfigureHttpJsonOptions(options =>
    options.SerializerOptions.TypeInfoResolverChain.Insert(0, MessagingJsonContext.Default));

WebApplication app = builder.Build();
app.MapOperationalEndpoints();

var equipment = new Equipment("camera-001", "Demo Camera");
app.MapGet("/api/equipment", () => new[] { equipment });
app.MapGet("/api/equipment/{id}", (string id) =>
{
    if (!HelloValidation.IsEquipmentId(id))
    {
        return Results.Problem(statusCode: 400, title: "Invalid equipment ID");
    }

    Equipment? item = id == equipment.Id ? equipment : null;
    return item is not null
        ? Results.Ok(item)
        : Results.Problem(statusCode: 404, title: "Equipment not found");
});

app.Run();

namespace Inventory
{
    public partial class Program
    {
    }
}
