# Implementation Plan: Generated API documentation and interactive testing

**Feature**: `010-openapi-documentation` | **Date**: 2026-10-19 | **Spec**: [spec.md](spec.md)

**Baseline**: `ffe638bd394262db2bb3a3bc7c1f3bb5596d8d3e`; no branch creation requested.

## Summary

Generate OpenAPI 3.1 from production Minimal API routes in Inventory, Reservations and Notifications and serve a local Scalar UI in Development. Add explicit wire-contract metadata, a dedicated Keycloak public client, and narrowly admit that client as a human identity. Preserve business responses, ownership and browser-write guards. Validate through production HTTP pipelines, real Keycloak contracts and browser interaction without an automated AppHost.

## Technical Context

- Language/platform: C# 14 / net10.0, existing pinned SDK and Aspire baseline retained.
- New dependencies: Microsoft.AspNetCore.OpenApi **10.0.13**, Scalar.AspNetCore **2.18.0**; Microsoft.OpenApi **2.12.2** (includes JSON reading/validation APIs; no legacy Readers package). Do not select incompatible Microsoft.OpenApi 3.x. Resolve exact transitives in committed lockfiles and verify restore/build before dependent code.
- Existing storage: PostgreSQL 18.6; RabbitMQ 4.3.6; Keycloak 26.8.1. No schema, data migration, or business storage changes.
- Tests: xUnit v3 / Microsoft Testing Platform, WebApplicationFactory, existing Testcontainers infrastructure; existing Playwright 1.64.0 for browser checks. Podman required.
- Scope: eight business operations, three documents and UIs; no aggregate portal, frontend generation, schema baselines or exported schema artifacts.
- Routes: `/openapi/v1.json`, UI `/scalar/` (`/scalar` redirects); OAuth callback explicitly `/oauth/callback` on each registered service origin. UI assets served locally by pinned Scalar package, default fonts disabled.
- Performance: no new business latency budget; generation is development tooling outside business request execution. No network call is necessary to generate a document.

## Applicable standards and constitution check

Required reading: [OpenAPI](../../docs/engineering/openapi.md), [ASP.NET Core](../../docs/engineering/aspnet-core.md), [testing](../../docs/engineering/testing.md), [formatting](../../docs/engineering/formatting-and-linting.md), [Aspire](../../docs/engineering/aspire.md), [observability](../../docs/engineering/observability.md), [resilience](../../docs/engineering/resilience.md), and [Angular](../../docs/engineering/angular.md) for browser verification.

Initial pre-research/post-design assessment proposed no exception; the later human-approved Q-IMPL-003 exception is recorded below. I: direct endpoint metadata with one focused shared documentation registration helper; do not place API contract concerns in ServiceDefaults or invent business layers. II: record failing public-interface tests before each new behavior. III–IV: retain real production pipeline and internal collaborators, isolated real providers; document boundary doubles below. V: retain production OTel registrations and verify actual exported privacy. VI: retain bounded identity bootstrap and authentication dependency policies; do not retry browser writes or authorization-code exchange. Independent reviewers own their gate decisions; human acceptance remains required.

## Project structure and ownership

```text
src/ApiDocumentation/                 focused shared OpenAPI/Scalar configuration
src/{Inventory,Reservations,Notifications}/   endpoint metadata and registration
src/IdentityAccess/                  exact additional human client allowlist
src/IdentityBootstrap/               dedicated client provisioning and validated redirects
src/AppHost/Program.cs               runtime endpoint references and dashboard links
src/Web/browser-tests/              Scalar browser smoke checks
src/Web/playwright.config.ts        optional service URLs for browser smoke checks
tests/{Inventory,Reservations,Notifications}.Tests/   service document/exposure checks
tests/{IdentityAccess,IdentityBootstrap}.Tests/       identity/provider contracts
tests/TestSupport/                 bounded reusable fixtures and contract assertions
specs/010-openapi-documentation/      design, contracts, tasks and evidence
```

A focused shared project avoids three copies of security/UI configuration while leaving service-specific contracts next to endpoints. Add it to the solution and reference it only from the three APIs. Implementation may consolidate assertions into TestSupport, but expected operation/status/schema assertions remain independently specified rather than computed from endpoint metadata.

## Design

### Runtime documents and metadata

Register built-in `AddOpenApi("v1", ...)`, explicitly select 3.1, and include only described business routes. Map docs/UI/assets only inside Development. Use stable names, summaries, descriptions, tags and typed `Produces`/`Accepts` metadata. Where manually parsed query/body contracts cannot be represented accurately by standard metadata, use narrowly scoped built-in operation/schema transformers. Do not bind a new body/query argument that changes validation behavior. Generation must retain source-generated JSON contexts; framework-owned document serialization is framework responsibility.

See [HTTP contract](contracts/http.md) for operation IDs and statuses. All protected operations declare an OAuth2 authorizationCode security requirement named `DocumentationOAuth`; Inventory also describes service bearer authorization as an alternative where supported. Roles are descriptive authorization requirements, not invented OAuth scopes. Declare only `openid` as login scope; preserve API audience mappers and role mappings. A description must distinguish empty JWT 401/403 from Problem Details middleware 403 on writes; a response may have an optional Problem Details body without claiming all 403s carry one. Exclude operational routes explicitly and assert exclusion.

### Browser and identity trust boundaries

Use `equipment-docs`, public, standard flow, mandatory S256; disable implicit flow, direct grants and service accounts, no client secret. Same human-role scope mappings, principal_kind=human and three API audience mappers as existing equipment-web; no added privileges. IsHuman accepts exactly equipment-web or equipment-docs, retaining single-value claims, issuer/signature/lifetime/audience and role checks. User key remains issuer+subject, so the same user owns the same data across clients. An arbitrary client with human claim remains rejected.

Provisioning receives three exact callback URIs through an optional settings collection so existing callers remain source-compatible; empty collection means no docs client required by legacy isolated scenarios. Application local provisioning always supplies all three. Validate every URI before admin calls: http/https, canonical loopback hostname, valid port, exact `/oauth/callback` path, no userinfo/query/fragment, no wildcard; derive distinct exact WebOrigins. Reconcile desired current addresses on each run, replacing stale values. Reject malformed/nonlocal configuration. Feed bootstrap URLs from Aspire endpoint reference expressions, not hard-coded ports; never wait for APIs to start to obtain their allocated proxy endpoints (APIs wait for identity bootstrap). UI OAuth callback is explicitly configured from the same trusted per-service setting, never an arbitrary incoming Host header.

Configure Scalar auth code PKCE Sha256 with public client ID, `openid`, authorization/token URLs from validated authority, explicit callback, no secret/token defaults, persistence false, agent disabled, proxy unset, local bundle and fonts disabled. Relative/same-origin OpenAPI servers keep API requests direct to the service. Do not add API CORS or weaken browser guards; token endpoint CORS comes from exact Keycloak WebOrigins. Browser OAuth callback uses `response_mode=fragment` to keep authorization codes out of HTTP server URLs and telemetry; verify the pinned Scalar implementation supports fragment callbacks. PKCE/state remain library responsibilities, verified by real provider/browser tests.

### Dependencies, resilience and observability

No new server-side external system: Keycloak provisioning reuses existing production registration, HttpClient timeout 5s, total reconciliation deadline 60s, at most two retries for repeat-safe GET/PUT transient errors using existing exponential jitter; uncertain POSTs are reconciled without replay. Retain no bootstrap circuit breaker because bounded one-shot reconciliation/readiness exposes failure; API identity metadata/JWKS policies remain unchanged. Browser authorize/token flow uses library cancellation/error handling with bounded smoke-test deadlines, no added retry wrapper, no retry of code exchange or business writes. Login cancelled/unavailable must never become authenticated success.

Reuse official production ASP.NET Core/HttpClient OTel integrations already installed; no custom dependency span emitter or alternate ActivityListener. Test new provisioning paths through the same production registration/in-memory exporter and real provider for success and controlled failure. Check useful operation/outcome correlation and actual exported tags/events/logs for absence of credentials, tokens, query codes, bodies and personal data. No new dimensions contain user IDs or raw URLs. Browser tests disable trace/screenshots/video/network body logging; inspect destinations and token-storage behavior without writing secret-bearing artifacts. Manual Aspire trace inspection remains required.

## Test design record

1. **Documents/exposure (FR-001–004,006,011)**: extend each existing service test project using WebApplicationFactory of real Program, isolated PostgreSQL and existing broker fixture where startup needs it. Keep production routing, metadata, serialization, guards and generated documents. Existing faithful JWT authority fixture replaces only external discovery/JWKS, with fidelity established by real Keycloak provider contracts. Fetch anonymously and with distinct human roles and compare contracts. Parse as 3.1, fail on validation diagnostics/unresolved refs and assert all expected operation IDs, paths/methods, inputs, schemas/media/statuses/security and zero health/operational paths. Test Development vs Production and Testing for doc/UI/assets; business tests remain intact. Do not copy a test-only endpoint map.
2. **Identity/provider (FR-007–009)**: extend IdentityAccess HTTP policy tests and real Keycloak contracts with docs-client code+S256 exchange, exact callbacks, token-endpoint CORS, valid audiences/roles and stable ownership. Reject unknown azp, duplicate claims, wrong audience, docs service impersonation, missing/plain PKCE, unregistered redirects/origins, implicit/password/service grants. Extend existing tests rather than mirror private methods; invalid provision settings are checked at the public provisioner boundary before provider mutation.
3. **Browser (FR-005,007–012)**: use actual Chromium+Scalar+Keycloak+APIs. Browser checks may target manually started local services through explicit validated loopback URLs; they must not build, inspect or start AppHost. Existing Playwright configuration can accept extra API URL environment variables and continue using its manually supplied Web URL. Sign in through UI popup, execute authenticated read, Employee booking/cancellation, Approver forbidden write and unauthenticated failure. Assert actual HTTP results and same-origin destination, S256/code flow, no persistent auth in fresh context, no external traffic or AI UI, and unchanged browser protection behavior. Include cancelled login/provider failure with bounded observation. Never treat raw HTTP token login alone as the UI smoke test. Retain diagnostic axe findings for the bundled Scalar surface under the scoped Q-IMPL-003 exception below; do not customize vendor accessibility or treat recorded vendor defects as a claimed clean WCAG AA result. Application-owned screens remain subject to the engineering accessibility requirements.
4. **Manual (SC-002/004)**: coordinator uses README local procedure to start Aspire, records actual three dashboard links, dynamic callback/origin consistency, permitted/forbidden browser behavior and representative safe trace. Review keyboard-only navigation, activation, focus visibility/order and popup return focus across documentation, authorization and request/result states; record native observations without requiring vendor accessibility customization under Q-IMPL-003. This is required evidence separate from automated checks.

No solitary tests planned. Existing external doubles retain their documented fidelity; tests claiming real Keycloak/browser behavior must use the provider, not those doubles. Test assertions concern observable documents, traffic, authorization and storage effects rather than helper method arrangements.

## Validation and handoff

Record each red command/result before implementation, then green focused tests and full `npm run format-check`, `npm run lint`, `npm run check`. Browser: follow quickstart with actual runtime URLs/secrets from environment; never commit values. Runtime prerequisite: running Podman, README Docker socket environment and `TESTCONTAINERS_RYUK_DISABLED=true` where required; sandbox may require approved escalation to access machine lock/socket. Missing prerequisites keep gates pending. Review links/readability and inspect nonautomatable standards. Freeze revision for independent quality/security review and convergence; do not claim completion until human acceptance.

## Complexity tracking

No business entities or persistence changes. Deferred capabilities remain as specified. Q-IMPL-003 is the scoped human-approved exception described below.


## Targeted fixture readiness repair during full validation

The full check exposed a BrokerStartup reserved/Unicode-credential case failing in fixture setup before its contract assertions: the existing TCP-listener wait was followed immediately by a production-bounded AMQP connection attempt that did not receive connection.start within three seconds. Concurrent local startup resource contention is a hypothesis, not established cause. The fixture already requires authenticated management readiness but currently waits only after AMQP setup.

Reorder that existing real-provider management readiness prerequisite before the first AMQP setup in tests/TestSupport/BrokerAccessFixture.cs. This is a test-fixture sequencing correction, not a claim that HTTP readiness alone proves AMQP readiness: the subsequent real AMQP connection/channel/topology operations and credential/permission assertions remain unchanged and must still pass under the actual three-second production timeout. Retain the existing bounded overall fixture deadline and condition-based management observation; add no fixed sleep, AMQP retry, production timeout increase, or concurrency exclusion. Prefer this existing public provider condition over matching an incidental startup-log string. The stable tested boundary remains RabbitMQ's real AMQP and management protocols with the production provisioner, connection factory and topology; no double is introduced. Preserve the original failing command/result, run the affected startup contract and full check after repair, and report any recurring failure as unresolved rather than retrying to manufacture a pass.


## Targeted local environment propagation repair

Manual integration found all three API resources Healthy while `/scalar/` and `/openapi/v1.json` returned 404. The actual resource environment lacked both ASPNETCORE_ENVIRONMENT and DOTNET_ENVIRONMENT, and the API projects have no Development launch profile; the AppHost's Development launch environment is not itself evidence that child service hosts run in Development. This is a T015 orchestration configuration gap, not a document-route failure.

Explicitly propagate builder.Environment.EnvironmentName to both ASPNETCORE_ENVIRONMENT and DOTNET_ENVIRONMENT on the three API resources in src/AppHost/Program.cs for local run mode. Setting both consistently avoids conflicting host-variable precedence. Carry the actual AppHost value rather than hard-coding Development: a nondevelopment AppHost must launch nondevelopment APIs, whose existing Development-only documentation guard remains unchanged. Do not change business routing or add an independent documentation enable switch. Reuse the existing three-resource configuration loop rather than duplicate per-service settings. No automated AppHost test is introduced under repository policy; retain existing production HTTP environment-exposure tests, and manually verify actual child environment and both routes on each service after owned-session restart. Treat absence of that manual evidence as pending, not inferred success.


## Human-approved scoped exception Q-IMPL-003

- Owner: human application owner.
- Date: 2026-10-19.
- Explicit decision: “No need to customize accessibily on Scalar’s bundled UI.”
- Scope and rationale: accept the bundled Scalar 2.18.0 vendor accessibility behavior unchanged rather than add accessibility customizations. This is a feature-local exception to remediation of the bundled UI findings, not a change to the engineering standards or a declaration that its accessibility checks pass.
- Retained observed findings: critical missing required combobox ARIA attributes and unnamed buttons; serious color-contrast/sidebar-tab findings and missing HTML language declaration reported by axe. Preserve the actual diagnostic evidence and native keyboard/focus observations; do not suppress checks or relabel failures as passing evidence.
- Limits: no waiver for application-owned screens, functional browser behavior, authentication/authorization, privacy, development-only exposure, or any other feature gate. Human feature acceptance remains separate and pending until explicitly given. No accessibility customization of the vendor bundle is required by this feature under this decision.


## Targeted callback isolation repair

Sequential real-browser login exposed a reproducible authentication failure: Scalar's full callback UI router appended literal `/description/introduction` to the fragment code's internal client segment before its parent polling consumed it. Safe provider-log classification confirmed the resulting client-binding mismatch; context-wide counts and code/state/verifier equality excluded a second browser exchange and PKCE mismatch. No raw codes or session identifiers belong in evidence.

Use a dedicated minimal same-origin `GET /oauth/callback` endpoint, mapped only in Development alongside the documentation routes. Return a small static HTML page with no Scalar bundle, router, scripts, redirects or code parsing; do not rewrite the fragment. The original Scalar popup polling/state validation, S256 verifier and token exchange remain responsible for the flow. Keep response_mode=fragment so credentials never reach the callback server URL. Return no-store cache policy and no-referrer policy. The URI is trusted configuration, never derived from arbitrary request Host. UI remains `/scalar/` and dashboard links do not change.

Update exact callback validation and reconciliation in both documentation and identity provisioner, all three Aspire callback references, provider fixtures/contracts, HTTP exposure checks and browser callback assertions together. Record a failing regression before implementation: callback response has no bundle/router and is absent outside Development; sequential Employee then Approver UI login succeeds with the immutable first actual callback code/state preserved through the exchange (compare opaque values in memory; output equality booleans only, without assumptions about provider code structure), followed by expected Approver403. Re-run provider, document/exposure, telemetry/privacy and complete browser suites. This is a targeted repair under T011/T012/T014–T016/T018/T019, not a product change or authentication exception. Preserve completed task history and require fresh evidence for affected claims.

## Targeted manual-scheduler test-boundary repair

Full-suite validation failed the existing MissingTriggerAndManualRepairAreRecoveredByFallback case in tests/Integration.Tests/OutboxNotificationTests.cs after manual time advancement. Inspection identifies a possible scheduling-boundary fidelity defect: cancellation of DelayAsync's WaitAsync abandons its waiter without cancelling the queued TaskCompletionSource, and the selected delay may also become cancelled after NextAsync but before advancement. This explains how stale simulated time can be advanced without releasing the worker; inspection alone is not a proven causal result. Preserve the failure and establish deterministic red/green evidence before recording closure.

Scope the repair to ManualSchedule and its scheduling-contract regressions in tests/Integration.Tests/OutboxNotificationTests.cs. Register cancellation on the underlying queued completion and use bounded asynchronous advancement that skips cancelled selected/queued entries and releases the first live delay, retaining the requested delay value and normal cancellation behavior. Add deterministic cases for cancellation before selection and after selection but before advancement; assert cancelled delay tasks remain cancelled and the replacement live delay completes. Exercise only the scheduler's existing public scheduling/control surface, without inspecting production private state. A focused isolated regression is justified for the test harness's external-time-boundary contract, a deterministic scheduling algorithm; this does not authorize solitary application behavior tests or changing production timing to fit a fixture.

The existing fallback integration case remains the application behavior regression, retaining production routing/WebApplicationFactory, isolated real PostgreSQL, actual OutboxWorker/listener/store, and its already documented external publisher/time boundaries. Observable contract remains recovery of the real pending/repaired outbox event after the simulated fallback deadline, without an infrastructure notification. No production startup reordering, timeout increase, retry, sleep, concurrency restriction or assertion weakening is permitted. Run deterministic scheduler regressions, the affected real integration case and required full checks; record actual red/green evidence and any recurring failures rather than treating repeated runs as a pass.
