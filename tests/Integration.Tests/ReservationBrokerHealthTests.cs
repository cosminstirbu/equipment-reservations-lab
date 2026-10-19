using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Diagnostics.HealthChecks;
using Reservations;
using Xunit;

namespace Integration.Tests;

[Collection("Reservation delivery")]
public sealed class ReservationBrokerHealthTests(ReservationDeliveryFixture infrastructure)
{
    [Fact]
    public async Task ConfiguredPublisherCanEstablishAHealthyBrokerConnection()
    {
        IConfiguration configuration = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["ConnectionStrings:messaging"] = infrastructure.Publisher
        }).Build();
        var health = new BrokerHealth(configuration);

        HealthCheckResult result = await health.CheckHealthAsync(new HealthCheckContext(), TestContext.Current.CancellationToken);

        Assert.Equal(HealthStatus.Healthy, result.Status);
        Assert.Null(result.Exception);
        Assert.Null(result.Description);
    }
}
