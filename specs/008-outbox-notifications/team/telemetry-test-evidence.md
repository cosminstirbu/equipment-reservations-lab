# T018/T019 telemetry test evidence

## Scope and design record

Assigned ownership: `tests/Integration.Tests/OutboxNotificationTelemetryTests.cs` and this evidence record only. No production source, shared support, checklist verdicts or task checkboxes changed. Applicable standards read: constitution, team protocol, engineering formatting, testing, ASP.NET Core, observability and resilience; feature spec, plan/test design, research, data model, contracts, quickstart and tasks. Explicit feature resolution via `SPECIFY_FEATURE_DIRECTORY="$PWD/specs/008-outbox-notifications" .specify/scripts/bash/check-prerequisites.sh --json --require-tasks --include-tasks` resolved feature 008. No extension hooks file exists. Preparation checklists have no unchecked items.

Tests use public hosted application lifecycle and `ReservationStore.ConfirmAsync`, real PostgreSQL 18.6, production migrations, worker, listener, database tracing/privacy and production AddNpgsql collection. Existing `DatabaseTelemetryCapture` adds exporters, never missing instrumentation. Publisher double records the async publication boundary only; existing real RabbitMQ contracts establish provider fidelity, and these tests do not claim broker behavior. A gate implements the public delay boundary and a supplied clock controls deadlines; no private worker state or mocked notification listener is used. Process-wide exporter/meter observation requires the same narrow class exclusion as existing database telemetry tests. No solitary application tests added.

Observable contracts: native LISTEN span with short workflow parent, fixed admitted SQL including revised snapshot, notification payload ignored and absent from all exported fields, preserved stored producer parent, bounded wake/listener dimensions; real schema failure exports admitted operation and sanitized provider exception; three healthy 30-second scans yield six total exported native SQL operations with no hidden heartbeat/deadline queries or locked-overdue-row spin.

## Test-first RED

Before listener, revised snapshot or wake telemetry implementation:

```sh
DOCKER_HOST=unix:///var/folders/6k/z9rq_rsj7gj5ghmy_rx43nzh0000gp/T/podman/podman-machine-default-api.sock TESTCONTAINERS_RYUK_DISABLED=true dotnet test --project tests/Integration.Tests --no-restore -- --filter-class '*OutboxNotificationTelemetryTests'
```

Escalated process exited 2: 3 tests, 3 failed, 0 passed, 0 skipped. Real PostgreSQL readiness succeeded. Successful-listener export case failed at missing native `outbox.listen`; both empty/peer-locked idle rows failed expecting 30-second delay versus actual ten seconds. Thus missing production behavior, not infrastructure or compilation, produced RED. Author formatting command `npm run format -- tests/Integration.Tests/OutboxNotificationTelemetryTests.cs` completed with exit 0. Initial compiler identified IDE0008 and CA1861, explicitly repaired afterward.

Further focused RED, green and final checks are recorded below as executed. The main coder owns full repository handoff checks.

Second test-first run, after basic US1 listener but before revised snapshot, recovery and telemetry implementation:

```sh
DOCKER_HOST=unix:///var/folders/6k/z9rq_rsj7gj5ghmy_rx43nzh0000gp/T/podman/podman-machine-default-api.sock TESTCONTAINERS_RYUK_DISABLED=true dotnet test --project tests/Integration.Tests --no-restore -- --filter-class '*OutboxNotification*'
```

Escalated process exited 2: 8 tests, 4 passed, 4 failed, 0 skipped. Both idle-accounting cases passed: six total native SQL spans during three 30-second controlled intervals, with and without a peer lock. Revised-snapshot schema-fault case failed because exported SQL lacked `min(next_attempt_at)`; LISTEN export case failed because native LISTEN had no workflow parent yet. Main coder's future-retry/reconnect cases provided their intended RED (four-second retry expected versus 30-second fallback; reconnect delivery timeout). My test file produced no analyzer warnings in this second build.

## Focused GREEN

After the main coder implemented revised deadlines/recovery and telemetry, the same combined command above exited 2 with 13 total, 12 passed, 1 failed, 0 skipped. **All five telemetry cases passed**: successful LISTEN/privacy/correlation/metrics, failed revised snapshot with sanitized `42P01`, listener authentication setup failure with sanitized `28P01` and terminal outcome, and both empty/peer-locked SQL-accounting cases. No analyzer warning originated in this worker's test file. The one failure belonged to the main coder's shutdown/session-cleanup assertion (expected zero sessions, actual PID 100); this was reported directly rather than rerun into success. Overall integration green remains the main coder's responsibility after correction.

## Evidence limits

Native Npgsql command spans capture application SQL plus connections, but current empty-transaction disposal does not export BEGIN/ROLLBACK protocol spans. The idle test asserts **all** native operations in the steady window, including absence of additional commands or reconnects; six statements over a controlled 90-second equivalent contrasts with the existing two-per-ten-second baseline of eighteen. It does not claim observed wire-protocol message totals. One-time native LISTEN/connect and initial snapshot/select precede the steady-window baseline; transaction control overhead must be reported separately and honestly.

LISTEN has no channel ACL or table lock, so an ordinary isolated schema/permission fault cannot reliably fail this fixed command. Coordinator/architect are evaluating targeted evidence clarification: retain successful real LISTEN, real failed revised snapshot with sanitized exception events, and a real listener setup fault. No fabricated PostgreSQL exception is used.

Removing production AddNpgsql sensitivity check remains pending until the main coder performs the exclusive production-file mutation and restore; this worker does not own production registration and will not mutate it concurrently. Repository `format-check`, `lint`, `check` are main-coder/coordinator handoff gates and have not been independently claimed by this worker.

## Main coder follow-through

The preparation clarification is approved and independently revalidated: successful LISTEN + real failed listener open + controlled failing revised snapshot establish dependency coverage without an artificial PostgreSQL exception. Production AddNpgsql-removal sensitivity has now been executed by the main coder: native LISTEN disappears and the focused exporter test fails, while workflow-only tracing remains. Exact command/outcome and immediate restore are in [implementation evidence](implementation-evidence.md). All20 notification tests passed after session cleanup repair. A native admitted `outbox.unlisten` success/privacy assertion has also been added after ownership handoff; final full-suite green will establish that latest assertion. No independent reviewer verdict is supplied here.

## Repair round 1 — T028 / Q008-002

Coverage repair design: `InterruptedListenerExportsDegradedPollingAndCorrelatedSafeRecovery` retains the production host, real listener/worker, instrumented data source and production exporters. A scoped PostgreSQL LOGIN role has only outbox SELECT/UPDATE authority; while the external publisher boundary holds the processor connection, the test limits new role connections and terminates the exact listening session. Actual PostgreSQL reconnect failures produce SQLSTATE 53300. Individually resumable public delay gates hold reconnect independently from degraded processing; restoring the role before completing publication avoids conflating listener failure with processor pool recovery. Advance a real degraded idle timer, then release reconnect and observe restored healthy cadence.

Contractual assertions cover actual exported unavailable→recovered listener dimensions, degraded_poll wake cause, safe structured recovery log messages, error/success workflow parents for native failed connects/recovered LISTEN, sanitized exception events and absence of credentials, role identity, connection strings and raw provider fault text across exported fields. Existing bounded-dimension checks also apply to the complete recovery scenario. No ActivityListener or test-only missing instrumentation is added. No production behavior changes are proposed, so an artificial RED would misrepresent this coverage-only repair; actual focused green and existing production-registration sensitivity provide the relevant evidence. The prior UNLISTEN assertion is preserved.

After the coordinator released the stopped manual AppHost and the main coder confirmed the exclusive build slot, ran:

```sh
DOCKER_HOST=unix:///var/folders/6k/z9rq_rsj7gj5ghmy_rx43nzh0000gp/T/podman/podman-machine-default-api.sock TESTCONTAINERS_RYUK_DISABLED=true dotnet test --project tests/Integration.Tests --no-restore -- --filter-class '*OutboxNotification*'
```

Exit 0: **22 passed, 0 failed, 0 skipped**, duration 7.432 seconds. T028 passed on its first run, including actual exported recovery counter attributes, structured unavailable/recovered log messages, native connect failures with sanitized 53300 exception events and workflow parents, recovered native LISTEN with successful setup parent, degraded polling and all-fields privacy assertions. T027 also passed in this combined run. Owned test SHA-256: `1c384eebbc48e63cbd154359d2b250dfab306676ce2cbcedbb0f321598b64ae4`. No warning originated in the owned telemetry test file; two diagnostics in the main coder's T027 file (IDE0007 line 491, IDE0046 line 541) were reported directly for repair before final gates. The slot was released to the main coder immediately after completion.

`npm run format -- tests/Integration.Tests/OutboxNotificationTelemetryTests.cs` exited 0 after the edit; formatted source was re-read and inspected. `git diff --check` exited 0. Existing AddNpgsql-removal sensitivity remains relevant: this new test also requires actual native spans, not workflow-only spans, and no missing production instrumentation was added by the test. No additional mutation was needed or performed. No production behavior changed during this repair; no RED is claimed. Full repository handoff gates and independent finding closure remain coordinator/main-coder/reviewer responsibilities. Owned source and this evidence record are frozen for re-review.
