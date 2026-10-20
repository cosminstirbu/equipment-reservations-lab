using System.Collections.Concurrent;
using System.Diagnostics;
using System.Net;
using System.Text;
using System.Text.Json;
using DotNet.Testcontainers.Builders;
using DotNet.Testcontainers.Configurations;
using DotNet.Testcontainers.Containers;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Hosting.Server;
using Microsoft.AspNetCore.Hosting.Server.Features;
using Microsoft.Extensions.DependencyInjection;
using RabbitMQ.Client;
using ReservationMessaging;
using Xunit;

namespace BrokerBootstrap.Tests;

public sealed class BrokerExecutableTests
{
    private const string ExportKey = "private-collector-otlp-key-012";
    [Fact]
    public async Task RepeatedExecutionReusesIdenticalPrivateDefinitionsWithoutMutationOrDisclosure()
    {
        string directory = Path.Combine(Path.GetTempPath(), "broker-cli-" + Guid.NewGuid().ToString("N"));
        _ = Directory.CreateDirectory(directory);
        string output = Path.Combine(directory, "definitions.json");
        try
        {
            (int code, string diagnostics) = await RunAsync(output);
            Assert.Equal(0, code);
            Assert.DoesNotContain("private-broker", diagnostics, StringComparison.Ordinal);
            Assert.DoesNotContain("password_hash", diagnostics, StringComparison.Ordinal);
            using var document = JsonDocument.Parse(await File.ReadAllTextAsync(output, TestContext.Current.CancellationToken));
            Assert.Equal(3, document.RootElement.GetProperty("users").GetArrayLength());
            Assert.Contains(document.RootElement.GetProperty("users").EnumerateArray(), user => user.GetProperty("name").GetString() == "reservations-publisher");
            if (!OperatingSystem.IsWindows())
            {
                Assert.Equal(UnixFileMode.UserRead | UnixFileMode.UserWrite, File.GetUnixFileMode(output));
            }

            string before = await File.ReadAllTextAsync(output, TestContext.Current.CancellationToken);
            DateTime written = File.GetLastWriteTimeUtc(output);
            (int repeatCode, string repeatDiagnostics) = await RunAsync(output);
            Assert.Equal(0, repeatCode);
            Assert.Equal(before, await File.ReadAllTextAsync(output, TestContext.Current.CancellationToken));
            Assert.Equal(written, File.GetLastWriteTimeUtc(output));
            Assert.DoesNotContain("private-broker", repeatDiagnostics, StringComparison.Ordinal);
        }
        finally
        {
            Directory.Delete(directory, recursive: true);
        }
    }

    [Theory]
    [InlineData("changed")]
    [InlineData("truncated")]
    [InlineData("permissions")]
    [InlineData("unreadable")]
    [InlineData("special-bits")]
    [InlineData("hardlink")]
    [InlineData("fifo")]
    [InlineData("symlink")]
    [InlineData("directory")]
    public async Task UnsafeExistingDefinitionsAreRefusedWithoutMutationOrDisclosure(string fault)
    {
        if (OperatingSystem.IsWindows())
        {
            throw new PlatformNotSupportedException("This deployment requires Unix file protection.");
        }

        string directory = Path.Combine(Path.GetTempPath(), "broker-unsafe-" + Guid.NewGuid().ToString("N"));
        _ = Directory.CreateDirectory(directory);
        string output = Path.Combine(directory, "definitions.json");
        string target = Path.Combine(directory, "original.json");
        try
        {
            Assert.Equal(0, (await RunAsync(output)).Code);
            if (fault == "changed")
            {
                string contents = await File.ReadAllTextAsync(output, TestContext.Current.CancellationToken);
                await File.WriteAllTextAsync(output, contents.Replace("reservations-publisher", "unexpected-publisher", StringComparison.Ordinal), TestContext.Current.CancellationToken);
            }
            else if (fault == "truncated")
            {
                await File.WriteAllTextAsync(output, "{", TestContext.Current.CancellationToken);
            }
            else if (fault == "permissions")
            {
                File.SetUnixFileMode(output, UnixFileMode.UserRead | UnixFileMode.UserWrite | UnixFileMode.GroupRead);
            }
            else if (fault == "unreadable")
            {
                File.SetUnixFileMode(output, UnixFileMode.None);
            }
            else if (fault == "special-bits")
            {
                File.SetUnixFileMode(output, UnixFileMode.UserRead | UnixFileMode.UserWrite | UnixFileMode.SetUser);
            }
            else if (fault == "hardlink")
            {
                var start = new ProcessStartInfo("ln");
                start.ArgumentList.Add(output);
                start.ArgumentList.Add(target);
                using Process link = Process.Start(start)!;
                await link.WaitForExitAsync(TestContext.Current.CancellationToken);
                Assert.Equal(0, link.ExitCode);
            }
            else if (fault == "fifo")
            {
                File.Delete(output);
                var start = new ProcessStartInfo("mkfifo");
                start.ArgumentList.Add(output);
                using Process fifo = Process.Start(start)!;
                await fifo.WaitForExitAsync(TestContext.Current.CancellationToken);
                Assert.Equal(0, fifo.ExitCode);
                File.SetUnixFileMode(output, UnixFileMode.UserRead | UnixFileMode.UserWrite);
            }
            else if (fault == "symlink")
            {
                File.Move(output, target);
                _ = File.CreateSymbolicLink(output, target);
            }
            else if (fault == "directory")
            {
                File.Delete(output);
                _ = Directory.CreateDirectory(output);
            }

            byte[]? original = fault is "unreadable" or "directory" or "fifo" ? null : await File.ReadAllBytesAsync(output, TestContext.Current.CancellationToken);
            DateTime written = File.GetLastWriteTimeUtc(output);
            FileAttributes attributes = File.GetAttributes(output);
            UnixFileMode mode = File.GetUnixFileMode(output);
            (int code, string diagnostics) = await RunAsync(output);
            Assert.Equal(1, code);
            Assert.Equal(attributes, File.GetAttributes(output));
            Assert.Equal(mode, File.GetUnixFileMode(output));
            Assert.Equal(written, File.GetLastWriteTimeUtc(output));
            Assert.Equal(fault == "symlink" ? target : null, new FileInfo(output).LinkTarget);
            if (original is not null)
            {
                Assert.Equal(original, await File.ReadAllBytesAsync(output, TestContext.Current.CancellationToken));
            }

            Assert.DoesNotContain("private-broker", diagnostics, StringComparison.Ordinal);
            Assert.DoesNotContain("password_hash", diagnostics, StringComparison.Ordinal);
            Assert.DoesNotContain(output, diagnostics, StringComparison.Ordinal);
            Assert.DoesNotContain(Directory.GetFiles(directory), path => Path.GetFileName(path).StartsWith(".definitions-", StringComparison.Ordinal));
        }
        finally
        {
            if (fault == "unreadable")
            {
                File.SetUnixFileMode(output, UnixFileMode.UserRead | UnixFileMode.UserWrite);
            }

            Directory.Delete(directory, recursive: true);
        }
    }

    [Fact]
    public async Task CliProducedPrivateDefinitionsImportUnderActualNonrootRabbitMqUser()
    {
        string directory = Path.Combine(Path.GetTempPath(), "broker-import-" + Guid.NewGuid().ToString("N"));
        _ = Directory.CreateDirectory(directory);
        string output = Path.Combine(directory, "definitions.json");
        try
        {
            (int code, _) = await RunAsync(output);
            Assert.Equal(0, code);
            using var deadline = new CancellationTokenSource(TimeSpan.FromSeconds(60));
            await using IContainer broker = new ContainerBuilder("rabbitmq:4.3.6-management")
                .WithCreateParameterModifier(parameters => parameters.User = "999:999")
                .WithEnvironment("RABBITMQ_DEFAULT_USER", "bootstrap-admin")
                .WithEnvironment("RABBITMQ_DEFAULT_PASS", "private-broker-admin-password")
                .WithResourceMapping(await File.ReadAllBytesAsync(output, deadline.Token), "/etc/rabbitmq/equipment-definitions.json", 999, 999, UnixFileModes.UserRead | UnixFileModes.UserWrite)
                .WithResourceMapping(Encoding.UTF8.GetBytes(BrokerProvisioning.Configuration), "/etc/rabbitmq/conf.d/20-equipment.conf", 999, 999, UnixFileModes.UserRead | UnixFileModes.UserWrite)
                .WithPortBinding(5672, true)
                .WithWaitStrategy(Wait.ForUnixContainer().UntilInternalTcpPortIsAvailable(5672))
                .Build();
            await broker.StartAsync(deadline.Token);
            Assert.Equal("999", (await broker.ExecAsync(["id", "-u"], deadline.Token)).Stdout.Trim());
            var publisher = new ConnectionFactory
            {
                HostName = broker.Hostname,
                Port = broker.GetMappedPublicPort(5672),
                VirtualHost = "equipment",
                UserName = "reservations-publisher",
                Password = "private-broker-publisher-password"
            };
            await using IConnection sender = await publisher.CreateConnectionAsync(deadline.Token);
            await using IChannel outgoing = await sender.CreateChannelAsync(new CreateChannelOptions(true, true), deadline.Token);
            byte[] body = "cli-import-contract"u8.ToArray();
            await outgoing.BasicPublishAsync(ReservationTopology.Exchange, ReservationTopology.Confirmed, true, new BasicProperties { Persistent = true }, body, deadline.Token);
            var consumer = new ConnectionFactory
            {
                HostName = broker.Hostname,
                Port = broker.GetMappedPublicPort(5672),
                VirtualHost = "equipment",
                UserName = "notifications-consumer",
                Password = "private-broker-consumer-password"
            };
            await using IConnection receiver = await consumer.CreateConnectionAsync(deadline.Token);
            await using IChannel incoming = await receiver.CreateChannelAsync(cancellationToken: deadline.Token);
            BasicGetResult? delivered = await incoming.BasicGetAsync(ReservationTopology.Queue, true, deadline.Token);
            Assert.NotNull(delivered);
            Assert.Equal(body, delivered.Body.ToArray());
        }
        finally
        {
            Directory.Delete(directory, recursive: true);
        }
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task CliExportsCorrelatedPrivateWorkflowBeforeExitForSuccessAndFilesystemFailure(bool fail)
    {
        string directory = Path.Combine(Path.GetTempPath(), "broker-telemetry-" + Guid.NewGuid().ToString("N"));
        _ = Directory.CreateDirectory(directory);
        string output = Path.Combine(directory, fail ? "missing/definitions.json" : "definitions.json");
        WebApplicationBuilder builder = WebApplication.CreateSlimBuilder();
        _ = builder.WebHost.ConfigureKestrel(options => options.Listen(IPAddress.Loopback, 0));
        await using WebApplication collector = builder.Build();
        var traces = new ConcurrentQueue<byte[]>();
        var logs = new ConcurrentQueue<byte[]>();
        var metrics = new ConcurrentQueue<byte[]>();
        _ = collector.MapPost("/v1/{signal}", async (string signal, Microsoft.AspNetCore.Http.HttpRequest request) =>
        {
            if (request.Headers["x-otlp-api-key"] != ExportKey)
            {
                return Microsoft.AspNetCore.Http.Results.Unauthorized();
            }

            using var bytes = new MemoryStream();
            await request.Body.CopyToAsync(bytes, request.HttpContext.RequestAborted);
            switch (signal)
            {
                case "traces":
                    traces.Enqueue(bytes.ToArray());
                    break;
                case "logs":
                    logs.Enqueue(bytes.ToArray());
                    break;
                case "metrics":
                    metrics.Enqueue(bytes.ToArray());
                    break;
                default:
                    return Microsoft.AspNetCore.Http.Results.NotFound();
            }

            return Microsoft.AspNetCore.Http.Results.Ok();
        });
        await collector.StartAsync(TestContext.Current.CancellationToken);
        string endpoint = Assert.Single(collector.Services.GetRequiredService<IServer>().Features.Get<IServerAddressesFeature>()!.Addresses);
        try
        {
            (int code, string diagnostics) = await RunAsync(output, collectorEndpoint: endpoint, collectorKey: ExportKey);
            Assert.Equal(fail ? 1 : 0, code);
            Assert.DoesNotContain("private-broker", diagnostics, StringComparison.Ordinal);
            OtlpMessage workflow = Assert.Single(OtlpMessage.Records(traces), span => span.Text(5) == "broker.definitions.prepare");
            Assert.Equal(fail ? 2UL : 1UL, Assert.Single(workflow.Children(15)).Integer(3));
            OtlpMessage outcome = Assert.Single(OtlpMessage.Records(logs), log => log.Children(6).Any(attribute =>
                attribute.Text(1) == "logrecord.event.id" && Assert.Single(attribute.Children(2)).Integer(3) == (fail ? 6302UL : 6301UL)));
            Assert.Equal(workflow.Bytes(1), outcome.Bytes(9));
            Assert.Equal(workflow.Bytes(2), outcome.Bytes(10));
            Assert.Contains(workflow.Bytes(1), value => value != 0);
            Assert.Contains(OtlpMessage.Records(metrics), metric => metric.Text(1) == "broker.definitions.preparation");
            foreach (byte[] payload in traces.Concat(logs).Concat(metrics))
            {
                string wire = Encoding.UTF8.GetString(payload);
                Assert.DoesNotContain("private-broker", wire, StringComparison.Ordinal);
                Assert.DoesNotContain("password_hash", wire, StringComparison.Ordinal);
                Assert.DoesNotContain(output, wire, StringComparison.Ordinal);
                Assert.DoesNotContain(ExportKey, wire, StringComparison.Ordinal);
            }
        }
        finally
        {
            await collector.StopAsync(TestContext.Current.CancellationToken);
            Directory.Delete(directory, recursive: true);
        }
    }

    [Theory]
    [InlineData(null)]
    [InlineData("private-wrong-collector-key")]
    public async Task CollectorRejectsMissingOrWrongOtlpAuthorityWithoutReceivingTelemetry(string? key)
    {
        string directory = Path.Combine(Path.GetTempPath(), "broker-unauthorized-" + Guid.NewGuid().ToString("N"));
        _ = Directory.CreateDirectory(directory);
        string output = Path.Combine(directory, "definitions.json");
        WebApplicationBuilder builder = WebApplication.CreateSlimBuilder();
        _ = builder.WebHost.ConfigureKestrel(options => options.Listen(IPAddress.Loopback, 0));
        await using WebApplication collector = builder.Build();
        int rejected = 0;
        int received = 0;
        _ = collector.MapPost("/v1/{signal}", (Microsoft.AspNetCore.Http.HttpRequest request) =>
        {
            if (request.Headers["x-otlp-api-key"] != ExportKey)
            {
                _ = Interlocked.Increment(ref rejected);
                return Microsoft.AspNetCore.Http.Results.Unauthorized();
            }

            _ = Interlocked.Increment(ref received);
            return Microsoft.AspNetCore.Http.Results.Ok();
        });
        await collector.StartAsync(TestContext.Current.CancellationToken);
        string endpoint = Assert.Single(collector.Services.GetRequiredService<IServer>().Features.Get<IServerAddressesFeature>()!.Addresses);
        try
        {
            (int code, string diagnostics) = await RunAsync(output, collectorEndpoint: endpoint, collectorKey: key);
            Assert.Equal(0, code);
            Assert.True(rejected > 0);
            Assert.Equal(0, received);
            Assert.DoesNotContain("private-collector", diagnostics, StringComparison.Ordinal);
            Assert.DoesNotContain("private-wrong", diagnostics, StringComparison.Ordinal);
            Assert.DoesNotContain("private-broker", diagnostics, StringComparison.Ordinal);
        }
        finally
        {
            await collector.StopAsync(TestContext.Current.CancellationToken);
            Directory.Delete(directory, recursive: true);
        }
    }

    [Fact]
    public async Task InvalidConfigurationFailsWithoutCreatingOutputOrPrintingSecrets()
    {
        string output = Path.Combine(Path.GetTempPath(), "broker-cli-" + Guid.NewGuid().ToString("N") + ".json");
        (int code, string diagnostics) = await RunAsync(output, invalid: true);
        Assert.Equal(1, code);
        Assert.False(File.Exists(output));
        Assert.DoesNotContain("private-broker", diagnostics, StringComparison.Ordinal);
        Assert.DoesNotContain("password_hash", diagnostics, StringComparison.Ordinal);
    }

    private static async Task<(int Code, string Diagnostics)> RunAsync(string output, bool invalid = false, string? collectorEndpoint = null, string? collectorKey = null)
    {
        var start = new ProcessStartInfo("dotnet") { RedirectStandardOutput = true, RedirectStandardError = true };
        start.ArgumentList.Add(typeof(BrokerProvisioning).Assembly.Location);
        start.ArgumentList.Add("--output");
        start.ArgumentList.Add(output);
        start.Environment["BrokerAdministrator"] = "bootstrap-admin";
        start.Environment["BrokerPassword"] = "private-broker-admin-password";
        start.Environment["BrokerAdministratorSalt"] = new string('a', 32);
        start.Environment["PublisherPassword"] = invalid ? "" : "private-broker-publisher-password";
        start.Environment["PublisherSalt"] = new string('p', 32);
        start.Environment["ConsumerPassword"] = "private-broker-consumer-password";
        start.Environment["ConsumerSalt"] = new string('c', 32);
        if (collectorEndpoint is not null)
        {
            _ = start.Environment.Remove("OTEL_EXPORTER_OTLP_HEADERS");
            _ = start.Environment.Remove("OTEL_EXPORTER_OTLP_TRACES_HEADERS");
            _ = start.Environment.Remove("OTEL_EXPORTER_OTLP_LOGS_HEADERS");
            _ = start.Environment.Remove("OTEL_EXPORTER_OTLP_METRICS_HEADERS");
            if (collectorKey is not null)
            {
                start.Environment["OTEL_EXPORTER_OTLP_HEADERS"] = "x-otlp-api-key=" + collectorKey;
            }

            start.Environment["OTEL_EXPORTER_OTLP_ENDPOINT"] = collectorEndpoint;
            start.Environment["OTEL_EXPORTER_OTLP_PROTOCOL"] = "http/protobuf";
            start.Environment["OTEL_DOTNET_EXPERIMENTAL_OTLP_EMIT_EVENT_LOG_ATTRIBUTES"] = "true";
        }

        using Process process = Process.Start(start)!;
        Task<string> stdout = process.StandardOutput.ReadToEndAsync(TestContext.Current.CancellationToken);
        Task<string> stderr = process.StandardError.ReadToEndAsync(TestContext.Current.CancellationToken);
        try
        {
            await process.WaitForExitAsync(TestContext.Current.CancellationToken).WaitAsync(TimeSpan.FromSeconds(30), TestContext.Current.CancellationToken);
        }
        catch (Exception exception) when (exception is TimeoutException or OperationCanceledException)
        {
            if (!process.HasExited)
            {
                process.Kill(entireProcessTree: true);
                await process.WaitForExitAsync(CancellationToken.None).WaitAsync(TimeSpan.FromSeconds(5), CancellationToken.None);
            }

            throw;
        }

        return (process.ExitCode, await stdout + await stderr);
    }
}
