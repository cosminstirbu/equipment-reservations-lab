# Testing

Applies to client and backend changes. The constitution requires test-first development
and behavior tests through public interfaces; this guide describes practical boundaries.

## Choose the boundary

| Need | Default approach |
| --- | --- |
| Client behavior | Render a feature/component, act as a user, assert visible results |
| Backend behavior | Call its public API with real internal collaborators |
| Database behavior | Real selected database through Testcontainers |
| External service interaction | Narrow integration test with a faithful boundary double |
| Double fidelity | Contract test against the provider contract |
| Focused algorithm or calculation | Solitary public-interface test when justified |

For ASP.NET Core, prefer `WebApplicationFactory` and its test client for HTTP behavior.
Keep the production pipeline and internal dependencies where relevant; replace external
boundaries deliberately. Tests must not accidentally call live third-party services.

Source: [ASP.NET Core integration testing](https://learn.microsoft.com/en-us/aspnet/core/test/integration-tests?view=aspnetcore-10.0).

## Database fixtures

Required: use the chosen engine with production-representative schema and migrations.
Use Testcontainers readiness checks and isolated data. Container reuse within a suite
is acceptable only when tests remain independent and parallel execution is safe.
Clean up resources reliably; a missing container runtime is a failed prerequisite,
not permission to skip required tests and report success.

Source: [Testcontainers for .NET](https://dotnet.testcontainers.org/).

## Keep tests useful

Start with a failure for the intended reason, implement, then refactor with passing tests.
Assert outcomes and contractual effects, not private methods or incidental call sequences.
A class rename or internal extraction must not require changing behavior expectations.

Control time and randomness at boundaries; avoid timing sleeps and shared mutable state.
Cover relevant failure and concurrency behavior as well as successful paths. Keep test
setup local and readable; use shared fixtures when they reduce real duplication.
Record why a solitary test is necessary. Decide Redis, Kafka, RabbitMQ, and other
infrastructure testing approaches individually in the feature plan.

Prefer a small set of end-to-end smoke tests for important journeys when justified.
They supplement focused tests. Coverage numbers alone are not an acceptance gate;
reviews assess whether meaningful behavior and risks have evidence.
