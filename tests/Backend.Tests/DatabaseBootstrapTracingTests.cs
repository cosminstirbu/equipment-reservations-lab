using System.Collections.Concurrent;
using System.Diagnostics;
using System.Net;
using System.Text;
using DatabaseBootstrap;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Hosting.Server;
using Microsoft.AspNetCore.Hosting.Server.Features;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using Npgsql;
using Persistence;
using Xunit;

namespace Backend.Tests;

[Collection("PostgreSQL")]
public sealed class DatabaseBootstrapTracingTests(PostgresFixture postgres)
{
    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task BootstrapProcessExportsBeforeExitOnSuccessAndFailure(bool fail)
    {
        await using BootstrapDatabase isolated = await BootstrapDatabase.CreateAsync();
        await using NpgsqlDataSource fixture = await isolated.Fixture.CreateDatabaseAsync();
        string admin = new NpgsqlConnectionStringBuilder(isolated.Fixture.ConnectionStringFor(fixture)) { Database = "postgres" }.ConnectionString;
        if (fail)
        {
            admin = new NpgsqlConnectionStringBuilder(admin) { Password = "private-bootstrap-auth-failure" }.ConnectionString;
        }

        WebApplicationBuilder builder = WebApplication.CreateSlimBuilder();
        _ = builder.WebHost.ConfigureKestrel(options => options.Listen(IPAddress.Loopback, 0));
        await using WebApplication collector = builder.Build();
        var traces = new ConcurrentQueue<byte[]>();
        var logs = new ConcurrentQueue<byte[]>();
        _ = collector.MapPost("/v1/{signal}", async (string signal, Microsoft.AspNetCore.Http.HttpRequest request) =>
        {
            using var bytes = new MemoryStream();
            await request.Body.CopyToAsync(bytes);
            if (signal == "traces")
            {
                traces.Enqueue(bytes.ToArray());
            }
            else if (signal == "logs")
            {
                logs.Enqueue(bytes.ToArray());
            }

            return Microsoft.AspNetCore.Http.Results.Ok();
        });
        await collector.StartAsync();
        string endpoint = Assert.Single(collector.Services.GetRequiredService<IServer>().Features.Get<IServerAddressesFeature>()!.Addresses);
        var start = new ProcessStartInfo("dotnet")
        {
            RedirectStandardOutput = true,
            RedirectStandardError = true
        };
        start.ArgumentList.Add(typeof(DatabaseProvisioner).Assembly.Location);
        start.Environment["ConnectionStrings__postgres"] = admin;
        start.Environment["InventoryPassword"] = "private-bootstrap-role-password";
        start.Environment["ReservationsPassword"] = "private-bootstrap-role-password";
        start.Environment["NotificationsPassword"] = "private-bootstrap-role-password";
        start.Environment["OTEL_EXPORTER_OTLP_ENDPOINT"] = endpoint;
        start.Environment["OTEL_EXPORTER_OTLP_PROTOCOL"] = "http/protobuf";
        start.Environment["OTEL_DOTNET_EXPERIMENTAL_OTLP_EMIT_EVENT_LOG_ATTRIBUTES"] = "true";
        using Process process = Process.Start(start)!;
        Task<string> stdout = process.StandardOutput.ReadToEndAsync();
        Task<string> stderr = process.StandardError.ReadToEndAsync();
        await process.WaitForExitAsync().WaitAsync(TimeSpan.FromSeconds(30));
        Assert.Equal(fail ? 1 : 0, process.ExitCode);
        Assert.DoesNotContain("private-bootstrap", await stdout + await stderr, StringComparison.Ordinal);
        Assert.Contains(traces, bytes => Encoding.UTF8.GetString(bytes).Contains("database.bootstrap", StringComparison.Ordinal));
        Assert.All(traces.Concat(logs), bytes => Assert.DoesNotContain("private-bootstrap", Encoding.UTF8.GetString(bytes), StringComparison.Ordinal));
        OtlpMessage workflow = Assert.Single(OtlpMessage.Records(traces), span => span.Text(5) == "database.bootstrap");
        ulong eventId = fail ? 2UL : 1UL;
        OtlpMessage outcome = Assert.Single(OtlpMessage.Records(logs), log => log.Children(6)
            .Any(attribute => attribute.Text(1) == "logrecord.event.id" && attribute.Children(2).Single().Integer(3) == eventId));
        Assert.Contains(workflow.Bytes(1), value => value != 0);
        Assert.Contains(workflow.Bytes(2), value => value != 0);
        Assert.Equal(workflow.Bytes(1), outcome.Bytes(9));
        Assert.Equal(workflow.Bytes(2), outcome.Bytes(10));
        await collector.StopAsync();
    }

    [Theory]
    [InlineData(true)]
    [InlineData(false)]
    public async Task FullProvisioningAndRepeatedMigrationsExportAdminAndReviewedServiceOperationsWithoutSecrets(bool captureSql)
    {
        await using BootstrapDatabase isolated = await BootstrapDatabase.CreateAsync();
        await using NpgsqlDataSource fixture = await isolated.Fixture.CreateDatabaseAsync();
        string admin = new NpgsqlConnectionStringBuilder(isolated.Fixture.ConnectionStringFor(fixture)) { Database = "postgres" }.ConnectionString;
        string password = "private-provisioning-" + Guid.NewGuid().ToString("N");
        var passwords = new Dictionary<string, string> { ["inventory"] = password, ["reservations"] = password, ["notifications"] = password };
        using var capture = new DatabaseTelemetryCapture();
        using WebApplicationFactory<Inventory.Program> host = capture.App<Inventory.Program>("inventory", postgres.ConnectionStringFor(fixture));
        _ = host.CreateClient();
        await DatabaseProvisioner.ReconcileAsync(admin, passwords, captureSql);
        await DatabaseProvisioner.ReconcileAsync(admin, passwords, captureSql);
        await host.DisposeAsync();

        foreach (string database in new[] { "inventory", "reservations", "notifications" })
        {
            DatabaseSpan[] owned = [.. capture.Spans.Values.Where(span => Equals(span.Tags.GetValueOrDefault("db.namespace"), database))];
            Assert.Contains(owned, span => Equals(span.Tags.GetValueOrDefault("db.operation.name"), "migration.apply"));
            foreach (string operation in new[] { "migration.lock", "migration.ledger", "migration.lookup", "migration.record", "migration.unlock" })
            {
                Assert.Contains(owned, span => Equals(span.Tags.GetValueOrDefault("db.operation.name"), operation));
            }
            if (captureSql)
            {
                Assert.Contains(owned, span => span.Tags.TryGetValue("db.query.text", out object? sql) && sql is string text && text.Contains("CREATE TABLE", StringComparison.Ordinal));
            }
            else
            {
                Assert.All(owned, span => Assert.False(span.Tags.ContainsKey("db.query.text")));
            }
        }

        DatabaseSpan[] administrative = [.. capture.Spans.Values.Where(span => span.Name == "postgresql.command")];
        Assert.NotEmpty(administrative);
        Assert.All(administrative, span => Assert.False(span.Tags.ContainsKey("db.query.text")));
        Assert.All(capture.AllFields, field => Assert.DoesNotContain(password, field, StringComparison.Ordinal));
    }

    [Fact]
    public async Task ArbitraryMigrationContentNeverBecomesApprovedSql()
    {
        await using NpgsqlDataSource fixture = await postgres.CreateDatabaseAsync();
        using var capture = new DatabaseTelemetryCapture();
        using WebApplicationFactory<Inventory.Program> host = capture.App<Inventory.Program>("inventory", postgres.ConnectionStringFor(fixture));
        _ = host.CreateClient();
        await SqlMigrations.ApplyAsync(host.Services.GetRequiredService<NpgsqlDataSource>(), [new SqlMigration(1, "SELECT 'private-migration-94de6'")]);
        await host.DisposeAsync();
        Assert.Contains(capture.Spans.Values, span => span.Source == "Npgsql");
        Assert.All(capture.AllFields, field => Assert.DoesNotContain("private-migration-94de6", field, StringComparison.Ordinal));
    }

    [Fact]
    public async Task ChangedMigrationDigestDoesNotAdmitResourceText()
    {
        await using NpgsqlDataSource fixture = await postgres.CreateDatabaseAsync();
        using var capture = new DatabaseTelemetryCapture();
        using WebApplicationFactory<Inventory.Program> host = capture.App<Inventory.Program>("inventory", postgres.ConnectionStringFor(fixture));
        _ = host.CreateClient();
        await SqlMigrations.ApplyEmbeddedAsync(host.Services.GetRequiredService<NpgsqlDataSource>(), typeof(Inventory.ServiceMigrations).Assembly,
            new Dictionary<string, string> { ["Inventory.Migrations.001_initial.sql"] = new string('0', 64) });
        await host.DisposeAsync();
        DatabaseSpan script = Assert.Single(capture.Spans.Values, span => span.Name == "postgresql.command");
        Assert.False(script.Tags.ContainsKey("db.query.text"));
        Assert.Contains(capture.Spans.Values, span => Equals(span.Tags.GetValueOrDefault("db.operation.name"), "migration.record"));
    }

    private sealed class BootstrapDatabase : IAsyncDisposable
    {
        public PostgresFixture Fixture { get; } = new();

        public static async Task<BootstrapDatabase> CreateAsync()
        {
            var database = new BootstrapDatabase();
            await database.Fixture.InitializeAsync();
            return database;
        }

        public ValueTask DisposeAsync()
        {
            return new ValueTask(Fixture.DisposeAsync());
        }
    }
}
