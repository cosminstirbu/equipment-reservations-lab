using System.Text.Json.Serialization;

namespace IdentityBootstrap;

internal sealed record RealmConfiguration(string Realm, bool Enabled = true, bool RegistrationAllowed = false,
    bool ResetPasswordAllowed = false, bool LoginWithEmailAllowed = false, bool VerifyEmail = false,
    int AccessTokenLifespan = 120, string SslRequired = "none", bool RevokeRefreshToken = true, int RefreshTokenMaxReuse = 0,
    bool EventsEnabled = false, bool AdminEventsEnabled = false, bool AdminEventsDetailsEnabled = false)
{
    public string[] EventsListeners { get; init; } = [];
}

internal sealed record RoleRepresentation(string Name, string? Id = null);

internal sealed record ClientRepresentation
{
    public string? Id
    {
        get; init;
    }

    public required string ClientId
    {
        get; init;
    }

    public bool Enabled { get; init; } = true;

    public string Protocol { get; init; } = "openid-connect";

    public bool PublicClient
    {
        get; init;
    }

    public bool BearerOnly
    {
        get; init;
    }

    public bool StandardFlowEnabled
    {
        get; init;
    }

    public bool ImplicitFlowEnabled
    {
        get; init;
    }

    public bool DirectAccessGrantsEnabled
    {
        get; init;
    }

    public bool ServiceAccountsEnabled
    {
        get; init;
    }

    public bool FullScopeAllowed
    {
        get; init;
    }

    public string? Secret
    {
        get; init;
    }

    public string[] RedirectUris { get; init; } = [];

    public string[] WebOrigins { get; init; } = [];

    public string[] DefaultClientScopes { get; init; } = ["basic", "roles"];

    public string[] OptionalClientScopes { get; init; } = [];

    public Dictionary<string, string> Attributes { get; init; } = [];

    public override string ToString()
    {
        return nameof(ClientRepresentation);
    }
}

internal sealed record ProtocolMapper(string Name, string Protocol, [property: JsonPropertyName("protocolMapper")] string Mapper,
    Dictionary<string, string> Config, string? Id = null);

internal sealed record UserRepresentation
{
    public string? Id
    {
        get; init;
    }

    public required string Username
    {
        get; init;
    }

    public bool Enabled { get; init; } = true;

    public string? FirstName
    {
        get; init;
    }

    public string? LastName
    {
        get; init;
    }

    public string? Email
    {
        get; init;
    }

    public bool EmailVerified
    {
        get; init;
    }

    public string[] RequiredActions { get; init; } = [];

    public Dictionary<string, string[]> Attributes { get; init; } = [];

    public UserCredential[]? Credentials
    {
        get; init;
    }

    public string? ServiceAccountClientId
    {
        get; init;
    }

    public override string ToString()
    {
        return nameof(UserRepresentation);
    }
}

internal sealed record UserCredential(string Type, string Value, bool Temporary = false)
{
    public override string ToString()
    {
        return nameof(UserCredential);
    }
}

internal sealed record TokenResponse([property: JsonPropertyName("access_token")] string AccessToken)
{
    public override string ToString()
    {
        return nameof(TokenResponse);
    }
}

internal sealed record UserProfilePermissions(string[] View, string[] Edit);

internal sealed record UserProfileAttribute(string Name, UserProfilePermissions Permissions);

internal sealed record UserProfileConfiguration(UserProfileAttribute[] Attributes);

[JsonSourceGenerationOptions(PropertyNamingPolicy = JsonKnownNamingPolicy.CamelCase, DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull)]
[JsonSerializable(typeof(RealmConfiguration))]
[JsonSerializable(typeof(RoleRepresentation))]
[JsonSerializable(typeof(RoleRepresentation[]))]
[JsonSerializable(typeof(ClientRepresentation))]
[JsonSerializable(typeof(ClientRepresentation[]))]
[JsonSerializable(typeof(ProtocolMapper))]
[JsonSerializable(typeof(ProtocolMapper[]))]
[JsonSerializable(typeof(UserRepresentation))]
[JsonSerializable(typeof(UserRepresentation[]))]
[JsonSerializable(typeof(TokenResponse))]
[JsonSerializable(typeof(UserProfileConfiguration))]
internal sealed partial class IdentityJsonContext : JsonSerializerContext;
