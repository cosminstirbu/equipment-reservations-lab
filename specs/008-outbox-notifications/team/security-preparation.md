Security preparation review — **pass**

Feature: `specs/008-outbox-notifications`
Revision: `prep-design-round0`, baseline `5ab2ed2800b95a69f1522d617b510e3aeff47701` plus frozen requirements/design artifacts.
Scope: requirements and design only; implementation has not been approved.

Reviewed `spec.md`, `plan.md`, `research.md`, `data-model.md`, `quickstart.md`, and `contracts/notifications.md`, applicable constitution/engineering guides, team protocol/security role, current worker and database telemetry privacy implementation.

**Assets and trust boundaries**

Durable outbox data, event identity, publication state, database credentials/connections, retry protections and exported telemetry are relevant assets. Actors are existing authorized reservation callers, scoped runtime/database principals, worker replicas and migration operators. PostgreSQL notification input crosses a database-session boundary; it does not authenticate an event or authorize publication. Existing database records and row-lock transactions remain authoritative.

**Assessment**

- Payload-free, fixed-channel signals avoid event-data disclosure to other database listeners. Incoming payload/PID is ignored; spoofing a notification cannot inject an event, modify retry eligibility or bypass backoff. Evidence: plan “Database signal and trust boundary,” “Lost-wakeup safety and processing,” notification contract.
- Invoker-rights function, explicitly qualified `pg_catalog.pg_notify`, additive reviewed migration and unchanged grants avoid introducing elevated execution authority or interpolated SQL. Evidence: plan database design; data-model database objects.
- Connection/setup budgets, one listener connection per replica, coalescing, separately bounded reconnect bursts and terminal permanent-failure propagation address introduced availability risks. Peer-locked rows cannot create a deadline-driven spin. Evidence: listener lifecycle, race design and resilience settings.
- Native Npgsql instrumentation, exact command admission, bounded labels, sanitized exceptions and production-export tests preserve telemetry privacy without trusting custom log messages alone. Evidence: observability section and test design record; existing `DatabaseTracing` and `DatabaseTelemetryPrivacyProcessor`.
- No API authorization, tenant identity, message envelope or dependency-version change is proposed. No new authorization or tenant-isolation issue is identified within this scope.

**Findings**

No confirmed security vulnerabilities. No blocking preparation findings or unresolved security questions. A database principal can generate redundant advisory wake-ups; this is explicitly documented, and no new public notification endpoint or runtime authority is introduced. No risk acceptance or policy waiver is recorded.

**Required implementation evidence**

The implementation review must verify the promised controls in actual code and revision-matched tests:

1. Scoped runtime-role insertion invokes the trigger without expanded DDL/elevated grants.
2. Real PostgreSQL confirms commit-only empty notifications; arbitrary nonempty payloads neither affect event reconstruction nor appear in exports.
3. Listener interruption, permanent database failures, cancellation and overlapping notification/backoff demonstrate bounded recovery and resource release.
4. Production-exported successful/failed LISTEN and changed SQL operations retain safe attributes and sanitized exception events.
5. Replica, locked-row and idle-cost evidence confirms no spin, unbounded queue or extra heartbeat-query load.

Checks performed: read-only artifact/source inspection. No files changed, tests executed, intrusive probes performed or residual risks accepted. Full implementation checks and representative Aspire telemetry inspection remain pending under the plan.
