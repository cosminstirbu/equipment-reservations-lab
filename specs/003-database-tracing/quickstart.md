# Quickstart: Validate Database Operation Tracing

Automated evidence is recorded in [implementation-evidence.md](team/implementation-evidence.md); runtime inspection and independent completion gates have their own evidence records.

**Authorized registration delta — 2026-10-15**: Use shared `.AddNpgsql()` from `Npgsql.OpenTelemetry` 10.0.3. Preserve historical direct-subscription evidence; repeat mutation, tracing/privacy tests and representative runtime verification before independent delta review.

## Prerequisites

Use repository SDK/npm tools and installed Aspire CLI. Start Podman and verify Testcontainers socket configuration from repository setup. Keep credentials in existing external configuration. Use `SPECIFY_FEATURE_DIRECTORY=specs/003-database-tracing`; no branch/template changes.

Follow the installed Aspire orchestration skill for lifecycle/exact AppHost targeting. Discover endpoints from Aspire rather than fixed ports.

## Automated evidence

1. Before implementation, run the new real-PostgreSQL exported-span regression; record successful API behavior but missing native database child span on baseline.
2. After implementation run focused tracing/privacy tests with actual production registration and export-only capture. Record exact test filters, commands, environment and revision.
3. Cover the plan inventory: reads/booking/cancellation, outbox success/retry/empty poll, inbox/history, all health checks, migrations and bootstrap admin/migration sources. Assert operations/parents/duration/outcome and safe SQL/metadata.
4. Check sensitive parameters/results, unknown literal SQL, arbitrary migration, administrative SQL matching an approved template, secret-bearing ALTER ROLE and sensitive database/client failures. Inspect spans/events/status/logs/resources/metrics. Do not record secret sentinels in reports.
5. Set `DatabaseTracing__CaptureSqlText=false`; spans persist and all text disappears. With true, unknown/admin text remains absent.
6. In an isolated fresh test process remove only production `.AddNpgsql()`; expected-span regression must fail. Restore exact source, format immediately and rerun. Do not leave mutation, duplicate direct registration or add test listeners.
7. Run `npm run format-check`, `npm run lint`, `npm run check`, `git diff --check`; record actual results. Missing prerequisites remain pending checks.

## Runtime Aspire evidence

Inspect/start exact repository AppHost with installed orchestration skill and discover dashboard/service endpoints. Verify bootstrap OTLP injection and delivery after its process exits.

Exercise equipment list/detail, reservation creation/cancellation, asynchronous outbox/inbox/history, each database health endpoint and empty poll. Inspect startup/migration/provisioning traces and a controlled database failure. Verify safe SQL only for approved commands, admin text always absent, no raw error details, proper workflow context and no prior-event context on empty polls. Demonstrate SQL-off retaining operation spans, restore configuration and stop only validation-owned AppHost according to lifecycle rules.

Record trace IDs/links, revision, scenarios and coverage reconciliation without secrets. Independent review, convergence and explicit human acceptance remain required after automated/runtime checks.

## SQL configuration and maintenance

`DatabaseTracing:CaptureSqlText` defaults true when absent. The environment key is
`DatabaseTracing__CaptureSqlText`. Configure the actual Inventory, Reservations,
Notifications and DatabaseBootstrap processes; restart after changes. SQL-off leaves
native operation/connection spans, bounded logical database/operation metadata,
timing, outcomes and parent relationships intact. Administrative sources ignore
SQL-on and never include statement text.

Review whole templates in `EquipmentStore.Commands`, `ReservationStore.Commands`,
`OutboxWorker.Commands`, `ReservationInbox.Commands`, shared health and migration
ledger commands. SQL constants are used for both execution and admission. Never
substitute bound values into text. Changed or unknown text falls back to a generic
`postgresql.command` without SQL. Existing safe status/event/demo literals are
reviewed fixed structure, not permission to include arbitrary literals.

For embedded scripts, the owning `ServiceMigrations` lists the exact resource name
and reviewed SHA-256 content digest. Review the complete script, including seeds,
before adding/updating admission. Do not edit an applied migration or blindly update
a checksum to satisfy a gate. Arbitrary `SqlMigration` content is not auto-approved.
Per-source admission and administrative exclusion apply during bootstrap too.

Physical connection operations have safe exported names and metadata. Internal
native OperationName can differ; OTLP exports the sanitized DisplayName. Native
internal BEGIN/COMMIT/ROLLBACK protocol operations do not guarantee their own spans;
assert executed application commands and their actual workflow context instead.
