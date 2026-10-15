**Design security verdict: pass for frozen D1.** No confirmed security findings, risk acceptance or waivers. This approves the proposed design only; implementation controls and execution evidence remain pending.

**Review scope**

Feature: `specs/002-book-cancel-equipment`  
HEAD: `0f3ee965011ddf3fc473ea1a5bba6bfa3acdc7b1`

Verified artifact SHA-256 values match the coordinator’s frozen D1:

- Plan: `27d154448784413614d2164f78b0f22718fd284fcf03fe4238db2a6307a9a4d2`
- Research: `07a37f8bf615b92c1c433d84d7e63cea7fec346a61aff8d259bdd8218acff81d`
- Data model: `715e6949cd5419d2d6187f616690bc9f4c897bc275c07053aac04ec4e07aaa12`
- HTTP: `583e4caef915520128e75976d3324b43f645e1ad5f77e252df21d426ef3af4b5`
- Events: `f85ae8a2e43966682bc46a44d7ab86dd4234f498c7b4a36762280aacff3929b8`
- Quickstart: `da9ddf70ef592de6171d1ebcd4461303a6efbbce1e3ede6a0439f287f9611798`

Requirements remain frozen at `e2822291af872664bc42c6a252e1c7e020216570b92b323b4bbe003b8b18cb96`.

**Threat assessment and design evidence**

Assets are allocation/history, equipment records, durable events/inbox and infrastructure credentials. Relevant boundaries are browser→local APIs, Reservations→Inventory, service→own database and publisher→broker→consumer. Plausible attack paths include malformed HTTP/event payloads, injected SQL values, misuse of shared administrative credentials, accidental network exposure, poison-message loops, lost publications and replayed deliveries.

D1 addresses these paths:

- **Identity and scope:** One server-assigned demo identity; authentication, authorization and user isolation are explicitly absent. No event identity field becomes an authorization boundary.
- **Database isolation:** APIs receive only their own role connection. The one-shot bootstrap alone receives the administrator credential. Fixed allowlisted identifiers, parameterized values, non-superuser roles without elevated capabilities/memberships, revoked PUBLIC CONNECT and hardened schema grants establish the planned boundaries.
- **Secret lifecycle:** Stable administrator/broker credentials remain outside Git and match persistent volumes. Bootstrap reconciles service-role passwords before APIs start. Application ownership of its own database is explicitly documented as a local migration simplification.
- **Exposure:** Loopback targets cover HTTP, infrastructure, dashboard and telemetry. Actual listener/container mapping inspection is required; resource labels are insufficient evidence.
- **Input handling:** Explicit-offset finite timestamps, microsecond precision, bounded identifiers/names, unknown-field rejection and 4 KiB payload limits prevent ambiguous or unbounded handling. Safe Problem Details exclude upstream bodies, stack traces and connection details.
- **Allocation integrity:** A named partial exclusion constraint enforces confirmed interval allocation. Cancellation locks and transition/event uniqueness prevent concurrent duplicate transitions. State and outbox writes share a transaction.
- **Delivery integrity:** A separate durable reservation exchange/queue, persistent messages, mandatory routing and publisher confirmations avoid inheriting lossy hello semantics. Uncertain publication retains the stable pending event.
- **Consumer safety:** Envelope, routing/message identity and bounded trace validation precede persistence. EventId uniqueness and ACK-after-commit handle replay and crash windows. Poison events reject without requeue; transient database failures remain redeliverable.
- **Resilience and telemetry:** Explicit operation budgets, bounded retry bursts with jitter and persistent scheduling satisfy repeat-safety requirements. No automatic booking retry is introduced. Sanitized diagnostics and bounded metric labels preserve constitutional privacy controls.

**Required implementation evidence**

Tasks and final checks must retain the planned evidence for:

- Negative cross-database connections and role privilege inspection.
- Secret storage/restart reconciliation and tracked credential inspection.
- Actual loopback listeners and Podman mappings.
- Malformed/oversized HTTP and event handling, including poison followed by valid delivery.
- Database concurrency, cancellation races and transactional rollback.
- Broker/consumer outages and both publication/ACK crash windows.
- Dependency audits and representative sanitized correlated telemetry.

Quickstart intentionally leaves the exact supported secret setup and volume names for implementation. These must become concrete README instructions before completion.

**Checks and changes:** Read-only artifact inspection and checksum verification. No files changed, automated application checks executed or intrusive probes performed.

**Unresolved questions:** none requiring a product decision. Tasks security review, implementation review and revision-matched execution evidence remain pending. Human feature acceptance is separate.
