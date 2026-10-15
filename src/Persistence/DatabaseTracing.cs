using System.Collections.Concurrent;
using System.Diagnostics;
using System.Runtime.CompilerServices;
using System.Security.Cryptography;
using System.Text;
using Npgsql;

namespace Persistence;

public sealed record DatabaseCommand(string Operation, string Sql);

public sealed record DatabaseOperation(string Database, string Operation, string? Sql);

public static class DatabaseTracing
{
    public const string HealthSql = "SELECT 1";
    private const string OperationProperty = "Equipment.DatabaseOperation";
    private static readonly ConditionalWeakTable<NpgsqlDataSource, SourcePolicy> Policies = [];

    public static NpgsqlDataSource Create(string connectionString, string database, bool captureSqlText = true,
        bool administrative = false, int commandTimeout = 5, IEnumerable<DatabaseCommand>? commands = null)
    {
        string identity = SafeDatabase(database);
        var settings = new NpgsqlConnectionStringBuilder(connectionString)
        {
            Timeout = 3,
            CommandTimeout = commandTimeout,
            IncludeErrorDetail = false,
            LogParameters = false
        };
        var policy = new SourcePolicy(identity, captureSqlText && !administrative, commands ?? []);
        var builder = new NpgsqlDataSourceBuilder(settings.ConnectionString)
        {
            Name = "equipment." + identity + (administrative ? ".admin" : ".application")
        };
        _ = builder.ConfigureTracing(tracing => tracing
            .ConfigureCommandSpanNameProvider(command => "postgresql." + policy.Describe(command.CommandText).Operation)
            .ConfigureCommandEnrichmentCallback((activity, command) => activity.SetCustomProperty(OperationProperty, policy.Describe(command.CommandText)))
            .ConfigureBatchSpanNameProvider(_ => "postgresql.command")
            .ConfigureBatchEnrichmentCallback((activity, _) => activity.SetCustomProperty(OperationProperty, new DatabaseOperation(identity, "command", null))));
        NpgsqlDataSource source = builder.Build();
        Policies.Add(source, policy);
        return source;
    }

    public static DatabaseOperation Describe(Activity activity)
    {
        if (activity.GetCustomProperty(OperationProperty) is DatabaseOperation operation)
        {
            return operation;
        }

        string database = "unknown";
        if (activity.GetTagItem("db.npgsql.data_source") is string source)
        {
            foreach (string candidate in new[] { "inventory", "reservations", "notifications", "postgres", "template1" })
            {
                if (source == "equipment." + candidate + ".admin" || source == "equipment." + candidate + ".application")
                {
                    database = candidate;
                    break;
                }
            }
        }

        return new DatabaseOperation(database, activity.OperationName.StartsWith("CONNECT ", StringComparison.Ordinal) ? "connect" : "command", null);
    }

    public static void RegisterReviewedMigration(NpgsqlDataSource source, string sql, string expectedDigest)
    {
        string actual = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(sql)));
        if (actual == expectedDigest && Policies.TryGetValue(source, out SourcePolicy? policy))
        {
            policy.AddMigration(sql);
        }
    }

    private static string SafeDatabase(string database)
    {
        return database is "inventory" or "reservations" or "notifications" or "postgres" or "template1" ? database : "unknown";
    }

    private sealed class SourcePolicy
    {
        private readonly ConcurrentDictionary<string, string> commands = new(StringComparer.Ordinal);
        private readonly string database;
        private readonly bool capture;

        public SourcePolicy(string database, bool capture, IEnumerable<DatabaseCommand> descriptors)
        {
            this.database = database;
            this.capture = capture;
            commands[HealthSql] = "database.health";
            foreach (DatabaseCommand descriptor in descriptors.Concat(SqlMigrations.Commands))
            {
                commands[descriptor.Sql] = descriptor.Operation;
            }
        }

        public void AddMigration(string sql)
        {
            commands[sql] = "migration.apply";
        }

        public DatabaseOperation Describe(string sql)
        {
            string? text = capture ? sql : null;
            return commands.TryGetValue(sql, out string? operation)
                ? new DatabaseOperation(database, operation, text)
                : new DatabaseOperation(database, "command", null);
        }
    }
}
