using Xunit;

namespace Notifications.Tests;

[CollectionDefinition("Application behavior")]
public sealed class ApplicationBehaviorScenarios;

[CollectionDefinition("Reservation delivery", DisableParallelization = true)]
public sealed class ReservationDeliveryScenarios : ICollectionFixture<ReservationDeliveryFixture>;
