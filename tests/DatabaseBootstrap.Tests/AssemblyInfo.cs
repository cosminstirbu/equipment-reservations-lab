using Xunit;
using Xunit.Sdk;
using Xunit.v3;

[assembly: AssemblyFixture(typeof(PostgresFixture))]
[assembly: Parallelization(Mode = ParallelMode.All, MaxThreads = -1)]
