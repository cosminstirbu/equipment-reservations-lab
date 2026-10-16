using System.Collections.Concurrent;
using System.Diagnostics;
using System.Net;
using System.Net.Http.Headers;
using System.Text.Json;
using IdentityAccess;
using IdentityBootstrap;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using OpenTelemetry;
using OpenTelemetry.Logs;
using OpenTelemetry.Trace;
using ServiceDefaults;
using Xunit;

namespace Backend.Tests;

[Collection("Identity provider")]
public sealed class IdentityProviderTelemetryTests(IdentityProviderFixture provider)
{
    [Fact]
    public async Task ActualProviderMetadataTokenAndBootstrapExportCorrelatedNativeHttpWithoutPrivateValues()
    {
        using var deadline = new CancellationTokenSource(TimeSpan.FromSeconds(90));
        using var spans = new Spans();
        using var logs = new Logs();
        HostApplicationBuilder bootstrapBuilder = Host.CreateApplicationBuilder();
        bootstrapBuilder.AddIdentityBootstrap();
        Capture(bootstrapBuilder.Services, bootstrapBuilder.Logging, spans, logs);
        using IHost bootstrap = bootstrapBuilder.Build();
        await bootstrap.StartAsync(deadline.Token);
        ActivityTraceId bootstrapTrace;
        using (Activity root = Parent())
        {
            bootstrapTrace = root.TraceId;
            await bootstrap.Services.GetRequiredService<IdentityProvisioning>().ReconcileAsync(provider.Settings, deadline.Token);
        }

        ProviderTokens tokens = await provider.LoginAsync("employee-a", cancellationToken: deadline.Token);
        await using WebApplication app = await ApiAsync(provider.Settings.ServiceSecret, spans, logs);
        ActivityTraceId metadataTrace;
        using (Activity root = Parent())
        {
            metadataTrace = root.TraceId;
            using HttpClient client = app.GetTestClient();
            client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", tokens.AccessToken);
            client.DefaultRequestHeaders.Add("traceparent", root.Id);
            Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/equipment", deadline.Token)).StatusCode);
        }

        using (Activity root = Parent())
        {
            using HttpClient client = app.GetTestClient();
            client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", tokens.IdToken);
            client.DefaultRequestHeaders.Add("traceparent", root.Id);
            Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/equipment", deadline.Token)).StatusCode);
        }

        ActivityTraceId tokenTrace;
        using (Activity root = Parent())
        {
            tokenTrace = root.TraceId;
            _ = await app.Services.GetRequiredService<ServiceTokenClient>().GetTokenAsync(new Uri("http://inventory/api/equipment/camera-001"), deadline.Token);
        }

        await using WebApplication rejected = await ApiAsync(Guid.NewGuid().ToString("N"), spans, logs);
        ActivityTraceId failureTrace;
        using (Activity root = Parent())
        {
            failureTrace = root.TraceId;
            HttpRequestException failure = await Assert.ThrowsAsync<HttpRequestException>(() => rejected.Services.GetRequiredService<ServiceTokenClient>().GetTokenAsync(new Uri("http://inventory/api/equipment/camera-001"), deadline.Token));
            Assert.Equal("Service authority unavailable.", failure.Message);
            Assert.Null(failure.InnerException);
        }

        ActivityTraceId bootstrapFailureTrace;
        using (Activity root = Parent())
        {
            bootstrapFailureTrace = root.TraceId;
            _ = await Assert.ThrowsAsync<InvalidOperationException>(() => bootstrap.Services.GetRequiredService<IdentityProvisioning>().ReconcileAsync(provider.Settings with { AdminPassword = Guid.NewGuid().ToString("N") }, deadline.Token));
        }

        Assert.True(bootstrap.Services.GetRequiredService<TracerProvider>().ForceFlush());
        Assert.True(app.Services.GetRequiredService<TracerProvider>().ForceFlush());
        Assert.True(rejected.Services.GetRequiredService<TracerProvider>().ForceFlush());
        Span[] metadata = [.. spans.Values.Where(value => value.TraceId == metadataTrace && value.Kind == ActivityKind.Client && value.Method == "GET").DistinctBy(value => value.Id)];
        Assert.Equal(2, metadata.Length);
        Assert.All(metadata, value => Assert.Equal(200, value.Status));
        Assert.Contains(spans.Values, value => value.TraceId == tokenTrace && value.Kind == ActivityKind.Client && value.Method == "POST" && value.Status == 200);
        Assert.Contains(spans.Values, value => value.TraceId == failureTrace && value.Kind == ActivityKind.Client && value.Method == "POST" && value.Status >= 400 && value.Outcome == ActivityStatusCode.Error);
        Assert.Contains(spans.Values, value => value.TraceId == bootstrapTrace && value.Kind == ActivityKind.Client && value.Method == "GET" && value.Status == 200);
        Assert.Contains(spans.Values, value => value.TraceId == bootstrapTrace && value.Kind == ActivityKind.Client && value.Method == "POST" && value.Status is >= 200 and < 400);
        Assert.Contains(spans.Values, value => value.TraceId == bootstrapFailureTrace && value.Kind == ActivityKind.Client && value.Method == "POST" && value.Status >= 400 && value.Outcome == ActivityStatusCode.Error);
        HashSet<ActivityTraceId> workflowTraces = [bootstrapTrace, metadataTrace, tokenTrace, failureTrace, bootstrapFailureTrace];
        Assert.All(spans.Values.Where(value => value.Kind == ActivityKind.Client && workflowTraces.Contains(value.TraceId)), value =>
        {
            Assert.True(value.Duration > TimeSpan.Zero);
            Assert.NotEqual(default, value.Parent);
            Assert.False(string.IsNullOrEmpty(value.Host));
        });

        using JsonDocument claims = IdentityProviderFixture.Claims(tokens.AccessToken);
        var privateValues = new List<string> { provider.Settings.AdminPassword, provider.Settings.ServiceSecret, tokens.AccessToken, tokens.IdToken, "employee-a" };
        privateValues.AddRange(provider.Settings.UserPasswords.Values);
        foreach (string claim in new[] { "sub", "sid", "session_state", "preferred_username" })
        {
            if (claims.RootElement.TryGetProperty(claim, out JsonElement value) && value.ValueKind == JsonValueKind.String)
            {
                privateValues.Add(value.GetString()!);
            }
        }

        string[] exported = [.. spans.Values.SelectMany(value => value.Attributes.Append(value.Name)), .. logs.Values];
        foreach (string value in privateValues)
        {
            Assert.False(exported.Any(item => item.Contains(value, StringComparison.Ordinal)), "Exported provider diagnostics contained private authority/profile data.");
        }

        Assert.DoesNotContain(exported, value => value.StartsWith("url.full=", StringComparison.Ordinal) || value.StartsWith("url.query=", StringComparison.Ordinal));
        await bootstrap.StopAsync(deadline.Token);
    }

    private async Task<WebApplication> ApiAsync(string secret, Spans spans, Logs logs)
    {
        WebApplicationBuilder builder = WebApplication.CreateBuilder(new WebApplicationOptions { EnvironmentName = "Development" });
        _ = builder.WebHost.UseTestServer();
        builder.AddServiceDefaults();
        _ = builder.Configuration.AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Identity:Authority"] = provider.Settings.Authority,
            ["Identity:ClientId"] = "reservations-service",
            ["Identity:ClientSecret"] = secret,
            ["InventoryUrl"] = "http://inventory"
        });
        _ = builder.Services.AddIdentityAuthentication(builder.Configuration, builder.Environment, "inventory-api");
        _ = builder.Services.AddServiceIdentity();
        Capture(builder.Services, builder.Logging, spans, logs);
        WebApplication app = builder.Build();
        _ = app.UseAuthentication();
        _ = app.UseAuthorization();
        _ = app.MapGet("/equipment", () => "readable").RequireAuthorization(IdentityAuthentication.EquipmentRead);
        await app.StartAsync();
        return app;
    }

    private static Activity Parent()
    {
        return new Activity("identity.telemetry.contract").SetIdFormat(ActivityIdFormat.W3C).Start();
    }

    private static void Capture(IServiceCollection services, ILoggingBuilder logging, Spans spans, Logs logs)
    {
        _ = services.AddOpenTelemetry().WithTracing(tracing => tracing.AddProcessor(new SimpleActivityExportProcessor(spans)));
        _ = logging.AddOpenTelemetry(options => options.AddProcessor(new SimpleLogRecordExportProcessor(logs)));
    }

    private sealed class Spans : BaseExporter<Activity>
    {
        public ConcurrentQueue<Span> Values { get; } = new();

        public override ExportResult Export(in Batch<Activity> batch)
        {
            foreach (Activity activity in batch)
            {
                string[] attributes = [.. activity.TagObjects.Select(pair => pair.Key + "=" + pair.Value), .. activity.Events.SelectMany(value => value.Tags).Select(pair => pair.Key + "=" + pair.Value), activity.StatusDescription ?? ""];
                Values.Enqueue(new Span(activity.DisplayName, activity.Kind, activity.TraceId, activity.SpanId, activity.ParentSpanId, activity.Duration, activity.Status,
                    activity.GetTagItem("http.request.method")?.ToString() ?? "", Convert.ToInt32(activity.GetTagItem("http.response.status_code"), System.Globalization.CultureInfo.InvariantCulture),
                    activity.GetTagItem("server.address")?.ToString() ?? "", attributes));
            }

            return ExportResult.Success;
        }
    }

    private sealed class Logs : BaseExporter<LogRecord>
    {
        public ConcurrentQueue<string> Values { get; } = new();

        public override ExportResult Export(in Batch<LogRecord> batch)
        {
            foreach (LogRecord record in batch)
            {
                Values.Enqueue(record.FormattedMessage ?? record.Body?.ToString() ?? "");
                if (record.Attributes is { } attributes)
                {
                    foreach (KeyValuePair<string, object?> pair in attributes)
                    {
                        Values.Enqueue(pair.Key + "=" + pair.Value);
                    }
                }

                if (record.Exception is { } exception)
                {
                    Values.Enqueue(exception.ToString());
                }
            }

            return ExportResult.Success;
        }
    }

    private sealed record Span(string Name, ActivityKind Kind, ActivityTraceId TraceId, ActivitySpanId Id, ActivitySpanId Parent, TimeSpan Duration, ActivityStatusCode Outcome, string Method, int Status, string Host, string[] Attributes);
}
