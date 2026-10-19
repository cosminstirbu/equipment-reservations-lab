# Testing

Applies to client and backend changes. This guide implements the constitution's
[test-first](../../.specify/memory/constitution.md#ii-test-first-development),
[public-interface](../../.specify/memory/constitution.md#iii-public-interface-behavior-tests), and
[test-feedback](../../.specify/memory/constitution.md#iv-useful-maintainable-test-feedback) principles
through concrete test boundaries, provider setup, and review practices.

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

## Test design and review

Before adding or changing tests, check the existing suite and extend or consolidate cases
that already cover the intended behavior. Record a concise design rationale in the existing
plan or review record; for ordinary work, use the task response or a comment where the
boundary choice is non-obvious. Group cases that share a behavior and boundary. The
record must identify:

- The behavior and contractual outcome being verified, and the stable public entry point.
- The real internal collaborators retained by the test.
- Each double, the external responsibility it replaces, and the provider contract evidence
  establishing its fidelity. Classify the responsibility rather than assuming that a
  public interface is an external boundary.
- For each solitary test, the specific reason isolation is necessary under Principle III.
  Deterministic parsing or validation algorithms can justify this boundary; public
  visibility, convenience, or an uncovered line alone cannot.
- The observable result or contractual effect whose regression makes the test fail.

Keep application-owned serialization, validation, routing, persistence, and error handling
real in integration tests that claim to verify those behaviors. Scope a component test's
claims to the component actually exercised. A database integration test can verify storage
behavior without establishing HTTP authorization or endpoint behavior. A broker adapter
contract test can verify a real connection without establishing readiness registration.

### Failure scenarios

Cause failures at the resource or external boundary responsible for them. Examples include
PostgreSQL schema/permission faults, blocked database statements cancelled by the actual
request budget, or HTTP transport failures from a faithful handler double. Use isolated
real providers for the broker delivery/recovery contracts selected by the feature plan.
Control time and scheduling at their boundaries while retaining the production behavior
being verified.

Do not manufacture a database exception inside a request-body stream or publisher double
to enter an unrelated catch block. Test coordination must tolerate internal refactoring:
observe scoped provider state or contractual signals rather than depending on middleware
rewinds, private SQL text, or an incidental internal call sequence.

### Review evidence

For each added or changed test, review the design record against the actual fixture and
assertions. Verify that the double is faithful at the stated boundary, that claimed
production collaborators remain real, and that failures occur at the stated resource.
Check the reason for each solitary case and whether an internal refactor would require
changing its behavioral expectations. Use the existing review process and preserve
independent reviewer ownership where required.

## Database fixtures

Required: use the chosen engine with production-representative schema and migrations.
Use Testcontainers readiness checks and isolated data. Container reuse within a suite
is acceptable only when tests remain independent and parallel execution is safe.
Clean up resources reliably; a missing container runtime is a failed prerequisite,
not permission to skip required tests and report success.

Source: [Testcontainers for .NET](https://dotnet.testcontainers.org/).

## Keep tests useful

For new behavior or a regression fix, retain the failing test command/result before
implementation as evidence for Principle II. During refactoring, retain the relevant
behavior expectations and rerun the affected tests.

Control time and randomness at boundaries; avoid timing sleeps and shared mutable state.
Cover relevant failure and concurrency behavior as well as successful paths. Keep test
setup local and readable; use shared fixtures when they reduce real duplication. Use
condition-based observations with bounded deadlines when waiting for external progress.

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

## Coverage work

Apply the same boundary selection and design review to coverage-driven changes. Use the
report to identify unverified behavior, then choose the test boundary from that behavior.
A numeric target does not justify a different boundary or a weaker solitary-test rationale.
Record remaining gaps and their causes, including generated sequence points and unreachable
defensive paths. Keep coverage exclusions governed by the committed configuration and
review any proposed exclusion change on its merits.

Passing tests, formatting, lint, and coverage checks establish only what those checks
measure. Review the behavioral failure each assertion detects and the design evidence
above before claiming compliance with the testing principles.

## Backend code coverage in VS Code and CI

[coverage.runsettings](../../coverage.runsettings) configures Microsoft Code Coverage
to exclude source files under `obj` directories. Its source-path expression handles
both Windows and Unix separators. C# Dev Kit uses Microsoft's collector rather than
Coverlet; Coverlet exclusion settings are not interchangeable with this configuration.

The workspace's `dotnet.unitTests.runSettingsPath` setting points C# Dev Kit to this
file. Use **Run Tests with Coverage** to regenerate IDE results after changing it.
VS Code workspace settings do not configure command-line or CI test runs; pass the
coverage settings explicitly there.

The CLI uses the native .NET 10 Microsoft Testing Platform runner. Before enabling
CLI coverage, add a pinned, MTP-compatible `Microsoft.Testing.Extensions.CodeCoverage`
package reference to the test projects through the existing test-only item group in
`tests/Directory.Build.props`, excluding TestSupport, and update their package lockfiles.
The repository does not currently reference this extension, so the following command
requires that setup first. Installing C# Dev Kit does not install the CLI extension
into the test projects.

From the repository root, with the normal container runtime environment from the README:

```sh
dotnet test --solution EquipmentReservation.slnx \
  --max-parallel-test-modules 9 \
  --coverage \
  --coverage-settings "$PWD/coverage.runsettings" \
  --coverage-output-format cobertura
```

This example uses a POSIX shell; in PowerShell, pass an absolute settings path using
`(Join-Path $PWD 'coverage.runsettings')` and use PowerShell line continuation syntax.
Use `dotnet test --project <project> --help` after adding the extension to confirm
the available coverage options. CI still needs the pinned SDK and the container
prerequisites for real PostgreSQL, RabbitMQ and Keycloak integration tests.

Publish the generated Cobertura reports from the test results directories as pipeline
artifacts. Each test module produces its own report; preserve distinct report paths
and merge them with a compatible reporting tool if the pipeline needs one solution-wide
coverage percentage. Do not direct parallel modules to the same output filename.
`npm run check` continues to run the normal suite without collecting coverage.

Sources: [Microsoft Testing Platform coverage options and package compatibility](https://learn.microsoft.com/en-us/dotnet/core/testing/microsoft-testing-platform-code-coverage),
[Microsoft Code Coverage configuration](https://github.com/microsoft/codecoverage/blob/main/docs/configuration.md).

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
