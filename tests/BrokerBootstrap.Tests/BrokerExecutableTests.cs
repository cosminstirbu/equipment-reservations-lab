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
    private const string UnixOnlyReason = "Broker private-file ownership and Unix modes require Linux or macOS; Linux CI retains this contract.";

    [Fact]
    public async Task RepeatedExecutionReusesIdenticalPrivateDefinitionsWithoutMutationOrDisclosure()
    {
        Assert.SkipWhen(OperatingSystem.IsWindows(), UnixOnlyReason);

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
            Assert.Skip(UnixOnlyReason);
            return;
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
        Assert.SkipWhen(OperatingSystem.IsWindows(), UnixOnlyReason);

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
            await using IConnection sender = await BrokerReadiness.ConnectAsync(publisher.CreateConnectionAsync, deadline.Token);
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
        Assert.SkipWhen(OperatingSystem.IsWindows() && !fail, UnixOnlyReason);

        string directory = Path.Combine(Path.GetTempPath(), "broker-telemetry-" + Guid.NewGuid().ToString("N"));
        _ = Directory.CreateDirectory(directory);
        string output = Path.Combine(directory, fail ? "missing/definitions.json" : "definitions.json");
        WebApplicationBuilder builder = WebApplication.CreateSlimBuilder();
        _ = builder.WebHost.ConfigureKestrel(options => options.Listen(IPAddress.Loopback, 0));
        await using WebApplication collector = builder.Build();
        var traces = new ConcurrentQueue<byte[]>();
        var logs = new ConcurrentQueue<byte[]>();
        var metrics = new ConcurrentQueue<byte[]>();
        var receipts = new ConcurrentQueue<(string Signal, int Status)>();
        var timeline = Stopwatch.StartNew();
        long childExitAt = -1;
        var events = new ConcurrentQueue<(string Signal, string Phase, long AtMs, long Bytes, int Status, bool Aborted)>();
        _ = collector.MapPost("/v1/{signal}", async (string signal, Microsoft.AspNetCore.Http.HttpRequest request) =>
        {
            string receiptSignal = signal is "traces" or "logs" or "metrics" ? signal : "unknown";
            receipts.Enqueue((receiptSignal, 0));
            events.Enqueue((receiptSignal, "request_started", timeline.ElapsedMilliseconds, request.ContentLength ?? -1, 0, request.HttpContext.RequestAborted.IsCancellationRequested));
            using CancellationTokenRegistration aborted = request.HttpContext.RequestAborted.Register(() =>
                events.Enqueue((receiptSignal, "request_aborted", timeline.ElapsedMilliseconds, -1, 0, true)));
            request.HttpContext.Response.OnCompleted(() =>
            {
                receipts.Enqueue((receiptSignal, request.HttpContext.Response.StatusCode));
                events.Enqueue((receiptSignal, "response_completed", timeline.ElapsedMilliseconds, -1, request.HttpContext.Response.StatusCode, request.HttpContext.RequestAborted.IsCancellationRequested));
                return Task.CompletedTask;
            });

            if (request.Headers["x-otlp-api-key"] != ExportKey)
            {
                return Microsoft.AspNetCore.Http.Results.Unauthorized();
            }

            using var bytes = new MemoryStream();
            try
            {
                await request.Body.CopyToAsync(bytes, request.HttpContext.RequestAborted);
            }
            catch (Exception exception)
            {
                string phase = exception switch
                {
                    OperationCanceledException => "body_cancelled",
                    IOException => "body_io_error",
                    _ => "body_error"
                };
                events.Enqueue((receiptSignal, phase, timeline.ElapsedMilliseconds, bytes.Length, 0, request.HttpContext.RequestAborted.IsCancellationRequested));
                throw;
            }

            events.Enqueue((receiptSignal, "body_complete", timeline.ElapsedMilliseconds, bytes.Length, 0, request.HttpContext.RequestAborted.IsCancellationRequested));
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
            var execution = Stopwatch.StartNew();
            (int code, string diagnostics) = await RunAsync(output, collectorEndpoint: endpoint, collectorKey: ExportKey,
                onExited: () => Interlocked.Exchange(ref childExitAt, timeline.ElapsedMilliseconds));
            TestContext.Current.TestOutputHelper?.WriteLine($"broker_cli case={(fail ? "filesystem_failure" : "success")} exit={code} elapsed_ms={execution.ElapsedMilliseconds}");
            TestContext.Current.TestOutputHelper?.WriteLine($"broker_timeline child_observed_exit_ms={Interlocked.Read(ref childExitAt)} snapshot_ms={timeline.ElapsedMilliseconds}");
            foreach ((string signal, string phase, long atMs, long bodyBytes, int status, bool aborted) in events)
            {
                TestContext.Current.TestOutputHelper?.WriteLine($"broker_request signal={signal} phase={phase} elapsed_ms={atMs} bytes={bodyBytes} status={status} aborted={aborted}");
            }

            foreach ((string signal, ConcurrentQueue<byte[]> payloads) in new[] { ("traces", traces), ("logs", logs), ("metrics", metrics) })
            {
                int records = -1;
                int workflows = -1;
                try
                {
                    OtlpMessage[] decoded = [.. OtlpMessage.Records(payloads)];
                    records = decoded.Length;
                    if (signal == "traces")
                    {
                        workflows = decoded.Count(span => span.Text(5) == "broker.definitions.prepare");
                    }
                }
                catch
                {
                    // Diagnostic decoding must not replace the original wire assertions.
                }

                int[] statuses = [.. receipts.Where(receipt => receipt.Signal == signal).Select(receipt => receipt.Status)];
                TestContext.Current.TestOutputHelper?.WriteLine($"broker_collector signal={signal} received={statuses.Count(status => status == 0)} completed_200={statuses.Count(status => status == 200)} completed_401={statuses.Count(status => status == 401)} completed_404={statuses.Count(status => status == 404)} completed_other={statuses.Count(status => status is not (0 or 200 or 401 or 404))} payloads={payloads.Count} records={records} matching_workflows={workflows}");
            }

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
        Assert.SkipWhen(OperatingSystem.IsWindows(), UnixOnlyReason);

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

    private static async Task<(int Code, string Diagnostics)> RunAsync(string output, bool invalid = false, string? collectorEndpoint = null, string? collectorKey = null, Action? onExited = null)
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

        using var process = new Process { StartInfo = start, EnableRaisingEvents = onExited is not null };
        if (onExited is not null)
        {
            process.Exited += (_, _) => onExited();
        }

        _ = process.Start();
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
