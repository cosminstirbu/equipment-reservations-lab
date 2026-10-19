# Research: Prompt Outbox Wake-ups

Researched 2026-10-19 against official PostgreSQL/Npgsql documentation and repository-pinned Npgsql 10.0.3 / PostgreSQL 18.6. No dependency upgrade is required.

## Transactional notifications

**Decision:** Use a fixed channel and empty payload in an insert-only statement trigger. Establish LISTEN in autocommit mode before a separate durable scan. Keep the listener outside application transactions.

**Rationale:** PostgreSQL broadcasts to all registered sessions. Registration becomes effective at commit; its documented startup sequence is registration commit followed by inspecting durable state. Signals are advisory, not retained work. Notifications are delivered only on commit; identical notifications in one transaction can coalesce. All database users can observe channels, so the signal carries no event data. Statement triggers cover insertion paths automatically. These semantics support replicas without modifying the existing SKIP LOCKED claim.

**Alternatives:** Application-issued NOTIFY can be omitted by insertion paths; per-row triggers do extra work for batches; durable broker/CDC infrastructure is outside approved scope.

Sources: [PostgreSQL LISTEN](https://www.postgresql.org/docs/18/sql-listen.html), [PostgreSQL NOTIFY](https://www.postgresql.org/docs/18/sql-notify.html).

## Npgsql asynchronous receive

**Decision:** Use the existing instrumented data source for one dedicated leased connection, subscribe to `Notification`, and run `WaitAsync(TimeSpan, CancellationToken)` continuously with a 30-second timeout. Treat timeout as normal; only matching channel notifications signal work. No query heartbeat is added.

**Rationale:** Npgsql requires explicit waiting to process notifications outside ordinary command traffic. Its public async wait API supports timeout and cancellation and reports whether a message arrived. Only one operation uses the listener connection at a time. Healthy SQL traffic remains reduced; fallback delivery covers a silent listener problem that has not yet raised a network error.

**Alternatives:** Sharing the processing connection delays receipt during transactions; blocking Wait violates async conventions; periodic SELECT heartbeats add avoidable idle SQL. TCP failure detection tuning is separate from correctness because fallback scans already preserve progress.

Sources: [Npgsql waiting](https://www.npgsql.org/doc/wait.html), [NpgsqlConnection public wait APIs](https://www.npgsql.org/doc/api/Npgsql.NpgsqlConnection.html).

## Dependency telemetry

**Decision:** Retain official Npgsql.OpenTelemetry 10.0.3 and production `.AddNpgsql()`. Keep `ConfigureTracing` operation-name/enrichment callbacks and the existing privacy processor, admitting fixed LISTEN and revised snapshot SQL plus reviewed migration digest.

**Rationale:** The vendor package provides actual command/connection spans; supported callbacks permit safe names and admission metadata. Custom listener workflow activities and bounded state metrics fill the application wake/reconnect gap rather than duplicating SQL spans. Passive receive waits do not issue SQL. Real dependency tests must export through production registration, including controlled failures; arbitrary ActivityListener subscriptions would hide broken production wiring.

**Alternatives:** Handwritten database spans duplicate native instrumentation; logging raw provider details violates privacy; collecting SQL without exact admission can export untrusted text.

Source: [Npgsql official tracing integration and configuration](https://www.npgsql.org/doc/diagnostics/tracing.html). The vendor labels its database tracing convention experimental; pinned versions and behavioral telemetry tests protect upgrades.

## Deadline and race design

**Decision:** Extend the existing snapshot with the minimum strictly future unpublished retry timestamp, then use a capacity-one pending wake signal consumed before scanning. Preserve absolute timestamps across restarts. Worker backoff and listener reconnect are independent.

**Rationale:** A separate third query would reduce the idle query benefit. Strictly future filtering prevents spinning when another worker locks a currently due row. Signals arriving during scans remain available before sleep. Fallback caps parked future dates and recovers missed signals/manual updates. No durable outbox schema change is necessary.

**Alternatives:** Only notifications miss retries; a notification count queue grows without benefit; clearing a signal after scanning loses late arrivals; a global delay shared with reconnect changes publication backoff. Existing-row modifications intentionally rely on fallback unless already represented by a captured retry deadline.

Repository evidence: `OutboxWorker.cs`, `RecoverySchedule.cs`, `DatabaseTracing.cs`, `ServiceDefaults/Extensions.cs`, migration 001 and existing outbox/recovery/provider tests. Exact budgets, retry bursts, telemetry contract and test design are recorded in [plan.md](plan.md); no unresolved research questions remain.
