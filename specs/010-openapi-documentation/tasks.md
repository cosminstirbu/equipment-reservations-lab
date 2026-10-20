# Tasks: Generated API documentation and interactive testing

**Input**: [spec.md](spec.md), [plan.md](plan.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/http.md](contracts/http.md), [quickstart.md](quickstart.md).

Tests are required by FR-011/012 and the constitution. Write each behavior test first, record the intended failing command/result, then implement and retain passing evidence. Completed task IDs/statuses must survive repairs. Coordinator owns manual gates, independent verdicts and acceptance; coder may not check those tasks on its own.

## Phase 1: Setup

- [X] T001 Verify pinned package availability/compatibility by restoring Microsoft.AspNetCore.OpenApi 10.0.13, Scalar.AspNetCore 2.18.0 and Microsoft.OpenApi 2.12.2; create focused src/ApiDocumentation/ApiDocumentation.csproj, add to EquipmentReservation.slnx and reference from three API projects, committing exact packages.lock.json files. Prove JSON reader/validator APIs resolve without legacy Readers/3.x; no runtime behavior yet.
- [X] T002 Confirm existing fixture/browser prerequisites and append concrete per-test boundary/extensions to specs/010-openapi-documentation/plan.md only if implementation needs a targeted design adjustment; preserve production routing, real databases/providers and no automated AppHost.

## Phase 2: Foundation

- [X] T003 Add independent expected-operation/schema/security assertion support using Microsoft.OpenApi JSON parser/validation in tests/TestSupport/OpenApiAssertions.cs, exercised by US1 HTTP tests; expected contract comes from specs/010-openapi-documentation/contracts/http.md, not introspection of application metadata. Record intended failing document requests before registration.

## Phase 3: US1 — Discover accurate contracts (P1)

Goal: all eight business operations accurately described. Independent test: fetch each production service document and assert exact expected contracts and excluded operations.

- [X] T004 [P] [US1] Add failing Inventory document HTTP tests in tests/Inventory.Tests/OpenApiTests.cs retaining production Program and real isolated PostgreSQL, covering both operations, response schema/media/statuses, parameter validation, security alternatives, identical anonymous/role documents and excluded health endpoints (FR-001–004,011).
- [X] T005 [P] [US1] Add failing Reservations document HTTP tests in tests/Reservations.Tests/OpenApiTests.cs using existing real fixtures and production metadata, covering five operations, all query/body/path constraints, required strings, optional empty-or-null cancellation body, middleware/handler status distinctions, Location header and security (FR-001–004,011).
- [X] T006 [P] [US1] Add failing Notifications document HTTP tests in tests/Notifications.Tests/OpenApiTests.cs retaining production pipeline/provider fixtures, verifying InboxEntry array, actual 400/401/403/503 contracts, security and excluded operational endpoints (FR-001–004,011).
- [X] T007 [US1] Implement shared built-in OpenAPI v1 registration with explicit 3.1 and security/document transformers in src/ApiDocumentation/ApiDocumentationExtensions.cs; register it in src/Inventory/Program.cs, src/Reservations/Program.cs and src/Notifications/Program.cs without changing business handlers or wire behavior (FR-001,002,003,004).
- [X] T008 [US1] Add named operation IDs, summaries, tags, request/response/status metadata beside actual endpoints in src/Inventory/Program.cs, src/Reservations/ReservationEndpoints.cs and src/Notifications/Program.cs using contracts/http.md; add narrow service-owned schema/operation transformers only for manual parsing gaps. Preserve generated application JSON metadata, optional problem extensions and empty auth responses (FR-003,004).
- [X] T009 [US1] Run focused document and existing API behavior suites and record red/green evidence in specs/010-openapi-documentation/team/implementation-evidence.md; verify no production validation/auth changes and no unresolved parser diagnostics (FR-011).

## Phase 4: US2 — Exercise APIs with development identity (P1)

Goal: discover per-service UI and test real permitted/forbidden operations. Independent test: actual Scalar popup login and authenticated read/write/denial.

- [X] T010 [P] [US2] Extend public HTTP identity tests in tests/IdentityAccess.Tests/IdentityAccessTests.cs to fail for newly allowed equipment-docs human flow while retaining wrong audience, duplicate claims, unknown azp, principal-kind/service restrictions and same issuer+subject ownership assertions (FR-007,008).
- [X] T011 [P] [US2] Extend real Keycloak tests in tests/IdentityBootstrap.Tests/IdentityProviderTests.cs and tests/TestSupport/IdentityProviderFixture.cs for dedicated public docs client code/S256 login, roles, three audiences, exact runtime callbacks/origins, token CORS and rejection of missing/plain PKCE, unregistered redirect/origin and forbidden grants; retain failing evidence (FR-007).
- [X] T012 [US2] Implement validated optional documentation callback collection in src/IdentityBootstrap/IdentityProvisioning.cs and src/IdentityBootstrap/Program.cs, with necessary source-generated contracts in src/IdentityBootstrap/IdentityContracts.cs. Reconcile equipment-docs with no secret, only standard flow/S256, same human roles and audience/kind mappers; reject noncanonical/nonloopback/wildcard/userinfo/query/fragment/wrong-path settings before provider mutation, replace stale values (FR-007).
- [X] T013 [US2] Narrowly admit exact equipment-docs azp alongside equipment-web in src/IdentityAccess/IdentityPrincipal.cs while preserving all other issuer/signature/lifetime/audience/subject/kind/role checks and user-key derivation; rerun identity/provider suites (FR-007,008).
- [X] T014 [US2] Add failing UI configuration/availability HTTP assertions then implement local Scalar UI mapping in src/ApiDocumentation/ApiDocumentationExtensions.cs with equipment-docs authCode/S256/openid, validated per-service explicit /oauth/callback callback and minimal script/router-free same-origin callback page with no-store/no-referrer, response_mode=fragment, direct same-origin requests, no secret/token defaults and no browser-write guard changes (FR-005,007,008).
- [X] T015 [US2] Use actual Aspire endpoint references to feed exact three callbacks to bootstrap and trusted per-service UI callback configuration, and add per-resource Scalar dashboard links in src/AppHost/Program.cs without readiness cycles, hard-coded ports, or automated AppHost tests (FR-005,007).
- [X] T016 [US2] Add actual Scalar browser smoke cases in src/Web/browser-tests/openapi.spec.ts and explicit validated loopback API URLs in src/Web/playwright.config.ts; retain failing run before completing missing interaction. Authenticate through UI popup, read, book/cancel as Employee, observe Approver 403 and anonymous 401, cancelled/provider-unavailable login without false success. Retain diagnostic axe findings on the bundled Scalar UI and representative states under human-approved Q-IMPL-003 in plan.md; no vendor accessibility customization is required, no findings may be relabeled as a clean WCAG AA result, and application-owned accessibility obligations remain unchanged. Disable secret-bearing artifacts and record green results against manually started services (FR-008,012; Angular accessibility standard).
- [X] T017 [US2] Document discovery, environment inputs, sign-in, permitted/forbidden testing, no secrets in artifacts and real development data changes in README.md and align specs/010-openapi-documentation/quickstart.md (FR-010).

## Phase 5: US3 — Bounded exposure and privacy (P1)

Goal: development-only UI/doc and safe browser authorization. Independent test: environment HTTP exposure matrix plus browser traffic/storage/provider privacy.

- [X] T018 [P] [US3] Add failing Development/Production/Testing document/UI/assets exposure assertions to tests/Inventory.Tests/OpenApiTests.cs, tests/Reservations.Tests/OpenApiTests.cs and tests/Notifications.Tests/OpenApiTests.cs, retaining production route definitions and deliberate nondevelopment HTTPS identity settings; implement mapping guard in src/ApiDocumentation/ApiDocumentationExtensions.cs and API startup (FR-006,011).
- [X] T019 [US3] Add browser assertions in src/Web/browser-tests/openapi.spec.ts for S256/code with fragment callback, same-origin API requests, only local configured destinations, disabled agent/proxy, no restored auth in fresh context and no token persistence. Configure explicit persistence false, DisableAgent, local bundle and DisableDefaultFonts in src/ApiDocumentation/ApiDocumentationExtensions.cs; preserve normal guards (FR-009,012).
- [X] T020 [US3] Extend production-exporter real provider privacy tests in tests/IdentityBootstrap.Tests/IdentityProviderTelemetryTests.cs and appropriate service telemetry tests to cover new provisioning success/controlled failure and document/callback requests; retain real production instrumentation, useful correlation and safe tags/events/logs without secrets/codes/bodies/personal data (FR-009).

## Phase 6: Verification and review gates

- [X] T021 Run exact-file formatting/readability inspection throughout editing, then npm run format-check, npm run lint, npm run check and browser suite; record revision-matched commands/environment/results and unresolved prerequisites in specs/010-openapi-documentation/team/implementation-evidence.md. Coder checks only executable evidence actually obtained.
- [X] T022 Coordinator manually validates three dashboard links, real runtime dynamic callbacks/origins across changed allocations, loopback access, UI permitted/forbidden operations, keyboard-only navigation/activation, focus visibility/order and popup return focus, and representative safe Aspire trace using README.md; record actual observations in specs/010-openapi-documentation/team/implementation-evidence.md, retaining native keyboard/focus limitations under scoped Q-IMPL-003 without requiring vendor customization (FR-005,012; SC-002,004). Coder must leave pending until coordinator evidence exists.
- [X] T023 Coordinator obtains independent quality/security verdicts and current convergence, routes repairs preserving task history, and records explicit human feature acceptance before completion metadata in specs/010-openapi-documentation/team/run-state.json and specs/010-openapi-documentation/spec.md. Coder must not self-approve or infer acceptance.

## Dependencies and parallel execution

T001 → T002 → T003 → US1 tests T004–T006 → T007–T009. T010/T011 may start independently after foundation, but respective failures must precede T012/T013. US2 UI T014 depends on US1 document generation and identity design; T015 wires it, T016 validates actual integration. US3 T018 should be written before the first environment/UI mapping implementation (T007/T014); T019 browser assertions precede privacy configuration in T014, even though grouped here for traceability. T020 extends tests before any new telemetry-affecting code, not retrospectively. T017 can follow the concrete UI. T021–T023 require all relevant code complete.

Parallel examples: US1 T004/T005/T006 own separate service tests; US2 T010/T011 own separate identity suites. US3 exposure edits share US1 files and must execute after their writers finish; do not parallelize same files. One assigned coder may execute all batches sequentially. Never run whole-repository formatting while any worker writes.

## Implementation strategy and requirement map

US1 is the document-only MVP, validated independently before UI wiring. Full requested delivery includes all three P1 stories; MVP does not authorize leaving privacy or UI work incomplete. Progress incrementally with failing public-interface test, minimal code, focused green test, readable refactor.

FR-001/002: T004–T009; FR-003/004: T003–T009; FR-005: T014–T017/T022; FR-006: T018; FR-007: T010–T015/T019; FR-008: T010/T013–T016; FR-009: T019/T020; FR-010: T017; FR-011: T003–T009/T018/T021; FR-012: T016/T019/T022. SC-001: document suites; SC-002: browser/manual; SC-003: exposure matrix; SC-004: browser/storage/telemetry checks. Deferred capabilities remain out of scope.


### Targeted callback repair obligations (preserve prior task completion history)

T011/T012 require fresh provider/validation evidence with exact `/oauth/callback` URIs; update tests and production validators together. T014 requires a failing HTTP regression for inert callback HTML (no Scalar bundle/router/script/redirect), then the minimal Development-only mapping. T015 updates all three endpoint-derived callback references while dashboard UI links stay `/scalar/`. T016/T019 require a failing sequential Employee→Approver browser regression, in-memory equality checks comparing immutable first actual callback opaque code/state against the exchange, without code-layout assumptions or emitting codes, then successful login/read/write and expected denial. T018 includes callback absence in default Production/Testing. Refresh affected telemetry/privacy and full-suite evidence before those claims pass again; no completed task ID or status is erased by this design repair.


## Phase 7: Convergence

- [X] T024 CRITICAL Repair cancelled-delay fidelity in ManualSchedule within tests/Integration.Tests/OutboxNotificationTests.cs per Constitution IV and plan: targeted manual-scheduler test-boundary repair (partial). First retain deterministic failing scheduling-contract cases for cancellation before selection and after selection; cancel the queued completion and advance the first live delay with a bounded asynchronous control operation. Preserve existing fallback real WAF/PostgreSQL/worker behavior, production timing/timeouts, retry policy, concurrency and assertions. Run deterministic red/green cases, unchanged MissingTriggerAndManualRepairAreRecoveredByFallback, affected integration suite and required full checks; retain failure history and exact revised evidence.
