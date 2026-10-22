# Backend test stability audit

Date: 2026-10-22. Baseline: d26d131, with the delivery-fixture restart repair
described in [broker readiness repair](broker-readiness-repair.md). The owner
authorized continuing repairs, committing/pushing and monitoring PR #15; feature
acceptance and merge remain pending.

## Scope and standards

Whole-tree static inventory and pattern review covered all nine backend test
projects and TestSupport: 96 C# files, 245 Fact/Theory declarations and 431 InlineData
attributes. These are source inventory counts, not discovered runtime case counts.
Manually inspected the provider/lifecycle, admission, process, clock, telemetry and
authentication helpers and test call sites highlighted by the sweep. This is a
static audit with focused manual review, not proof that every possible flake is absent.

Applicable standards: constitution II, III, IV and VI;
[testing](../../../docs/engineering/testing.md),
[formatting](../../../docs/engineering/formatting-and-linting.md),
[tooling](../../../docs/engineering/tooling.md),
[resilience](../../../docs/engineering/resilience.md) and
[observability](../../../docs/engineering/observability.md).
Authoritative guidance belongs in the testing guide, with discovery in the engineering
index. This change clarifies existing requirements; it changes neither constitutional
policy nor concurrency, application deadlines, test applicability or feature acceptance.

## Recent repairs and lessons

- Initial AMQP setup: TCP accepted connections before the AMQP handshake completed.
  A bounded authenticated connection policy now covers initial delivery fixture setup
  and the bootstrap import sender. Thirteen policy/client-boundary cases pass locally.
  Authentication/permanent failures and unrelated cancellation are not retried.
- Database admission: a 60-second queue deadline expired under concurrent setup waves.
  Admission now has a distinct five-minute bound and diagnostics; active database
  creation/extensions/migrations retain a separate 60-second budget. Five controlled
  scheduling/deadline regressions pass. See [database repair](database-admission-repair.md).
- Restart readiness: run 39778181737 first failed the real delivery recovery scenario
  after restart, followed by nine AMQP setup failures. Inspection found restart still
  returned at TCP readiness. The pending repair establishes an authenticated connection
  before returning. The existing hosted failing recovery test is its regression;
  no business-operation retry or weakened assertion is introduced.

Run logs establish the failures, and inspection establishes the missing readiness
postcondition. They do not prove the broker's internal reason for delaying AMQP.

## Remaining findings

Code-confirmed gaps below are distinguished from unproven load sensitivities. None
is claimed to explain a historical CI failure without corresponding evidence.

| ID | Finding and evidence | Next verification or repair |
| --- | --- | --- |
| BTS-001 | `TestSupport/BrokerAccessFixture.cs`: successful initialization uses TCP readiness plus management HTTP, followed by a one-shot AMQP connection; `RestartAsync` returns after management HTTP. AMQP readiness coverage remains inconsistent with the delivery fixture. | Exercise successful startup/restart through the actual broker and use bounded AMQP readiness on those success paths. Preserve intentional malformed-import and authorization failures. |
| BTS-002 | `TestSupport/ApplicationStartup.cs`: four-slot gate has a 60-second admission bound; the active `Func<Task<T>>` has no enforced deadline and does not accept an active token. Some host startup call sites bypass this gate. | Measure queued waves and classify first-start versus already-started/intentional-failure call sites. Reproduce contention before changing budgets. Do not abandon synchronous startup and release its slot while it still runs. |
| BTS-003 | `BookingRecoveryFixture.DisposeAsync` and `BookingScenario.DisposeAsync` dispose resources sequentially, so an early failure skips later cleanup. Partial-init cleanup in provider fixtures can replace the primary failure. | Add controlled primary-plus-cleanup failure coverage, attempt all owned resources and preserve both diagnostics using the tooling contract. |
| BTS-004 | `DatabaseBootstrapTracingTests.BootstrapProcessExportsBeforeExitOnSuccessAndFailure` times out waiting for a process but has no termination/reap path. `SpectralValidation` terminates on failure but uses an unbounded post-kill wait. | Regress timeout/cancellation with a real owned child, assert termination and bounded cleanup; preserve private output handling and the primary failure. |
| BTS-005 | Load sensitivities requiring measurement: `OutboxNotificationTests` has short notification observation windows and an intentional one-second delivery SLA; `SpectralValidationTests` expects a PID marker before a one-second process timeout. | Coordinate startup/observation causally and measure runner pressure. Preserve explicit SLA semantics. Do not increase timeouts based solely on static suspicion. |

## Sound paths retained

All nine assemblies retain `ParallelMode.All` and `MaxThreads = -1`. Shared broker
and Keycloak lifecycle collections already opt out of overlap. Process-wide telemetry
classes document exclusivity, and inspected environment changes restore their state.
xUnit documents that opted-out collections exclude overlap in `all` mode too;
there is no evidence here for changing those exclusions or serializing the suite.
Source: [xUnit parallelism](https://xunit.net/docs/running-tests-in-parallel).
An attempted pinned package-source inspection was unavailable due to local NuGet
network restrictions; no claim of successful source inspection is made.

Scenario databases use isolated names and real migrations. Identity signing on the
shared authority is protected by a lock; mutable authority failure settings use
scoped instances in inspected tests. Keycloak waits for HTTP readiness, so it does
not share the identical TCP-only startup gap. Bounded condition polling and deliberate
cancellable waits were not classified as arbitrary sleeps merely by text matching.

## Design and qualification record

The restart change retains the real broker, production publisher/worker and durable
state in the existing failing public recovery scenario. Its observable publication
and delivery assertions remain the regression boundary. Reused policy tests isolate
only the transient classification/time-budget algorithm, with a real loopback AMQP
transport failure case; they do not claim broker startup qualification.

Local restart-policy check: 13 passed, zero skipped. Formatting and lint passed after
the source change. The local Podman endpoint is unavailable; no VM/service changes
were made, and real-provider/full-suite local verification remains pending. The owner
has now authorized push and hosted validation; record exact hosted revision and result
when available. A green run supports this repair without proving every audit risk gone.

The engineering guidance covers readiness across lifecycle paths, distinct admission
and active budgets, causal observations, cleanup ownership and source-matched full
concurrency evidence. BTS-001 through BTS-005 remain follow-up work until separately
reproduced/repaired and verified. Existing feature qualification tasks remain open.
