using System.Buffers;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace IdentityAccess;

public static class IdentityPrincipal
{
    public static string UserKey(ClaimsPrincipal principal)
    {
        if (!IsHuman(principal) || !HasValidSubject(principal) || SingleValue(principal, "iss") is not { Length: > 0 } issuer)
        {
            throw new InvalidOperationException("A validated human identity is required.");
        }

        var buffer = new ArrayBufferWriter<byte>();
        using (var writer = new Utf8JsonWriter(buffer))
        {
            writer.WriteStartArray();
            writer.WriteStringValue(issuer);
            writer.WriteStringValue(SingleValue(principal, "sub"));
            writer.WriteEndArray();
        }

        return Convert.ToHexStringLower(SHA256.HashData(buffer.WrittenSpan));
    }

    internal static bool HasValidSubject(ClaimsPrincipal principal)
    {
        return SingleValue(principal, "sub") is { Length: > 0 } subject && Encoding.UTF8.GetByteCount(subject) <= 255;
    }

    internal static bool HasValue(ClaimsPrincipal principal, string type, string expected)
    {
        return string.Equals(SingleValue(principal, type), expected, StringComparison.Ordinal);
    }

    public static bool IsHuman(ClaimsPrincipal principal)
    {
        return principal.Identity?.IsAuthenticated == true
            && HasValue(principal, "principal_kind", "human")
            && (HasValue(principal, "azp", "equipment-web") || HasValue(principal, "azp", "equipment-docs"));
    }

    internal static bool HasRealmRole(ClaimsPrincipal principal, string role)
    {
        string? json = SingleValue(principal, "realm_access");
        if (json is null)
        {
            return false;
        }

        try
        {
            RoleGrants? grants = JsonSerializer.Deserialize(json, IdentityJsonContext.Default.RoleGrants);
            return grants?.Roles?.Contains(role, StringComparer.Ordinal) == true;
        }
        catch (JsonException)
        {
            return false;
        }
    }

    internal static bool CanReadEquipment(ClaimsPrincipal principal)
    {
        if (!HasValue(principal, "principal_kind", "service") || !HasValue(principal, "azp", "reservations-service")
            || SingleValue(principal, "resource_access") is not { } json)
        {
            return false;
        }

        try
        {
            Dictionary<string, RoleGrants>? clients = JsonSerializer.Deserialize(json, IdentityJsonContext.Default.DictionaryStringRoleGrants);
            return clients?.TryGetValue("inventory-api", out RoleGrants? grants) == true
                && grants?.Roles?.Contains("equipment.read", StringComparer.Ordinal) == true;
        }
        catch (JsonException)
        {
            return false;
        }
    }

    private static string? SingleValue(ClaimsPrincipal principal, string type)
    {
        using IEnumerator<Claim> claims = principal.FindAll(type).GetEnumerator();
        if (!claims.MoveNext())
        {
            return null;
        }

        string value = claims.Current.Value;
        return claims.MoveNext() ? null : value;
    }
}
