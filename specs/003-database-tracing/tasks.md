# Tasks: Database Operation Tracing

**Input**: `specs/003-database-tracing/` spec, plan, research, data model, telemetry contract and quickstart.

**Approved design**: plan SHA-256 `b8ca8afc6706560257b022a2e95f60415eed8b921d4af369f466ef6e66fb0214`; independent design reviews passed per coordinator. No implementation evidence is implied.

**Tests**: Required by FR-009 and constitution. Write/run failures before each new behavior. Tests add only export capture to production registration, never Npgsql sampling/source subscriptions/listeners. Existing generic fixture replacement must not bypass the production source policy.

**Organization**: Setup → privacy foundation → US1 coverage → US2 approved SQL → US3 durable evidence → independent completion gates. Coder owns implementation/evidence tasks only; reviewers/coordinator/human own their explicit gates. Each source edit requires immediate exact-file formatting/re-read.

## Phase 1: Setup

- [x] T001 Verify isolated PostgreSQL/Podman and current source baseline; record environment, intended test commands and all-path inventory in `specs/003-database-tracing/team/implementation-evidence.md` against `plan.md`.
- [x] T002 Add exporter-time span/log/resource/metric snapshot helpers in `tests/Backend.Tests/DatabaseTelemetryCapture.cs`, reusing `TelemetryPrivacyTests` patterns without adding activity subscriptions; configure real isolated connections through production registration and add `src/DatabaseBootstrap/DatabaseBootstrap.csproj` reference to `tests/Backend.Tests/Backend.Tests.csproj` for public provisioning coverage.

## Phase 2: Foundational privacy and test-first regression

**Purpose**: Do not turn on native database export before the privacy foundation exists.

- [x] T003 Add/run the initial failing equipment-list regression in `tests/Backend.Tests/DatabaseTracingTests.cs`: successful HTTP result through real production source, expected native Npgsql child span missing on baseline; record actual red output in `specs/003-database-tracing/team/implementation-evidence.md`.
- [x] T004 Add failing privacy/lifetime integration scenarios in `tests/Backend.Tests/DatabaseTelemetryPrivacyTests.cs` for sensitive parameters/results, unknown SQL with placeholder plus literal, server MESSAGE/DETAIL, client/connection failures, source/name/resource/log/metric fields, multiple exporters and repeated-host disposal. Tests must exercise real PostgreSQL and production registration without independent listeners.
- [x] T005 Implement shared fixed logical data-source construction/purpose and fail-closed command descriptor policy in `src/Persistence/DatabaseTracing.cs`: administrative purpose overrides text admission, unknown command uses `postgresql.command`, descriptor state stays in Activity custom properties, never exported baggage; preserve existing connection flags/time budgets and native connection tracing. Normalize exported DisplayName and metadata without changing actual configured database selection. Native immutable connection OperationName is internal and not serialized by the pinned OTLP exporter; keep it out of exported-field privacy snapshots and verify the actual wire-name boundary documented in `research.md`.
- [x] T006 Implement production Npgsql privacy processor/exception recorder in `src/ServiceDefaults/DatabaseTelemetryPrivacyProcessor.cs`: whitelist safe fields, redact exception message/stack before immutable event creation via production ExceptionRecorder with NO sampling callbacks, normalize status/name at end, initialize before DB use, drain before disposal, make repeated-host/global-listener behavior idempotent; no raw SQL/errors reach any exporter.

**Checkpoint**: Initial regression red evidence recorded; privacy components ready before native subscription activation. Existing application behavior retained.

## Phase 3: User Story 1 — Locate database work within a workflow (P1)

**Goal**: All current command paths visible with correct context, useful failure signal and no unsafe export.

**Independent test**: Real PostgreSQL API/worker/bootstrap operations export expected Client spans, parents, timing and safe outcome; handled failure leaves application behavior unchanged.

### Tests first

- [x] T007 [US1] Extend `tests/Backend.Tests/DatabaseTracingTests.cs` with failing reads/booking/cancellation/history/health cases across all services, multiple-command transaction coverage and controlled handled failure; assert expected operation identities and parent relationships, not only presence of some spans.
- [x] T008 [US1] Add failing worker tests in `tests/Backend.Tests/DatabaseWorkerTracingTests.cs` for snapshot/selection, publish update, retry reschedule, empty poll and inbox insert/dedup/history; verify real publication/consumer context and no unrelated reservation parent on polling.
- [x] T009 [US1] Add failing bootstrap/migration tests in `tests/Backend.Tests/DatabaseBootstrapTracingTests.cs` for all three provisioning source-construction paths, migration lock/ledger/apply/unlock, repeat migration and short-lived host export on both success and failure.

### Implementation

- [x] T010 [US1] Extract idempotent host-neutral production telemetry registration in `src/ServiceDefaults/Extensions.cs`, subscribe `.AddSource("Npgsql")`, register sanitizer before all exporters and preserve existing HTTP/workflow sources, sampler/logs/metrics/OTLP; wire runtime `AddDatabase` through the shared production source factory.
- [x] T011 [US1] Wire administrative and migration source purposes through every source-construction site in `src/DatabaseBootstrap/DatabaseProvisioner.cs`, preserving SQL execution and deadlines; administrative SQL always remains text-off, while migration sources remain eligible only for explicit reviewed admission.
- [x] T012 [US1] Start shared telemetry/host before provisioning and stop/flush/dispose on every exit in `src/DatabaseBootstrap/Program.cs` with independent bounded shutdown budget and real bootstrap context; preserve existing exit codes, safe source-generated logging and operation timeout. Inspect `src/AppHost/Program.cs` for existing OTLP injection and change wiring only if needed for bootstrap export.
- [x] T013 [US1] Run/fix scoped US1 regression/privacy tests and record path-by-path operations/parents/outcomes in `specs/003-database-tracing/team/implementation-evidence.md`; keep `src/Reservations/OutboxWorker.cs` and consumer context behavior intact, repairing only demonstrated tracing/context defects.

**Checkpoint**: Command spans and safe failure context work independently of SQL text admission; no approval to publish or stop feature work.

## Phase 4: User Story 2 — Useful diagnostics without data exposure (P1)

**Goal**: Reviewed parameterized SQL defaults on, can be disabled, and never leaks parameters, unsafe literals or administrative text.

**Independent test**: Real exported telemetry proves approved templates retain placeholders; unknown/admin SQL omitted; safe text off retains spans; distinctive sensitive data absent throughout export.

### Tests first

- [x] T014 [US2] Add failing SQL-policy/default/off tests in `tests/Backend.Tests/DatabaseTelemetryPrivacyTests.cs`: exact reviewed template including safe fixed literals, changed/unknown SQL, arbitrary migration SQL, explicit reviewed migration content, admin command identical to safe template, global off preserving all metadata/spans, sensitive parameter/result absence.
- [x] T015 [US2] Add failing real provisioning privacy tests in `tests/Backend.Tests/DatabaseBootstrapTracingTests.cs`: distinctive role-password literal in ALTER ROLE, controlled server error message/detail and service migration eligibility during bootstrap; inspect all exports including names/events/status/resources/logs/metrics and require safe operation spans with no admin text.

### Implementation

- [x] T016 [US2] Define reviewed shared SQL constants/descriptors in `src/Inventory/EquipmentStore.cs`, `src/Reservations/ReservationStore.cs`, `src/Reservations/OutboxWorker.cs`, `src/Notifications/ReservationInbox.cs` and health policy in `src/ServiceDefaults/Extensions.cs`; exact text matches only, bounded safe operation names, no duplicated diverging SQL catalog or behavior changes.
- [x] T017 [US2] Add explicit reviewed embedded resource/content digest admission and ledger/lock descriptors in `src/Persistence/SqlMigrations.cs` and service `ServiceMigrations.cs` files; new/changed/unreviewed content remains text-off. Review actual committed `.sql` scripts including seed literals without altering their bytes/checksums.
- [x] T018 [US2] Wire `DatabaseTracing:CaptureSqlText` / `DatabaseTracing__CaptureSqlText` default true into production web/bootstrap source policy in `src/ServiceDefaults/Extensions.cs` and `src/DatabaseBootstrap/Program.cs`; enforce false and administrative override in `src/Persistence/DatabaseTracing.cs` before export, preserving operation metadata.
- [x] T019 [US2] Run/fix US2 real-DB privacy scenarios and record complete field-surface results and reviewed SQL scope in `specs/003-database-tracing/team/implementation-evidence.md`; do not record secret sentinel values or raw sensitive failures.

## Phase 5: User Story 3 — Prevent missing visibility from recurring (P2)

**Goal**: Production regression fails when collection registration is removed; runtime evidence reconciles every path.

**Independent test**: Fresh-process missing-subscription mutation fails for missing native spans, restored production registration passes; Aspire shows representative commands including bootstrap after exit.

- [x] T020 [US3] Execute the missing-registration mutation against `src/ServiceDefaults/Extensions.cs` and focused `tests/Backend.Tests/DatabaseTracingTests.cs` in an isolated fresh test process: remove only production Npgsql subscription, record expected missing-span failure, restore exact source, format/re-read and rerun; production exception recorder must not activate spans. Save commands/results/revision in `specs/003-database-tracing/team/implementation-evidence.md`.
- [x] T021 [US3] Perform `specs/003-database-tracing/quickstart.md` runtime validation using installed Aspire lifecycle/monitoring skills, exact AppHost and discovered endpoints; record API reads/writes/cancel, publish/consume, health, empty poll, startup migration/admin provisioning, safe controlled failure, SQL-off and bootstrap spans after process exit in `specs/003-database-tracing/team/runtime-evidence.md` with trace IDs/links and coverage mapping.
- [x] T022 [US3] Document safe SQL setting, admission/maintenance rules, source coverage and no internal transaction-control-span promise in `specs/003-database-tracing/quickstart.md` and repository `README.md` where local diagnostics are described; do not modify Spec Kit templates or weaken engineering guides.

## Phase 6: Polish and independent completion gates

- [x] T023 Run final `npm run format-check`, `npm run lint`, `npm run check`, `git diff --check`; inspect generator/analyzer diagnostics and record exact candidate/environment/exit results in `specs/003-database-tracing/team/implementation-evidence.md`. Fixes require immediate formatting, affected revalidation and fresh snapshots.
- [x] T024 Coordinator freezes current candidate and obtains explicit independent quality/security verdicts with revision-matched test, privacy and runtime evidence; persist reports/findings and state in `specs/003-database-tracing/team/` (reviewers own verdicts; coder cannot check this on their behalf).
- [x] T025 Coordinator runs installed speckit-converge after implement on current `specs/003-database-tracing/tasks.md`, records current gap assessment in `specs/003-database-tracing/team/`, routes appended work and revalidates affected gates; preserve completed task IDs/history.
- [x] T026 Coordinator requests and records explicit human acceptance in `specs/003-database-tracing/team/human-acceptance.md`; keep this pending until the owner actually accepts, then synchronize `specs/003-database-tracing/spec.md`, `tasks.md` and team state with metadata-only completion status while preserving historical review hashes.

## Dependencies and execution order

T001 → T002 → T003/T004 → T005 → T006. US1 tests T007–T009 precede T010–T012; those depend on the privacy foundation. T013 validates US1. US2 tests T014–T015 precede T016–T018; T019 validates US2. US3 T020–T022 follows working US1/US2. T023 precedes frozen review T024, convergence T025 and human acceptance/metadata T026. Any source change invalidates affected evidence and reviews.

US1 is the smallest useful diagnostic increment, with privacy foundation mandatory; the authorized feature includes all three stories and every scope path. SQL-policy tests can be authored earlier if needed to establish intended red results. No story's green checkpoint authorizes external publication.

## Parallel opportunities

No task is marked [P]: one coder owns the shared tracing/source pipeline and several tests depend on the same registration. Avoid concurrent execution that introduces process-global ActivitySource subscribers into mutation proof.

After foundation, limited separate-file test authoring may be delegated explicitly: US1 API tests T007 and worker tests T008; US2 policy tests T014 and bootstrap tests T015. Run registration/mutation tests in isolation. US3 runtime observation T021 may accompany read-only evidence review only after the candidate is frozen; source fixes serialize and invalidate evidence. Format only owned files.

## Implementation strategy

Record intended red failures first; establish fail-closed privacy; enable native collection; prove all command paths/context; admit reviewed SQL; prove off/admin/unknown behavior; then mutation, runtime evidence and full checks. Maintain small coherent batches and readable code. Do not add suppressions, raw exception logs or a SQL heuristic to clear tests. Route missing requirements to coordinator, design defects to architect, and gate verdicts to independent reviewers. Do not commit, merge, publish, deploy or create external issues without separate authorization.

## Phase 7: Independent review repair

- [x] T027 Repair Q-001 per Constitution V and correlated-observability guidance: add intended failing real-subprocess OTLP assertions matching success/failure bootstrap outcome log trace/span IDs to the root workflow; emit provisioning failure logging while that workflow remains active, preserve one safe startup-failure log and existing exit codes/privacy, refresh affected tests and full checks, and obtain original verifier closure. Preserve earlier task history and reviewer snapshots.

## Phase 8: Owner-requested documented registration

Historical T005/T010/T020 registration references describe the prior implementation. This authorized delta supersedes the registration mechanism without changing requirements or privacy behavior; T026 remains the explicit human acceptance gate.

- [x] T028 Replace the sole production Npgsql subscription with `.AddNpgsql()` in `src/ServiceDefaults/Extensions.cs`, reference `Npgsql.OpenTelemetry` 10.0.3 in `src/ServiceDefaults/ServiceDefaults.csproj`, refresh affected generated lockfiles and align diagnostic documentation as needed. Preserve native instrumentation, all privacy controls and exporter ordering; use existing supported callbacks and no duplicate subscription. Follow the approved targeted plan/research/contract update.
- [x] T029 Revalidate the behavior-preserving registration delta using the existing 18 focused real-PostgreSQL API/worker/bootstrap/privacy cases; remove only actual production `.AddNpgsql()` in a fresh-process mutation, verify missing native spans with working application/control export, restore exact source and obtain green. Run required `npm run format-check`, `npm run lint`, `npm run check`, `git diff --check`; record commands/results/current source identity in `team/implementation-registration-delta.md`. Coder owns T028–T029, not independent verdicts.
- [x] T030 Coordinator captures representative Aspire command/bootstrap and SQL-off/restored runtime evidence on the updated binaries using installed Aspire skills, freezes the updated manifest, obtains independent quality/security delta verdicts, runs `speckit-converge` on current tasks and synchronizes gate metadata while preserving historical evidence. Record in `team/`; do not infer acceptance or perform external publication. T026 stays pending until the owner accepts the reviewed feature.


## Prospective testing-policy supersession — feature 007

On 2026-10-16, the owner approved [feature 007’s testing policy](../007-aspire-independent-tests/supersession.md), which supersedes this document’s automated Aspire/AppHost and manifest-publication obligations and retired Smoke.Tests paths. Retained application/provider guarantees have [replacement coverage](../007-aspire-independent-tests/team/coverage-disposition.md); local orchestration is verified manually. Deployment manifest support is outside scope. Original requirements, task markers, acceptance status, review hashes, and evidence above remain historical records; they do not approve feature 007.
