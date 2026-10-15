# Tasks: Retire the Hello Walking Skeleton

**Input**: [spec.md](spec.md), [plan.md](plan.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/retirement.md](contracts/retirement.md), [quickstart.md](quickstart.md).

**Tests**: Retain positive booking/guard/persistence/telemetry coverage required by FR-007/009/010/011 and constitution. Test changed retained behavior first where applicable; internal refactoring retains passing expectations. Owner directed removal of absence-only old-feature tests on 2026-10-15; recorded red evidence stays historical. Do not invent replacement contracts for retired TTL/transient-store behavior.

**Ownership**: Coder owns source/test/current-doc changes and implementation evidence; coordinator owns final check orchestration, independent reviewer reports, convergence and acceptance metadata. No task authorizes deployment, external issues or historical evidence rewrites. Each source edit requires exact-path formatting before its next read/test/edit. Preserve task IDs/status after implementation begins.

## Phase 1: Setup

- [X] T001 Record baseline revision, Podman prerequisites, unchanged AppHost secret identity and historical evidence manifest in `specs/004-remove-hello/team/implementation-evidence.md`; inspect `src/AppHost/AppHost.csproj` without reading/exporting secret values (FR-006/008/011).
- [X] T002 Inventory dedicated/mixed hello tests and map each retained infrastructure/security/telemetry/privacy/accessibility concern to named booking tests in `specs/004-remove-hello/team/implementation-evidence.md`, using plan coverage table and `tests/Backend.Tests/`, `tests/Smoke.Tests/`, `src/Web/browser-tests/` (FR-007/009/010).

## Phase 2: Foundational shared-code preservation

Goal: make shared booking dependencies independent of hello terminology while keeping behavior tests green.

- [X] T003 Extract `src/HelloMessaging/EquipmentIdValidation.cs` from `HelloRequested.cs` and update Inventory/reservation/event consumers to preserve exactly "1–64 ASCII letters/digits/hyphen/underscore"; preserve passing public validation cases in `tests/Backend.Tests/InventoryTests.cs`, `tests/Backend.Tests/BookingTests.cs` and event-envelope tests (FR-004/005/009).
- [X] T004 Rename `src/HelloMessaging/` project/namespace to `src/ReservationMessaging/ReservationMessaging.csproj`, update `EquipmentReservation.slnx`, service/test project references/usings and affected `packages.lock.json` files; retain exact package versions, generated reservation JSON/regex/timestamp behavior and wire contract (FR-004/005).

Checkpoint: solution restores/builds and representative booking validation tests pass. Renaming alone must not change public expectations.

## Phase 3: User Story 1 — Bookings without connectivity demo (P1)

**Independent validation**: inspect root/handler/proxy removal; positive create/history/cancel/inbox tests retain keyboard and accessible feedback.

### Superseded baseline test tasks (historical IDs preserved)

The original absence-test deliverables are retired. T005/T006 checkboxes now track removal of those files/blocks and preservation of historical red evidence, not reimplementation or retention of the tests. No existing completed checkbox was present when this targeted update was applied.

- [X] T005 [US1] SUPERSEDED by explicit owner direction 2026-10-15: baseline HTTP retirement red evidence was recorded; remove `tests/Backend.Tests/HelloRetirementTests.cs` rather than retain an old-route absence suite. Historical red results in `specs/004-remove-hello/team/implementation-evidence.md` do not count as retained-test evidence (FR-002).
- [X] T006 [US1] SUPERSEDED by explicit owner direction 2026-10-15: baseline UI retirement red evidence was recorded; remove absence-only `src/Web/src/app/app.spec.ts` and appended negative block in `src/Web/browser-tests/booking.browser.spec.ts`, preserving positive booking tests and historical red evidence in `specs/004-remove-hello/team/implementation-evidence.md` (FR-001/002/007).

### Implementation and regression preservation

- [X] T007 [US1] Simplify `src/Web/src/app/app.ts` to render Booking; remove `hello.ts`, `hello-api.ts`, `hello.spec.ts`, `src/Web/browser-tests/hello.browser.spec.ts` and hello mapping in `src/Web/proxy.conf.cjs`; retain accessible booking content and ordinary SPA fallback without compatibility UI (FR-001/002).
- [X] T008 [US1] Remove hello POST/publisher registration/DTOs/context/logging from `src/Reservations/Program.cs`, `HelloPublisher.cs`, `ReservationsJsonContext.cs`, `ReservationsLog.cs`; remove transient lookup/store/consumer/DTO/context/logging from `src/Notifications/Program.cs`, `HelloConsumer.cs`, `NotificationStore.cs`, `NotificationsJsonContext.cs`, `NotificationsLog.cs`, preserving durable inbox and reservation worker health (FR-002/003/004).
- [X] T009 [US1] Retire hello-only `tests/Backend.Tests/ReservationsTests.cs`, `NotificationsTests.cs`, `tests/Smoke.Tests/HelloSmokeTests.cs`; remove hello setup/restart helper/assertions from `tests/Smoke.Tests/BookingSmokeTests.cs` while retaining all meaningful booking durability/concurrency/recovery assertions ; verify route removal by source inspection (FR-004/007).
- [X] T010 [US1] Preserve booking foreign-origin create/cancel coverage in `tests/Backend.Tests/SecurityBrowserWriteTests.cs` and `src/Web/browser-tests/booking.browser.spec.ts` while removing obsolete hello POST expectations; fill only demonstrated malformed/oversized/Inventory-failure coverage gaps in `tests/Backend.Tests/BookingTests.cs` and assert no rejected-write side effect (FR-007/009).

Checkpoint: focused API/UI/security tests pass. No successful hello handler or screen remains; existing booking scenarios still pass.

## Phase 4: User Story 2 — Operate without hello dependencies (P1)

**Independent test**: isolated start/restart/outage proves booking state and delivery survive; legacy broker artifacts remain idle and intact; retained health/telemetry remain useful.

- [X] T011 [US2] Adapt `tests/Smoke.Tests/BrokerContractTests.cs` to unchanged ReservationTopology for confirms, both routing keys and mandatory unroutable rejection; retain existing durable replay/invalid-envelope tests in `ReservationOutboxTests.cs` and `ReservationConsumerTests.cs`; remove hello TTL/cap expectations without introducing booking limits (FR-003/004/007/009).
- [X] T012 [US2] Add an isolated legacy-resource preservation scenario in `tests/Smoke.Tests/BookingSmokeTests.cs` or `tests/Smoke.Tests/RetainedBrokerStateTests.cs`: seed old queue/exchange/message before application startup, assert passive preserved existence/count after booking processing/restart; this fixture proves retained state and must not become an old-feature absence suite; preserve existing reservation/outbox/inbox state checks and never target developer data (FR-003/006).
- [X] T013 [US2] Extract shared factory to `src/ReservationMessaging/RabbitConnection.cs`, update publisher/subscription/health and tests, then remove hello topology constants/declaration, HelloRequested/IHelloPublisher, HelloTelemetry and orphan Equipment/MessagingJsonContext after usage audit; retain recovery-disabled factory settings and all reservation topology/envelope behavior (FR-003/004/005/009).
- [X] T014 [US2] Remove Equipment.Hello source/meter registration from `src/ServiceDefaults/Extensions.cs`; use retained reservation dependency metrics in `src/Reservations/DependencyHealth.cs`; preserve reservation health and change database capture control to a retained source in `tests/Backend.Tests/DatabaseTracingTests.cs`; replace/delete hello metric test in `tests/Backend.Tests/TelemetryTests.cs` based on existing booking bounded-dimension coverage (FR-003/007/010).
- [X] T015 [US2] Run booking operational/recovery, broker/outbox/consumer, database tracing/privacy and telemetry tests through production registration; record success, controlled failure and recovery cases plus safe bounded metric coverage in `specs/004-remove-hello/team/implementation-evidence.md` (FR-004/006/007/009/010).

Checkpoint: durable booking delivery and health recover without a hello consumer; isolated legacy resources/messages remain unchanged. Telemetry covers retained operations.

## Phase 5: User Story 3 — One current application story (P2)

**Independent test**: current instructions exercise bookings and shared naming; historical evidence remains unchanged and original reviews are not presented as approval of this change.

- [X] T016 [P] [US3] Replace active hello instructions in `README.md` and the formatter example in `docs/engineering/formatting-and-linting.md` with booking equivalents, keeping valid startup/test commands and explaining retained booking resilience/security without modifying mandatory engineering rules (FR-008).
- [X] T017 [P] [US3] Add `docs/history/hello-retirement.md` with separate retirement context/links and preserved secret-ID rationale; leave prior `specs/001-*`, `specs/002-*`, `specs/003-*` agreements/tasks/contracts/reviews/hashes byte-for-byte intact (FR-006/008).
- [X] T018 [US3] Rename current Web package identity in `src/Web/package.json` and matching `src/Web/package-lock.json` metadata to equipment-reservations; audit all tracked active source/tests/config/current docs for residual hello references and record each allowed secret/history/retirement/state-preservation-fixture reference in `specs/004-remove-hello/team/implementation-evidence.md` (FR-005/008).
- [X] T019 [US3] Reconcile concern-to-test coverage from T002 and compare historical artifact contents/hashes against baseline in `specs/004-remove-hello/team/implementation-evidence.md`; list retired obsolete-only expectations separately from preserved coverage (FR-007/008/011).

## Phase 6: Cross-cutting validation and completion gates

- [X] T020 Run `npm run format-check`, `npm run lint`, `npm run check`, `git diff --check` on the final source snapshot and record command/environment/exit/status in `specs/004-remove-hello/team/implementation-evidence.md`; resolve diagnostics without suppressions and invalidate affected evidence on fixes (FR-011).
- [X] T021 Execute booking Playwright/axe suite and keyboard review against the current discovered AppHost Web URL, following `specs/004-remove-hello/quickstart.md`; record browser/environment, create/history/cancel/inbox/security/focus results and current snapshot in `specs/004-remove-hello/team/implementation-evidence.md` (FR-001/004/007/009/011).
- [X] T022 Capture representative Aspire booking/cancellation database+publish/consume/inbox trace and controlled failure/health recovery evidence, using production telemetry registration and privacy inspection; record trace IDs and expected operation/context mapping in `specs/004-remove-hello/team/implementation-evidence.md` (FR-010/011).
- [X] T023 Coordinator freezes candidate snapshot and records independent quality/security verdicts and current convergence result under `specs/004-remove-hello/team/`; route any blocker to its owner and revalidate changed snapshots before passing gates (FR-011).
- [X] T024 Coordinator requests explicit acceptance of completed result, records the owner's actual decision in `specs/004-remove-hello/team/run-state.json`, then synchronizes `spec.md` Status and `tasks.md` consistently as metadata-only completion change; leave accurately named pending gates if acceptance is absent (FR-011).

## Dependencies and execution order

T001–T002 precede foundation. T003 precedes T004. T005/T006 are superseded historical work, not prerequisites or retained evidence; inspect removal of those test deliverables. T007/T008 precede cleanup T009/T010. US2 shares files with US1, so execute after US1 rather than concurrently. T011/T012 establish broker/preservation evidence before T013/T014 dependency cleanup; T015 validates them. US3 can draft disjoint docs after foundation, but final audit T018/T019 depends on US1/US2. T020–T022 follow complete source edits; T023 follows all evidence; T024 follows passing independent reviews/convergence and actual owner acceptance.

```text
Setup → Shared rename → US1 retirement → US2 operational preservation → final US3 audit
                       ↘ US3 disjoint docs in parallel ↗
→ final checks/browser/traces → independent reviews + convergence → owner acceptance
```

## Parallel examples

US1: T005/T006 are retired by owner direction; do not parallelize or recreate them. T007 client removal and T008 backend removal can be assigned independently only with explicit disjoint ownership.

US2: use sequential single-coder execution because topology/factory/tests overlap; reviewer read-only assessment can run separately only on a frozen snapshot.

US3: T016 current-doc edits and T017 separate history note have disjoint ownership and may run together. Never whole-repository format while other writers are active.

## Implementation strategy

Use one bounded coder batch, retaining positive behavior test-first/green checkpoints as applicable and source/configuration/documentation evidence for removal. US1 is the first demonstrable increment; the full authorized feature requires US2/US3 and final gates. No standalone partial release is requested. All 24 tasks follow checkbox/ID/path syntax; story-phase tasks carry US1/US2/US3 labels. Record skipped/unavailable checks as pending, never pass. Preserve completed task history when targeted repairs or convergence append work.

## Completion metadata — 2026-10-15

T001–T022 implemented and validated. T023 passed independent quality/security reviews and coordinator convergence on source manifest `2d340fae1e3d9849b9729d38772bdc3735ead780e130d73438d5365dea031a07`; no unresolved findings or buildable gaps. T024 completed after the owner explicitly accepted the completed result on 2026-10-15; see team/human-acceptance.md. Acceptance was recorded before setting spec Status to Complete. These completion metadata, task-marker and Status updates are metadata-only; reviewed source and historical review reports/hashes remain unchanged.
