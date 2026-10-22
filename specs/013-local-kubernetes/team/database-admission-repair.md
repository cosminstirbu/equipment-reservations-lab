# Database setup admission repair

Owner request: fix the six setup-capacity failures in PR 15 run 39774205942,
source `555b608`. Bounded test-infrastructure repair; no feature acceptance,
remote execution, commit/push or VM changes are implied.

## Evidence and decision

The hosted check completed 577 cases: 571 passed and six Reservations cases failed
at PostgresFixture's 60-second semaphore wait, before obtaining provisioning
capacity. All six report the same admission exception, rather than SQL/business
assertion failure. Reservations ran for 116 seconds and the backend run for 263
seconds. Notifications and BrokerBootstrap passed in this run.

The existing four-slot capacity was selected from earlier measured provisioning
pressure; retain it and the native parallel scheduler. Ranked explanations are a
healthy setup backlog exceeding the admission timeout, slow active work holding
slots, or a missing release. Inspection found an existing finally release but
database creation outside the migration deadline. A controlled progressing queue
reproduces the exact timeout without any database or slow-operation failure.
This establishes the admission-policy defect, not the full hosted server-side
timing distribution.

Separate admission and active-work budgets. Admission now has a finite five-minute
bound, allowing the already observed backend-duration workload to queue behind four
leases. This is a setup scheduling allowance, not a five-minute database operation
or an application timeout increase. Once admitted, the existing 60-second setup
budget now starts before CREATE DATABASE and flows through database creation,
extension and migrations. Application connections/commands remain 3/5 seconds;
setup connection/command settings remain 30/30 seconds. No operations are retried.

Admission failure reports waited milliseconds, active/pending counts and completions
while waiting; these fixed numeric fields reveal progress without SQL, names,
credentials or raw provider exceptions. Active deadline failure has a separate safe
phase. Caller cancellation propagates and leases release in finally on every
admitted exit. Counters are concurrent observations, not a transactional snapshot.
Operations retain cancellation-aware Npgsql APIs; no abandoned background database
work or circuit breaker is introduced.

## Test boundary and chronology

The internal fixture admission helper is a concurrency/deadline algorithm. Its
public RunAsync boundary retains the real semaphore, cancellation and admission/
operation policy. Controlled operations model setup occupancy, not database or
business semantics. A thread-safe one-shot timer TimeProvider replaces only time
and drives the same CancellationTokenSource timer contract. No wall-clock sleeps
or live services are required. This solitary boundary is justified by deterministic
concurrency-policy verification; it does not replace existing real PostgreSQL and
production-migration integration suites.

The tests live in the existing BrokerBootstrap assembly because it can execute
shared-infrastructure policy tests without eagerly starting an assembly-wide
PostgresFixture. An initial attempt in Persistence.Tests failed its missing Docker
prerequisite before entering the tests; those failures are not intended-red evidence.
No fixture was disabled, provider substituted or assembly scheduling changed.

The initial helper retained the old 60-second admission and finally-release behavior.
Before implementing recovery, the provider-independent four-test class had two
intended failures: a healthy four-slot, 17-scenario backlog expired queued work after
61 simulated seconds, and active work had no independent timeout. The exact backlog
case failed with the original "Database scenario provisioning did not acquire setup
capacity" exception in 15ms, command exit 2:

`dotnet test --project tests/BrokerBootstrap.Tests/BrokerBootstrap.Tests.csproj --no-build -- --filter-method '*HealthyFourSlotBacklogCanTakeMoreThanOneMinuteToAdmitAllScenarios'`

After separating budgets and wiring the fixture, the backlog succeeds with the
same four slots. Coverage also checks active cancellation/deadline plus subsequent
admission, four successive failures releasing all capacity, cancellation before
entry, and bounded five-minute admission failure with safe progress fields when
occupants remain stuck. The latter deliberately controls occupants independently
of cancellation to test the queue bound, not to claim uncooperative operations
can be forcibly terminated.

Final focused command on Windows arm64 / .NET SDK 10.0.301:
`dotnet test --project tests/BrokerBootstrap.Tests/BrokerBootstrap.Tests.csproj -- --filter-class '*DatabaseProvisioningTests'`:
exit 0, five passed, zero failures/skips, 1.110 seconds. Formatting and analyzer
verification are recorded at handoff below. No debug instrumentation was added.

## Qualification

Final `npm.cmd run format-check`: exit 0. Final `npm.cmd run lint`: exit 0,
solution build zero warnings/errors and remaining ESLint/style verification passed.
Author inspection confirmed token propagation through CREATE DATABASE, extension
and all three migrations, unchanged returned application connection settings,
four-slot capacity, finally release and safe numeric-only admission diagnostics.
`git diff --check` passed. No changes were made to application production code,
workflow scheduling or tests' business assertions.

Existing Podman read-only info probe still fails its configured socket connection.
No runtime was started or changed. Real PostgreSQL/full-suite verification remains
pending; the focused algorithm regression is not equivalent to a successful hosted
workload qualification. Existing feature acceptance gates remain pending.
