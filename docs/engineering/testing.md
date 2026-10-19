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

The production-aligned test projects under `tests/` contain backend HTTP behavior,
cross-service integration, real PostgreSQL/RabbitMQ/Keycloak contracts,
delivery/recovery and privacy checks.
Use `WebApplicationFactory` for service pipelines and Testcontainers for isolated
providers; cross-service tests retain actual authentication and service credentials.
Provider setup uses production provisioners, scoped service authority and migrations.
Recovery tests recreate service hosts against the same isolated durable state and
restart real infrastructure; they do not claim separate process-crash or application
network-listener coverage.

The test projects use native xUnit scheduling. `npm run check` builds once
and invokes the complete suite through Microsoft Testing Platform with `--no-build`;
a missing runtime/readiness prerequisite fails the check.
No automated application test constructs, inspects, runs or publishes an Aspire
AppHost. Aspire is local development orchestration and is verified manually using
[the local procedure](../../README.md#manual-local-development-check).
Manifest generation/cloud deployment is outside the supported testing policy.
Existing frontend and browser checks remain required at their documented boundaries.

Coverage numbers alone are not an acceptance gate; review the failure each assertion
detects.

## Backend parallelism is the default

Backend tests must be designed to run concurrently within the same test project,
including methods and theory rows in the same class. Use xUnit v3
`ParallelMode.All` with `MaxThreads = -1`. The quality gate also enables all test
projects to run concurrently through native Microsoft Testing Platform scheduling.

Sequential execution is an exception, permitted only for a concrete, documented
constraint that prevents safe overlap. For every exception, document alongside the
attribute or in a linked fixture/guide section:

- The shared resource or process-wide state and how concurrent tests interfere.
- Why scenario isolation or scoped observation cannot currently remove the constraint.
- The smallest affected method, class or collection and the scope of exclusivity.

Apply the narrowest supported exclusion. A class or collection exclusion requires
a reason that covers that entire scope. Sharing a container, using a database, or
belonging to the same production project does not alone justify serialization.
Revisit exclusions when fixtures or observation boundaries change.

Use independent scenario data, application hosts, clocks and boundary doubles.
Shared fixture implementations must be thread-safe, including credential signing
and cleanup. Size test infrastructure for the intended concurrency and diagnose
connection exhaustion or timeouts before considering a scheduling restriction.
Keep resource-capacity settings in test fixtures and preserve behavioral assertions.

### Current constraints requiring exclusive execution

| Constraint | Current scope | Why overlap is unsafe |
| --- | --- | --- |
| Process-wide telemetry observation | Instrumented telemetry, privacy and recovery classes marked with `TestClass` | Listeners/exporters observe shared sources and can collect another test's signals; some privacy tests also change OpenTelemetry environment flags |
| Shared RabbitMQ state and lifecycle | `Reservation delivery` collections | Tests purge the same queues, change scoped permissions or restart the broker; consumer cases also capture global metrics or change `TZ` |
| Shared Keycloak state and lifecycle | `Identity provider` collections | Tests reconcile the same realm/users/clients or restart the provider; provider telemetry also observes global HTTP activities |

Only tests subject to these concrete constraints require exclusivity. New tests
with isolated state and scoped observations should remain parallel-compatible.
Existing exclusions must document the actual constraint for their entire scope
and be narrowed when the affected tests can safely overlap.

`[TestClass(DisableParallelization = true)]` and
`[CollectionDefinition(..., DisableParallelization = true)]` exclude overlap with
all other tests in that assembly's process. Other projects continue running in
their separate processes. Plain collection names organize tests without serializing
them under `ParallelMode.All`.

## Backend test projects and scheduling

The solution contains nine independently executable test projects and one helper
library. Classify tests by the behavior they verify: using real internal
collaborators does not by itself make a test cross-service integration.

| Project | Responsibility |
| --- | --- |
| `Inventory.Tests` | Inventory HTTP behavior and equipment persistence |
| `Reservations.Tests` | Booking, cancellation, ownership, browser-write security and reservation privacy/telemetry |
| `Notifications.Tests` | Notification ownership and real-broker consumer behavior |
| `IdentityAccess.Tests` | Identity validation, ownership input, service identity and identity telemetry |
| `Persistence.Tests` | Migration machinery, database tracing and privacy contracts |
| `DatabaseBootstrap.Tests` | Database provisioning and bootstrap tracing |
| `BrokerBootstrap.Tests` | Broker import/startup, scoped credentials and topology contracts |
| `IdentityBootstrap.Tests` | Real Keycloak provisioning, human/service token contracts and provider telemetry |
| `Integration.Tests` | Multi-API authorization/readiness, outbox publication, cross-service telemetry and recovery |
| `TestSupport` | Reusable fixture implementations, application factories, clocks, boundary doubles and telemetry captures; no discovered tests |

Run all projects with the normal container runtime environment from the README:

```sh
dotnet test --solution EquipmentReservation.slnx --max-parallel-test-modules 9
```

Or run an individual project (plain `dotnet test` also works inside its directory):

```sh
dotnet test --project tests/Reservations.Tests/Reservations.Tests.csproj
dotnet test --project tests/Reservations.Tests/Reservations.Tests.csproj --filter-class Reservations.Tests.BookingTests
```

`npm run check` uses the solution command with `--no-build` after building once.
MTP can run all nine test modules in separate processes concurrently. The quality
script derives the module limit from the number of `.Tests.csproj` files so future
projects are included automatically. Each assembly uses `ParallelMode.All` with
`MaxThreads = -1`, removing the per-assembly concurrency cap for eligible tests.
Exclusive telemetry classes and provider collections retain their isolation rules.
Individual concurrency tests can also issue several simultaneous requests.
The SDK default module limit is processor-count based; use the explicit count
above to allow all current projects regardless of machine CPU count.

`tests/Directory.Build.props` shares MTP/xUnit package settings while importing the
repository's build/analyzer settings. TestSupport is a library and does not receive
test executable settings. The suite uses `xunit.v3.mtp-v2` 4.0.2 and the native
.NET 10 MTP runner selected in `global.json`. IDE test discovery requires an
MTP-capable integration. `dotnet test --project <project> --help` lists supported
filter and report options. For TRX reports add `--report-xunit-trx --results-directory <directory>`; use distinct
filenames when collecting several modules into one directory.

Fixture implementations live in TestSupport, with internal helpers visible only
to the nine test assemblies. TestSupport has no collection or assembly-fixture
registrations. Every test project registers only the fixtures it needs, and owns
its live containers independently. There is no cross-process singleton. PostgreSQL
assembly fixtures retain one database per scenario and configure their test-only
servers for 512 connections to support uncapped concurrent scenarios.
Delivery/recovery fixtures retain their own durable state and provider containers.
Provider containers are reused by default. The Keycloak diagnostics privacy test is an explicit
exception: it owns a fresh provider so its complete log-history assertions cannot
see negative authentication events from other tests.
