using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json.Serialization.Metadata;

namespace IdentityBootstrap;

public sealed record IdentityProvisioningSettings(string Authority, string WebRoot, string AdminUsername, string AdminPassword,
    IReadOnlyDictionary<string, string> UserPasswords, string ServiceSecret)
{
    public override string ToString()
    {
        return nameof(IdentityProvisioningSettings);
    }
}

public sealed class IdentityProvisioning(HttpClient client)
{
    private const string RealmPath = "admin/realms/equipment";
    private static readonly Dictionary<string, string> HumanRoles = new(StringComparer.Ordinal)
    {
        ["employee-a"] = "Employee",
        ["employee-b"] = "Employee",
        ["approver"] = "Approver",
        ["equipment-staff"] = "EquipmentStaff"
    };
    private string? adminToken;

    public async Task ReconcileAsync(IdentityProvisioningSettings settings, CancellationToken cancellationToken)
    {
        ValidateSettings(settings);
        using var deadline = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        deadline.CancelAfter(TimeSpan.FromSeconds(60));
        CancellationToken token = deadline.Token;
        client.BaseAddress = new Uri(new Uri(settings.Authority).GetLeftPart(UriPartial.Authority) + "/");
        using var credentials = new FormUrlEncodedContent(new Dictionary<string, string>
        {
            ["grant_type"] = "password",
            ["client_id"] = "admin-cli",
            ["username"] = settings.AdminUsername,
            ["password"] = settings.AdminPassword
        });
        using HttpResponseMessage authenticated = await client.PostAsync("realms/master/protocol/openid-connect/token", credentials, token);
        EnsureSuccess(authenticated);
        TokenResponse authority = await authenticated.Content.ReadFromJsonAsync(IdentityJsonContext.Default.TokenResponse, token)
            ?? throw new InvalidOperationException("Provider administration authority is unavailable.");
        adminToken = authority.AccessToken;

        var realm = new RealmConfiguration("equipment");
        await EnsureCreatedAsync(RealmPath, "admin/realms", realm, IdentityJsonContext.Default.RealmConfiguration, token);
        await PutAsync(RealmPath, realm, IdentityJsonContext.Default.RealmConfiguration, token);
        var adminOnly = new UserProfilePermissions(["admin"], ["admin"]);
        var visibleName = new UserProfilePermissions(["admin", "user"], ["admin"]);
        var profile = new UserProfileConfiguration(
        [
            new UserProfileAttribute("username", visibleName),
            new UserProfileAttribute("email", adminOnly),
            new UserProfileAttribute("firstName", visibleName),
            new UserProfileAttribute("lastName", visibleName),
            new UserProfileAttribute("equipment-provisioning", adminOnly),
            new UserProfileAttribute("equipment-role", adminOnly)
        ]);
        await PutAsync(RealmPath + "/users/profile", profile, IdentityJsonContext.Default.UserProfileConfiguration, token);
        var roles = new Dictionary<string, RoleRepresentation>(StringComparer.Ordinal);
        foreach (string role in HumanRoles.Values.Distinct(StringComparer.Ordinal))
        {
            await EnsureCreatedAsync(RealmPath + "/roles/" + role, RealmPath + "/roles", new RoleRepresentation(role), IdentityJsonContext.Default.RoleRepresentation, token);
            roles[role] = await RequiredAsync(RealmPath + "/roles/" + role, IdentityJsonContext.Default.RoleRepresentation, token);
        }

        RoleRepresentation[] defaults = await RequiredAsync(RealmPath + "/roles/default-roles-equipment/composites/realm", IdentityJsonContext.Default.RoleRepresentationArray, token);
        if (defaults.Any(role => roles.ContainsKey(role.Name)))
        {
            throw new InvalidOperationException("Unexpected default identity privilege drift.");
        }

        var clients = new Dictionary<string, ClientRepresentation>(StringComparer.Ordinal);
        foreach (string id in new[] { "inventory-api", "reservations-api", "notifications-api" })
        {
            clients[id] = await ReconcileClientAsync(new ClientRepresentation { ClientId = id, BearerOnly = true }, token);
        }

        string webOrigin = new Uri(settings.WebRoot).GetLeftPart(UriPartial.Authority);
        clients["equipment-web"] = await ReconcileClientAsync(new ClientRepresentation
        {
            ClientId = "equipment-web",
            PublicClient = true,
            StandardFlowEnabled = true,
            RedirectUris = [settings.WebRoot],
            WebOrigins = [webOrigin],
            Attributes = new Dictionary<string, string>
            {
                ["pkce.code.challenge.method"] = "S256",
                ["post.logout.redirect.uris"] = settings.WebRoot
            }
        }, token);
        string web = ClientPath(clients["equipment-web"]);
        await AddRolesAsync(web + "/scope-mappings/realm", [.. roles.Values], token);
        await ReconcileMapperAsync(web, KindMapper("human"), token);
        await ReconcileMapperAsync(web, new ProtocolMapper("equipment-account-name", "openid-connect", "oidc-usermodel-property-mapper", new Dictionary<string, string>
        {
            ["user.attribute"] = "username",
            ["claim.name"] = "preferred_username",
            ["jsonType.label"] = "String",
            ["access.token.claim"] = "true",
            ["id.token.claim"] = "true",
            ["userinfo.token.claim"] = "false"
        }), token);
        foreach (string audience in clients.Keys.Where(id => id.EndsWith("-api", StringComparison.Ordinal)))
        {
            await ReconcileMapperAsync(web, AudienceMapper(audience), token);
        }

        clients["reservations-service"] = await ReconcileClientAsync(new ClientRepresentation
        {
            ClientId = "reservations-service",
            ServiceAccountsEnabled = true,
            Secret = settings.ServiceSecret
        }, token);
        string service = ClientPath(clients["reservations-service"]);
        await ReconcileMapperAsync(service, KindMapper("service"), token);
        await ReconcileMapperAsync(service, AudienceMapper("inventory-api"), token);
        string inventory = ClientPath(clients["inventory-api"]);
        await EnsureCreatedAsync(inventory + "/roles/equipment.read", inventory + "/roles", new RoleRepresentation("equipment.read"), IdentityJsonContext.Default.RoleRepresentation, token);
        RoleRepresentation read = await RequiredAsync(inventory + "/roles/equipment.read", IdentityJsonContext.Default.RoleRepresentation, token);
        await AddRolesAsync(service + "/scope-mappings/clients/" + clients["inventory-api"].Id, [read], token);
        UserRepresentation serviceUser = await RequiredAsync(service + "/service-account-user", IdentityJsonContext.Default.UserRepresentation, token);
        await AddRolesAsync(RealmPath + "/users/" + serviceUser.Id + "/role-mappings/clients/" + clients["inventory-api"].Id, [read], token);

        foreach ((string username, string role) in HumanRoles)
        {
            await ReconcileUserAsync(username, role, settings.UserPasswords[username], roles[role], token);
        }

        UserRepresentation[] humans = await RequiredAsync(RealmPath + "/users?max=100", IdentityJsonContext.Default.UserRepresentationArray, token);
        if (humans.Count(user => user.ServiceAccountClientId is null && !user.Username.StartsWith("service-account-", StringComparison.Ordinal)) != HumanRoles.Count)
        {
            throw new InvalidOperationException("Unexpected provisioned identity account drift.");
        }
    }

    private static void ValidateSettings(IdentityProvisioningSettings settings)
    {
        if (!Uri.TryCreate(settings.Authority, UriKind.Absolute, out Uri? authority) || !authority.IsLoopback
            || authority.AbsolutePath != "/realms/equipment" || authority.Query.Length != 0 || authority.Fragment.Length != 0 || authority.UserInfo.Length != 0
            || authority.Scheme is not ("http" or "https")
            || !Uri.TryCreate(settings.WebRoot, UriKind.Absolute, out Uri? web) || !web.IsLoopback
            || web.AbsolutePath != "/" || web.Query.Length != 0 || web.Fragment.Length != 0 || web.UserInfo.Length != 0
            || web.Scheme is not ("http" or "https")
            || settings.UserPasswords.Count != HumanRoles.Count || HumanRoles.Keys.Any(name => !settings.UserPasswords.ContainsKey(name))
            || settings.UserPasswords.Values.Any(string.IsNullOrWhiteSpace) || string.IsNullOrWhiteSpace(settings.ServiceSecret)
            || string.IsNullOrWhiteSpace(settings.AdminUsername) || string.IsNullOrWhiteSpace(settings.AdminPassword))
        {
            throw new InvalidOperationException("Local identity provisioning settings are invalid.");
        }
    }

    private async Task<ClientRepresentation> ReconcileClientAsync(ClientRepresentation desired, CancellationToken token)
    {
        string lookup = RealmPath + "/clients?clientId=" + Uri.EscapeDataString(desired.ClientId);
        ClientRepresentation[] matches = await RequiredAsync(lookup, IdentityJsonContext.Default.ClientRepresentationArray, token);
        if (matches.Length == 0)
        {
            await CreateAsync(RealmPath + "/clients", desired, IdentityJsonContext.Default.ClientRepresentation, token);
            matches = await RequiredAsync(lookup, IdentityJsonContext.Default.ClientRepresentationArray, token);
        }

        ClientRepresentation current = matches.Length == 1 ? matches[0] : throw new InvalidOperationException("Ambiguous provider client configuration.");
        ClientRepresentation updated = desired with
        {
            Id = current.Id
        };
        await PutAsync(ClientPath(updated), updated, IdentityJsonContext.Default.ClientRepresentation, token);
        return updated;
    }

    private async Task ReconcileUserAsync(string username, string role, string password, RoleRepresentation grant, CancellationToken token)
    {
        string lookup = RealmPath + "/users?exact=true&username=" + Uri.EscapeDataString(username);
        UserRepresentation[] matches = await RequiredAsync(lookup, IdentityJsonContext.Default.UserRepresentationArray, token);
        if (matches.Length == 0)
        {
            var created = new UserRepresentation
            {
                Username = username,
                FirstName = username,
                LastName = "Local",
                Email = username + "@example.invalid",
                EmailVerified = true,
                Credentials = [new UserCredential("password", password)],
                Attributes = new Dictionary<string, string[]> { ["equipment-provisioning"] = ["initializing"], ["equipment-role"] = [role] }
            };
            await CreateAsync(RealmPath + "/users", created, IdentityJsonContext.Default.UserRepresentation, token);
            matches = await RequiredAsync(lookup, IdentityJsonContext.Default.UserRepresentationArray, token);
        }

        UserRepresentation user = matches.Length == 1 ? matches[0] : throw new InvalidOperationException("Ambiguous provider user configuration.");
        if (!user.Enabled || !user.Attributes.TryGetValue("equipment-role", out string[]? intended) || intended.Length != 1 || intended[0] != role
            || !user.Attributes.TryGetValue("equipment-provisioning", out string[]? phase) || phase.Length != 1 || phase[0] is not ("initializing" or "complete"))
        {
            throw new InvalidOperationException("Unexpected identity account configuration drift.");
        }

        string userPath = RealmPath + "/users/" + user.Id;
        RoleRepresentation[] grants = await RequiredAsync(userPath + "/role-mappings/realm/composite", IdentityJsonContext.Default.RoleRepresentationArray, token);
        string[] assigned = [.. grants.Where(item => HumanRoles.Values.Contains(item.Name, StringComparer.Ordinal)).Select(item => item.Name)];
        if (grants.Any(item => item.Name != role && item.Name is not ("default-roles-equipment" or "offline_access" or "uma_authorization"))
            || assigned.Any(name => name != role) || (phase[0] == "complete" && (assigned.Length != 1 || assigned[0] != role)))
        {
            throw new InvalidOperationException("Unexpected identity role privilege drift.");
        }

        if (phase[0] == "initializing")
        {
            await AddRolesAsync(userPath + "/role-mappings/realm", [grant], token);
            user.Attributes["equipment-provisioning"] = ["complete"];
            await PutAsync(userPath, user with
            {
                Credentials = null
            }, IdentityJsonContext.Default.UserRepresentation, token);
        }
    }

    private async Task ReconcileMapperAsync(string owner, ProtocolMapper desired, CancellationToken token)
    {
        string collection = owner + "/protocol-mappers/models";
        ProtocolMapper[] existing = await RequiredAsync(collection, IdentityJsonContext.Default.ProtocolMapperArray, token);
        ProtocolMapper[] matches = [.. existing.Where(mapper => mapper.Name == desired.Name)];
        if (matches.Length == 0)
        {
            await CreateAsync(collection, desired, IdentityJsonContext.Default.ProtocolMapper, token);
            ProtocolMapper[] created = await RequiredAsync(collection, IdentityJsonContext.Default.ProtocolMapperArray, token);
            if (created.Count(mapper => mapper.Name == desired.Name) != 1)
            {
                throw new InvalidOperationException("Provider mapper creation outcome is uncertain.");
            }
        }
        else if (matches.Length == 1)
        {
            await PutAsync(collection + "/" + matches[0].Id, desired with
            {
                Id = matches[0].Id
            }, IdentityJsonContext.Default.ProtocolMapper, token);
        }
        else
        {
            throw new InvalidOperationException("Ambiguous provider mapper configuration.");
        }
    }

    private static ProtocolMapper KindMapper(string kind)
    {
        return new ProtocolMapper("equipment-principal-kind", "openid-connect", "oidc-hardcoded-claim-mapper", new Dictionary<string, string>
        {
            ["claim.name"] = "principal_kind",
            ["claim.value"] = kind,
            ["jsonType.label"] = "String",
            ["access.token.claim"] = "true",
            ["id.token.claim"] = "false",
            ["userinfo.token.claim"] = "false"
        });
    }

    private static ProtocolMapper AudienceMapper(string audience)
    {
        return new ProtocolMapper("equipment-audience-" + audience, "openid-connect", "oidc-audience-mapper", new Dictionary<string, string>
        {
            ["included.client.audience"] = audience,
            ["access.token.claim"] = "true",
            ["id.token.claim"] = "false"
        });
    }

    private static string ClientPath(ClientRepresentation client)
    {
        return RealmPath + "/clients/" + (client.Id ?? throw new InvalidOperationException("Provider client identifier is missing."));
    }

    private async Task AddRolesAsync(string path, RoleRepresentation[] roles, CancellationToken token)
    {
        await CreateAsync(path, roles, IdentityJsonContext.Default.RoleRepresentationArray, token);
        RoleRepresentation[] assigned = await RequiredAsync(path, IdentityJsonContext.Default.RoleRepresentationArray, token);
        if (roles.Any(role => !assigned.Any(item => item.Id == role.Id && item.Name == role.Name)))
        {
            throw new InvalidOperationException("Provider role mapping outcome is uncertain.");
        }
    }

    private async Task EnsureCreatedAsync<T>(string lookup, string collection, T desired, JsonTypeInfo<T> type, CancellationToken token) where T : class
    {
        if (await GetAsync(lookup, type, token) is null)
        {
            await CreateAsync(collection, desired, type, token);
        }
    }

    private async Task<T?> GetAsync<T>(string path, JsonTypeInfo<T> type, CancellationToken token) where T : class
    {
        using HttpResponseMessage response = await SendAsync(HttpMethod.Get, path, null, token);
        if (response.StatusCode == HttpStatusCode.NotFound)
        {
            return null;
        }

        EnsureSuccess(response);
        return await response.Content.ReadFromJsonAsync(type, token);
    }

    private async Task<T> RequiredAsync<T>(string path, JsonTypeInfo<T> type, CancellationToken token) where T : class
    {
        return await GetAsync(path, type, token) ?? throw new InvalidOperationException("Provider configuration response is unavailable.");
    }

    private async Task PutAsync<T>(string path, T value, JsonTypeInfo<T> type, CancellationToken token)
    {
        using HttpResponseMessage response = await SendAsync(HttpMethod.Put, path, () => JsonContent.Create(value, type), token);
        EnsureSuccess(response);
    }

    private async Task CreateAsync<T>(string path, T value, JsonTypeInfo<T> type, CancellationToken token)
    {
        try
        {
            using HttpResponseMessage response = await SendAsync(HttpMethod.Post, path, () => JsonContent.Create(value, type), token);
            if (response.StatusCode != HttpStatusCode.Conflict)
            {
                EnsureSuccess(response);
            }
        }
        catch (HttpRequestException)
        {
            // Callers look up the resource before continuing; never replay an uncertain create.
        }
        catch (OperationCanceledException) when (!token.IsCancellationRequested)
        {
            // A timeout may follow a committed create. The subsequent lookup establishes its outcome.
        }
    }

    private async Task<HttpResponseMessage> SendAsync(HttpMethod method, string path, Func<HttpContent?>? content, CancellationToken token)
    {
        bool repeatSafe = method == HttpMethod.Get || method == HttpMethod.Put;
        for (int attempt = 0; ; attempt++)
        {
            using var request = new HttpRequestMessage(method, path);
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", adminToken);
            request.Content = content?.Invoke();
            try
            {
                HttpResponseMessage response = await client.SendAsync(request, token);
                if (!repeatSafe || attempt >= 2 || !Transient(response.StatusCode))
                {
                    return response;
                }

                response.Dispose();
            }
            catch (HttpRequestException) when (repeatSafe && attempt < 2)
            {
                // Retry only transient transport failure for repeat-safe administration requests.
            }
            catch (OperationCanceledException) when (repeatSafe && attempt < 2 && !token.IsCancellationRequested)
            {
                // The per-request budget expired; the total bootstrap budget still bounds retries.
            }

            await Task.Delay(TimeSpan.FromMilliseconds((100 << attempt) + Random.Shared.Next(51)), token);
        }
    }

    private static bool Transient(HttpStatusCode status)
    {
        return status is HttpStatusCode.RequestTimeout or HttpStatusCode.TooManyRequests || (int)status >= 500;
    }

    private static void EnsureSuccess(HttpResponseMessage response)
    {
        if (!response.IsSuccessStatusCode)
        {
            throw new InvalidOperationException("Identity provider administration request failed.");
        }
    }
}
