using Xunit;

namespace Reservations.Tests;

[CollectionDefinition("Application behavior")]
public sealed class ApplicationBehaviorScenarios;

[CollectionDefinition("Authentication and input security")]
public sealed class AuthenticationAndInputSecurityScenarios;

[CollectionDefinition("Database telemetry and recovery")]
public sealed class DatabaseTelemetryAndRecoveryScenarios;
