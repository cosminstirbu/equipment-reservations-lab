SEC-006 independent implementation security review

Feature: `specs/006-identity-access`  
Review snapshot: `2e094af021db5f65143a73d4cd24c1fd473437b529fd6a8e48500139e0a95cef`  
Source/build snapshot: `fc5d66bedefff1ff2e5a438a5e343b87d3db429aadb055eb094e3a6233c770dc`  
Baseline HEAD: `87bd4bc6964ed8dd75b8fdba8a227b530675b22d`

**Verdict: PASS.** No new confirmed security vulnerabilities or unresolved blocking security questions identified within the agreed local-workstation scope. Security independently verifies implementation closure of `DESIGN-006-001` and `CODE-006-001`. Quality review, convergence and final human acceptance remain separate gates.

**Snapshot and review scope**

Independently recomputed SHA-256 values for all 284 entries in `team/implementation-review-manifest.json`; every entry matches. Reviewed actual authentication, authorization, ownership persistence, browser session handling, service credentials, broker provisioning/readiness, messaging contracts, provider provisioning, telemetry, tests and recorded validation evidence against the approved agreements and broker amendment.

Protected assets remain private reservation/history/inbox data, ownership and event-recipient integrity, allocation correctness, credentials/tokens, and local infrastructure administration. Relevant attack paths assessed include token substitution, principal/role confusion, cross-user access, ownership forgery, stale browser responses, unintended write replay, service credential propagation, excessive broker privileges and sensitive diagnostic disclosure.

**Control assessment**

- JWT validation requires exact configured issuer, per-API audience, RS256 signature, expiration and five-second skew; signed payload type and subject checks reject ID-token and ambiguous-subject authority. Human/service policies require distinct `principal_kind` and `azp`, with Inventory service permission read from the expected client. Evidence: `src/IdentityAccess/IdentityAuthentication.cs:17`, `src/IdentityAccess/IdentityPrincipal.cs:40`, `tests/Backend.Tests/IdentityAccessTests.cs:32`.
- Ownership uses shared canonical issuer/opaque-subject hashing. Endpoints derive it from validated principals; strict request guards reject ownership inputs. Lists, individual reads and cancellation lock/read/update statements use owner predicates. Reservation/outbox writes share transactions; allocation remains global. Evidence: `src/IdentityAccess/IdentityPrincipal.cs:11`, `src/IdentityAccess/OwnershipInputGuard.cs:16`, `src/Reservations/ReservationStore.cs:14`, `src/Reservations/ReservationStore.cs:43`, `src/Reservations/ReservationStore.cs:88`.
- Inbox queries require the validated human owner; durable events carry only the stable recipient key and bounded business fields. Strict envelope deserialization, key validation and event-ID deduplication preserve recipient continuity through retries. Evidence: `src/Notifications/ReservationInbox.cs:10`, `src/Notifications/ReservationInbox.cs:21`, `src/ReservationMessaging/ReservationEvent.cs:5`, `src/ReservationMessaging/ReservationEventValidation.cs:13`.
- Browser credentials remain in adapter memory. PKCE, exact callbacks, fragment cleanup, generation checks, subscription cancellation and response admission prevent previous-account state restoration. There is no automatic write retry after authentication failure. Bearer attachment is restricted to same-origin application paths. Evidence: `src/Web/src/app/auth/keycloak-session.ts:56`, `src/Web/src/app/auth/auth-session.ts:163`, `src/Web/src/app/auth/auth-interceptor.ts:7`, `src/Web/src/app/booking/booking.ts:112`, `src/Web/src/app/booking/booking.ts:527`.
- Service acquisition is single-flight and bounded, refreshes before expiry, rejects expired fallback, disables token-endpoint redirects and attaches authority only to the configured Inventory origin. Inventory validation completes before reservation mutation. Evidence: `src/IdentityAccess/ServiceTokenClient.cs:19`, `src/Reservations/InventoryClient.cs:13`, `src/Reservations/Program.cs:23`.
- Provisioning preserves established subjects/passwords, constrains clients and explicit human roles, and uses finite privileged startup processes. Generated persisted secrets are separated from application runtime privileges. No migration, owner-volume reset or destructive startup recovery was introduced. Evidence: `src/IdentityBootstrap/IdentityProvisioning.cs:27`, `src/IdentityBootstrap/IdentityProvisioning.cs:188`, `src/AppHost/Program.cs:197`.

**Finding closure: DESIGN-006-001**

- Original severity: high; blocking.
- Attack/preconditions: enabling management HTTP outside Development to support startup provisioning would expose an administrative capability beyond feature 005’s boundary.
- Remediation verified: core definitions are injected solely in run mode; management is guarded by both run mode and Development. Workers receive distinct scoped vhost connections; administrator credentials remain outside workers. Definitions have explicit broker ownership/modes and stable salted hashes.
- Evidence: `src/AppHost/Program.cs:81`, `src/AppHost/Program.cs:120`, `src/AppHost/Program.cs:164`, `src/BrokerBootstrap/BrokerProvisioning.cs:14`.
- Verification reviewed: exact allowed/denied workload operations, other-vhost/administration denial, protected injected files and managed staging, malformed/unreadable import blocking workers, durable restart, and publish guards preventing local secret resolution.
- Tests: `tests/Smoke.Tests/BrokerContractTests.cs:118`, `tests/Smoke.Tests/BrokerContractTests.cs:159`, `tests/Smoke.Tests/BrokerImportTests.cs:13`, `tests/Smoke.Tests/BrokerImportTests.cs:85`, `tests/Smoke.Tests/BrokerImportTests.cs:105`, `tests/Smoke.Tests/BrokerPublicationTests.cs:14`.
- Owner: architecture/coder. **Security status: closed at implementation level.** This does not claim production provisioning or secure erasure of framework staging.

**Finding closure: CODE-006-001**

- Original severity: medium; blocking under telemetry privacy requirements.
- Attack/preconditions: access to application diagnostic output could disclose private local paths or raw JWT validation exception information.
- Remediation verified: minimum Warning applies to the two evidenced framework categories, retaining framework warnings/errors and generated safe application outcomes. Production HTTP instrumentation remains enabled.
- Evidence: `src/ServiceDefaults/Extensions.cs:45`, `src/IdentityAccess/IdentityAuthentication.cs:70`.
- Verification reviewed: original private-path/console/export assertions, invalid-issuer 401 with safe unauthorized outcome and zero durable effects, plus actual-provider ID-token rejection and provider credential failures under complete captured-value scans.
- Tests: `tests/Backend.Tests/TelemetryPrivacyTests.cs:70`, `tests/Smoke.Tests/IdentityProviderTelemetryTests.cs:26`.
- Owner: coder. **Security status: closed at implementation level.** Closure concerns the confirmed paths; it is not a claim that every hypothetical framework error is universally sanitized.

**Checks and evidence**

Reviewed the recorded final full check: tooling 4, frontend 60, backend 317 and smoke 94 passed, with zero failures/skips and zero build warnings/errors; final formatting, lint and suggestion-level C# checks passed. Reviewed actual-provider export/privacy tests, the negative production-HTTP-registration mutation, three-AppHost persistence/issuer/recipient evidence and 18 real-provider browser checks.

Browser/manual/runtime evidence accurately identifies its earlier application snapshot. Subsequent production changes concern migration telemetry admission and bounded framework logging filters; final backend/provider/full checks cover those changes. UI/session behavior was unchanged, so the recorded browser evidence remains applicable to that behavior without implying a later browser rerun.

This reviewer performed read-only source/artifact inspection and manifest verification; no tests, intrusive probes, writes or external actions. No risk acceptance was invented. The explicit 125-second issued-token validity bound after logout and excluded production/self-service identity work remain documented scope limitations.
