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

### Outbox startup coordination follow-up — 2026-10-23

Run 39921459240 failed `LegacyPollingAndListeningWorkersShareLocksAndStableEventIds`
at its first timer assertion: expected 30 seconds, observed 1 second. Local normal
execution passed, so a green rerun does not establish repair. Review of commits
cc27e49, 879aa24, 662b917 and 088d6cc shows the fixes addressed commit observation,
AMQP readiness and database admission; the audit's BTS-005 did not inventory each
startup/timer assertion or separate listener recovery from publisher/idle scheduling.
That missing per-call-site analysis allowed this fragile precondition to remain.
The hosted log lacks the original database exception (the fixture uses NullLogger),
so its exact external trigger remains unproven.

Test design: extend the existing real PostgreSQL/production OutboxWorker coexistence
scenario with a controlled initial connection-pool shortage. Hold the two connections
in a dedicated bounded pool until a real startup retry is scheduled, then release
them. Retain real schema, LISTEN, locking, HTTP booking, production publication state
and stable event identities. The existing manual schedule replaces only time/retry
progress and the gated publisher replaces the external broker at the established
adapter boundary. This scenario tests outbox coexistence, not AMQP fidelity (covered
by the real delivery suite). First observe the unchanged idle assertion fail on the
controlled one-second delay, then coordinate recovery to an observed healthy idle
state before measuring the actual behavior. Preserve explicit fallback/backoff and
one-second publication assertions once their prerequisites hold. Stop both owned
workers on every test exit with a fresh bounded cleanup budget. No production timeout,
retry policy, test concurrency or blanket retry change is planned.

Controlled red evidence: the normal case passed; the added delayed-startup case
failed with the same expected 30 seconds / actual 1 second at the original assertion.
After bounded recovery coordination, all 19 cases in OutboxNotificationTests passed
against real PostgreSQL on Windows/arm64 Podman. This proves the test defect and its
controlled recovery path, not the precise hosted trigger. Production timeouts remain
unchanged. Full-suite qualification is recorded below when complete.

#### Call-site review

| Call site | Classification and result |
| --- | --- |
| `IdleWorkerPublishesWithinOneSecondWithoutAdvancingFallbackAndDrainsBusyInserts` | Healthy startup prerequisite now waits for the real 30-second idle delay, advancing only known startup recovery delays within a separate 30-second setup budget. The provider commit gate and measured one-second SLA are unchanged. |
| `RestartHonorsFuturePersistedRetryWithoutNewInsert` | Both initial/restarted workers now reach the expected four-second due-time wait before the clock advances. Startup recovery cannot masquerade as that timer; due-time assertions remain. |
| `TerminatedListenerReconnectsThenDrainsAndShutdownReleasesSession` | Wait for healthy idle before querying/terminating the actual LISTEN backend. A first arbitrary delay did not prove that backend existed. |
| `ReplicasClaimDistinctRowsAndKeepEachPublisherSequential` | Each worker reaches healthy idle before inserting work; distinct-row and sequential-publisher assertions remain. |
| `MissingTriggerAndManualRepairAreRecoveredByFallback` | Establish healthy idle before deliberately suppressing notifications; fallback advancement and stable-event assertions remain. |
| `LegacyPollingAndListeningWorkersShareLocksAndStableEventIds` | Normal and forced transient startup cases retain actual locking/event assertions. Both workers are stopped on assertion failure with fresh bounded cleanup; secondary cleanup failure is reported without replacing the original failure. |
| `ManualScheduleAdvancesReplacementWhenPreviousDelayIsCancelled` | Both cancellation orderings already exercise real schedule tasks. Canceled entries are skipped; no replacement of these focused regressions with timing sleeps. |
| `InsertAndReconnectCannotShortenPublicationBackoff`, `TransientListenerRecoveryUsesBoundedBurstsAndIndependentTenSecondDegradedPolling`, permanent-auth cases | Intentional retry/terminal contracts retain strict expectations. Their fault-specific phase setup must be reviewed independently; general startup advancement must not swallow the failure being tested. See BTS-007. |
| `CommitBetweenEmptyScanAndWaitPublishesWithoutAdvancingFallback` | Uses a distinct synchronous TransitionSchedule gate. It still assumes its first gate is the healthy 30-second wait; it does not use the repaired ManualSchedule boundary. This is a separate unproven startup sensitivity, tracked as BTS-006 rather than claimed repaired. |
| `OutboxNotificationTelemetryTests` ScanSchedule; `DatabaseWorkerTracingTests` PollGate | An arbitrary first delay is insufficient proof of a completed LISTEN, snapshot or publication. Provider spans/state/attempt observations already exist in several cases, but startup recovery can reach a gate earlier. Scope and causal coordination remain BTS-007. |
| `ReservationWorkerBoundaryTests`, `ReservationOutboxTests`, `ReservationRecoveryTests` | Intentional broker/permission failures assert durable attempt count, parked due time, publisher failure or terminal logs in addition to timers. Those assertions are meaningful and retained; a blanket timer filter would weaken them. This review does not establish immunity to unrelated PostgreSQL startup failures. |

The original audit's broad inventory and BTS-005 timing warning were insufficient
to establish these per-call-site preconditions. Guidance in the testing engineering
document now makes this distinction explicit; earlier independent verdicts and
historical pending findings are not retroactively changed.

Code-confirmed gaps below are distinguished from unproven load sensitivities. None
is claimed to explain a historical CI failure without corresponding evidence.

| ID | Finding and evidence | Next verification or repair |
| --- | --- | --- |
| BTS-001 | `TestSupport/BrokerAccessFixture.cs`: successful initialization uses TCP readiness plus management HTTP, followed by a one-shot AMQP connection; `RestartAsync` returns after management HTTP. AMQP readiness coverage remains inconsistent with the delivery fixture. | Exercise successful startup/restart through the actual broker and use bounded AMQP readiness on those success paths. Preserve intentional malformed-import and authorization failures. |
| BTS-002 | `TestSupport/ApplicationStartup.cs`: four-slot gate has a 60-second admission bound; the active `Func<Task<T>>` has no enforced deadline and does not accept an active token. Some host startup call sites bypass this gate. | Measure queued waves and classify first-start versus already-started/intentional-failure call sites. Reproduce contention before changing budgets. Do not abandon synchronous startup and release its slot while it still runs. |
| BTS-003 | `BookingRecoveryFixture.DisposeAsync` and `BookingScenario.DisposeAsync` dispose resources sequentially, so an early failure skips later cleanup. Partial-init cleanup in provider fixtures can replace the primary failure. | Add controlled primary-plus-cleanup failure coverage, attempt all owned resources and preserve both diagnostics using the tooling contract. |
| BTS-004 | `DatabaseBootstrapTracingTests.BootstrapProcessExportsBeforeExitOnSuccessAndFailure` times out waiting for a process but has no termination/reap path. `SpectralValidation` terminates on failure but uses an unbounded post-kill wait. | Regress timeout/cancellation with a real owned child, assert termination and bounded cleanup; preserve private output handling and the primary failure. |
| BTS-005 | Load sensitivities requiring measurement: `OutboxNotificationTests` has short notification observation windows and an intentional one-second delivery SLA; `SpectralValidationTests` expects a PID marker before a one-second process timeout. | Coordinate startup/observation causally and measure runner pressure. Preserve explicit SLA semantics. Do not increase timeouts based solely on static suspicion. |
| BTS-006 | `CommitBetweenEmptyScanAndWaitPublishesWithoutAdvancingFallback` has a separate TransitionSchedule first-timer startup assumption. The repaired ManualSchedule does not cover it. | Reproduce transient startup at this exact synchronous registration gate, establish readiness without removing the lost-wakeup race, retain commit-to-publisher assertions and fresh bounded worker cleanup. |
| BTS-007 | Some intentional-fault and telemetry gates share schedules with startup recovery; a timer alone does not identify the listener/publisher phase. The call-site table distinguishes inspected contracts from unproven sensitivity. | Add provider-state/publication barriers and controlled startup coverage at each relevant boundary. Preserve strict retry order, durable attempt counts and production telemetry observation; do not broadly consume timers in fault-contract assertions. |
| BTS-008 | The 2026-10-23 full-concurrency Windows run failed two reservation security cases and two identity-provider cases outside the repaired Integration project. One reservation assertion query timed out opening PostgreSQL; another deserialized a numeric Problem Details status as a BookedReservation string after its setup booking failed. The identity failures were documentation code flow and the isolated-provider diagnostic privacy case. | Reproduce each operation with safe phase/error evidence under normal concurrency. Assert successful fixture booking status before deserialization so a setup failure is reported accurately; distinguish provider startup/authentication, request behavior and assertion-query budgets. No memory-exhaustion or common root-cause claim is established. |

### Outbox repair qualification and subsequent readiness repair

Four-failure repair follow-up: the owner requested repair of BTS-008. A joint focused
run passed all 52 SecurityBrowserWriteTests and all 24 IdentityProviderTests, so these
green results are not treated as a fix. Full nine-project concurrency is being used
to collect safe failure-phase evidence before changing provider policy. One independent
diagnostic defect is confirmed: the origin-security setup deserializes its booking
response without asserting Created. Extend BookingScenario at its existing public
fixture boundary with a confirmed-booking operation, retaining the real HTTP pipeline,
database and authentication. A controlled InventoryBoundary outage represents the
external inventory service and must produce a safe setup-status assertion instead of
a misleading DTO JSON error. No failed booking is retried. Capture intended red before
adding that success precondition; keep all authorization/ownership/write assertions.

The next full-concurrency diagnostic run passed all four original cases but failed
two cancellation cases and a database-tracing case (566 passed, three failed, 14
Windows skips). This establishes that failures move between database-dependent
scenarios, not that a rerun repairs them. Inspection found migrations use a separate
setup datasource and return an unopened runtime pool. A new real-PostgreSQL fixture
contract observes sessions through a separate unpooled observer, excluding that
observer; it requires an authenticated retained runtime session before requests.
This is a fixture-readiness boundary, not a claim about application business behavior.
It retains real PostgreSQL and schema and introduces no database double. Connection
readiness retries, if required, apply only to opening the fixture connection before
requests; request/command budgets and intentional outage tests remain unchanged.

Readiness policy design: database fixture connection preflight has at most five
attempts, three seconds each, a 20-second total bound within the existing active
provisioning budget, and bounded exponential backoff with jitter. Only timeout or
Npgsql-classified transient handshakes recover; authentication/configuration and
unknown failures stop immediately with safe diagnostics. Keep the returned runtime
pool warm; do not change production tracing/source timeouts or retry SQL writes.
Tests replace only the external connection handshake for policy cases; the real
PostgreSQL observer contract separately checks wiring/provider fidelity. These are
isolated startup-policy cases, not application persistence claims.

Identity fixture preflight must obtain a valid administration token, beyond a
master-realm HTTP page. At most eight five-second attempts within 60 seconds recover
transient timeout/transport or 408/429/502/503/504; 400/401/403 and other unexpected
responses fail immediately. The existing three-minute initialization deadline still
encloses all setup. HTTP/browser login and production provisioning budgets remain
unchanged. Only ephemeral admin authentication is repeated: uncertain responses may
issue extra short-lived fixture-admin tokens, bounded by eight and discarded, without
realm/user/business changes. No rejected-user login or provisioning mutation is retried.
No circuit breaker is added for these finite fixture startup phases. Policy doubles
return the external provider's HTTP statuses or transport failures; the real pinned
Keycloak fixture and existing code-flow/privacy tests establish provider fidelity.

Intended red evidence: database policy/real fixture suite had four failures out of
five (transient recovery, cancellation, exhaustion, runtime session); identity policy
had four failures out of seven (503, timeout, cancellation, exhaustion). Permanent
rejection cases already passed without retries. The controlled failed-booking case
raised JsonException instead of the required safe HTTP 503 fixture assertion.

The runtime-session assertion was checked against real PostgreSQL before warming
was implemented and failed as intended. Runtime/provisioning connections now have
different fixed application labels so a lingering schema session cannot satisfy
the contract. Only runtime connection opening is retried; the probe is read-only
and actual booking writes remain single-attempt. Permanent database failures are
sanitized rather than propagating private provider exception text.

Focused green evidence after repair: FixtureReadinessTests 5/5; all reservation
SecurityBrowserWriteTests 53/53 including controlled HTTP 503 diagnostic; the full
IdentityBootstrap project 34/34 including the real documentation flow, isolated
diagnostic privacy case and seven readiness policy cases. All had zero skips.
Warnings-as-errors solution build passed. Full unchanged-concurrency qualification
and required lint/format checks are recorded below when complete; no exact common
historical trigger or blanket freedom from flakes is claimed.

Source: working repair on parent 3161f5d, Windows/arm64, existing rootful WSL Podman,
6 CPUs and 7728 MiB guest memory, existing exploratory kind cluster retained.
No VM, DNS/trust or production timing policy was changed.

Latest T094 full-concurrency qualification is failed: Reservations.Tests passed,
but the shared identity fixture timed out in `provider.StartAsync`, before the new
authentication preflight. This caused 27 identity cases to fail at initialization.
Database provisioning's durable container replacement also exhausted its existing
setup deadline. These are distinct from the focused authentication/readiness
regressions and remain unresolved; do not mark the branch green. A concurrent VM
sample reported 3150 MiB available and 39 MiB swap use, which does not establish
resource exhaustion as the cause. The exploratory kind cluster was retained.
Final result: 596 total, 552 passed, 30 failed, 14 existing Windows skips,
8m49.796s. Integration.Tests contributed two additional failures; their detailed
diagnostics were not retained by the safe streaming filter, so their cause remains
unclassified. Do not infer they share the Keycloak startup cause. All disposable
containers cleaned up afterward; only the existing kind node remained running.
Latest mandatory format-check and lint passed, including the suggestion-level IDE
gate after removing two redundant generic type arguments. The zero-warning build
passed. These checks do not override the failed full-suite qualification.

- Intended red: coexistence delayedStartup=true reproduced 30-second expected versus
  1-second actual; normal false case passed. This preceded the recovery helper repair.
- Focused real-provider class: 19 passed, zero failed/skipped.
- Full backend command: `dotnet test --solution EquipmentReservation.slnx
  --max-parallel-test-modules 9 --no-build`; 583 total, 565 passed, four failed and
  14 existing Windows applicability skips, duration 7m26s. Integration.Tests passed
  in this run; Reservations.Tests and IdentityBootstrap.Tests each failed two cases.
  This is failed full-suite evidence, not a waiver or proof that the branch is green.
- Resource observation during the run: guest reported 3661 MiB available and 3 MiB
  swap use; kind used about 3.7 GB. These observations do not establish the cause of
  the connection/provider failures, and do not justify changing application deadlines.
- Full hosted Linux qualification remains pending after authorized commit/push.
- Format-check and lint passed, including zero-warning/error solution build and the
  suggestion-level style check. Documentation links and diff whitespace passed.
  Provider verification containers were cleaned up; only the existing kind node
  remained running afterward.

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
