using System.Text.Json.Serialization;

namespace IdentityAccess;

internal sealed record RoleGrants(string[]? Roles);

[JsonSourceGenerationOptions(PropertyNamingPolicy = JsonKnownNamingPolicy.CamelCase)]
[JsonSerializable(typeof(RoleGrants))]
[JsonSerializable(typeof(Dictionary<string, RoleGrants>))]
internal sealed partial class IdentityJsonContext : JsonSerializerContext;
