using System.Net;
using System.Net.Http.Headers;
using System.Text;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Diagnostics.HealthChecks;
using Xunit;

namespace Reservations.Tests;

[Collection("Application behavior")]
public sealed class ReservationBoundaryTests(PostgresFixture postgres)
{
    [Fact]
    public async Task OversizedStreamingRequestIsRejectedWithoutAllocating()
    {
        await using BookingScenario scenario = await BookingScenario.CreateAsync(postgres);
        using var content = new StreamingJsonContent(new string('x', 4097));
        Assert.Null(content.Headers.ContentLength);

        using HttpResponseMessage response = await scenario.Client.PostAsync("/api/reservations", content, TestContext.Current.CancellationToken);

        Assert.Equal(HttpStatusCode.RequestEntityTooLarge, response.StatusCode);
        Assert.Equal(0, scenario.Inventory.Calls);
        Assert.Equal(0L, await scenario.CountAsync("reservations"));
        Assert.Equal(0L, await scenario.CountAsync("reservation_outbox"));
    }

    // IHealthCheck is the public probe boundary for configuration errors; there is
    // no provider to contact when the broker connection is absent or malformed.
    [Theory]
    [InlineData(null, "Broker not configured")]
    [InlineData("invalid", "Broker unavailable")]
    public async Task BrokerReadinessReportsMissingOrInvalidConfiguration(string? connection, string description)
    {
        IConfiguration configuration = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["ConnectionStrings:messaging"] = connection
        }).Build();
        var health = new BrokerHealth(configuration);
        HealthCheckResult result = await health.CheckHealthAsync(new HealthCheckContext(), TestContext.Current.CancellationToken);
        Assert.Equal(HealthStatus.Unhealthy, result.Status);
        Assert.Equal(description, result.Description);
    }

    // Only HTTP framing is controlled: the production middleware reads the real body.
    private sealed class StreamingJsonContent : HttpContent
    {
        private readonly byte[] body;

        public StreamingJsonContent(string json)
        {
            body = Encoding.UTF8.GetBytes(json);
            Headers.ContentType = new MediaTypeHeaderValue("application/json");
        }

        protected override bool TryComputeLength(out long length)
        {
            length = 0;
            return false;
        }

        protected override Task SerializeToStreamAsync(Stream stream, TransportContext? context)
        {
            return stream.WriteAsync(body).AsTask();
        }

        protected override Task SerializeToStreamAsync(Stream stream, TransportContext? context, CancellationToken cancellationToken)
        {
            return stream.WriteAsync(body, cancellationToken).AsTask();
        }
    }
}
