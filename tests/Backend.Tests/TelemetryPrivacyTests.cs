using System.Collections.Concurrent;
using System.Diagnostics;
using System.Net;
using System.Net.Http.Json;
using System.Text;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Hosting.Server;
using Microsoft.AspNetCore.Hosting.Server.Features;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using OpenTelemetry;
using OpenTelemetry.Logs;
using OpenTelemetry.Trace;
using Xunit;

namespace Backend.Tests;

[Collection("PostgreSQL")]
public sealed class TelemetryPrivacyTests(PostgresFixture postgres)
{
    private const string QueryProbe = "harmless-query-probe-5179";
    private const string HeaderProbe = "harmless-header-probe-6280";
    private const string BodyProbe = "harmless-body-probe-7391";
    private const string UserAgentProbe = "harmless-user-agent-probe-8402";
    private static readonly string[] Probes = [QueryProbe, HeaderProbe, BodyProbe, UserAgentProbe];

    [Fact]
    public async Task ExportedAndConsoleLogsOmitUrlsScopesAndHostPathsWhileRetainingCorrelatedOutcomes()
    {
        using var flags = new DevelopmentRedactionFlags();
        bool unavailable = false;
        await using BookingScenario scenario = await BookingScenario.CreateAsync(postgres, new InventoryBoundary
        {
            BeforeReply = token => unavailable ? throw new HttpRequestException(HeaderProbe) : Task.CompletedTask
        });
        using var logs = new ExportedLogs();
        using var console = new ConsoleCapture();
        using WebApplicationFactory<Reservations.Program> host = Capture(scenario, logs, console);
        using HttpClient client = host.CreateClient();
        client.DefaultRequestHeaders.Add("X-Telemetry-Probe", HeaderProbe);
        client.DefaultRequestHeaders.Add("User-Agent", UserAgentProbe);
        Assert.Equal(HttpStatusCode.Created, (await BookAsync(client)).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await BookAsync(client)).StatusCode);
        unavailable = true;
        Assert.Equal(HttpStatusCode.ServiceUnavailable, (await BookAsync(client)).StatusCode);
        using var body = new StringContent("{\"equipmentId\":\"camera-001\",\"privacyBodyProbe\":\"" + BodyProbe + "\"}", Encoding.UTF8, "application/json");
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsync("/api/reservations?harmless_token=" + QueryProbe, body)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync("/privacy-probe/" + QueryProbe + "?harmless_token=" + QueryProbe)).StatusCode);

        LogSnapshot workflow = Assert.Single(logs.Values, value => value.Message == "Reservation book completed (created)");
        Assert.NotEqual(default, workflow.TraceId);
        Assert.NotEqual(default, workflow.SpanId);
        Assert.Contains(logs.Values, value => value.Message.Contains("booking_conflict", StringComparison.Ordinal));
        Assert.Contains(logs.Values, value => value.Message.Contains("inventory_unavailable", StringComparison.Ordinal));
        Assert.Contains(console.Values, value => value.Contains("Reservation book completed (created)", StringComparison.Ordinal));
        string root = host.Services.GetRequiredService<IHostEnvironment>().ContentRootPath;
        AssertPrivate(logs.Values.SelectMany(value => value.Values.Append(value.Message)), root);
        AssertPrivate(console.Values, root);
        AssertPrivate(logs.ResourceValues, root);
        Assert.All(logs.Values, value => Assert.False(value.HasException, "Export must not retain raw exception objects."));
        Assert.All(logs.Values, value => Assert.DoesNotContain(value.Values, attribute => attribute.StartsWith("RequestPath=", StringComparison.Ordinal)));
    }

    [Fact]
    public async Task IncomingHttpExportRedactsQueryDespiteDevelopmentFlagsAndRetainsRequestSemantics()
    {
        using var flags = new DevelopmentRedactionFlags();
        await using BookingScenario scenario = await BookingScenario.CreateAsync(postgres);
        using var spans = new ExportedActivities();
        using WebApplicationFactory<Reservations.Program> host = scenario.App.WithWebHostBuilder(builder => builder.ConfigureServices(services =>
            services.AddOpenTelemetry().WithTracing(tracing => tracing.AddProcessor(new SimpleActivityExportProcessor(spans)))));
        using HttpClient client = host.CreateClient();
        client.DefaultRequestHeaders.Add("X-Telemetry-Probe", HeaderProbe);
        client.DefaultRequestHeaders.Add("User-Agent", UserAgentProbe);
        Assert.Equal(HttpStatusCode.Created, (await BookAsync(client)).StatusCode);
        SpanSnapshot incoming = Assert.Single(spans.Values, value => value.Kind == ActivityKind.Server && value.Values.Contains("http.route=/api/reservations"));
        Assert.True(incoming.Duration > TimeSpan.Zero);
        Assert.Contains("http.request.method=POST", incoming.Values);
        Assert.Contains("http.response.status_code=201", incoming.Values);
        AssertPrivate(incoming.Values, host.Services.GetRequiredService<IHostEnvironment>().ContentRootPath, false);
    }

    [Fact]
    public async Task OutgoingHttpExportAndAllLogProvidersKeepProbeValuesPrivate()
    {
        using var flags = new DevelopmentRedactionFlags();
        WebApplicationBuilder serverBuilder = WebApplication.CreateSlimBuilder();
        _ = serverBuilder.Logging.ClearProviders();
        _ = serverBuilder.WebHost.ConfigureKestrel(options => options.Listen(IPAddress.Loopback, 0));
        await using WebApplication server = serverBuilder.Build();
        _ = server.MapPost("/probe", () => "OK");
        await server.StartAsync();
        string address = Assert.Single(server.Services.GetRequiredService<IServer>().Features.Get<IServerAddressesFeature>()!.Addresses);
        await using BookingScenario scenario = await BookingScenario.CreateAsync(postgres);
        using var logs = new ExportedLogs();
        using var console = new ConsoleCapture();
        using var spans = new ExportedActivities();
        using WebApplicationFactory<Reservations.Program> host = Capture(scenario, logs, console).WithWebHostBuilder(builder => builder.ConfigureServices(services =>
        {
            _ = services.AddHttpClient("privacy-probe");
            _ = services.AddOpenTelemetry().WithTracing(tracing => tracing.AddProcessor(new SimpleActivityExportProcessor(spans)));
        }));
        using HttpClient client = host.Services.GetRequiredService<IHttpClientFactory>().CreateClient("privacy-probe");
        using var request = new HttpRequestMessage(HttpMethod.Post, address + "/probe?harmless_token=" + QueryProbe)
        {
            Content = new StringContent(BodyProbe, Encoding.UTF8, "text/plain")
        };
        request.Headers.Add("X-Telemetry-Probe", HeaderProbe);
        request.Headers.Add("User-Agent", UserAgentProbe);
        using HttpResponseMessage response = await client.SendAsync(request);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        SpanSnapshot outgoing = Assert.Single(spans.Values, value => value.Kind == ActivityKind.Client);
        Assert.Contains("http.request.method=POST", outgoing.Values);
        Assert.Contains("http.response.status_code=200", outgoing.Values);
        Assert.True(outgoing.Duration > TimeSpan.Zero);
        string root = host.Services.GetRequiredService<IHostEnvironment>().ContentRootPath;
        AssertPrivate(outgoing.Values, root, false);
        AssertPrivate(logs.Values.SelectMany(value => value.Values.Append(value.Message)), root);
        AssertPrivate(console.Values, root);
        await server.StopAsync();
    }

    private static Task<HttpResponseMessage> BookAsync(HttpClient client)
    {
        return client.PostAsJsonAsync("/api/reservations?harmless_token=" + QueryProbe, new
        {
            equipmentId = "camera-001",
            startAt = "2030-01-02T12:00:00Z",
            endAt = "2030-01-02T13:00:00Z"
        });
    }

    private static WebApplicationFactory<Reservations.Program> Capture(BookingScenario scenario, ExportedLogs logs, ConsoleCapture console)
    {
        return scenario.App.WithWebHostBuilder(builder => builder.ConfigureServices(services =>
        {
            _ = services.AddLogging(logging =>
            {
                _ = logging.AddProvider(console);
                _ = logging.AddOpenTelemetry(options => options.AddProcessor(new SimpleLogRecordExportProcessor(logs)));
            });
        }));
    }

    private static void AssertPrivate(IEnumerable<string> values, string root, bool forbidUrls = true)
    {
        foreach (string value in values)
        {
            Assert.True(!Probes.Any(probe => value.Contains(probe, StringComparison.Ordinal)), "Telemetry must omit query/header/body probe values.");
            Assert.False(value.Contains(root, StringComparison.Ordinal), "Telemetry must omit the local content root.");
            Assert.False(value.Contains("/Users/", StringComparison.Ordinal), "Telemetry must omit local user paths.");
            if (forbidUrls)
            {
                Assert.False(value.Contains("http://", StringComparison.Ordinal) || value.Contains("https://", StringComparison.Ordinal), "Application logs must omit raw URLs.");
            }
        }
    }

    private sealed class DevelopmentRedactionFlags : IDisposable
    {
        private static readonly string[] Names = ["OTEL_DOTNET_EXPERIMENTAL_ASPNETCORE_DISABLE_URL_QUERY_REDACTION", "OTEL_DOTNET_EXPERIMENTAL_HTTPCLIENT_DISABLE_URL_QUERY_REDACTION"];
        private readonly string?[] previous = [.. Names.Select(Environment.GetEnvironmentVariable)];

        public DevelopmentRedactionFlags()
        {
            foreach (string name in Names)
            {
                Environment.SetEnvironmentVariable(name, "true");
            }
        }

        public void Dispose()
        {
            for (int index = 0; index < Names.Length; index++)
            {
                Environment.SetEnvironmentVariable(Names[index], previous[index]);
            }
        }
    }

    private sealed class ExportedLogs : BaseExporter<LogRecord>
    {
        public ConcurrentQueue<LogSnapshot> Values { get; } = new();

        public string[] ResourceValues { get; private set; } = [];

        public override ExportResult Export(in Batch<LogRecord> batch)
        {
            ResourceValues = [.. ParentProvider.GetResource().Attributes.Select(attribute => attribute.Key + "=" + attribute.Value)];
            foreach (LogRecord record in batch)
            {
                List<string> attributes = record.Attributes is { } recorded ? [.. recorded.Select(attribute => attribute.Key + "=" + attribute.Value)] : [];
                record.ForEachScope((scope, captured) =>
                {
                    foreach (KeyValuePair<string, object?> attribute in scope)
                    {
                        captured.Add(attribute.Key + "=" + attribute.Value);
                    }
                }, attributes);
                Values.Enqueue(new LogSnapshot(record.FormattedMessage ?? record.Body?.ToString() ?? "", [.. attributes], record.TraceId, record.SpanId, record.Exception is not null));
            }

            return ExportResult.Success;
        }
    }

    private sealed class ExportedActivities : BaseExporter<Activity>
    {
        public ConcurrentQueue<SpanSnapshot> Values { get; } = new();

        public override ExportResult Export(in Batch<Activity> batch)
        {
            foreach (Activity activity in batch)
            {
                string[] attributes = [.. activity.TagObjects.Select(attribute => attribute.Key + "=" + attribute.Value), .. activity.Events.SelectMany(value => value.Tags).Select(attribute => attribute.Key + "=" + attribute.Value), activity.StatusDescription ?? ""];
                Values.Enqueue(new SpanSnapshot(activity.Kind, activity.Duration, attributes));
            }

            return ExportResult.Success;
        }
    }

    private sealed class ConsoleCapture : ILoggerProvider
    {
        public ConcurrentQueue<string> Values { get; } = new();

        public ILogger CreateLogger(string categoryName)
        {
            return new Capture(Values);
        }

        public void Dispose()
        {
        }

        private sealed class Capture(ConcurrentQueue<string> values) : ILogger
        {
            public IDisposable? BeginScope<TState>(TState state) where TState : notnull
            {
                return null;
            }

            public bool IsEnabled(LogLevel logLevel)
            {
                return true;
            }

            public void Log<TState>(LogLevel logLevel, EventId eventId, TState state, Exception? exception, Func<TState, Exception?, string> formatter)
            {
                values.Enqueue(formatter(state, exception));
                if (state is IEnumerable<KeyValuePair<string, object?>> attributes)
                {
                    foreach (KeyValuePair<string, object?> attribute in attributes)
                    {
                        values.Enqueue(attribute.Key + "=" + attribute.Value);
                    }
                }

                if (exception is not null)
                {
                    values.Enqueue(exception.ToString());
                }
            }
        }
    }

    private sealed record LogSnapshot(string Message, string[] Values, ActivityTraceId TraceId, ActivitySpanId SpanId, bool HasException);

    private sealed record SpanSnapshot(ActivityKind Kind, TimeSpan Duration, string[] Values);
}
