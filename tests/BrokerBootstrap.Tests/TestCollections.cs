using Xunit;

namespace BrokerBootstrap.Tests;

[CollectionDefinition("Reservation delivery", DisableParallelization = true)]
public sealed class ReservationDeliveryScenarios : ICollectionFixture<ReservationDeliveryFixture>;
