SEC-006 requirements security review

Feature: `specs/006-identity-access`  
Baseline: `87bd4bc6964ed8dd75b8fdba8a227b530675b22d`, with requirements additions  
Reviewed spec SHA-256: `4ccc350ed0be9c5d0f708ef3c044b63fef6bc57afc95ffbc5bec1378d9913095`

**Requirements verdict: PASS.** No blocking requirements findings or missing security-related product decisions. **Design/tasks verdict: pending frozen handoff.** This report does not approve architecture or implementation.

Reviewed inputs: `AGENTS.md`, protocol, security reviewer role, constitution, original feature prompt, confirmed scope, complete feature specification, and relevant baseline application boundaries.

Assets and actors:

- Protect reservation/history/inbox confidentiality, ownership and recipient integrity, allocation and event integrity, bearer/service/bootstrap credentials, and local administration boundaries.
- Relevant adversaries are anonymous callers and foreign browser origins, Employee B targeting Employee A, non-Employee users seeking Employee authority, and compromised restricted service/broker accounts.
- The human local operator is trusted to administer identities and perform the explicitly chosen volume reset. Agents are not authorized to delete volumes.

Trust boundaries:

- Browser ↔ Keycloak authorization/callback.
- Browser ↔ each protected backend API.
- Validated claims ↔ ownership predicates and durable records.
- Reservations ↔ provider token endpoint ↔ Inventory.
- Outbox ↔ RabbitMQ ↔ Notifications inbox.
- AppHost/bootstrap ↔ persistent identity/broker state and diagnostic surfaces.

Plausible attack paths and required controls:

- Substitute invalid, wrong-audience, wrong-issuer or identity tokens; covered by FR-003 and SC-003.
- Admit service principals as humans or infer Employee from other roles; covered by FR-003/005/006/010 and service-identity edge cases.
- Forge owner inputs, enumerate another user’s records, or omit owner SQL predicates; covered by FR-004/007 and SC-005.
- Restore account A’s private data through late responses after switching to B, or replay an interrupted write; covered by FR-012/013 and SC-002.
- Leak tokens or credentials through logs, telemetry or messages; covered by FR-009/015 and SC-010.
- Use shared privileged broker access to publish forged recipient events or consume unrelated queues; covered by FR-011 and SC-008.
- Recreate subjects or drift grants during provisioning, transferring access or losing ownership; covered by FR-001/004/014 and SC-001/009.

Confirmed baseline implementation conditions are feature targets, not newly discovered requirements blockers:

- `src/Inventory/Program.cs`, `src/Reservations/ReservationEndpoints.cs`, and `src/Notifications/Program.cs` expose the current application APIs without authentication.
- `src/Notifications/ReservationInbox.cs` lists the entire demo inbox without an owner predicate.
- `src/AppHost/Program.cs` supplies both messaging services a shared broker reference using the broker administrator credential.
- `src/Reservations/InventoryClient.cs` performs unauthenticated equipment validation.

Frozen-design review must establish concrete audience and principal separation, exact callback/logout origins, PKCE/state/nonce handling, browser storage and callback URL cleanup, session-generation response isolation, stable issuer/subject framing, bounded token/JWKS operations, diagnostic redaction, repeatable provisioning and broker permission expressions. These are investigation areas, not findings or accepted residual risks.

Checks performed: read-only artifact and source inspection. No tests, intrusive probes or write-producing checks were run. No files changed. No risk acceptance recorded. Final implementation security approval remains pending.
