using ApiDocumentation;
using IdentityAccess;
using Inventory;
using ServiceDefaults;

WebApplicationBuilder builder = WebApplication.CreateBuilder(args);
builder.AddServiceDefaults();
builder.AddApiDocumentation();
_ = builder.Services.AddIdentityAuthentication(builder.Configuration, builder.Environment, "inventory-api");
builder.AddDatabase("inventory", EquipmentStore.Commands);
builder.Services.AddSingleton<EquipmentStore>();
builder.Services.ConfigureHttpJsonOptions(options =>
    options.SerializerOptions.TypeInfoResolverChain.Insert(0, InventoryJsonContext.Default));

WebApplication app = builder.Build();
_ = app.UseAuthentication();
_ = app.UseAuthorization();
_ = app.UseOwnershipInputGuard();
app.MapOperationalEndpoints();
app.MapApiDocumentation();

app.MapEquipmentEndpoints();

app.Run();

namespace Inventory
{
    public partial class Program
    {
    }
}
