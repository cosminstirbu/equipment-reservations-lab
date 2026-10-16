# Implementation Plan: Identity and Access

**Branch**: `main` (explicit feature directory `specs/006-identity-access`) | **Date**: 2026-10-16 | **Spec**: [spec.md](spec.md)

Application baseline: `87bd4bc6964ed8dd75b8fdba8a227b530675b22d`. Proposed design for independent review; no gate self-approval.

## Summary

Add local Keycloak, finite privileged provisioning, memory-only SPA authentication, validated API authorization, Reservations service credentials and separate RabbitMQ service accounts. Replace demo ownership with a deterministic issuer/subject key while preserving overlap exclusion, transactional cancellation, outbox and inbox. Owner manually deletes volumes before replacement schema use; agents never reset user volumes.

## Technical Context

- .NET 10/C# 14, existing pinned SDK, Angular 22.2.2/TypeScript 6.0.3, existing Node toolchain.
- Keep Aspire 13.6.1, PostgreSQL 18.6, RabbitMQ 4.3.6, Npgsql and existing OpenTelemetry production registration.
- Select official Aspire.Hosting.Keycloak `13.6.1-preview.1.26506.6` deliberately for bounded local orchestration (official integration is preview-only), Keycloak image `26.8.1`, keycloak-js `26.2.4`, and Microsoft.AspNetCore.Authentication.JwtBearer matching the repository's .NET 10 servicing patch. Pin package/image versions and lock restored dependencies.
- Local Angular SPA, three loopback Minimal APIs, PostgreSQL per-service storage, existing background workers and Podman containers. Keycloak has its own persistent local data volume; no additional application identity table.
- xUnit/WebApplicationFactory public HTTP tests with real PostgreSQL Testcontainers; faithful OIDC and Inventory doubles; real Keycloak/RabbitMQ contracts; rendered Vitest and Playwright real-provider journeys with axe.
- Keep 8-second request and 3-second Inventory budgets. Four human accounts plus one service client; no production/self-service identity workflows.

## Constitution Check

Read and apply all [engineering guides](../../docs/engineering/README.md): ASP.NET Core/source generation, Angular, Aspire, testing, observability, resilience and formatting/linting.

| Principle | Before research and after design |
| --- | --- |
| Simple design | Retain Minimal APIs/stores. Focused IdentityAccess library, finite IdentityBootstrap process and pure BrokerBootstrap definitions-builder library used by AppHost; no BFF or business policy in ServiceDefaults. |
| Test first | Each implementation batch records intended red then green public behavior tests; no demo-removal-only tests. |
| Public interfaces | Real PostgreSQL; faithful HTTP boundary doubles contract-verified with real Keycloak; real RabbitMQ permission/recovery tests. No private-state seams. |
| Useful feedback | Isolated databases/realms/vhosts, deterministic clock/expiry fixtures, bounded polling, no sleeps or shared operator state mutation. |
| Observability | Production HTTP/Npgsql/RabbitMQ instrumentation with safe filtering and exported success/failure evidence. |
| Resilience | Explicit dependency budgets below; no browser write replay or expired service-token fallback. |
| Governance | Independent preparation/implementation reviews, revision-matched checks, convergence and final owner acceptance remain required. |

No constitutional exceptions proposed. Native provider internal telemetry is deliberately not exported because documented events contain session identifiers; application-provider dependency calls remain instrumented.

## Project Structure

```text
specs/006-identity-access/{spec,plan,research,data-model,quickstart,tasks}.md
specs/006-identity-access/contracts/{identity,http,messaging}.md
src/IdentityAccess/       # JWT validation, principal policies/key, service token client
src/IdentityBootstrap/    # finite provider provisioning
src/BrokerBootstrap/      # pure secret-aware definitions builder, invoked before broker boot
src/AppHost/
src/{Inventory,Reservations,Notifications,ReservationMessaging}/
src/Web/src/app/auth/
tests/{Backend.Tests,Smoke.Tests}/
src/Web/{src/app,browser-tests}/
```

## Identity and Trust Boundaries

1. Public SPA client `equipment-web`: standard code flow with enforced S256 PKCE, nonce/state, no secret/direct grants/implicit flow/offline access. Register the exact allocated Web root as redirect/logout URI and exact Web origin. No wildcard hosts/ports/origins. Existing same-origin API proxy forwards bearer headers. Dev server generates ignored `/auth-config.json` from Aspire public environment values (issuer/realm/client ID only), never secrets. Bootstrap receives the allocated Web reference and completes before Web starts.
2. Stable configurable local issuer: use the actual allocated host-network Keycloak endpoint URL plus `/realms/equipment`; default configured host port is `18080`. Aspire may promote the endpoint named `http` to HTTPS when its managed developer certificate is available; preserve that TLS configuration and do not infer scheme from endpoint name. Set KC_HOSTNAME from an explicit `KnownNetworkIdentifiers.LocalhostNetwork` endpoint reference so container-context resolution cannot substitute an internal hostname/target port. The exact allocated scheme, loopback host and configured port must remain unchanged across ordinary restarts; changing any part is an explicit separate identity environment. Tests may allocate isolated random ports but preserve the complete issuer throughout restart scenarios. Host API processes use that identical authority for discovery/JWKS and strict validation. HTTP metadata is permitted only when the actual authority is HTTP in Development with a validated loopback host; HTTPS retains certificate validation, and insecure metadata fails startup outside that boundary. All management endpoints remain loopback, excluded from application references/manifests. Tests use isolated realms/allocated endpoints, preserving the identical issuer across each restart scenario.
3. JWT: built-in JwtBearer, `MapInboundClaims=false`, exact issuer and per-API audience, signed RS256, required exp/lifetime, five-second maximum clock skew. Require signed payload `typ=Bearer`, rejecting ID tokens. Human policy additionally requires `azp=equipment-web` and mapper claim `principal_kind=human`. Service policy requires `azp=reservations-service`, mapper `principal_kind=service`, Inventory audience and exact equipment-read client role. Never classify service accounts as authenticated humans merely because `sub` exists. Permissions/audiences in contracts.
4. User key: lowercase hex SHA-256 of UTF-8 canonical JSON array `[issuer,subject]`, compact Utf8JsonWriter encoding using the default JavaScriptEncoder (no indentation); share one implementation in all services. Issuer from validated exact configured authority; one nonempty opaque subject, at most 255 UTF-8 bytes. Reject duplicate/ambiguous/missing subject claims; no normalization/email/display-name ownership. Fixed 64-character lowercase hex key alone crosses persistence/messaging boundaries.
5. Browser: adapter access/refresh tokens only in memory, no profile/token persistence in local/session storage or IndexedDB. Adapter callback state/nonce/PKCE verifier bookkeeping is transient protocol state and removed after callback. Fragment response mode and immediate adapter URL cleanup before application telemetry/start; do not log callback URLs. Explicit login, recoverable failure/cancel, no silent iframe dependency. Access token lifespan 120 seconds, accepted surviving-token bound 125 seconds including skew. At expiry clear private state and require sign-in. Before explicit API actions, refresh a still-valid token with less than 30 seconds remaining; never refresh to revive an expired UI session or retry 401/writes. Obtain provider logout URL before clearing adapter tokens, clear local/private state immediately, then redirect; failed provider logout shows explicit retry warning. BroadcastChannel logout/account-change signals contain no identity/token and clear other tabs. Increment session generation and cancel pending subscriptions on expiry/logout/account change; discard old-generation responses and recheck expiry on visibility/focus and before responses are applied. Preserve safe date/equipment input only; never auto-replay booking/cancel.
6. Service client: confidential client credentials, Full Scope Allowed=false, no human/Employee mapper/roles, no refresh/offline token, explicit Inventory-only audience/role. Async single-flight cached token acquisition, refresh 30 seconds before expiry, never expired fallback. Attach only to configured Inventory origin. Browser bearer never forwarded. Inventory accepts human read OR scoped service read. Service cannot invoke human Reservations/Notifications routes.
7. Owner reset: replace fresh SQL initialization scripts/constraints/indexes and event ownership contract directly; no compatibility migration. Old checksum/schema mismatch fails safely with owner-reset guidance, never drops data. Provider bootstrap creates missing accounts, preserves established subjects/passwords, updates exact allocated endpoint/client security settings and reconciles documented roles only. Unexpected account/grant drift fails safely rather than silently promoting/deleting accounts. No normal startup data reset.

## Provisioning and Broker

AppHost generates/persists secret parameters for Keycloak admin, four user passwords, Reservations client secret and two RabbitMQ runtime passwords. Only the finite provider bootstrap receives Keycloak administration credentials. AppHost resolves broker secrets solely for a run-mode container-file preparation callback; application workers receive only their own broker connection. Independent persisted generated salt material keeps broker password hashes stable between runs. Provider bootstrap uses Admin REST idempotently; no committed realm containing passwords and no password-grant test shortcut. Test identities `employee-a`, `employee-b`, `approver`, `equipment-staff`; roles `Employee`, `Approver`, `EquipmentStaff`, assigned explicitly. Disable registration/recovery; no default Employee role. A local operator retrieves individual generated secrets from user-secrets without bulk logging/output.

Dedicated broker vhost `equipment`, durable direct exchange `reservations`, queue `reservation-notifications`, existing two routing bindings. Superseding the initial admin-HTTP proposal, BrokerBootstrap becomes a pure definitions-builder library referenced by AppHost. In every supported local run environment, an async `WithContainerFiles` callback resolves parameters and prepares the core RabbitMQ definitions before container start; no management API or privileged network connection is needed. Include the existing broker administrator explicitly, with its existing password and administrator tag, `/` and `equipment` vhosts and administrator permissions, because boot definitions suppress default user/vhost creation. Runtime users receive empty tag arrays and only their exact grants. Definitions use named users/vhosts/exchanges/queues/permissions/bindings, existing durable/non-auto-delete settings, no policies/messages or deletion operations. Runtime Reservations: configure/read `^$`, write `^reservations$`; Notifications: configure/write `^$`, read `^reservation-notifications$`; no management tags, other-vhost access or default exchange write. Remove runtime topology declarations. Keep publisher confirms/mandatory return, manual ack, poison handling, existing recovery. Management image/plugin/HTTP endpoint remain exclusively local Development run-mode; all other run environments and publish models retain ordinary `4.3.6` with no administrative HTTP endpoint, preserving feature 005 FR-006. Administrator credentials never reach application workers. Test both allowed and denied resource operations; denied broker operations close a channel, so use a fresh channel for each assertion.

### Definitions preparation, storage and restart semantics

Inject `/etc/rabbitmq/equipment-definitions.json` plus `/etc/rabbitmq/conf.d/20-equipment.conf` using the supported Aspire 13.6.1 container-file callback and explicit owner/group 999 (RabbitMQ image account), file mode 0600; any newly created containing directory mode 0700. Confirm effective ownership/readability against actual pinned image. Config sets `definitions.import_backend = local_filesystem`, `definitions.local.path = /etc/rabbitmq/equipment-definitions.json`, `definitions.skip_if_unchanged = true`. AppHost callback produces in-memory file contents via generated JSON metadata; no application-created host secret file, shell argument secret or source-controlled definitions. Aspire may internally stage files: inspect effective permissions/artifacts and never log contents or assume immediate secure erasure. Sensitive hash material exists only in the protected container configuration and managed staging lifetime; no extra persistent application volume or cleanup deleting broker data.

For each of administrator/publisher/consumer, persist independent generated random salt material alongside existing secret parameters. Define salt bytes as first four bytes of SHA-256 of that account's independently generated persisted random material. Hash is base64(salt4 || SHA-256(salt4 || UTF8(password))), with explicit `hashing_algorithm: rabbit_password_hashing_sha256`. This implements RabbitMQ's supported salted format and gives byte-stable definitions for unchanged parameters; never generate new per-start salts. Hashes remain sensitive and excluded from logs, artifacts, fixtures and metrics. Changing persisted credentials/salt is explicit operator rotation, not normal startup.

Core import adds missing topology without deleting existing messages/queues. Pinned source updates imported user hashes/tags and named permissions; do not describe it as universally non-overwriting. Stable content with skip-if-unchanged avoids ordinary reapplication. Existing operator mutations/unrelated resources are not automatically deleted or globally reconciled; this feature does not claim management-plane drift policing. Boot/import failure must fail readiness and block workers, never fall back to administrator AMQP or broad grants. Workers wait on broker healthy after core import plus bounded exact-account/topology readiness validation: authenticate each expected account to its vhost and use administrator-only passive inspection if an explicit topology probe is needed, without creating a production probe message or modifying operator state. Production workers retain their normal confirm-channel/consumer initialization and delivery error handling; readiness never grants runtime accounts configure rights. Tests verify required/denied operations, repeat boot credentials/grants/topology/data, malformed import and failure diagnostics.

Run-mode file callback only: publish/model inspection must not resolve local broker passwords, execute definitions preparation or embed runtime hashes/files. Preserve ordinary broker image/AMQP parameters and zero administrative endpoint in generated manifests. `WithContainerFiles` dynamic injection is development/runtime functionality, not a production secret delivery mechanism. Production deployment/provisioning remains outside scope and needs a target-specific secret-mount design before an actual deploy; do not fabricate working production import output or add plaintext/hash build defaults. BrokerBootstrap needs no separate always-running process or admin-HTTP resource; retain completed skeleton-task history and repurpose the project in T020.

## Dependency Budgets

| Dependency | Timeouts/retries | Breaker and repeat safety |
| --- | --- | --- |
| Discovery/JWKS | Instrumented dedicated HttpClient, 3-second request timeout, no foreground retry; framework metadata caching/key refresh | No extra breaker; valid cached keys usable during outage, unknown key/invalid authority fails closed. |
| Client credentials | 2-second total acquisition inside existing Inventory 3-second budget; no POST retry or expired cache fallback | Single-flight/cache bounds traffic; safe 503 before reservation/outbox mutation. |
| Inventory | 3 seconds total including token acquisition and GET, no retries including 401/403 | Retain no-breaker local GET design and safe dependency rejection. |
| Provider bootstrap | 5-second request, 60-second startup total; transient GET/PUT at most two retries, 100/200ms exponential jitter; uncertain POST resolved by lookup before another create | Finite startup gate; permanent 4xx fails, no blind creation replay. |
| Broker definitions/import | Local preparation has a 10-second cancellation budget and no network retry; broker import/readiness bounded by 60-second startup gate. Exact-account AMQP readiness probes use 3-second calls and bounded exponential backoff/jitter within that gate. | Invalid definitions/import/authentication fail safely; no resource deletion or admin fallback. Existing worker recovery schedule unchanged. |

Cancel on caller/startup cancellation. Known JSON token/admin/config contracts use generated metadata; generated LoggerMessage methods and supported configuration generators, inspect diagnostics. Never include token endpoint response bodies/raw validation exceptions in errors; remove HTTP client loggers.

## Observability

Evaluate official integrations: existing .NET OpenTelemetry HttpClient instrumentation is selected for discovery/JWKS, token and Keycloak bootstrap admin calls, through production `AddHttpClientInstrumentation()`. Inject instrumented DI backchannel into JwtBearer metadata path, not framework ad-hoc client with missing telemetry. Existing HTTP processor strips URL/query and retains safe host/method/status/duration; headers/form bodies are never captured. Preserve trace parent context token acquisition → Inventory → booking. IdentityBootstrap uses existing ServiceDefaults telemetry. Broker file preparation is a local operation, not HTTP: record safe preparation/import readiness outcome logs, bounded metrics and correlated startup activities where context exists; production broker-worker native AMQP spans remain mandatory. Inspect supported broker startup/import diagnostics for failure and privacy; never invent HTTP spans for file import. Native Keycloak Quarkus OTel evaluated but not exported: documented session/token-ID tags and full login-event details conflict with session privacy; no provider-internal telemetry promised.

Tests export the application's actual production pipeline with in-memory exporter only; no test-only instrumentation/subscribers. Exercise real-provider successful token acquisition and controlled rejection/outage; inspect tags and exception events for credentials, token/login codes, bodies and unapproved personal/session data. Removing required production HTTP registration must fail tracing evidence. Record representative Aspire trace and safe diagnostics. Add bounded auth/dependency outcome counters (`authenticated`, `unauthorized`, `forbidden`, `provider_unavailable`) without user IDs or high-cardinality dimensions. Preserve native Npgsql/RabbitMQ correlation and existing SQL privacy admission when changing SQL.

## Validation and Requirement Mapping

- FR-001/014: actual startup creates exactly four intended users, no duplicate/reset/promotions; normal restart keeps subjects, credentials, grants and owned data.
- FR-002/012/013/017: rendered and browser login/cancel/failure/logout/expiry/account switch, late responses, forbidden actions, no replay, axe and manual keyboard/focus/status checks.
- FR-003/004/006/007: real production JWT pipeline missing/malformed/expired/signature/issuer/audience/type cases, roles, explicit combination, human/service distinction and ownership body/query/header forgery; list isolation, foreign/unknown equivalent 404 and zero effects.
- FR-005/008: authenticated all-human catalog and boolean availability; existing future interval/adjacency/cancellation/concurrency guarantees across users.
- FR-009/011: real broker allow/deny credentials and delayed/repeated correct-recipient delivery, worker outage/recovery and inbox idempotence.
- FR-010: actual client credentials success and wrong/missing scope/target/invalid token rejection; dependent booking/outbox remains empty.
- FR-015/016/018/019: secret/privacy evidence, retained full suite, docs, frozen independent review snapshots and convergence, separate final acceptance.

Use faithful signed OIDC/JWKS boundary fixtures for deterministic token-edge cases, contract-check actual Keycloak claims/audiences/types with real code-flow login. Browser tests authenticate through actual login screens, never enable direct password grants. Existing tests gain shared authenticated factory helpers rather than rewritten assertions. Smoke.Tests links BookingScenario/PostgresFixture/TestTimeProvider from Backend.Tests: link new auth fixtures too. DatabaseTelemetryCapture has its own factory and needs authority. BookingSmoke restart test creates three AppHosts: isolate provider storage but preserve it, issuer and client secrets across all three. BrokerContract/AdminConsole resource pruning needs provider/bootstrap awareness. Tests never remove operator volumes.

## Complexity Tracking

No constitutional violation proposed. A finite identity provisioning executable and broker definitions-builder library keep administration credentials out of long-lived user-facing services. The shared library prevents divergent validation/ownership algorithms; ServiceDefaults remains operational only. The memory-only SPA was chosen over a BFF to preserve the existing architecture and accepted local scope; risk evaluation is in research.


## Prospective testing-policy supersession — feature 007

On 2026-10-16, the owner approved [feature 007’s testing policy](../007-aspire-independent-tests/supersession.md), which supersedes this document’s automated Aspire/AppHost and manifest-publication obligations and retired Smoke.Tests paths. Retained application/provider guarantees have [replacement coverage](../007-aspire-independent-tests/team/coverage-disposition.md); local orchestration is verified manually. Deployment manifest support is outside scope. Original requirements, task markers, acceptance status, review hashes, and evidence above remain historical records; they do not approve feature 007.
