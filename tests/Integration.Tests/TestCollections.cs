using Xunit;

namespace Integration.Tests;

[CollectionDefinition("Application behavior")]
public sealed class ApplicationBehaviorScenarios;

[CollectionDefinition("Database telemetry and recovery")]
public sealed class DatabaseTelemetryAndRecoveryScenarios;

[CollectionDefinition("Identity provider", DisableParallelization = true)]
public sealed class IdentityProviderScenarios : ICollectionFixture<IdentityProviderFixture>;

[CollectionDefinition("Reservation delivery", DisableParallelization = true)]
public sealed class ReservationDeliveryScenarios : ICollectionFixture<ReservationDeliveryFixture>;
