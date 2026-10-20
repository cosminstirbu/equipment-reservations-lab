# CI outbox latency measurement repair

## Design before changes

The hosted failure in run 39412807716 reports 1666.1 ms for
`IdleWorkerPublishesWithinOneSecondWithoutAdvancingFallbackAndDrainsBusyInserts`.
The existing stopwatch begins before the first booking HTTP request and is read
after the HTTP response and publisher-channel observation. That interval includes
first-request authentication, routing/JIT, inventory and precommit database work,
plus response/observer scheduling; it does not isolate commit-to-publisher latency.
No production listener/worker defect has been established.

Keep the actual booking HTTP endpoint, authentication, application transaction,
PostgreSQL schema/notifications, listener and worker. The existing inventory HTTP
boundary and publisher transport seam retain their existing responsibilities;
publisher attempt time will be captured at entry, before observer scheduling.
The manual recovery schedule is not advanced. Keep two distinct events, completed
publication and maximum publisher concurrency one.

Proposed provider coordination: a test-only deferred constraint trigger on outbox
INSERT takes an advisory transaction lock. A separate test transaction holds that
lock. Observe the actual blocked advisory-lock request in the isolated database,
then take a monotonic timestamp immediately before releasing the holder transaction.
The booking transaction cannot commit before that timestamp, so requiring publication
within one second of this conservative lower bound is at least as strict as the
commit-to-publication requirement. No clock synchronization or production extension
is needed. The test releases the gate in finally and uses bounded condition waits.
A quality reviewer is assessing this design before implementation. Provider/build
execution waits for the coordinator's resource slot.

Applicable requirements: constitution II–IV, engineering testing public HTTP and
real-provider boundaries, condition-based bounded waits, formatting per edit,
resilience and observability. New tests must fail for the relevant wrong timing
boundary; preserve exact RED/GREEN evidence below rather than inventing prior runs.

## Design review and regression baseline

Independent quality reviewer `/root/quality` approved the conservative provider-gate
measurement with bounded independent cleanup, immediate publisher-entry timestamp,
HTTP 201 and persisted drain assertions. Coordinator agreed that the existing hosted
1666.1 ms failure is the regression RED for this measurement repair. No artificial
wall-clock delay or retrospective passing run is used as RED evidence. Exact commit
time is not directly exposed here: the lock-release timestamp is a lower bound,
so this test can conservatively fail under overload; its one-second limit remains.

Implementation adds a deferred constraint trigger only inside the isolated fixture
database, observes its advisory waiter scoped to the database/key/holding backend,
and proves no committed outbox row or publisher attempt exists before release.
The holder rollback releases the gate even on assertion/cancellation failure using
an independent five-second cleanup budget. The normal HTTP transaction and actual
production notification/listener/worker path remain intact. Attempts are timestamped
inside the publisher transport seam before any observer or HTTP-response wait.
The test still does not advance the fallback schedule, and additionally checks both
HTTP 201 responses and two durable published rows.

## Verification and limitations

`npm run format -- tests/Integration.Tests/OutboxNotificationTests.cs` passed.
The first sandboxed attempt failed because the .NET build host could not bind its
local IPC socket (SocketException 13); the same exact-file command passed with
approved local IPC access. This was an execution prerequisite, not a test RED.
`git diff --check -- tests/Integration.Tests/OutboxNotificationTests.cs` passed.

Focused real-provider GREEN (coordinator granted exclusive resource slot):

```sh
DOCKER_HOST=unix:///var/folders/6k/z9rq_rsj7gj5ghmy_rx43nzh0000gp/T/podman/podman-machine-default-api.sock TESTCONTAINERS_RYUK_DISABLED=true dotnet test --project tests/Integration.Tests/Integration.Tests.csproj --filter-class '*OutboxNotificationTests' --output Detailed
```

Exit 0: 18 passed, 0 failed, 0 skipped. The repaired test took 1252 ms overall,
while its conservative commit-release-to-publisher-entry interval was 3.1 ms.
Both actual HTTP bookings returned 201; the unadvanced manual fallback, idle wake,
busy insert drain, distinct events, two persisted published rows and concurrency-one
assertions passed. Existing listener disconnect/recovery, retry, multiple replicas,
rollback notification and shutdown cases also passed in this focused class.
The provider/build slot was released immediately afterward.

No production source changed. Changed files are this evidence record and
`tests/Integration.Tests/OutboxNotificationTests.cs`. No commits, pushes, publication,
host configuration or task/checklist verdict changes were made. Full format-check,
lint and application checks are coordinated by the parent after the parallel fixes
freeze; this focused result does not substitute for those final checks or hosted CI.
