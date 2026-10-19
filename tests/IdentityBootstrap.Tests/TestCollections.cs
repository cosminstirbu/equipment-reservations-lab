using Xunit;

namespace IdentityBootstrap.Tests;

[CollectionDefinition("Identity provider", DisableParallelization = true)]
public sealed class IdentityProviderScenarios : ICollectionFixture<IdentityProviderFixture>;
