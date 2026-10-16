using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace BrokerBootstrap;

public static class BrokerProvisioning
{
    public const string Configuration = "definitions.import_backend = local_filesystem\ndefinitions.local.path = /etc/rabbitmq/equipment-definitions.json\ndefinitions.skip_if_unchanged = true\n";

    public static string Build(string administrator, string administratorPassword, string administratorSalt, string publisherPassword, string publisherSalt, string consumerPassword, string consumerSalt)
    {
        if (string.IsNullOrWhiteSpace(administrator) || administrator is "reservations-publisher" or "notifications-consumer")
        {
            throw new InvalidOperationException("Broker definitions configuration is invalid.");
        }

        var definitions = new BrokerDefinitions(
            [User(administrator, administratorPassword, administratorSalt, ["administrator"]),
                User("reservations-publisher", publisherPassword, publisherSalt, []),
                User("notifications-consumer", consumerPassword, consumerSalt, [])],
            [new("/"), new("equipment")],
            [new(administrator, "/", ".*", ".*", ".*"), new(administrator, "equipment", ".*", ".*", ".*"),
                new("reservations-publisher", "equipment", "^$", "^reservations$", "^$"),
                new("notifications-consumer", "equipment", "^$", "^$", "^reservation-notifications$")],
            [new("reservations", "equipment", "direct", true, false, new())],
            [new("reservation-notifications", "equipment", true, false, new())],
            [Binding("reservation.confirmed"), Binding("reservation.cancelled")]);
        return JsonSerializer.Serialize(definitions, BrokerJsonContext.Default.BrokerDefinitions);
    }

    private static BrokerUser User(string name, string password, string material, string[] tags)
    {
        if (password.Length == 0 || material.Length < 32)
        {
            throw new InvalidOperationException("Broker definitions configuration is invalid.");
        }

        byte[] salt = SHA256.HashData(Encoding.UTF8.GetBytes(material))[..4];
        byte[] passwordBytes = Encoding.UTF8.GetBytes(password);
        byte[] salted = new byte[4 + passwordBytes.Length];
        salt.CopyTo(salted, 0);
        passwordBytes.CopyTo(salted, 4);
        byte[] output = new byte[36];
        salt.CopyTo(output, 0);
        SHA256.HashData(salted).CopyTo(output, 4);
        try
        {
            return new BrokerUser(name, Convert.ToBase64String(output), "rabbit_password_hashing_sha256", tags);
        }
        finally
        {
            CryptographicOperations.ZeroMemory(passwordBytes);
            CryptographicOperations.ZeroMemory(salted);
            CryptographicOperations.ZeroMemory(output);
        }
    }

    private static BrokerBinding Binding(string route)
    {
        return new("reservations", "equipment", "reservation-notifications", "queue", route, new());
    }
}

internal sealed record BrokerDefinitions(BrokerUser[] Users, BrokerVhost[] Vhosts, BrokerPermission[] Permissions, BrokerExchange[] Exchanges, BrokerQueue[] Queues, BrokerBinding[] Bindings)
{
    public override string ToString()
    {
        return nameof(BrokerDefinitions);
    }
}

internal sealed record BrokerUser(string Name, string PasswordHash, string HashingAlgorithm, string[] Tags)
{
    public override string ToString()
    {
        return nameof(BrokerUser);
    }
}

internal sealed record BrokerVhost(string Name);

internal sealed record BrokerPermission(string User, string Vhost, string Configure, string Write, string Read);

internal sealed record BrokerArguments;

internal sealed record BrokerExchange(string Name, string Vhost, string Type, bool Durable, bool AutoDelete, BrokerArguments Arguments);

internal sealed record BrokerQueue(string Name, string Vhost, bool Durable, bool AutoDelete, BrokerArguments Arguments);

internal sealed record BrokerBinding(string Source, string Vhost, string Destination, string DestinationType, string RoutingKey, BrokerArguments Arguments);

[JsonSourceGenerationOptions(PropertyNamingPolicy = JsonKnownNamingPolicy.SnakeCaseLower)]
[JsonSerializable(typeof(BrokerDefinitions))]
internal sealed partial class BrokerJsonContext : JsonSerializerContext;
