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

## Automated application boundary

`tests/Backend.Tests` contains backend HTTP behavior, cross-service integration,
real PostgreSQL/RabbitMQ/Keycloak contracts, delivery/recovery and privacy checks.
Use `WebApplicationFactory` for service pipelines and Testcontainers for isolated
providers; cross-service tests retain actual authentication and service credentials.
Provider setup uses production provisioners, scoped service authority and migrations.
Recovery tests recreate service hosts against the same isolated durable state and
restart real infrastructure; they do not claim separate process-crash or application
network-listener coverage.

Keep the assembly and existing fixture collections sequential. Parallelization is a
separate decision. `npm run check` builds once and invokes the complete Backend.Tests
suite with `--no-build -m:1`; a missing runtime/readiness prerequisite fails the check.
No automated application test constructs, inspects, runs or publishes an Aspire
AppHost. Aspire is local development orchestration and is verified manually using
[the local procedure](../../README.md#manual-local-development-check).
Manifest generation/cloud deployment is outside the supported testing policy.
Existing frontend and browser checks remain required at their documented boundaries.

Coverage numbers alone are not an acceptance gate; review the failure each assertion
detects. The [coverage disposition](../../specs/007-aspire-independent-tests/team/coverage-disposition.md)
records the migration from the retired Smoke suite without rewriting historical evidence.
