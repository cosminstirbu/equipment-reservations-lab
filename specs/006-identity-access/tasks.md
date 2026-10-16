# Tasks: Identity and Access

**Input**: `specs/006-identity-access/` spec, approved plan/research/data-model/contracts/quickstart. Frozen design snapshot: `36348a74a4a6ec000d87eb119e99c6d20f04f32866fb0a5f19536e1ccb2d95b2`.

**Tests**: Required by FR-016 and constitution. Write each behavior test first, observe failure for its intended reason, implement and record green evidence. A test not run is pending, not passed. No tests solely asserting removal of demo implementation. Source edits require exact-file formatting before reread/test/edit; generated/lockfiles and agreements follow repository exclusions.

**Ownership**: One coder executes bounded batches assigned by coordinator. Reviewers own verdicts; coordinator owns team metadata, convergence and human acceptance. Preserve IDs and completed statuses after implementation begins; append targeted follow-up work rather than regenerate. No volume deletion, deployment, publication, merge, external messages/issues.

## Phase 1: Setup

- [x] T001 Inspect frozen inputs, baseline environment/result and existing changes; record implementation/red-green command evidence in `specs/006-identity-access/implementation-evidence.md` without modifying frozen agreements or coordinator-owned team state.
- [x] T002 Add focused project skeletons `src/IdentityAccess/IdentityAccess.csproj`, `src/IdentityBootstrap/IdentityBootstrap.csproj`, `src/BrokerBootstrap/BrokerBootstrap.csproj` and references in `EquipmentReservation.slnx`/owning projects; pin approved JWT/Keycloak dependencies and `src/Web/package.json` keycloak-js, lock restored versions, verify exact Aspire hosting APIs before edits.

## Phase 2: Foundation — blocks story implementation

Independent boundary: real production authentication pipeline can validate faithful signed OIDC fixtures before APIs become protected.

- [x] T003 Write failing public HTTP authentication/identity tests in `tests/Backend.Tests/IdentityAccessTests.cs` and faithful OIDC/JWKS fixture `tests/Backend.Tests/IdentityAuthorityFixture.cs`: missing/malformed/expired/wrong-signature/issuer/audience/ID-token authority, duplicate/missing subject, human/service separation, explicit role combinations and stable issuer/subject framing.
- [x] T004 Implement validation/policies/key derivation in `src/IdentityAccess/IdentityAuthentication.cs`, `src/IdentityAccess/IdentityPrincipal.cs` and generated contracts/logging: exact issuer/API audience, RS256/signature/expiry, required exp, 5-second skew, payload typ=Bearer, azp/principal_kind distinctions; subject is "one opaque nonempty subject (maximum 255 UTF-8 bytes)"; key is "lowercase 64-character SHA-256 hex" over compact default-encoder Utf8JsonWriter array. Green T003; no email/name authority.
- [x] T005 Write failing public request tests in `tests/Backend.Tests/OwnershipInputTests.cs` covering rejected body/query/header ownership and response precedence; implement shared strict ownership-input rejection in `src/IdentityAccess/OwnershipInputGuard.cs` using `contracts/http.md`, without permitting any unrecognized input to override server identity. Green tests with zero effects.
- [x] T006 Adapt authenticated shared fixtures in `tests/Backend.Tests/BookingScenario.cs`, `tests/Backend.Tests/DatabaseTelemetryCapture.cs`, related HTTP test factories and links in `tests/Smoke.Tests/Smoke.Tests.csproj`; preserve real collaborators, production JWT middleware and existing behavior assertions. Keep operational probes available without exposing application data; retain safe metadata outage/key-cache tests in `tests/Backend.Tests/IdentityAccessTests.cs`.

## Phase 3: US1 — Sign in and end a session (P1, first reviewable increment)

**Goal**: Repeatable provisioned real login, protected application shell and safe expiry/logout/account changes.

**Independent test**: Real Keycloak signs in all four accounts, renders correct roles, rejects anonymous APIs, handles failure/expiry/logout and stale responses without previous-user state or automatic writes. Booking success follows US4/US2.

- [x] T007 [US1] Write failing real-provider provisioning/code-flow contracts in `tests/Smoke.Tests/IdentityProviderTests.cs` and isolated provider fixture `tests/Smoke.Tests/IdentityProviderFixture.cs`: four role assignments, exact callback origins, no duplicate/reset subjects/passwords on repeat, expected token claims/audiences/type, invalid authority rejection. Obtain human tokens through real code flow, never enable direct grants.
- [x] T008 [US1] Implement finite idempotent Admin REST bootstrap in `src/IdentityBootstrap/Program.cs`, `src/IdentityBootstrap/IdentityProvisioning.cs` and generated JSON/log contracts: realm/clients/roles/users/mappers/audiences, preserve opaque subjects/passwords, no default Employee, fail privilege drift, exact callback/logout/origin reconciliation, prescribed bounded HTTP settings and secret-safe errors. Green provider provisioning contracts.
- [x] T009 [US1] Wire persistent loopback Keycloak and IdentityBootstrap into `src/AppHost/Program.cs` and `src/AppHost/AppHost.csproj`: stable default authority localhost:18080 with explicit override, generated persisted secret parameters, exact endpoint references/readiness and no bootstrap dependency cycle; APIs/Web wait for provisioning; isolate provider storage/ports/secrets in `tests/Smoke.Tests/SmokeStartup.cs` and resource-pruning tests. Verify authority survives normal restart.
- [x] T010 [US1] Write failing rendered auth/role/login-error/expiry/logout/generation tests in `src/Web/src/app/auth/auth-session.spec.ts` and `src/Web/src/app/booking/booking.spec.ts`, including late old-account responses, focus/visibility expiry checks, cross-tab clear signals, explicit retry after provider logout failure and zero automatic write replay.
- [x] T011 [US1] Implement memory-only keycloak-js boundary/session state in `src/Web/src/app/auth/auth-session.ts`, `src/Web/src/app/auth/keycloak-session.ts`, `src/Web/src/app/auth/auth-interceptor.ts` and initialization in `src/Web/src/main.ts`: standard code+S256, nonce/state, fragment URL cleanup, no credential persistence, 120-second expiry/125-second API bound, active-session generation checks, bounded still-valid refresh and no 401/write retry. Green auth tests.
- [x] T012 [US1] Generate ignored public auth configuration from Aspire environment in `src/Web/dev-server.cjs`, update `src/Web/angular.json` asset configuration and `src/Web/proxy.conf.cjs` as needed; expose issuer/realm/clientId only, keep same-origin API proxy and exact allowed bearer target. Add configuration exposure/target-boundary coverage in `src/Web/src/app/auth/auth-session.spec.ts`.
- [x] T013 [US1] Add accessible signed-out/authenticated/failed/expired/forbidden account shell and state clearing in `src/Web/src/app/app.ts`, `src/Web/src/app/booking/booking.ts`, `src/Web/src/app/booking/booking.html` and styles; integrate role visibility, cancel subscriptions/discard stale generations, preserve only safe equipment/date input and green T010 rendered tests.
- [x] T014 [US1] Register production identity middleware/policies and protect API routes in `src/Inventory/Program.cs`, `src/Reservations/Program.cs`, `src/Reservations/ReservationEndpoints.cs`, `src/Notifications/Program.cs`; authenticate/authorize before browser-write/business validation, preserve anonymous minimal loopback health endpoints. Green anonymous/token/role request tests with correct 401/403.
- [x] T015 [US1] Add real login/logout/cancelled-login/account-switch smoke browser cases in `src/Web/browser-tests/identity.browser.spec.ts` with isolated credentials/real provider; green US1 tests and record checkpoint in `specs/006-identity-access/implementation-evidence.md`. No passwords/tokens in traces/artifacts.

## Phase 4: US4 — Keep internal access limited (P1, required before integrated booking)

**Goal**: Dedicated Reservations HTTP identity and exact broker workload privileges.

**Independent test**: Actual provider service token reads Inventory only; missing/invalid/insufficient service authority fails. Actual runtime broker accounts perform required operations and fail unrelated operations/administration.

- [x] T016 [US4] Write failing HTTP service-token acquisition/cache/timeout/wrong-target/insufficient-role tests in `tests/Backend.Tests/ServiceIdentityTests.cs` plus real provider contract in `tests/Smoke.Tests/ServiceIdentityContractTests.cs`; test concurrent single-flight, 30-second refresh margin, no expired fallback, correct audience, no human reservation/inbox privileges and no browser bearer forwarding.
- [x] T017 [US4] Implement narrowly scoped client credentials provider and Inventory-only bearer attachment in `src/IdentityAccess/ServiceTokenClient.cs`, generated token contracts and `src/Reservations/InventoryClient.cs`; configure client secret only in Reservations, Full Scope Allowed=false and Inventory equipment.read mapper/grant in `src/IdentityBootstrap/IdentityProvisioning.cs`. Respect 2-second acquisition within total 3-second Inventory budget, no POST/401 retry; green T016.
- [x] T018 [US4] Enforce human-read OR exact service-read Inventory policy in `src/Inventory/Program.cs` and wire client settings/secrets in `src/AppHost/Program.cs`; test service rejection through public APIs in `tests/Backend.Tests/ServiceIdentityTests.cs`, including safe 503 and zero reservation/outbox effect on failed dependent booking.
- [x] T019 [US4] Write failing real-broker ACL/topology/core-import contracts in `tests/Smoke.Tests/BrokerContractTests.cs`: publisher confirms/mandatory routing, consumer ack/reject, denied reverse/unrelated publish/consume/configure/default-exchange/other-vhost/administration operations; fresh channel per denial. Include fresh default administrator creation, stable salted credential/grant/topology replay, retained data and malformed/unreadable import failure with workers blocked; preserve existing routing assertions.
- [x] T020 [US4] Repurpose completed skeleton `src/BrokerBootstrap/BrokerBootstrap.csproj` as pure library with `src/BrokerBootstrap/BrokerProvisioning.cs` and generated named JSON/log contracts; prepare core definitions for explicit existing administrator plus `/`/equipment grants, runtime empty-tag users, durable topology and exact publisher/consumer ACLs. Use `rabbit_password_hashing_sha256`, base64(salt4 || SHA256(salt4 || UTF8password)), independent persisted generated salt material and byte-stable output; no broker HTTP client/process/secret-file CLI. Core import named-user hash/tag/permission update semantics and skip-if-unchanged follow amended plan; no unrelated state deletion or arbitrary drift-pruning claim. Green T019 builder/import cases, preserve T002 completion history.
- [x] T021 [US4] Wire run-mode async WithContainerFiles preparation from `src/AppHost/Program.cs`/`src/AppHost/AppHost.csproj`, separate persisted broker passwords/salt parameters and bounded readiness before workers. Inject definitions plus core local_filesystem/path/skip_if_unchanged config, owner/group999, files0600/new directories0700; verify effective image/staging permissions and safe failure. Preserve Development-only WithManagementPlugin, ordinary other-run/publish image4.3.6 and zero admin HTTP endpoint; publish must not resolve/embed local passwords/hashes or claim production provisioning. Provide workers only their own vhost connections, remove topology declarations in `src/Reservations/ReservationPublisher.cs`/`src/Notifications/ReservationSubscription.cs`, retain confirms/ack/poison/recovery. Update `tests/Smoke.Tests/ReservationDeliveryFixture.cs` and `tests/Smoke.Tests/AdminConsoleTests.cs`; green T019.
- [x] T022 [US4] Revalidate real service/broker contracts, core import repeat/failure/no-secret-artifact behavior, effective ownership/modes and own-database/workstation-console boundaries in `tests/Smoke.Tests/DatabaseProvisioningTests.cs`, `tests/Smoke.Tests/AdminConsoleTests.cs`, `tests/Smoke.Tests/BrokerContractTests.cs`; preserve Production/publish exclusion assertions without exposing admin API. Record allowed/denied operations, actual import/readiness diagnostics and checkpoint in `specs/006-identity-access/implementation-evidence.md`.

## Phase 5: US2 — Book and cancel as authenticated owner (P1)

**Goal**: Own reservation isolation and forgery rejection while retaining global allocation/cancellation guarantees.

**Independent test**: A books/cancels own reservation, B cannot list/read/cancel it, non-Employees denied reservation paths, all humans see only advisory availability. Cross-user concurrency and idempotent cancellation pass.

- [x] T023 [US2] Write failing public ownership/role/forgery tests in `tests/Backend.Tests/ReservationOwnershipTests.cs`, `tests/Backend.Tests/BookingConcurrencyTests.cs` and `tests/Backend.Tests/CancellationConcurrencyTests.cs`: own-only lists/read/cancel, foreign equals unknown 404, role denial, explicit combined roles, all-human boolean availability, cross-user overlap, no state/outbox changes on rejection.
- [x] T024 [US2] Replace fresh reservation/outbox ownership schema in `src/Reservations/Migrations/001_initial.sql`: user_key is "text NOT NULL" constrained to "64 lowercase hex characters"; owner-first history index, retain global overlap constraint, existing interval/status/unique-transition constraints. No migration/reset code; safe old-schema/checksum guidance in `src/DatabaseBootstrap/Program.cs` only if needed.
- [x] T025 [US2] Derive owner at endpoints and parameterize owner-scoped insert/list/find/cancellation lock/read/update/outbox in `src/Reservations/ReservationEndpoints.cs`, `src/Reservations/ReservationStore.cs`; preserve transactions and Cancelled idempotence after original start. Update named contracts/generated JSON and production SQL admission registry, green T023 with actual PostgreSQL.
- [x] T026 [US2] Update authenticated reservation/browser contracts in `src/Web/src/app/booking/booking-api.ts`, booking/history UI and rendered tests `src/Web/src/app/booking/booking.spec.ts`, `src/Web/src/app/booking/reservations.spec.ts`; use userKey, Employee controls, distinct 401/403/uncertain-write messages, explicit history recovery and no auto replay. Retain date/DST/focus behavior and green rendered tests.
- [x] T027 [US2] Adapt and pass existing booking/availability/equipment/cancellation/persistence/recovery tests in `tests/Backend.Tests/BookingTests.cs`, `tests/Backend.Tests/CancellationTests.cs`, `tests/Backend.Tests/BookingScenario.cs` and affected behavior suites; assertions retain existing guarantees with explicit users, no absence tests.
- [x] T028 [US2] Update real-provider booking/cancellation browser journey in `src/Web/browser-tests/booking.browser.spec.ts`; verify A success/B isolation/non-Employee denial and uncertain response → history recovery, record actual green checkpoint in `specs/006-identity-access/implementation-evidence.md`.

## Phase 6: US3 — Receive only my durable notifications (P1)

**Goal**: Stable recipient continuity through asynchronous outbox/inbox processing independent of session lifetime.

**Independent test**: A commits while delivery unavailable, signs out, delivery/restart recovers, A receives exactly one entry per event and B none; forged identity query/header cannot disclose A inbox.

- [x] T029 [US3] Write failing recipient/inbox isolation and envelope boundary tests in `tests/Smoke.Tests/ReservationConsumerTests.cs`, `tests/Smoke.Tests/ReservationOutboxTests.cs` and `tests/Backend.Tests/NotificationOwnershipTests.cs`: A/B isolation, delayed/duplicate delivery after logout, opaque identity changes, malformed key and strict unknown fields, token/credential-free payload contract.
- [x] T030 [US3] Replace event owner contract with userKey in `src/ReservationMessaging/ReservationEvent.cs`, `src/ReservationMessaging/ReservationEventValidation.cs`, `src/Reservations/OutboxWorker.cs` and mappings/generated contexts: schema version 1 replacement, "64 lowercase hex" key, existing "4096-byte envelope bound", routes/timestamps/header validation and trace context preserved. No legacy compatibility.
- [x] T031 [US3] Replace fresh inbox schema/index in `src/Notifications/Migrations/001_initial.sql` and scope persistence/API to validated current human key in `src/Notifications/ReservationInbox.cs`, `src/Notifications/Program.cs`, `src/Notifications/NotificationContracts.cs`; retain event_id deduplication, ordering/precision and production SQL telemetry registry. Green T029 against real PostgreSQL/broker.
- [x] T032 [US3] Update inbox UI contracts/rendered behavior in `src/Web/src/app/booking/booking-api.ts`, `src/Web/src/app/booking/booking.ts`, `src/Web/src/app/booking/notifications.spec.ts` and actual browser assertions in `src/Web/browser-tests/booking.browser.spec.ts`; own inbox available to every human, stale responses cleared, service denied.
- [x] T033 [US3] Run adapted real-broker outbox/consumer fault, poison, duplicate, commit-before-ack and permanent-recovery scenarios in `tests/Smoke.Tests/ReservationOutboxTests.cs`, `tests/Smoke.Tests/ReservationConsumerTests.cs`; preserve stable correct recipients and record checkpoint in `specs/006-identity-access/implementation-evidence.md`.

## Phase 7: Cross-cutting evidence and completion gates

- [x] T034 Write failing exported production-pipeline provider HTTP success/failure/privacy tests in `tests/Backend.Tests/IdentityTelemetryTests.cs` and `tests/Smoke.Tests/IdentityProviderTelemetryTests.cs`; use real provider for representative dependency evidence, test removal of required production instrumentation registration invalidates tracing, inspect attributes/exception events for credentials/tokens/login codes/session/profile data.
- [x] T035 Register DI-instrumented discovery/JWKS backchannel and Keycloak bootstrap HTTP clients, generated safe auth outcome logs/bounded metrics in `src/IdentityAccess/IdentityAuthentication.cs`, `src/IdentityAccess/ServiceTokenClient.cs`, `src/IdentityBootstrap/Program.cs`; retain `src/ServiceDefaults/Extensions.cs` production HTTP/privacy pipeline. Add safe correlated local definitions-preparation/import-readiness outcomes in `src/BrokerBootstrap/BrokerProvisioning.cs` and `src/AppHost/Program.cs`, and failure/privacy evidence in `tests/Smoke.Tests/BrokerContractTests.cs`; retain native broker-worker spans, no invented HTTP spans for file import. Green T034 and import-failure evidence; no test-only listener/instrumentation or provider session-event export.
- [x] T036 Adapt persistence/restart coverage in `tests/Smoke.Tests/BookingSmokeTests.cs`, `tests/Smoke.Tests/SmokeStartup.cs` and provider fixture: preserve new provider volume/issuer/client secrets across all three AppHosts while isolating operator state; newly owned reservations/inbox/equipment/pending delivery survive ordinary restart; no duplicate accounts/unintended grants. Record real green results.
- [x] T037 Update `readme.md` with runnable startup, prerequisites, exact four local identities/roles, filtered individual secret retrieval command, stable issuer configuration, owner-performed reset boundary, no migration, token storage/125-second logout limitation, service/broker permissions, verification commands and failure recovery; ensure no credential literals or token diagnostics.
- [x] T038 Execute authenticated real-provider browser journeys and axe assertions in `src/Web/browser-tests/identity.browser.spec.ts`, `src/Web/browser-tests/booking.browser.spec.ts`; manually verify keyboard/focus/status/non-color behavior across login, failure, expiry, forbidden and dependency-error states; record commands/environment/revision and manual outcomes in `specs/006-identity-access/implementation-evidence.md`.
- [x] T039 Run mandatory `npm run format-check`, `npm run lint` and `npm run check` with real Podman, plus documented browser command; inspect generator diagnostics and affected readability. Record actual outcomes/revision in `specs/006-identity-access/implementation-evidence.md`; unavailable checks remain pending. Capture representative safe Aspire provider→Inventory→reservation→broker/inbox traces and controlled-failure evidence.
- [x] T040 Coordinator freezes current source/artifact snapshot and obtains independent quality/security implementation verdicts and original-reviewer closure of findings in `specs/006-identity-access/team/quality-implementation.md`, `specs/006-identity-access/team/security-implementation.md` and `specs/006-identity-access/team/findings.json`; coder cannot check off reviewer-owned approval without explicit verdicts.
- [x] T041 Coordinator executes speckit-converge after implementation on current `specs/006-identity-access/tasks.md`, records result in `specs/006-identity-access/team/`, routes appended work to coder and repeats affected checks/reviews within protocol budgets; latest convergence must identify no gaps.
- [x] T042 Coordinator requests explicit final owner acceptance after concrete evidence and clear limitations; records decision before metadata-only completion status edit in `specs/006-identity-access/spec.md`, then verifies spec/tasks/team state consistency in `specs/006-identity-access/team/run-state.json`. Scope confirmation does not satisfy acceptance; never mark complete while pending.

## Dependencies and Bounded Batches

All four stories are P1. US4 precedes integrated US2 because booking requires real authenticated Inventory; this is dependency ordering rather than a priority change. US3 needs US2 transitions and US4 broker plumbing. Foundation blocks every story.

```text
Setup T001–T002 → Foundation T003–T006 → US1 T007–T015
→ US4 T016–T022 → US2 T023–T028 → US3 T029–T033
→ Cross-cutting T034–T039 → Independent review T040 → Convergence T041 → Owner acceptance T042
```

One coder should receive these bounded batches separately: B1 T001–T006; B2 T007–T009; B3 T010–T015; B4 T016–T018; B5 T019–T022; B6 T023–T028; B7 T029–T033; B8 T034–T039. Each ends with targeted actual green checks and a handoff; source is not frozen for final review until cross-cutting evidence passes. Coordinator-owned T040–T042 are never coder self-approval tasks. Preserve all red/green history and route design changes before implementation rather than silently weaken approved decisions.

Within each batch: relevant failing tests before implementation, source format immediately, reread, targeted green tests then inspect diff. Existing unaffected suites need no speculative rewrites. Full checks run when integrated scope is ready, then repeat only after changes/failures invalidate evidence.

## Parallel Opportunities

No tasks are marked [P]: one assigned coder and shared AppHost/test fixtures make serial mutation simplest. Read-only work may run concurrently after inputs are ready: US1 browser accessibility inspection alongside provider-contract evidence collection; US4 service and broker contract result analysis; US2 concurrency result inspection alongside rendered history inspection; US3 inbox/consumer evidence inspection alongside event payload privacy inspection. Such concurrency must not share provider-mutating test runs or source writes. Never whole-repository-format while a worker is writing. Independent quality/security reviews run together against the same frozen snapshot.

## Requirement Coverage

| Requirements | Tasks and evidence |
| --- | --- |
| FR-001 | T007–T009, T036–T037 |
| FR-002 | T010–T015, T038 |
| FR-003 | T003–T004, T007, T014, T016–T018 |
| FR-004 | T003–T005, T023–T025, T029–T031 |
| FR-005 | T014, T023, T025, T031–T032 |
| FR-006/007 | T003–T004, T014, T023–T028, T031 |
| FR-008 | T023–T028, T036, T039 |
| FR-009 | T029–T033, T036, T039 |
| FR-010 | T016–T018 |
| FR-011 | T019–T022, T033 |
| FR-012/013 | T010–T015, T026, T028, T032, T037–T038 |
| FR-014 | T008–T009, T024, T031, T036–T037 |
| FR-015 | T019–T022, T029–T030, T034–T035, T037, T039–T040 |
| FR-016 | Every story's test-first tasks, T034, T036, T038–T039 |
| FR-017 | T010–T013, T026, T032, T038 |
| FR-018 | T001, T006, T024–T027, T030–T031, T037; analyst's targeted Book and Cancel amendment already preserved |
| FR-019 | T039–T042 |

SC-001/009 correspond to provisioning/restart; SC-002 to session/browser; SC-003/005/006 to token/role/owner; SC-004/007 to booking/messaging/restart; SC-008 to service/broker; SC-010 to diagnostic privacy/docs; SC-011 to accessibility/checks/review/convergence/acceptance tasks above. Each story's independent criterion must have actual revision-matched evidence, not merely completed task boxes.

## Implementation Strategy

First reviewable increment is US1 with anonymous APIs closed and real-provider sign-in/out; it is not whole-feature completion. Continue US4, US2, US3, then integrated evidence and independent gates. No feature subset authorizes deployment or bypasses acceptance. Unexpected material requirement decisions return to coordinator/human; routine compatible implementation details remain with coder under frozen contracts.


## Targeted design amendment: DESIGN-006-001

T019–T022 and T035 text now implement core boot definitions import in local run mode instead of the original finite admin-HTTP proposal. Existing IDs/checkmarks/history, including completed BrokerBootstrap skeleton T002, are preserved; T020 repurposes that project as a pure library. Runtime secrets/hashes are never generated into publish output; production provisioning/deployment remains outside scope. Feature005 Development-only console/administrative-endpoint boundary remains mandatory. Follow the updated plan/research/messaging contract; independent targeted reviewers own closure before dependent source implementation.


## Prospective testing-policy supersession — feature 007

On 2026-10-16, the owner approved [feature 007’s testing policy](../007-aspire-independent-tests/supersession.md), which supersedes this document’s automated Aspire/AppHost and manifest-publication obligations and retired Smoke.Tests paths. Retained application/provider guarantees have [replacement coverage](../007-aspire-independent-tests/team/coverage-disposition.md); local orchestration is verified manually. Deployment manifest support is outside scope. Original requirements, task markers, acceptance status, review hashes, and evidence above remain historical records; they do not approve feature 007.
