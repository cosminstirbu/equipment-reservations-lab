using System.Diagnostics;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using Npgsql;
using Xunit;

namespace Persistence.Tests;

// Telemetry capture observes process-wide sources, so this class runs exclusively.
[TestClass(DisableParallelization = true)]
[Collection("Database telemetry and recovery")]
public sealed class DatabaseTelemetryPrivacyTests(PostgresFixture postgres)
{
    [Theory]
    [InlineData(true)]
    [InlineData(false)]
    public async Task ProductionPipelineExportsSafeCommandsAndRedactsUnknownTextParametersAndErrors(bool captureSql)
    {
        await using NpgsqlDataSource fixture = await postgres.CreateMigratedDatabaseAsync("inventory");
        using var capture = new DatabaseTelemetryCapture();
        using var second = new DatabaseTelemetryCapture();
        using WebApplicationFactory<Inventory.Program> host = capture.App<Inventory.Program>("inventory", postgres.ConnectionStringFor(fixture), captureSql)
            .WithWebHostBuilder(builder => builder.ConfigureServices(second.Register));
        using HttpClient client = host.CreateClient();
        Assert.True((await client.GetAsync("/api/equipment/camera-001", TestContext.Current.CancellationToken)).IsSuccessStatusCode);
        NpgsqlDataSource database = host.Services.GetRequiredService<NpgsqlDataSource>();
        const string value = "private-parameter-result-6dbf2";
        const string literal = "private-literal-68ab3";
        const string error = "private-error-detail-79bc4";
        Assert.Null(await host.Services.GetRequiredService<Inventory.EquipmentStore>().FindAsync(value, CancellationToken.None));
        await using (NpgsqlCommand seed = fixture.CreateCommand("UPDATE equipment SET name=$1 WHERE id='camera-001'"))
        {
            _ = seed.Parameters.AddWithValue(value);
            _ = await seed.ExecuteNonQueryAsync(TestContext.Current.CancellationToken);
        }

        Assert.Contains(value, await client.GetStringAsync("/api/equipment/camera-001", TestContext.Current.CancellationToken), StringComparison.Ordinal);
        await using (NpgsqlCommand command = database.CreateCommand("SELECT $1::text || '" + literal + "'"))
        {
            _ = command.Parameters.AddWithValue(value);
            Assert.Equal(value + literal, await command.ExecuteScalarAsync(TestContext.Current.CancellationToken));
        }

        await using (NpgsqlCommand command = database.CreateCommand("DO $$ BEGIN RAISE EXCEPTION USING MESSAGE='" + error + "', DETAIL='" + value + "'; END $$"))
        {
            _ = await Assert.ThrowsAsync<PostgresException>(command.ExecuteNonQueryAsync);
        }

        await host.DisposeAsync();
        foreach (DatabaseTelemetryCapture exported in new[] { capture, second })
        {
            Assert.Null(exported.Spans.Failure);
            Assert.Contains(exported.AllFields, field => field.StartsWith("telemetry.sdk.name=", StringComparison.Ordinal));
            DatabaseSpan[] spans = [.. exported.Spans.Values.Where(span => span.Source == "Npgsql")];
            Assert.NotEmpty(spans);
            Assert.Contains(spans, span => span.Status == ActivityStatusCode.Error && span.Tags["error.type"] is "P0001");
            Assert.All(exported.AllFields, field =>
            {
                Assert.DoesNotContain(value, field, StringComparison.Ordinal);
                Assert.DoesNotContain(literal, field, StringComparison.Ordinal);
                Assert.DoesNotContain(error, field, StringComparison.Ordinal);
                Assert.DoesNotContain("Password=", field, StringComparison.OrdinalIgnoreCase);
            });
            Assert.All(spans.Where(span => span.Name == "postgresql.command"), span => Assert.False(span.Tags.ContainsKey("db.query.text")));
            if (captureSql)
            {
                Assert.Contains(spans, span => span.Tags.TryGetValue("db.query.text", out object? text) && Equals(text, "SELECT id, name, operational FROM equipment WHERE id=$1"));
            }
            else
            {
                Assert.All(spans, span => Assert.False(span.Tags.ContainsKey("db.query.text")));
            }
        }
    }

    [Fact]
    public async Task RepeatedHostsKeepDatabaseFailuresSafeWithoutDuplicateExceptionEvents()
    {
        await using NpgsqlDataSource fixture = await postgres.CreateMigratedDatabaseAsync("inventory");
        for (int attempt = 0; attempt < 2; attempt++)
        {
            using var capture = new DatabaseTelemetryCapture();
            using WebApplicationFactory<Inventory.Program> host = capture.App<Inventory.Program>("inventory", postgres.ConnectionStringFor(fixture));
            _ = host.CreateClient();
            await using NpgsqlCommand command = host.Services.GetRequiredService<NpgsqlDataSource>().CreateCommand("SELECT 'private-client-error-82cd5'::integer");
            _ = await Assert.ThrowsAsync<PostgresException>(command.ExecuteScalarAsync);
            await host.DisposeAsync();
            DatabaseSpan failure = Assert.Single(capture.Spans.Values, span => span.Source == "Npgsql" && span.Status == ActivityStatusCode.Error);
            _ = Assert.Single(failure.Fields, field => field == "exception");
            Assert.All(capture.AllFields, field => Assert.DoesNotContain("private-client-error-82cd5", field, StringComparison.Ordinal));
        }
    }

    [Fact]
    public async Task AdministrativePurposeOverridesAnExactApprovedStatement()
    {
        await using NpgsqlDataSource fixture = await postgres.CreateMigratedDatabaseAsync("inventory");
        using var capture = new DatabaseTelemetryCapture();
        using WebApplicationFactory<Inventory.Program> host = capture.App<Inventory.Program>("inventory", postgres.ConnectionStringFor(fixture));
        _ = host.CreateClient();
        await using NpgsqlDataSource admin = DatabaseTracing.Create(postgres.ConnectionStringFor(fixture), "inventory", administrative: true, commands: Inventory.EquipmentStore.Commands);
        await using (NpgsqlCommand health = admin.CreateCommand(DatabaseTracing.HealthSql))
        {
            Assert.Equal(1, await health.ExecuteScalarAsync(TestContext.Current.CancellationToken));
        }

        await using (NpgsqlCommand list = admin.CreateCommand(Inventory.EquipmentStore.Commands[0].Sql))
        {
            await using NpgsqlDataReader reader = await list.ExecuteReaderAsync(TestContext.Current.CancellationToken);
            Assert.True(await reader.ReadAsync(TestContext.Current.CancellationToken));
        }

        await host.DisposeAsync();
        Assert.Contains(capture.Spans.Values, span => Equals(span.Tags.GetValueOrDefault("db.operation.name"), "equipment.list"));
        Assert.All(capture.Spans.Values.Where(span => span.Source == "Npgsql"), span => Assert.False(span.Tags.ContainsKey("db.query.text")));
    }

    [Theory]
    [InlineData(true)]
    [InlineData(false)]
    public async Task ConnectionFailureExportsOnlySafeConnectionSignalWithoutClaimingCommandExecution(bool authenticationFailure)
    {
        await using NpgsqlDataSource fixture = await postgres.CreateDatabaseAsync();
        using var capture = new DatabaseTelemetryCapture();
        using WebApplicationFactory<Inventory.Program> host = capture.App<Inventory.Program>("inventory", postgres.ConnectionStringFor(fixture));
        _ = host.CreateClient();
        var settings = new NpgsqlConnectionStringBuilder(postgres.ConnectionStringFor(fixture)) { Password = "private-connect-password-71ea" };
        if (!authenticationFailure)
        {
            settings.Port = 1;
        }

        await using NpgsqlDataSource failed = DatabaseTracing.Create(settings.ConnectionString, "private-source-name-82fb");
        _ = await Assert.ThrowsAnyAsync<NpgsqlException>(async () => await failed.OpenConnectionAsync(TestContext.Current.CancellationToken));
        await host.DisposeAsync();
        DatabaseSpan connection = Assert.Single(capture.Spans.Values, span => span.Source == "Npgsql");
        Assert.Equal("postgresql.connect", connection.Name);
        Assert.Equal("unknown", connection.Tags["db.namespace"]);
        Assert.Equal(ActivityStatusCode.Error, connection.Status);
        Assert.Equal(authenticationFailure ? "28P01" : "database_error", connection.Tags["error.type"]);
        Assert.All(capture.AllFields, field =>
        {
            Assert.DoesNotContain("private-connect-password-71ea", field, StringComparison.Ordinal);
            Assert.DoesNotContain("private-source-name-82fb", field, StringComparison.Ordinal);
            Assert.DoesNotContain(settings.Database!, field, StringComparison.Ordinal);
        });
    }
}
