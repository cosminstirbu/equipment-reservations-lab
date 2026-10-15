# Tasks: Feature 1 — Book and Cancel Equipment

**Input**: Approved D1 design in `specs/002-book-cancel-equipment/`; constitution 1.1.0.

**Frozen baseline**: HEAD `0f3ee965011ddf3fc473ea1a5bba6bfa3acdc7b1`; spec SHA-256 `e2822291af872664bc42c6a252e1c7e020216570b92b323b4bbe003b8b18cb96`; plan SHA-256 `27d154448784413614d2164f78b0f22718fd284fcf03fe4238db2a6307a9a4d2`. Independent requirements/design quality and security passed; task analysis is a separate preparation gate.

Tests are explicitly required by the owner and constitution. Write behavior tests and demonstrate an intended red before implementation; record commands/environment/result then green after implementation. A missing runtime does not count as intended red. Every source edit is formatted by the trusted hook or `npm run format -- <owned exact files>` before rereading/testing/editing. Never format another worker's files or run whole-repository formatting during writes. Generated/lockfiles excluded. All existing task IDs/status survive subsequent repairs; append targeted tasks instead of regeneration.

## Phase 1: Setup

Purpose: pin selected infrastructure without changing behavior or approved stack.

- [X] T001 Verify PostgreSQL `postgres:18.6` and RabbitMQ `4.3.6` images and Npgsql `10.0.3`, Aspire.Hosting.PostgreSQL `13.6.1`, Testcontainers.PostgreSql `4.16.0` restore availability; add exact package references/lockfiles and new Persistence/DatabaseBootstrap projects in `EquipmentReservation.slnx`, `src/Persistence/Persistence.csproj`, `src/DatabaseBootstrap/DatabaseBootstrap.csproj`, `src/AppHost/AppHost.csproj`, service csproj files and `tests/Backend.Tests/Backend.Tests.csproj`; report unavailable selections without silent downgrade (FR-017/018).
- [X] T002 Establish isolated real PostgreSQL Testcontainers fixture and controlled clock/random/delay boundaries in `tests/Backend.Tests/PostgresFixture.cs` and `tests/Backend.Tests/TestTimeProvider.cs`; run production-representative migrations, reliable cleanup and independent data, never substitute an in-memory DB (SC-001/006/011).

## Phase 2: Foundation (blocks all stories)

Goal: repeatable own-database provisioning, production schemas and safe operational boundaries. This phase does not claim the user journey works.

### Test first

- [X] T003 [P] Add failing migration/seed behavior tests in `tests/Backend.Tests/MigrationTests.cs`: first run, second-run no duplicate/overwrite, ledger/checksum mismatch, transactional rollback and migration serialization; identify failure reason and red evidence (SC-001/011).
- [X] T004 [P] Add failing own-database privilege and restart provisioning tests in `tests/Smoke.Tests/DatabaseProvisioningTests.cs`: three roles/databases, denied cross-DB CONNECT, no superuser/CREATEDB/CREATEROLE/memberships, no admin credentials in API environment, reused-volume credentials; record red evidence (SC-001/011/016).

### Implementation

- [X] T005 Implement small async versioned SQL migration runner in `src/Persistence/SqlMigrations.cs`: `schema_migrations` version PK, UTC applied time/checksum, per-database advisory lock, ordered embedded SQL, transactional application, fail changed applied checksum; no shared domain persistence (T003, FR-017).
- [X] T006 Implement initial own-service migrations in `src/Inventory/Migrations/001_initial.sql`, `src/Reservations/Migrations/001_initial.sql`, `src/Notifications/Migrations/001_initial.sql` and corresponding public migration entry points: quote/preserve equipment `id` "ASCII identifier1..64 primary key", name "nonblank1..256", operational not-null; reservation nonnull UTC finite microsecond timestamps, "start_at < end_at", "status allowlist" Confirmed/Cancelled, "Confirmed has null cancelled_at; Cancelled has nonnull cancelled_at"; outbox event UUID PK, own reservation FK, "Unique (reservation_id,event_type)", "attempt_count nonnegative", pending due/published metadata; inbox EventId PK, bounded snapshot fields/plain-text message and no TTL; add named partial GiST `reservations_no_confirmed_overlap` using equipment = / `tstzrange(start_at,end_at,'[)')` && WHERE Confirmed; seed camera/laptop operational and projector non-operational INSERT-on-conflict-do-nothing (T005, SC-001/004/005/011).
- [X] T007 Implement privileged one-shot own-role/database reconciliation and btree_gist provisioning in `src/DatabaseBootstrap/Program.cs` plus generated safe logging in `src/DatabaseBootstrap/BootstrapLog.cs`: fixed allowlisted quoted identifiers, no user SQL, NOSUPERUSER/NOCREATEDB/NOCREATEROLE/no memberships, revoke PUBLIC CONNECT including postgres/template1 before service admission, grant only own DB, harden schema PUBLIC privileges, migrate each DB through own role; never pass admin credentials to APIs (T004/T006, SC-001/016).
- [X] T008 Wire stable external secret parameters, persistent PostgreSQL/RabbitMQ volumes, actual loopback host proxies and WaitForCompletion bootstrap in `src/AppHost/Program.cs`; configure each API only with own-role connection and bounded Npgsql settings, remove broker-dependent startup gating for APIs/SPA, retain broker/worker health separately and process-only liveness in `src/ServiceDefaults/Extensions.cs`, `src/Reservations/DependencyHealth.cs`, `src/Notifications/Program.cs`; no admin UI or secret logging (T007, SC-001/011/016).
- [X] T009 Adapt affected existing WebApplicationFactory setup to isolated production-migrated own databases in `tests/Backend.Tests/InventoryTests.cs`, `tests/Backend.Tests/ReservationsTests.cs`, `tests/Backend.Tests/NotificationsTests.cs`, `tests/Backend.Tests/OperationalTests.cs` while retaining faithful external boundary doubles and original behavior expectations; rerun T003/T004 green and existing hello startup smoke with expanded seed selected by camera ID in `tests/Smoke.Tests/HelloSmokeTests.cs`; record intentionally updated Single/catalog assumptions and equivalent hello behavior, investigate every unexpected failure (T008, SC-001/015/016).

Checkpoint: real DB fixtures, migrations, credentials and legacy HTTP/broker path operate. Freeze/check Batch 1 before dependent business work.

Batch 1 staging note: T002 supplies the isolated production-migrated database fixture and controlled clock. Retry randomness/delay controls remain part of T029, where their behavior is introduced and tested; no speculative scheduler is added in this foundation batch.

## Phase 3: US1 — Browse and book equipment (P1)

Goal: persisted catalog, advisory availability and atomically confirmed booking, with timezone-aware UI. Notification delivery remains a separate story.

Independent test: fresh startup → choose operational camera/future interval → advisory check →201 Confirmed → refresh/restart read; competing overlap409, adjacency/different item201.

### Tests first

- [X] T010 [P] [US1] Add failing persisted Inventory HTTP/provider contract tests in `tests/Backend.Tests/EquipmentPersistenceTests.cs`: deterministic sorted three-item catalog/status, unknown/malformed IDs, additive old hello contract, restart persistence; record red (FR-002/014, SC-001/003/015).
- [X] T011 [P] [US1] Add failing real-DB booking HTTP/date/body/error tests in `tests/Backend.Tests/BookingTests.cs`: required offset, strict ISO8601 grammar, 0..6 fractional digits, reject infinity sentinels/unknown fields/oversize/malformed IDs, UTC normalization, equal/reversed/past/start-equal-clock, unknown/non-operational equipment, Inventory timeout/unavailable/unusable, no reservation/outbox on rejection and no automatic side-effect retry; use faithful HTTP double and controlled TimeProvider; record red (SC-002/003/013).
- [X] T012 [P] [US1] Add failing public-HTTP real-DB allocation tests in `tests/Backend.Tests/BookingConcurrencyTests.cs`: identical/containment/partial overlap, both adjacency boundaries, different items, stale availability, barrier-coordinated simultaneous requests produce one201/one409 and one event; transaction rollback yields neither state nor event, interrupted response recovery through history; record red (SC-004/005/006/007, FR-011).
- [X] T013 [P] [US1] Add failing rendered booking UI tests in `src/Web/src/app/booking/booking.spec.ts`: equipment loading/empty/error/status, visible demo local scope, labeled time inputs and timezone/offset, nonexistent/ambiguous DST validation/explicit offset choice, advisory invalidation, creation states/conflict/dependency errors and duplicate-click prevention independent of server rules; record red (SC-014/016).

### Implementation

- [X] T014 [US1] Implement async own-DB equipment store in `src/Inventory/EquipmentStore.cs`, generated DTO context in `src/Inventory/InventoryJsonContext.cs`, and list/get endpoints in `src/Inventory/Program.cs`; bounded identifier/name validation and operational boolean, safe errors; update only affected camera-selection compatibility expectations in `tests/Backend.Tests/InventoryTests.cs`, `src/Web/src/app/hello.ts` and `src/Web/src/app/hello-api.ts` (T010, SC-001/003/015).
- [X] T015 [US1] Implement strict generated-regex/explicit-offset timestamp parsing, six-digit microsecond precision, sentinel rejection, UTC conversion and safe Problem Details codes in `src/Reservations/ReservationContracts.cs`, `src/Reservations/ReservationValidation.cs`, `src/Reservations/ReservationsJsonContext.cs`; requests contain only equipmentId/startAt/endAt, server assigns demo-user/status/name (T011, FR-003/004/019).
- [X] T016 [US1] Implement fixed-endpoint generated-metadata Inventory HTTP validation in `src/Reservations/InventoryClient.cs`: 3s timeout, no retries, validate response item/name/operational, distinguish not-found/non-operational/dependency-unusable safely; never trust browser equipment snapshot (T014/T015, SC-003/013).
- [X] T017 [US1] Implement advisory allocation read and transactional confirmed insert+stable confirmation outbox in `src/Reservations/ReservationStore.cs`; sample/truncate authoritative clock immediately before insertion, use actual DB exclusion instead of check-then-insert, map only named SQLSTATE23P01 to conflict,8s request/5s DB command budget, no broker call or retry, durable read/list contracts include event IDs (T012/T016, SC-002/004/005/006/007, FR-011).
- [X] T018 [US1] Map generated-contract availability/create/list/get endpoints and safe error handling in `src/Reservations/Program.cs`; availability validates item and date and returns advisory true,201 only after commit/Location, fixed demo identity; register workflow ActivitySource/Meter and generated outcome logs in `src/Reservations/ReservationTelemetry.cs`, `src/Reservations/ReservationLog.cs`, `src/ServiceDefaults/Extensions.cs` (T017, SC-002/017).
- [X] T019 [US1] Implement API service and booking screen in `src/Web/src/app/booking/booking-api.ts`, `src/Web/src/app/booking/booking.ts`, `src/Web/src/app/booking/booking.html`, `src/Web/src/app/booking/booking.css`; semantic labels/focus/status, local demo notice, explicit timezone/offset and DST validation, advisory invalidation,5s calls/no write retry/loading/empty/error/conflict/saved state, disable pending clicks; mount alongside hello in `src/Web/src/main.ts` and add fixed `/api/availability`/`/api/reservations` proxy mappings in `src/Web/proxy.conf.cjs` (T013/T018, SC-014/015/016).
- [X] T020 [US1] Run T010–T013 green, provider contract and real concurrent trial with production migrations; record exact commands/red-green/restart persistence in `specs/002-book-cancel-equipment/team/validation.md` through coordinator handoff and maintain status only after evidence (SC-001–007/013/014/015).

## Phase 4: US2 — View and cancel reservations (P1)

Goal: durable Confirmed/Cancelled history and future cancellation releasing interval, with repeated cancellation safe at any time.

Independent test: create future confirmed fixture through public API → cancel → repeat/concurrent cancel → restart/history → book released interval; at/after-start Confirmed cannot change.

### Tests first

- [X] T021 [P] [US2] Add failing public-HTTP real-DB cancellation tests in `tests/Backend.Tests/CancellationTests.cs`: future transition, exact-start/after rejection, unknown/malformed ID, repeat Cancelled after original start, concurrent repeats one event, no Inventory/broker dependency, forced rollback no partial transition/event, retained history and released interval; record red (SC-008/009/010/011).
- [X] T022 [P] [US2] Add failing competing cancellation/booking allocation tests in `tests/Backend.Tests/CancellationConcurrencyTests.cs`: controlled concurrent transaction boundaries/public requests, new booking succeeds only after committed cancellation releases interval, no committed overlapping Confirmed rows; record red (FR-006/009/010/011, SC-004/006/008).
- [X] T023 [P] [US2] Add failing rendered reservation list/cancel tests in `src/Web/src/app/booking/reservations.spec.ts`: deterministic history order/status/timezone, empty/load error distinct, pending actions/focus, at-start errors, repeated clicks/no duplicate UI transitions, refresh after uncertain response; record red (SC-008/010/014).

### Implementation

- [X] T024 [US2] Implement row-locked cancellation in `src/Reservations/ReservationStore.cs` and cancel endpoint in `src/Reservations/Program.cs`: FOR UPDATE, return Cancelled before time check even after original start, sample clock after lock, Confirmed requires now<start, transactional cancellation timestamp+single unique cancellation outbox, unknown404/started409, no Inventory/broker call (T021/T022, SC-008/009/010).
- [X] T025 [US2] Implement history/cancel API and accessible display/actions in `src/Web/src/app/booking/booking-api.ts`, `src/Web/src/app/booking/booking.ts`, `src/Web/src/app/booking/booking.html`; preserve cancelled records/event IDs, explicit refresh, sorted confirmedAt DESC/id, Confirmed/Cancelled text and timezone, saved result independent of notification state, focus recovery; add generated cancellation telemetry/log events in `src/Reservations/ReservationTelemetry.cs` and `src/Reservations/ReservationLog.cs` (T023/T024, SC-008/014/017).
- [X] T026 [US2] Run T021–T023 green including controlled-clock boundary and real DB competition; restart/read/rebook released interval and report evidence in `specs/002-book-cancel-equipment/team/validation.md` via coordinator (SC-008/009/010/011).

## Phase 5: US3 — Receive durable notifications (P2)

Goal: asynchronously publish every committed transition and persist one observed inbox entry/event across broker/consumer outages, while booking remains saved.

Independent test: create/cancel while broker unavailable → restore → explicit inbox refresh → exactly one entry/transition → restart Notifications and read unchanged inbox; duplicate deliveries cause no duplicates.

### Tests first

- [X] T027 [P] [US3] Add failing outbox/public booking-broker contract tests in `tests/Smoke.Tests/ReservationOutboxTests.cs`: initial broker unavailable booking/cancel still committed, same stable event payload/ID on bounded retry, pending after nack/return/timeout, persistent recovery after worker restart, crash after broker acceptance before Published commit; observe real broker and public inbox effects with 60s readiness-based deadline; record red (SC-009/011/012).
- [X] T028 [P] [US3] Add failing real broker+real DB inbox tests in `tests/Smoke.Tests/ReservationConsumerTests.cs`: consumer outage/reconnect, duplicate ID across restarts, crash after inbox commit before ACK, transient DB failure remains unACKed/redeliverable, poison/oversize/missing IDs/schema/type/routing mismatch/invalid UTC interval followed by valid event, deterministic occurredAt DESC/eventId ordering; record red (SC-009/011/012, FR-019).
- [X] T029 [P] [US3] Add failing retry policy tests through worker/consumer public lifecycle in `tests/Backend.Tests/ReservationRecoveryTests.cs`: per-attempt budgets, bounded 3-attempt exponential jitter bursts and scheduled next cycle <=10s, cancellation/disposal/no locks held during backoff, permanent contract failures not false-published, stable IDs/no duplicated stored effects; document any necessary solitary boundary reason, record red (FR-012/020, SC-012).
- [X] T030 [P] [US3] Add failing rendered explicit inbox refresh/pending tests in `src/Web/src/app/booking/notifications.spec.ts`: matching event IDs distinguish saved state from not-observed, notification error does not undo booking/cancel, empty/loading distinct, no auto-poll/write retry, component destruction cancels in-flight work; record red (SC-014).

### Implementation

- [X] T031 [US3] Add schema1 generated event envelope and separate durable topology in `src/HelloMessaging/ReservationEvent.cs`, `src/HelloMessaging/ReservationJsonContext.cs`, `src/HelloMessaging/ReservationTopology.cs`: stable nonempty UUIDs, fixed demo-user, equipment "ASCII1..64", name "nonblank1..256", finite UTC interval start<end, 4 KiB limit, allowlisted confirmation/cancellation/routing and matching MessageId; durable reservations exchange/queue, persistent messages/manual ACK/prefetch1, mandatory confirms/no TTL or dropping capacity policy; preserve hello topology (T027/T028, FR-011/012/013/019).
- [X] T032 [US3] Implement bounded publisher and due outbox background worker in `src/Reservations/ReservationPublisher.cs`, `src/Reservations/OutboxWorker.cs` and wire `src/Reservations/Program.cs`: select due FOR UPDATE SKIP LOCKED, hold row only during <=3s attempt, mark Published only confirmed, persist transient attempt/next-due metadata, same ID/payload retry, 3-attempt burst base 1s/cap 4s exponential jitter then scheduled <=10s next cycle; safe permanent-failure signals/no false success, inject clock/random and dispose lock before waits, propagate saved W3C context (T029/T031, SC-011/012/017).
- [X] T033 [US3] Implement own-DB inbox store/API/contracts in `src/Notifications/ReservationInbox.cs`, `src/Notifications/NotificationContracts.cs`, `src/Notifications/NotificationsJsonContext.cs`, `src/Notifications/Program.cs`: EventId PK ON CONFLICT DO NOTHING/commit, no expiry, fixed demo identity, bounded plain-text constructed messages, sorted occurredAt DESC/eventId, GET list available without broker; preserve hello GUID lookup/memory semantics (T028/T031, SC-009/011/012).
- [X] T034 [US3] Implement reconnecting consumer in `src/Notifications/ReservationConsumer.cs`: validate schema/envelope/content type/IDs/routing/UTC interval/bounded trace headers, ACK only after inbox commit, duplicate success ACK, poison reject without requeue, transient DB fault close/reconnect to redeliver;5s setup/3s ACK/5s DB budgets, bounded jittered 3-attempt reconnect bursts then <=10s next cycle and cancellation-safe lifecycle; generated logs and consume spans/metrics in `src/Notifications/NotificationsLog.cs`, `src/Notifications/NotificationTelemetry.cs` (T029/T033, SC-009/012/017).
- [X] T035 [US3] Implement explicit inbox API/refresh and event-ID observation states in `src/Web/src/app/booking/booking-api.ts`, `src/Web/src/app/booking/booking.ts`, `src/Web/src/app/booking/booking.html`; matching inbox means observed, absent is not-yet-observed even if broker accepted; preserve saved status on failure, allow later refresh without recreating transitions, semantic announcements/focus, no realtime updates/polling (T030/T033/T034, SC-014/018).
- [X] T036 [US3] Run T027–T030 green against actual RabbitMQ/PostgreSQL; verify broker+consumer outage recovery, duplicate/crash windows and restart persistence, record exact red/green/recovery deadlines in `specs/002-book-cancel-equipment/team/validation.md` through coordinator handoff (SC-009/011/012/014).

## Phase 6: Cross-cutting verification and handoff

- [X] T037 Add intended failing telemetry behavior tests/capture requirements first, then finish bounded-label outcome/latency/outbox age/dependency meters, correlated workflow/event W3C context and generated structured logging in `tests/Backend.Tests/ReservationTelemetryTests.cs`, `src/Reservations/ReservationTelemetry.cs`, `src/Notifications/NotificationTelemetry.cs`, `src/ServiceDefaults/Extensions.cs`; exclude secrets/body/raw exceptions/PII and identifier metric dimensions, preserve hello signals (SC-017, FR-020).
- [X] T038 Add/complete browser journey tests in `src/Web/browser-tests/booking.browser.spec.ts` before remaining UI repairs: real browse/check/book/history/cancel/refresh inbox, keyboard/axe success and loading/empty/validation/conflict/dependency/pending states, explicit timezone/DST offset behavior and focus recovery; retain `src/Web/browser-tests/hello.browser.spec.ts`, only intentional seed-selection changes with equivalent validation (SC-014/015).
- [X] T039 Add/complete AppHost persistence/startup restart smoke tests in `tests/Smoke.Tests/BookingSmokeTests.cs`, `tests/Smoke.Tests/SmokeStartup.cs`: fresh and repeated bootstrap, stable secrets/reused volumes, own DB roles, reservation/inbox/pending outbox survive service/broker/AppHost restart, full hello preserved; automate infrastructure control with readiness conditions/bounded diagnostics and run after all implementations (SC-001/002/008/011/012/015).
- [X] T040 Document actual supported stable-secret setup, one startup procedure, precise volume names/explicit destructive reset, demo identity/local security limits, migration/recovery behavior and UTC UI in `README.md`; confirm `specs/002-book-cancel-equipment/quickstart.md` commands against implemented behavior and route needed factual corrections to architect without changing approved acceptance criteria (SC-001/011/016/018).
- [X] T041 Coordinate manual keyboard/focus/status review on the current browser journey and preserved hello in `specs/002-book-cancel-equipment/team/accessibility-review.md`; capture exact revision/states/keyboard actions/focus/status outcomes, route legacy Q-001 closure to original verifier; automated axe/keyboard cannot substitute, unavailable manual review remains pending (SC-014/015).
- [X] T042 Run actual listener/socket/Podman mapping inspection, cross-database negative credential tests, tracked secret scan and transitive dependency audit; inspect captured booking/cancel/conflict/controlled Inventory+broker failures for correlated telemetry and forbidden data/cardinality; report environment/commands/results/revision in `specs/002-book-cancel-equipment/team/validation.md` through coordinator handoff (SC-013/016/017).
- [X] T043 Run `npm run format-check`, `npm run lint`, `npm run check` and actual Playwright browser suite with AppHost running; record precise result counts/red-green references/unavailable prerequisites and intentional hello catalog test changes in `specs/002-book-cancel-equipment/team/validation.md` via coordinator; all required checks revision-matched and zero silently skipped (SC-001–017).
- [X] T044 Freeze implementation snapshot and hand evidence/changed files to independent verifier/security reviewers; coordinator persists explicit verdicts and SC-018 scope review, runs converge after implement, routes targeted repair tasks preserving history, repeats affected checks/reviews and obtains explicit human feature acceptance in `specs/002-book-cancel-equipment/team/run-state.json`, `specs/002-book-cancel-equipment/team/findings.json` and review reports; no self-approval/external action (SC-001–018).

## Dependencies and bounded batches

```text
T001 → T002 → (T003 || T004) → T005 → T006 → T007 → T008 → T009
Foundation → US1 tests T010..013 → T014..019 → T020
US1 → US2 tests T021..023 → T024..025 → T026
US1+US2 transition APIs → US3 tests T027..030 → T031..035 → T036
US1+US2+US3 → T037..044 → independent review + converge + human acceptance
```

Within each test task, isolate subcases and implement only after that behavior's intended red; do not defer all red checks until end of phase. Schema foundation supports later story tests, but API behavior tests remain mandatory. No task has authorization to change approved stack/rules to clear a failure. Bootstrap/operational fixes require affected checks and independent revalidation.

Recommended coordinator implementation assignments:

| Batch | Scope | Exit evidence |
| --- | --- | --- |
| 1 | T001–T009 foundation | Package/image prerequisites; red/green migration/provisioning tests; own credentials; reused-volume startup; legacy smoke. |
| 2 | T010–T020 US1 | Real DB public HTTP concurrency/rollback/date/dependency tests and rendered booking UI. |
| 3 | T021–T026 US2 | Public DB cancellation boundaries/concurrent repeats/release; rendered history/cancel. |
| 4 | T027–T036 US3 | Real broker/DB outage/crash/duplicate recovery and explicit inbox UI. |
| 5 | T037–T044 final | Telemetry, restart/browser/manual accessibility, docs, required checks, frozen independent reviews/convergence/human acceptance. |

Three implementation repair rounds are the protocol budget, not the number of planned feature batches. Coordinator tracks counters and stable findings; recurring root cause twice without new evidence yields needs_intervention. Tests/failures cannot be reclassified as passed by retries or skipped prerequisites.

## Parallel opportunities

[P] means disjoint test files can be authored after the shared fixture/build prerequisites are ready. It does not authorize parallel writes to shared Program/store/UI files or a new worker without coordinator assignment. Format only owned files.

- US1: T010 Inventory persistence contracts and T011 date/dependency API tests and T012 concurrent allocation tests and T013 rendered booking tests can be authored independently. Implement backend T014–T018 and UI T019 sequentially or with explicit separate ownership after contracts are stable.
- US2: T021 cancellation rules, T022 allocation competition and T023 rendered history tests have disjoint files. T024 store/Program and T025 screen touch existing owned files; serialize with any other story writes.
- US3: T027 outbox broker tests, T028 consumer tests, T029 recovery lifecycle tests and T030 UI pending tests are disjoint. Do not concurrently mutate shared messaging/Program/booking screen without explicit ownership.

## Acceptance traceability

| Criteria | Tasks |
| --- | --- |
| SC-001 / AC1 | T001–T010, T014, T020, T039, T040, T043 |
| SC-002 / AC2 | T011, T017, T018, T020, T039 |
| SC-003 / AC3 | T010, T011, T014–T016, T020 |
| SC-004 / AC4 | T006, T012, T017, T020, T022 |
| SC-005 / AC5 | T006, T012, T017, T020 |
| SC-006 / AC6 | T002, T012, T017, T020, T022 |
| SC-007 / AC7 | T012, T017–T020 |
| SC-008 / AC8 | T021–T026, T039 |
| SC-009 / AC9 | T021, T024, T026–T028, T033, T034, T036 |
| SC-010 / AC10 | T021, T023–T026 |
| SC-011 / AC11 | T003, T004, T006–T009, T021, T026–T028, T032–T034, T036, T039, T040 |
| SC-012 / AC12 | T027–T029, T031–T034, T036, T039 |
| SC-013 / AC13 | T011, T016, T020, T042 |
| SC-014 / AC14 | T013, T019, T023, T025, T030, T035, T038, T041, T043 |
| SC-015 / AC15 | T009, T010, T014, T019, T038, T039, T043 |
| SC-016 / AC16 | T004, T007, T008, T013, T019, T040, T042, T044 |
| SC-017 | T018, T025, T032, T034, T037, T042, T043 |
| SC-018 | T035, T040, T044 |

## Incremental strategy and completion

US1 is the MVP increment, independently demonstrable with durable Confirmed booking/advisory check; it is not completion of this request. US2 adds safe cancellation/history; US3 adds durable asynchronous observed notifications. Continue all planned batches and gates without asking for routine implementation permission. No merge/deploy/publish/external issues/messages are authorized. Coordinator-owned reports are updated through handoff, not overwritten by coder. Final human acceptance remains a separate required gate; tasks/reviewer checks never invent that decision.

## Phase 7: Targeted Batch 3 repair

- [X] T045 Add an intended failing rendered regression for Q-B3-001 using confirmation instants differing within one millisecond and opposite UUID order, then preserve authoritative API history ordering (or full six-digit precision) in `src/Web/src/app/booking/booking.ts` and faithful fixtures in `src/Web/src/app/booking/reservations.spec.ts`; refresh focused tests, format-check/lint/check and original reviewer closure on the new frozen source (FR-008, T023/T025, D1 HTTP history ordering).

This repair preserves completed task history and approved requirements/design. It is implementation repair round 1 of 3, not a convergence assessment.

## Phase 8: Targeted browser-write security repair

- [X] T046 Define and independently review the targeted browser-write policy for SEC-001, add intended failing public-HTTP regressions for hostile/null Origin, originless browser metadata and simple text/plain creation/cancellation with zero state/outbox effects, then enforce the approved server policy preserving the loopback SPA/proxy and documented direct local CLI. Require JSON creation media type, safe 403/415 errors and actual browser validation; refresh affected gates and original security closure (FR-019, SC-016, D1 malicious-browser-content trust boundary).

Implementation repair round 2 of 3; this is a targeted correction of the earlier scoped security review omission, not a constitutional waiver or authentication feature. Independent US3 work may continue while the policy is reviewed.

## Phase 9: Targeted Batch 4 repair

- [X] T047 Add intended failing public worker/consumer lifecycle regressions and real RabbitMQ/PostgreSQL configuration-fault coverage for Q-B4-001, then classify permanent broker protocol/authentication errors including nested connection causes and own-database authentication/permission/schema/catalog errors in publisher, consumer and outer outbox selection/open-connection retry paths; retain transient outage/return/nack/uncertain-publication and SQLSTATE08006 recovery, durable unpublished parking where the database remains accessible, worker halt until repair/restart when permanent database failure prevents access, safe bounded signals and explicit repaired recovery. Refresh affected provider/recovery checks, full gates and original reviewer closure (Constitution VI, FR-020, approved permanent-disposition policy).
- [X] T048 Add intended failing real-broker poison-then-valid regressions for Q-B4-002 covering offset-free timestamps under controlled UTC and excessive fractional digits that align or truncate, then enforce original timestamp grammar before conversion while preserving generated JSON metadata, explicit UTC semantics, six-digit maximum precision, finite bounds, zero invalid inbox writes and continued valid delivery. Refresh consumer/provider checks, full gates and original reviewer closure (FR-019, data-model validation boundary).

These two findings form one bounded implementation repair batch, round 3 of 3. Preserve completed task history and approved feature intent; SEC-001 browser evidence and final feature acceptance remain pending.
