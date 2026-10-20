using Npgsql;
using Persistence;

namespace DatabaseBootstrap;

public static class DatabaseProvisioner
{
    private static readonly string[] Databases = ["inventory", "reservations", "notifications"];

    public static Task ReconcileAsync(string adminConnectionString, IReadOnlyDictionary<string, string> passwords, CancellationToken cancellationToken)
    {
        return ReconcileAsync(adminConnectionString, passwords, captureSqlText: true, cancellationToken);
    }

    public static async Task ReconcileAsync(string adminConnectionString, IReadOnlyDictionary<string, string> passwords, bool captureSqlText = true, CancellationToken cancellationToken = default)
    {
        string[] databases = passwords.ContainsKey("keycloak") ? [.. Databases, "keycloak"] : Databases;
        foreach (string database in databases)
        {
            if (!passwords.TryGetValue(database, out string? password) || string.IsNullOrWhiteSpace(password) || password.Contains('\0'))
            {
                throw new ArgumentException("Each service requires an external secret password.", nameof(passwords));
            }
        }

        await using NpgsqlDataSource admin = DatabaseTracing.Create(adminConnectionString, "postgres", administrative: true, commandTimeout: 30);
        await using NpgsqlConnection connection = await admin.OpenConnectionAsync(cancellationToken);
        await ExecuteAsync(connection, "SET standard_conforming_strings=on", cancellationToken);
        await ExecuteAsync(connection, "REVOKE ALL ON DATABASE postgres, template1 FROM PUBLIC", cancellationToken);

        foreach (string database in databases)
        {
            string role = database + "_app";
            string quotedRole = Quote(role);
            await using var exists = new NpgsqlCommand("SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname=$1)", connection);
            _ = exists.Parameters.AddWithValue(role);
            if (!(bool)(await exists.ExecuteScalarAsync(cancellationToken))!)
            {
                string password = "'" + passwords[database].Replace("'", "''", StringComparison.Ordinal) + "'";
                await ExecuteAsync(connection, $"CREATE ROLE {quotedRole} LOGIN PASSWORD {password}", cancellationToken);
            }

            await ExecuteAsync(connection, $"ALTER ROLE {quotedRole} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS", cancellationToken);
            await using var memberships = new NpgsqlCommand("SELECT r.rolname FROM pg_auth_members m JOIN pg_roles r ON r.oid=m.roleid JOIN pg_roles u ON u.oid=m.member WHERE u.rolname=$1", connection);
            _ = memberships.Parameters.AddWithValue(role);
            var inherited = new List<string>();
            await using (NpgsqlDataReader reader = await memberships.ExecuteReaderAsync(cancellationToken))
            {
                while (await reader.ReadAsync(cancellationToken))
                {
                    inherited.Add(reader.GetString(0));
                }
            }

            foreach (string membership in inherited)
            {
                await ExecuteAsync(connection, $"REVOKE {Quote(membership)} FROM {quotedRole}", cancellationToken);
            }

            await using var databaseExists = new NpgsqlCommand("SELECT EXISTS (SELECT 1 FROM pg_database WHERE datname=$1)", connection);
            _ = databaseExists.Parameters.AddWithValue(database);
            if (!(bool)(await databaseExists.ExecuteScalarAsync(cancellationToken))!)
            {
                await ExecuteAsync(connection, $"CREATE DATABASE {Quote(database)} OWNER {quotedRole}", cancellationToken);
            }

            await ExecuteAsync(connection, $"ALTER DATABASE {Quote(database)} OWNER TO {quotedRole}; REVOKE ALL ON DATABASE {Quote(database)} FROM PUBLIC", cancellationToken);
        }

        foreach (string database in databases.Append("postgres").Append("template1"))
        {
            foreach (string service in databases)
            {
                await ExecuteAsync(connection, $"REVOKE ALL ON DATABASE {Quote(database)} FROM {Quote(service + "_app")}", cancellationToken);
            }
        }

        foreach (string database in databases)
        {
            string role = database + "_app";
            await ExecuteAsync(connection, $"GRANT CONNECT ON DATABASE {Quote(database)} TO {Quote(role)}", cancellationToken);
            var adminSettings = new NpgsqlConnectionStringBuilder(adminConnectionString) { Database = database };
            await using NpgsqlDataSource databaseAdmin = DatabaseTracing.Create(adminSettings.ConnectionString, database, administrative: true, commandTimeout: 30);
            await using NpgsqlConnection databaseConnection = await databaseAdmin.OpenConnectionAsync(cancellationToken);
            await ExecuteAsync(databaseConnection, $"REVOKE ALL ON SCHEMA public FROM PUBLIC; GRANT USAGE, CREATE ON SCHEMA public TO {Quote(role)}", cancellationToken);
            if (database == "reservations")
            {
                await ExecuteAsync(databaseConnection, "CREATE EXTENSION IF NOT EXISTS btree_gist", cancellationToken);
            }

            var settings = new NpgsqlConnectionStringBuilder(adminConnectionString)
            {
                Database = database,
                Username = role,
                Password = passwords[database]
            };
            await using NpgsqlDataSource own = DatabaseTracing.Create(settings.ConnectionString, database, captureSqlText, commandTimeout: 30);
            try
            {
                await using NpgsqlConnection authenticated = await own.OpenConnectionAsync(cancellationToken);
            }
            catch (PostgresException exception) when (exception.SqlState == PostgresErrorCodes.InvalidPassword)
            {
                throw new InvalidOperationException("Existing database credentials do not match. Restore the original private credential bundle before retrying.");
            }

            switch (database)
            {
                case "inventory":
                    await Inventory.ServiceMigrations.ApplyAsync(own, cancellationToken);
                    break;
                case "reservations":
                    await Reservations.ServiceMigrations.ApplyAsync(own, cancellationToken);
                    break;
                case "notifications":
                    await Notifications.ServiceMigrations.ApplyAsync(own, cancellationToken);
                    break;
                case "keycloak":
                    // Keycloak owns its schema lifecycle; bootstrap verifies only scoped access.
                    break;
                default:
                    throw new InvalidOperationException("Unknown service database.");
            }
        }
    }

    private static string Quote(string identifier)
    {
        using var quoting = new NpgsqlCommandBuilder();
        return quoting.QuoteIdentifier(identifier);
    }

    private static async Task ExecuteAsync(NpgsqlConnection connection, string sql, CancellationToken cancellationToken)
    {
        await using var command = new NpgsqlCommand(sql, connection) { CommandTimeout = 30 };
        _ = await command.ExecuteNonQueryAsync(cancellationToken);
    }
}
