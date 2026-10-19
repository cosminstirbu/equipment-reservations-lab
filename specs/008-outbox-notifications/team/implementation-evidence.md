# Implementation evidence

Assigned baseline: `5ab2ed2800b95a69f1522d617b510e3aeff47701` plus frozen feature 008 preparation artifacts. Coder owns T001–T024; coordinator owns T025–T026 and independent gates.

## Setup and test design (T001–T003)

Read AGENTS, protocol/coder role, constitution, engineering index and formatting/testing/ASP.NET Core/observability/resilience guides, plus feature spec/plan/tasks/research/model/contract/quickstart. SDK `dotnet --version`: 10.0.301. Explicit prerequisite check resolves `/Users/cosmin.stirbu/Desktop/codex-speckit-team/specs/008-outbox-notifications`. No extension hooks file. Requirements checklist 16/16 and reviewer-quality checklist 12/12 checked; read-only PASS. Existing ignore configuration covers build/test/generated/secrets artifacts; no publish package needed.

Podman socket inspection required sandbox escalation and returned `/var/folders/6k/z9rq_rsj7gj5ghmy_rx43nzh0000gp/T/podman/podman-machine-default-api.sock`. Tests use `DOCKER_HOST=unix://` plus that path and `TESTCONTAINERS_RYUK_DISABLED=true`.

Existing outbox/recovery/provider/telemetry tests inspected before extending. New `OutboxNotificationTests` uses public BackgroundService lifecycle with real worker, database/migrations, serialization, SQL, listener and schedule logic. Publisher boundary records/gates attempt entry only; existing real RabbitMQ cases retain responsibility for provider confirmation, failure and envelope fidelity. Manual IRecoverySchedule controls only external delays; no listener substitute or production state exposed. Tests use isolated scenario databases; xUnit's existing database fixture retains native parallel scheduling. Trigger tests enter through real Npgsql and HTTP insertion, inspecting commit/rollback signals; worker tests inspect publish entry, durable state, SQL session state and bounded timer requests. New file avoids expanding existing process-wide telemetry exclusions. Separate telemetry coder owns production-exporter evidence.

## Red/green execution

Pending; exact outcomes appended as observed. New behavior is not considered verified until intended red and green evidence exists. Author inspection/checks do not approve independent gates.

US1 intended RED: `DOCKER_HOST=unix:///var/folders/6k/z9rq_rsj7gj5ghmy_rx43nzh0000gp/T/podman/podman-machine-default-api.sock TESTCONTAINERS_RYUK_DISABLED=true dotnet test --project tests/Integration.Tests --no-restore -- --filter-class '*OutboxNotificationTests'` (escalated), exit 2; 2 failed, 0 passed, 0 skipped. InsertNotificationIsEmptyCommitOnlyAndRollbackIsSilent: WaitAsync false after commit, missing trigger. IdleWorkerPublishesWithinOneSecondWithoutAdvancingFallbackAndDrainsBusyInserts: expected 30s idle budget, actual10s. Real PG18.6 container readiness succeeded. Default sandbox command initially stalled and was cancelled; it is not test evidence. Style warnings identified for cleanup, no compile failure.

Combined phase checkpoint (telemetry coder run, before deadline/reconnect/telemetry implementation): `--filter-class '*OutboxNotification*'`, exit2, 8 total4 passed4 failed. US1 initial two tests PASS; empty/peer-locked90s accounting cases PASS after basic wake integration. Intended US2 RED: persisted4s retry requested30s; terminated listener recovery timed out. Intended US3 RED: revised snapshot admission lacks min(next_attempt_at); LISTEN native span present but short workflow parent absent. See telemetry-test-evidence.md for exporter case evidence.

Second combined run: 18 total17passed1failed, exit2. Migration upgrade/reapply/runtime no-DDL insert, one/five replicas, absent-trigger/manual-repair fallback, disabled/gated-publication shutdown and busy/backoff terminal auth cases pass. Idle terminal auth race exposed real Npgsql28P01 escaping worker when listener cancellation changed between catch-filter evaluation and outer OCE handler; added terminal-fault catch (no reschedule/false success). Cleanup regression fixed with explicit fixed UNLISTEN, independent3s cleanup budget and native admission; healthy pooled sessions unregister before return. Repeated transient probes signal state only on listening→degraded transition, not every failed reconnect.

Third combined run20 total19passed1failed, exit2. Terminal idle/busy/backoff auth race now PASS, mixed legacy/current claiming PASS. Transient burst test correctly observed listener1s/2s/10s but processing requested1s instead of expected degraded10s: connection-limit fault also blocked processing after Npgsql invalidated its pool on backend termination. Fixture now restores role connection capacity while listener remains in controlled failed-burst delay, then releases gated publication; this isolates actual degraded idle cadence from a separate processing database failure. No weakened expectation or source change.

Corrected focused new-suite GREEN: supported command `dotnet test --project tests/Integration.Tests --no-restore -- --filter-class '*OutboxNotification*'`, same provider env, exit0:20passed0failed0skipped in5.283s. An attempted optional `--report-trx --results-directory /tmp/outbox-notification-green` invocation yielded zero tests/exit5 (unsupported reporter extension configuration); this is not verification evidence and was replaced by the repository-supported runner command.

Production registration mutation sensitivity: temporarily removed only `.AddNpgsql()` from `src/ServiceDefaults/Extensions.cs`, exact-file formatted, then `dotnet test --project tests/Integration.Tests --no-restore -- --filter-method '*ProductionExportAdmitsListenAndSnapshotIgnoresSpoofPayloadAndPreservesEventParent'`, same provider env, exit2:1failed, missing native Npgsql LISTEN while workflow span alone remained. Restored exact original file immediately and reformatted. No production instrumentation change remains. This establishes native registration, rather than incidental ActivityListeners, is required for the evidence.

Retained recovery RED: `--filter-class '*ReservationRecoveryTests'`, exit2:60total44passed16failed. All16 failures are permanent-contract parking theories expecting10s idle after the unchanged first10s failure backoff, actual healthy idle30s. Updated only post-backoff and restarted healthy idle expectations to30s. Failure burst1s/2s/10s and initial permanent-error10s assertions unchanged; provider metadata/schema/auth tests and consumer budgets remained green. Design rationale: same public host/real PG collaborators, assertion changes follow accepted FR004 healthy fallback, not relaxed delivery/failure semantics.

## Required checks and exact latency observation

`npm run format-check`, provider environment above, exit0. `npm run lint`, same environment, exit0; solution builds with0warnings0errors and suggestion-level style verification passes. Explicit semantic style fixes were applied only to owned changed C# files (`dotnet format style EquipmentReservation.slnx --no-restore --severity info --include ...`) then inspected/formatted/tested. Changes are explicit types/block bodies/discards/method-group use; behavior assertions retained.

SC001 measured upper bound: native installed runner `dotnet tests/Integration.Tests/bin/Debug/net10.0/Integration.Tests.dll --filter-method '*IdleWorkerPublishesWithinOneSecondWithoutAdvancingFallbackAndDrainsBusyInserts' --report-xunit-xml --results-directory /tmp/outbox-latency --output Detailed --show-stdout All`, provider env above, exit0:1passed0failed. Observed **127.4ms** from before HTTP insertion through publisher entry (includes HTTP completion, thus bounds actual commit→attempt latency); controlled fallback was never advanced. XML artifact `/tmp/outbox-latency/cosmin.stirbu_CLJ1-LMC-IT-6834_2026-10-19_10_56_25.495122.xunit.xml`. Earlier `dotnet test ... -- --help` forwards help incorrectly with this SDK and exited134; direct installed runner help works, no application/test failure.

Current source hashes (SHA-256, before complete npm check):

```text
8fc3250e0119588b28245b28f3a5ca024bf4288be2bc3528a5c3bf9e3508d6aa OutboxWorker.cs
0a8f0c492f3e8f3203b5102e21519312bdd0ee5db8a30a1ea30ae7e17bd76214 OutboxListener.cs
8d321adb2ea60cbadbb3d88a79eb5cac64ebc3fb8bd32623addcc0395fb941db ReservationTelemetry.cs
2e1166250c46e0b9338cda29c65afafb178802768b250a202ebb0c70fc18f3a0 ReservationsLog.cs
7973356cc13cf354037ffdaf82d340df505d819eb2c04da275304d416a3036f6 ServiceMigrations.cs
b2d7ee7284706734b271a2c8159323862f3832b717277ec9d3d6190fa96cd9d8 002_outbox_notifications.sql
d4b82cbafab781e0f049e7bef50a0b65908284691f195cafa52fc1efb9529f50 OutboxNotificationTests.cs
2afbe913a5ed518027e99f603269722a1aaf4d20e535d2d14853f19c177b8308 OutboxNotificationTelemetryTests.cs
1ad2d36a2f6c3bfcbd1dc3c5e7c77b855ff87124e4fc85ad4c2f2433250d9ce6 ReservationRecoveryTests.cs
```

Author inspection: immutable001 unchanged; migration002 fixed empty payload/invoker rights/statement insert trigger, no privilege expansion; listening establishes before scan, signal consumed only before scan, no unbounded notification queue; strict-future snapshot shares ready timestamp and no extra idle query; due peer locks excluded from deadline, parked dates capped by fallback; linked terminal/shutdown cancellation bypasses retries and awaits listener disposal; independent publish/backoff and listener retries; no notification data/PID/raw provider text exported, only finite causes/outcomes; native AddNpgsql retained and mutation-proven; README and feature links/readability checked. Required independent reviews, convergence, manual Aspire and human acceptance remain coordinator-owned gates.

Complete first handoff `DOCKER_HOST=unix:///var/folders/6k/z9rq_rsj7gj5ghmy_rx43nzh0000gp/T/podman/podman-machine-default-api.sock TESTCONTAINERS_RYUK_DISABLED=true npm run check`, exit0 at the source hashes above / coordinator freeze snapshot164c3c (before appended convergence test repairs). Build0warnings0errors; tooling4/4; frontend60/60; backend475/475,0failed0skipped,9projects in parallel,2m37.943s. Integration module PASS in2m34.936s includes new20cases, latest native UNLISTEN success/privacy assertion, retained real RabbitMQ confirmation/outage/envelope/duplicate safety and updated permanent parked idle30sec expectations. No full-suite failure was rerun into success. No extension hooks file exists, so pre/post implementation hooks are skipped by installed skill rules.

Independent quality round1 requested test-only repairs Q008-001/Q008-002, appended as T027/T028 by coordinator convergence. These invalidate affected test gate evidence until repair revalidation; prior complete check remains historical, not approval of future edits. No production defect or policy exception was inferred. Coordinator retains manual Aspire, review closure, convergence and human acceptance ownership.

## Convergence repair T027 / Q008-001

Independent quality reviewer accepted the test-boundary design before authoring. New `CommitBetweenEmptyScanAndWaitPublishesWithoutAdvancingFallback` uses public worker lifecycle, real PostgreSQL transaction/insert trigger/listener/SQL/publication and a faithful cancelable external delay boundary. A bounded local ManualResetEventSlim gate holds only the synchronous timer-registration invocation after empty selection and before notification wait registration. The async test commits a genuinely staged durable event via CommitAsync, releases the local gate, observes the original event ID entering publication, and verifies durable published state without advancing fallback. The requested healthy timer is asserted30s. A finally block releases the gate and stops the worker on all assertion/commit failures. Gate timeout is diagnostic5s; no Task.Wait/Result, synchronous provider I/O, production hooks or fake listener is introduced. The test establishes commit-before-wait, not an unsupported claim that a client callback was already received. This adds regression coverage to unchanged production behavior; no artificial behavior change/red is invented. Pending targeted and full revalidation after coordinator manual no-build slot.

T027/T028 focused repair GREEN: `dotnet test --project tests/Integration.Tests --no-restore -- --filter-class '*OutboxNotification*'`, provider environment above, exit0:22passed0failed0skipped in7.432s. Q008-001 actual commit-before-wait and durable published result pass without timer advancement. Q008-002 real provider53300 listener interruption exports unavailable→recovered, degraded_poll wake cause, safe recovery workflow/native spans/logs and sanitized fields. Two test-only IDE0007/IDE0046 diagnostics were explicitly fixed then exact-file formatted/inspected; no production source changes. Final required gates rerun below on the repaired test revision. Coordinator manual browser/Aspire trace evidence is [manual-trace.md](manual-trace.md); it is coordinator-owned and not self-approved here.

Final repair revision is coordinator snapshot `8dcd843745c284b962b4b46f891c0f3a2e95a55e1276e2edd0f7cfece71bceda` (`implementation-review-round1.json`). `npm run format-check` exit0 and `npm run lint` exit0 on this revision, build0warnings0errors and suggestion gateclean. Test hashes now `436dc2200a600ddc69613d5c8760c1dc08d02e2eaf521335669216a0ad4413b5` (OutboxNotificationTests.cs) and `1c384eebbc48e63cbd154359d2b250dfab306676ce2cbcedbb0f321598b64ae4` (OutboxNotificationTelemetryTests.cs). Production hashes remain exactly those listed in the first handoff. Final complete check is running; no check has been skipped or waived.

## Final repaired handoff

On coordinator snapshot `8dcd843745c284b962b4b46f891c0f3a2e95a55e1276e2edd0f7cfece71bceda`, exact final command:

```sh
DOCKER_HOST=unix:///var/folders/6k/z9rq_rsj7gj5ghmy_rx43nzh0000gp/T/podman/podman-machine-default-api.sock TESTCONTAINERS_RYUK_DISABLED=true npm run check
```

Exit **0**: backend **477 passed, 0 failed, 0 skipped** across nine projects in parallel; total 2m26.487s, Integration 2m26.040s. Tooling **4/4**, frontend **60/60**, production build **zero warnings and errors**. Required `npm run format-check` and `npm run lint` also passed separately on the same repaired revision. Source/test hashes remain frozen; only task-completion and team evidence metadata follow. `git diff --check` passed. No required automated check is unavailable.

T027 author remediation evidence is complete: reviewer-approved public scheduling boundary, commit-before-wait, original durable event publication without fallback advancement, targeted 22-test green and complete 477-test green. T028 exporter repair is included in the same passing checks; its author evidence is telemetry-test-evidence.md, and closure/checkbox ownership remains coordinator/reviewer. No production changes were needed for these findings. Coordinator owns independent verdict closure, final convergence, manual acceptance records, T025/T026/T028 metadata and explicit human feature acceptance. This author handoff does not self-approve those gates.
