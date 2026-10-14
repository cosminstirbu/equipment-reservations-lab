# Tasks: Feature 0 — Hello World Walking Skeleton

**Input**: `specs/001-hello-world-skeleton/{spec,plan,research,data-model,quickstart}.md` and `contracts/hello.md`; design baseline P1 independently reviewed. **Tests**: Required by FR-010 and constitution. No behavior implementation precedes its intended failing test. Record red/green commands and results with revision in feature team evidence; failed compilation alone is not an intended behavior failure.

## Phase 1: Setup

- [X] T001 Create monorepo solution/project/test scaffolding in `EquipmentReservation.slnx`, `src/{AppHost,ServiceDefaults,HelloMessaging,Inventory,Reservations,Notifications,Web}/` and `tests/{Backend.Tests,Smoke.Tests}/`; preserve existing repository instructions and starter files; no hello behavior yet.
- [X] T002 Pin SDK 10.0.301 in `global.json`, compatible stable dependencies in project files and `src/Web/package.json`, exact stable Angular22.2.2/TypeScript6.0/RxJS7.8 patch versions and `src/Web/package-lock.json`; use Node24.15.0, Aspire13.6.1, RabbitMQ4.3.6, Client7.2.2, OTEL exporter1.19.1/instrumentation1.19.0; restore/build empty scaffolding, exclude prereleases and committed secrets, update `.gitignore` for generated output.

## Phase 2: Foundation

- [X] T003 Write and run failing public operational checks in `tests/Backend.Tests/OperationalTests.cs` for safe errors/request-size bounds, dependency readiness distinct from liveness, explicit outbound cancellation/timeouts and no retries; use faithful external boundary doubles, never private state assertions.
- [X] T004 Implement shared OTEL defaults, health mappings, safe Problem Details and explicit no-retry HTTP setup in `src/ServiceDefaults/Extensions.cs` and backend `Program.cs` files; request/event size limit 4 KiB, fixed dependency references, no raw credentials/body/exception logging; make T003 pass.
- [X] T005 Write and run a failing orchestration smoke skeleton in `tests/Smoke.Tests/HelloSmokeTests.cs` that starts AppHost, has bounded prerequisite/readiness deadlines, and expects live Inventory→Reservations→broker→Notifications behavior; unavailable prerequisites must fail diagnostically rather than skip.
- [X] T006 Wire `src/AppHost/Program.cs`, `src/AppHost/Properties/launchSettings.json`, `src/Web/proxy.conf.cjs` and dev launcher with resource references/WaitFor, deterministic npm ci, loopback SPA/API/dashboard/resource-service/OTLP and broker host proxy, generated broker credentials, dashboard token protection, Podman runtime, no management endpoint or persistent volumes; verify actual supported endpoint options and Podman mappings before claiming AC8. The smoke remains red until US1 exists.

## Phase 3: US1 — Send hello for equipment (P1, entire MVP)

**Goal**: Display authoritative Inventory seed, send one deliberate hello, confirm equipment over actual HTTP, publish/consume through actual RabbitMQ, and display the matching notification/correlation ID.

**Independent test**: Fresh local startup followed by Send hello displays “Hello received for Demo Camera”; automated smoke verifies the live chain and distinct GUIDs for two sends.

### Tests first

- [X] T007 [P] [US1] Write/run failing Inventory public HTTP contract tests in `tests/Backend.Tests/InventoryTests.cs`: exactly one seed `id: camera-001`, `name: Demo Camera`; valid lookup, unknown404, malformed400; authoritative response is the sole client equipment source.
- [X] T008 [P] [US1] Write/run failing Reservations public HTTP tests in `tests/Backend.Tests/ReservationsTests.cs`: confirmed seed →202/new nonempty GUID after successful publish; unknown404 and missing/malformed400/oversized413 produce zero published events; real internal collaborators and faithful HTTP/publisher boundaries; Inventory timeout/failure and broker nack/unroutable/timeout produce safe503, bounded cancellation and no retries.
- [X] T009 [P] [US1] Write/run failing Notifications public lookup/consumer-boundary tests in `tests/Backend.Tests/NotificationsTests.cs`: correct message/GUID, malformed/empty GUID400, missing404, invalid/oversized event rejected without requeue; “At most 1,000 records; oldest evicted first; expired never returned”, five-minute TTL and atomic concurrent operations using controlled TimeProvider.
- [X] T010 [P] [US1] Write/run failing rendered Angular tests in `src/Web/src/app/hello.spec.ts`: loading/pending/success/error, authoritative item, send ID, returned GUID, repeat deliberate send, no overlapping clicks, 500ms observation and absolute30s deadline including stalled calls, 5s remote deadlines, no requests after success/destroy, accessible labels and announcements; TestBed, real internal collaborators, fake clock and HTTP boundary.
- [X] T011 [US1] Write/run failing real-broker adapter contract tests in `tests/Smoke.Tests/BrokerContractTests.cs`: fixed exchange/queue routing, actual mandatory publisher confirmations, unroutable/nack failure, queue TTL/max-length/overflow and invalid-event rejection. Keep one queue and one consumer; use isolated test sessions, no messaging simulation.

### Implementation and contract fidelity

- [X] T012 [US1] Implement seed and lookup endpoints in `src/Inventory/Program.cs`, validating “nonempty ASCII identifier of at most 64 characters”; make T007 pass and verify boundary-double responses match actual Inventory contract from T008.
- [X] T013 [US1] Implement `src/HelloMessaging/HelloRequested.cs` and `src/HelloMessaging/RabbitTopology.cs`: “new nonempty GUID”, “validated <=64-character ASCII identifier”, “confirmed seed name”, “UTC timestamp”, “JSON <=4 KiB”; one non-durable direct hello exchange, durable nonexclusive hello-notifications queue with transient/non-persistent messages (supported RabbitMQ4.3.6 metadata; no volume/persistent delivery/replay guarantee; no deprecated feature enable), hello.requested routing key, TTL30000/max-length1000/reject-publish; topology bound before use, mandatory confirms and no automatic/topology recovery/retries; safely serialize channel operations and propagate cancellation. Make relevant T011 broker tests pass.
- [X] T014 [US1] Implement POST hello, fixed direct Inventory HTTP confirmation and confirmed broker publication in `src/Reservations/Program.cs` and `src/Reservations/HelloPublisher.cs`; 3s Inventory/broker operation budgets, 8s overall request budget, safe rejection/errors, never publish unknown ID or return success before broker confirm; make T008 pass.
- [X] T015 [US1] Implement one cancelling BackgroundService consumer and lookup/store in `src/Notifications/HelloConsumer.cs`, `src/Notifications/NotificationStore.cs`, `src/Notifications/Program.cs`; acknowledge after storage, reject invalid without requeue, 5s initialization budgets, no reconnect loop; “At most 1,000 records; oldest evicted first; expired never returned”, created+5min expiry; make T009 and consumer T011 pass.
- [X] T016 [US1] Implement standalone strict Angular screen and focused HTTP state flow in `src/Web/src/app/hello.ts` and `src/Web/src/app/hello-api.ts`; authoritative seed, Send hello, loading/pending/result/GUID/errors, 5s calls/500ms polling/absolute30s wait, lifecycle cancellation, bounded duplicate clicks, semantic keyboard controls and live messages; make T010 pass.
- [X] T017 [US1] Complete correlated telemetry in `src/HelloMessaging/HelloTelemetry.cs`, `src/Reservations/HelloPublisher.cs` and `src/Notifications/HelloConsumer.cs`; propagate W3C context, producer/consumer spans, structured correlated logs, latency/errors/hello outcome/dependency health metrics with operation/outcome only; no IDs as metric labels or payload/secret capture. Verify success and controlled failure OTEL output against plan.
- [X] T018 [US1] Make `tests/Smoke.Tests/HelloSmokeTests.cs` pass against isolated running AppHost/services and RabbitMQ: Inventory seed, actual HTTP confirmation/publication/consumption, matching GUID/message and distinct second GUID; preserve diagnostic bounds and no skips, run all HTTP/UI/broker contract tests green.

## Phase 4: Polish and evidence

- [X] T019 Update existing `readme.md` (preserve starter content) with exact version pins/prerequisites, one Aspire+Podman startup procedure, resource URLs, journey and correlation, exact implemented automated commands, troubleshooting/dependency outage/manual restart, memory reset/TTL/cap and uncertain publish timeout; explicit local-only no identity/persistence/recovery/production functionality.
- [ ] T020 Run backend/Angular build and all tests, axe on loading/pending/success/error states and manual keyboard/focus/announcement review; validate fresh startup, OTEL success/failure correlation/privacy, actual host listeners/Podman mappings and committed secret scan; supply commands, exits and tested revision to coordinator for `specs/001-hello-world-skeleton/team/quality-review.md` and `security-review.md`. Never mark skipped checks passed.

**T020 partial validation evidence (I1)**: Backend 16/16, real AppHost/RabbitMQ smoke 2/2, rendered Angular 6/6, and isolated browser 3/3 pass without skips; backend/strict Angular builds pass with zero warnings. Browser keyboard sends/focus restoration and axe with color contrast pass. Security review passes. **Q-001 remains blocking**: the engineering guide requires manual keyboard review, which remains unavailable because native CUA closed its pipe and the in-app browser is unavailable. Automated keyboard tests do not complete this manual gate. Human final feature acceptance also remains pending and is maintained by the coordinator. T020 stays unchecked; see team validation/review records for revision-matched commands and evidence.

## Dependencies and execution

Setup T001→T002; foundation T003→T004 and T005→T006 after setup; all US1 work starts after foundation. Test tasks T007–T010 are independent files and can run in parallel if specifically assigned; they are followed by their respective implementation tasks. T011 depends on runnable orchestrator and precedes broker implementation. T012→T013→T014/T015→T016→T017→T018; T014 and T015 may proceed independently after required tests/contracts if ownership is disjoint. T019→T020 completes delivery evidence. One coder can execute sequentially; no extra workers or conflicting edits implied.

Parallel example for US1: Inventory tests T007 and Angular rendered tests T010 can be authored independently after foundation. All behavior implementation waits for its corresponding intended red evidence. Reviewers independently assess the same frozen revision; they own approval. Coordinator owns persisted findings, convergence and human acceptance, outside coder self-approval.

## Requirement coverage

| Requirement / acceptance | Tasks |
| --- | --- |
| FR001, SC002/AC2 | T007,T012,T016,T018 |
| FR002–004, SC003–004/AC3–4 | T008–009,T011–018 |
| FR005–007, SC005–006/AC5–6 | T003–004,T008–010,T014–016,T018,T020 |
| FR008, retention portion SC008 | T009,T011,T013,T015,T019–020 |
| FR009, SC001/AC1 | T001–002,T005–006,T019–020 |
| FR010, SC007/AC7 | T005,T007–011,T018,T020 |
| FR011, exposure/credential portion SC008/AC8 | T002,T004,T006,T019–020 |
| FR012 telemetry | T004,T017,T020 |
| FR013 excluded scope | T001–020 bounded scope, T019 limitations, independent review |
| FR014 accessibility | T010,T016,T020 |

## Implementation strategy

The sole US1 is the complete narrow MVP; no additional stories or product features. Implement incremental red→green slices, then integrate real connectivity. Keep completed IDs/status stable through repairs. No merge, deployment, publication or external issue/message is authorized. Final done requires independent current-revision reviews, convergence with no gaps and explicit owner acceptance; unmet gates yield needs_intervention.

## Phase 5: Convergence

- [ ] T021 Complete and record manual keyboard/focus/status review on the current implementation, or obtain an explicit owner-approved scoped exception, then have verifier_reviewer validate Q-001 closure per FR-014, T020 and the Angular engineering guide (partial). Native computer-use controls failed; passing isolated browser keyboard/axe tests do not waive this gate. No application code change is requested.
