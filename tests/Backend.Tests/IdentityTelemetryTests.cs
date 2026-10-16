using System.Collections.Concurrent;
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using IdentityAccess;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using OpenTelemetry;
using OpenTelemetry.Metrics;
using Xunit;

namespace Backend.Tests;

[Collection("PostgreSQL")]
public sealed class IdentityTelemetryTests(PostgresFixture postgres)
{
    private static readonly string[] AllowedDimensions = ["operation", "outcome"];

    [Fact]
    public async Task ProductionMetricsExportBoundedAuthenticatedUnauthorizedAndForbiddenOutcomes()
    {
        await using BookingScenario scenario = await BookingScenario.CreateAsync(postgres);
        using var exported = new Outcomes();
        using WebApplicationFactory<Reservations.Program> host = scenario.App.WithWebHostBuilder(builder => builder.ConfigureServices(services =>
            services.AddOpenTelemetry().WithMetrics(metrics => metrics.AddReader(new BaseExportingMetricReader(exported)))));
        using HttpClient client = host.CreateClient();
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/api/reservations")).StatusCode);
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", IdentityAuthorityFixture.Shared.Token(roles: ["Approver"]));
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync("/api/reservations")).StatusCode);
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", IdentityAuthorityFixture.Shared.Token(wrongSignature: true));
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/reservations")).StatusCode);
        Assert.True(host.Services.GetRequiredService<MeterProvider>().ForceFlush());
        Assert.Contains(exported.Values, value => value.Outcome == "authenticated");
        Assert.Contains(exported.Values, value => value.Outcome == "unauthorized");
        Assert.Contains(exported.Values, value => value.Outcome == "forbidden");
        Assert.All(exported.Values, value => Assert.All(value.Keys, key => Assert.Contains(key, AllowedDimensions)));
    }

    [Fact]
    public async Task FailedServiceAuthorityExportsOnlyBoundedProviderOutcomeBeforeAnyBookingEffect()
    {
        await using BookingScenario scenario = await BookingScenario.CreateAsync(postgres);
        using var exported = new Outcomes();
        using WebApplicationFactory<Reservations.Program> host = scenario.App.WithWebHostBuilder(builder => builder.ConfigureServices(services =>
        {
            _ = services.AddHttpClient(ServiceTokenClient.ClientName).ConfigurePrimaryHttpMessageHandler(() => new Unavailable());
            _ = services.AddOpenTelemetry().WithMetrics(metrics => metrics.AddReader(new BaseExportingMetricReader(exported)));
        }));
        using HttpClient client = host.CreateClient();
        using HttpResponseMessage response = await client.PostAsJsonAsync("/api/reservations", new
        {
            equipmentId = "camera-001",
            startAt = "2030-01-02T12:00:00Z",
            endAt = "2030-01-02T13:00:00Z"
        });
        Assert.Equal(HttpStatusCode.ServiceUnavailable, response.StatusCode);
        Assert.DoesNotContain("private-provider-failure", await response.Content.ReadAsStringAsync(), StringComparison.Ordinal);
        Assert.Equal(0L, await scenario.CountAsync("reservations"));
        Assert.Equal(0L, await scenario.CountAsync("reservation_outbox"));
        Assert.True(host.Services.GetRequiredService<MeterProvider>().ForceFlush());
        Assert.Contains(exported.Values, value => value.Outcome == "provider_unavailable");
        Assert.All(exported.Values, value => Assert.All(value.Keys, key => Assert.Contains(key, AllowedDimensions)));
    }

    private sealed class Unavailable : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            throw new HttpRequestException("private-provider-failure");
        }
    }

    private sealed class Outcomes : BaseExporter<Metric>
    {
        public ConcurrentQueue<OutcomeSnapshot> Values { get; } = new();

        public override ExportResult Export(in Batch<Metric> batch)
        {
            foreach (Metric metric in batch)
            {
                if (metric.Name != "identity.outcomes")
                {
                    continue;
                }

                foreach (ref readonly MetricPoint point in metric.GetMetricPoints())
                {
                    var keys = new List<string>();
                    string outcome = "";
                    foreach (KeyValuePair<string, object?> tag in point.Tags)
                    {
                        keys.Add(tag.Key);
                        if (tag.Key == "outcome")
                        {
                            outcome = tag.Value?.ToString() ?? "";
                        }
                    }

                    Values.Enqueue(new OutcomeSnapshot(outcome, [.. keys]));
                }
            }

            return ExportResult.Success;
        }
    }

    private sealed record OutcomeSnapshot(string Outcome, string[] Keys);
}
