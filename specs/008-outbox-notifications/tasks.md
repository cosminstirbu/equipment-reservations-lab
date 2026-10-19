# Tasks: Prompt Outbox Wake-ups

**Input**: Approved preparation design in `specs/008-outbox-notifications/`: spec.md, plan.md, research.md, data-model.md, contracts/notifications.md and quickstart.md.

**Tests**: Required by the confirmed specification and constitution. For every new behavior, retain intended failing test command/output before implementing it, then green evidence at the tested revision. Follow the plan's test design record and existing parallelism rules. No task author may approve independent review or invent human acceptance.

**Format**: `- [ ] Tnnn [P?] [USn?] Description with file path`. `[P]` means disjoint files and no dependency on another unfinished task in its group. Existing branch and explicit feature 008 remain active. Do not rewrite completed IDs/status during repairs.

## Phase 1: Setup

- [X] T001 Confirm pinned SDK and Podman provider prerequisites, read required guides, and record exact commands/environment plus the approved baseline in `specs/008-outbox-notifications/team/implementation-evidence.md`; inspect existing `tests/Integration.Tests/ReservationOutboxTests.cs`, `ReservationRecoveryTests.cs` and `ReservationTelemetryTests.cs` for extensions rather than duplicate coverage.
- [X] T002 Record concrete test-case-to-behavior/boundary mapping against the design record in `specs/008-outbox-notifications/team/implementation-evidence.md`, including real internal collaborators, any faithful publisher/time boundary doubles, provider contracts, parallel isolation and red-before-green sequence.

## Phase 2: Foundational prerequisites

No new package, infrastructure, persistence model or authorization framework is needed.

- [X] T003 Add only necessary scoped scheduling/observation support in `tests/TestSupport/` for host lifecycle, publisher attempt gates, independent worker clocks and exported telemetry; preserve real listener/database behavior, production telemetry registration and parallel-safe scenario isolation. Retain existing provider fixtures and avoid public production state exposed solely for tests.

## Phase 3: US1 — Deliver committed events promptly (P1; MVP)

**Goal**: Commit wakes a healthy idle worker without waiting for fallback; coalescing cannot lose durable work.

**Independent criterion**: Real insertion commit through an existing path starts a publish attempt within one second under the spec's conditions; open/rollback transactions do not publish, and rows inserted while busy/transitioning to idle drain without fallback advancement.

### Tests first

- [X] T004 [US1] Add real PostgreSQL trigger contract cases in `tests/Integration.Tests/ReservationOutboxTests.cs` proving no signal before commit/after rollback, empty payload after commit, insertion-path and multirow coverage; retain intended red evidence (FR-001; SC-003).
- [X] T005 [US1] Add hosted-worker real PostgreSQL prompt-wake and busy/idle-transition race cases in `tests/Integration.Tests/ReservationOutboxTests.cs`, observing publisher entry/durable results and coalescing without private-order assertions; retain red evidence and separate real one-second latency observation from schedule-controlled wake proof (FR-002–003; SC-001, SC-003).

### Implementation and evidence

- [X] T006 [US1] Add immutable additive `src/Reservations/Migrations/002_outbox_notifications.sql` with an invoker-rights insert-only statement trigger calling fixed `pg_catalog.pg_notify('reservation_outbox_changed', '')`, register reviewed SHA-256 in `src/Reservations/ServiceMigrations.cs`, and preserve all existing outbox columns, constraints and migration 001 (FR-001, FR-009–010).
- [X] T007 [US1] Implement dedicated instrumented connection setup and continuous bounded `WaitAsync` receive in `src/Reservations/OutboxListener.cs`; complete autocommit LISTEN before scan readiness, ignore payload/PID, coalesce one pending signal consumed only before scan, hold state/fault independently, and register its lifetime in `src/Reservations/Program.cs` if needed (FR-002, FR-007, FR-012).
- [X] T008 [US1] Integrate listener signals with `src/Reservations/OutboxWorker.cs`, retaining sequential SKIP LOCKED claiming, immediate drain after success and release of processing transaction/connection before wait; admit fixed LISTEN SQL through the existing command descriptors and instrumented source (FR-002–003, FR-009).
- [X] T009 [US1] Run US1 focused cases against real PostgreSQL and retained broker contracts; record green results, exact one-second observation and race evidence in `specs/008-outbox-notifications/team/implementation-evidence.md` (SC-001, SC-003).

**Checkpoint**: Validate prompt wake independently; the MVP is an internal milestone, not feature acceptance or deployment authorization.

## Phase 4: US2 — Recover without losing durable work (P1)

**Goal**: Recover from missed signals/listener failure and honor durable retry schedules and failure protections.

**Independent criterion**: Existing/retry rows publish across restart/reconnect without new inserts; failure backoff remains intact, degraded polls occur every ten seconds, permanent faults halt and cancellation releases resources.

### Tests first

- [X] T010 [US2] Extend `tests/Integration.Tests/ReservationRecoveryTests.cs` with real PostgreSQL startup/reconnect existing-work, future retry/restart, already-due peer-locked no-spin, parked row and manual-repair/missed-signal fallback cases; retain intended red evidence (FR-004, FR-007; SC-003).
- [X] T011 [US2] Extend `tests/Integration.Tests/ReservationRecoveryTests.cs` with real scoped listener failure, bounded jittered reconnect bursts, ten-second degraded idle polling, overlapping publisher backoff/reconnect, and permanent database fault halt cases; retain red evidence including terminal failure while idle/backoff/busy (FR-005–006; SC-003, SC-005).
- [X] T012 [US2] Add shutdown cases in `tests/Integration.Tests/ReservationOutboxTests.cs` for passive wait, reconnect delay, backoff and gated publication, plus disabled messaging; assert scoped session cleanup and uncertain row remains pending, retaining intended red evidence (FR-008–009; SC-005).

### Implementation and evidence

- [X] T013 [US2] Extend the existing snapshot SQL in `src/Reservations/OutboxWorker.cs` with parameterized minimum strictly future unpublished `next_attempt_at`, preserving pending/oldest metrics; wait for minimum of absolute retry deadline and 30-second healthy/ten-second degraded fallback without extra idle queries, locked-row spin or far-future overflow (FR-004, FR-011; SC-002–003).
- [X] T014 [US2] Implement independent bounded listener recovery in `src/Reservations/OutboxListener.cs`: three-second setup/command budgets, three transient attempts per burst with 1s/2s base jitter 0.75–1.25, ten-second failed-burst delay, no heartbeat SQL, dispose failed connection before reconnect and rescan only after LISTEN succeeds (FR-006–007; SC-003).
- [X] T015 [US2] Preserve existing publish/database failure delay, persisted retry/parking and three-second publish budget in `src/Reservations/OutboxWorker.cs`; ordinary notifications/reconnect cannot shorten backoff, permanent listener faults interrupt waits/attempt and halt observably, and shutdown awaits listener cleanup (FR-005–009; SC-003, SC-005).
- [X] T016 [US2] Run US2 focused and retained real RabbitMQ recovery/confirmation/duplicate-safety cases, recording unchanged envelope and failed-burst bounds plus shutdown/session evidence in `specs/008-outbox-notifications/team/implementation-evidence.md` (SC-003, SC-005).

**Checkpoint**: Validate recovery independently against durable state and real fault boundaries.

## Phase 5: US3 — Share work safely and reduce idle cost (P2)

**Goal**: Safe concurrent/rolling workers, measurable idle-query reduction and useful private telemetry.

**Independent criterion**: One and five replicas and mixed generations drain isolated durable rows safely; measured full idle SQL cost decreases; production exporters distinguish listener mode/wake cause safely.

### Tests first

- [X] T017 [P] [US3] Add one/five hosted-worker and mixed-generation polling/listening cases, migration-ledger reapplication/old-data upgrade, absent-trigger fallback and scoped runtime-role insert/trigger-without-DDL cases in `tests/Integration.Tests/ReservationOutboxTests.cs`; assert sequential per-replica attempts and preserved durable IDs/locking, retaining intended red evidence (FR-003, FR-009–010, FR-012; SC-004).
- [X] T018 [P] [US3] Extend `tests/Integration.Tests/ReservationTelemetryTests.cs` for real successful LISTEN and changed processing SQL, a real listener connection/open failure for setup classification, and a controlled real revised-snapshot permission/schema failure for native command error/exception-event privacy using the production AddNpgsql registration plus exporter, safe parent relationships/names/SQL admission/exception events, nonempty spoof payload privacy and bounded wake/listener dimensions; retain intended red evidence including sensitivity to removal of production registration (FR-011; SC-005).
- [X] T019 [US3] Add healthy idle scan/total SQL accounting evidence in `tests/Integration.Tests/ReservationTelemetryTests.cs` over a controlled 90-second equivalent window, contrasting two statements/30s to two/10s and separately reporting setup/transaction protocol overhead; ensure every added idle query is counted and locked overdue rows do not spin; retain intended red evidence (FR-004, FR-011; SC-002).

### Implementation and evidence

- [X] T020 [US3] Add bounded `reservation.outbox.wakeups` cause and listener-transition outcome counters/workflow setup spans in `src/Reservations/ReservationTelemetry.cs` and source-generated safe logs in `src/Reservations/ReservationsLog.cs`; wire listener/worker transitions without duplicating native dependency spans or exporting payload/PID/raw exceptions/identifiers as dimensions (FR-011; SC-005).
- [X] T021 [US3] Complete fixed revised snapshot/LISTEN command admission in `src/Reservations/OutboxWorker.cs` and `OutboxListener.cs` with existing `src/Persistence/DatabaseTracing.cs` extension points, retain production `.AddNpgsql()` and privacy processor in `src/ServiceDefaults/Extensions.cs`, and resolve only behavior defects exposed by replica/compatibility/privacy cases without schema/grant/contract expansion (FR-009–012).
- [X] T022 [US3] Run US3 focused and retained provider/telemetry/privacy cases; record real replica/mixed-version results, runtime-role authority, exported span/exception samples and transparent idle operation counts in `specs/008-outbox-notifications/team/implementation-evidence.md` (SC-002, SC-004–005).

**Checkpoint**: All stories satisfy their independent criteria; cross-cutting gates still pending.

## Phase 6: Cross-cutting validation and handoff

- [X] T023 Update operator behavior, connection budget, fallback/retry timing, listener recovery and unchanged at-least-once limitations in `README.md`; reconcile actual runnable commands/evidence links in `specs/008-outbox-notifications/quickstart.md` without weakening acceptance.
- [X] T024 Run required `npm run format-check`, `npm run lint` and `npm run check` with working Podman and inspect all applicable standards including nonautomated race/cancellation/privacy/readability requirements; record exact commands/environment/exit status/tested revision in `specs/008-outbox-notifications/team/implementation-evidence.md`. Missing checks remain pending.
- [x] T025 Coordinator performs the existing manual local Aspire trace procedure from `README.md` and records representative real dependency trace, producer-context correlation, LISTEN setup and privacy inspection in `specs/008-outbox-notifications/team/implementation-evidence.md`; unavailable trace inspection remains an explicit pending gate.
- [x] T026 Coordinator arranges independent quality/security review and current-task convergence, routes repairs with preserved task history, and reconciles `specs/008-outbox-notifications/spec.md`, `tasks.md` and `team/run-state.json` under protocol completion metadata rules; explicit human acceptance is required before Complete status and cannot be supplied by an agent.

## Dependencies and execution order

```text
T001 → T002 → T003
    → US1: T004,T005 → T006 → T007 → T008 → T009
    → US2: T010,T011,T012 → T013 → T014 → T015 → T016
    → US3: T017,T018 → T019 → T020 → T021 → T022
    → T023 → T024 → T025 → T026
```

US2 and US3 test planning can begin once foundations exist, but implementation is sequential because the same worker/listener files are shared. Each test task must fail for its intended missing behavior before the matching implementation task, even where phases share files. Existing passing behavior-preservation cases need no artificial red result. T024 reruns after relevant repairs; review/convergence evidence must match the final implementation revision. No deployment, external issue/message creation or merge is included.

## Parallel opportunities

- US1: independent provider documentation/test review can overlap while the coder owns `ReservationOutboxTests.cs`; no parallel source edit is marked.
- US2: scenario analysis of retry and shutdown behavior may overlap; test source edits remain serialized because files/support overlap.
- US3: T017 and T018 can be authored in parallel only with disjoint file ownership and no concurrent test-support edits; T019 follows T018 in the same file. Independent quality/security review may run in parallel against a frozen revision.

## Implementation strategy

First validate the prompt-wake MVP (US1), then preserve recovery contracts (US2), then demonstrate replica compatibility, SQL reduction and telemetry (US3). Deliver the entire confirmed scope before asking for feature acceptance. The coder records actual evidence, coordinator owns gate metadata, reviewers own verdicts, and the human owner alone accepts the feature.

## Phase 7: Convergence

- [X] T027 Add deterministic public-lifecycle coverage for commit after empty selection and before notification wait, retaining real PostgreSQL/listener and proving publication without fallback advancement per FR-002, US1/AC3 and SC-003 (partial; Q008-001).
- [x] T028 Add real listener interruption/recovery through production telemetry export and assert unavailable/recovered transitions, degraded_poll wake cause, safe correlated recovery logs/spans and privacy per FR-011, US3/AC4 and SC-005 (partial; Q008-002).

## Handoff status — 2026-10-19

Implementation, required automated checks, representative local trace inspection, independent quality/security reviews and final convergence have passed on snapshot `8dcd843745c284b962b4b46f891c0f3a2e95a55e1276e2edd0f7cfece71bceda`. The human owner explicitly accepted the feature on 2026-10-19; acceptance is recorded in [human-acceptance.md](team/human-acceptance.md). T026 is complete, all tasks are checked, and spec status/run-state consistently reflect accepted completion. These status/checkbox updates are metadata-only; reviewed source/test hashes are unchanged.
