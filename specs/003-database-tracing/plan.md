# Implementation Plan: Database Operation Tracing

**Branch**: `main` (no branch created; explicit feature-directory override) | **Date**: 2026-10-15 | **Spec**: [spec.md](spec.md)

**Input**: Clarified specification SHA-256 `f75233085e5647f7f572b7efdce34e30bc5f5b898de8339ff83b4dc00ef8c95e`; source baseline `6241fb1495412274b3de3242d7ec3eb36f9ee4b6`.

**Authorized design delta — 2026-10-15**: Use documented `Npgsql.OpenTelemetry` 10.0.3 `.AddNpgsql()` registration in ServiceDefaults instead of the original equivalent direct source subscription. This bounded package/registration delta preserves all privacy, SQL-admission, context and bootstrap-lifecycle requirements. Historical review hashes/reports remain historical; the delta requires current checks and independent review.

## Summary

Subscribe production OpenTelemetry to supported native Npgsql activities. Apply a shared fail-closed SQL admission policy, fixed safe metadata and exception sanitization before export. Reuse host-neutral telemetry registration in bootstrap, start its provider before database work and flush before process exit. Preserve application behavior and asynchronous context.

## Technical Context

**Language/Version**: .NET 10 / C# 14 and existing pinned SDK.

**Primary Dependencies**: existing Npgsql 10.0.3; OpenTelemetry SDK/hosting/exporter 1.19.1; ASP.NET Core; existing Aspire. Add `Npgsql.OpenTelemetry` 10.0.3 to `src/ServiceDefaults/ServiceDefaults.csproj` and use `.AddNpgsql()`; no other package upgrade.

**Storage**: existing PostgreSQL databases and migrations; no schema/data changes.

**Testing**: xUnit, WebApplicationFactory, Testcontainers PostgreSQL, production OpenTelemetry provider with capture exporters; existing application checks.

**Target Platform**: supported local workstation, Podman, Aspire dashboard and existing OTLP wiring.

**Project Type**: three web services, short-lived Generic Host bootstrap, shared operational/persistence libraries.

**Performance Goals**: no extra database calls; one native span per existing command, bounded metadata and exact-template lookup. Owner selected health/poll volume inclusion.

**Constraints**: no values/results/raw exception export, SQL parser, new retry behavior, templates, business/API/schema changes or new services.

**Scale/Scope**: all current database paths in Inventory, Reservations, Notifications, Persistence and DatabaseBootstrap.

## Constitution Check

Pre-research and post-design assessment: compliant design proposed; independent verdicts pending; no policy exception requested.

| Principle / guide | Design and required evidence |
| --- | --- |
| I Simple design | Native driver spans; one shared source policy and host telemetry setup; no SQL parser, repository layer or new project. |
| II Test first | Failing real-DB exported-span regression before code; removal mutation reproduces missing-span failure. |
| III Public behavior | API/worker/bootstrap/migration entry points with real PostgreSQL. Focused production telemetry-host integration justified for unknown SQL/errors without new application endpoints. |
| IV Useful feedback | Export-time snapshots, isolated providers, deterministic failure injection, explicit operations/parents; no test source listeners. |
| V Observability | Full path inventory below; privacy at driver/event/export boundaries; production pipeline tests and Aspire evidence. |
| VI Resilience | Preserve runtime connect 3s / command 5s, migrations 30s (unlock 3s), bootstrap connect 3s / command 30s / overall 120s. No new retries/breaker. Existing transactions, cancellation and outbox backoff unchanged; separate bounded telemetry shutdown budget. |
| Engineering guides | Apply README, aspnet-core, testing, observability, resilience, aspire and formatting-and-linting guides. Source-generated logging for new known events; no new JSON/regex need. Exact-file format, inspect generator/analyzer diagnostics, final format/lint/full check. |

## Architecture and trust boundaries

### Production registration and data-source construction

Extract telemetry-only registration from ServiceDefaults into an `IHostApplicationBuilder` extension. Keep web health/Kestrel/routing defaults on WebApplicationBuilder. Register native `Npgsql` through `.AddNpgsql()` alongside existing workflow/HTTP sources, existing AlwaysOn sampler, metrics and OTLP. The pinned adapter delegates solely to `.AddSource("Npgsql")`; it does not replace application privacy controls. Keep only one Npgsql registration call. Call once per host; repeated calls must not create duplicate exporters/providers.

Place shared Npgsql source/tracing policy in Persistence, already referenced by ServiceDefaults/bootstrap. Replace all production `NpgsqlDataSource.Create` sites: ServiceDefaults runtime source; bootstrap admin source; bootstrap per-database admin source; bootstrap per-service migration source. Use fixed logical source names and database identities from the current finite set, never connection strings/usernames. Preserve `IncludeErrorDetail=false` and `LogParameters=false`.

Use native command span-name/enrichment callbacks to attach bounded operation descriptors. Unknown commands use `postgresql.command`; no SQL/dynamic identifier span names. Do not filter commands for privacy. Retain native physical connection tracing with normalized safe names/identity, including connection failure before command execution. No promise of separate internal BEGIN/COMMIT/ROLLBACK spans: the driver may send these without command activities.

### SQL admission

Setting `DatabaseTracing:CaptureSqlText` (environment `DatabaseTracing__CaptureSqlText`) defaults true for the supported local app; false removes text while retaining spans. This does not select production hosting policy.

Admit only exact ordinal matches against reviewed compile-time templates for the source. Share named SQL constants with executing stores to avoid diverging copies. Review the whole statement including fixed literals; existing status/event/demo literals can be safe, but placeholders alone prove nothing. Never reconstruct bound values, classify SQL with regex or presume SQL verbs are safe. Unknown/modified/ad hoc text stays omitted with a generic operation span.

Embedded migrations require explicitly reviewed resource identity and exact content digest; do not auto-approve all reflected resources or arbitrary `SqlMigration.Sql`. Review current seed literals as part of complete scripts. Ledger/lock commands belong in the reviewed catalog. Changed/new script content remains text-off until reviewed.

Source purpose is authoritative: all administrative provisioning sources are always text-off even if a command exactly matches a safe runtime/migration template. Service-owned migration sources created during bootstrap can admit explicitly reviewed migration text. This preserves FR-008's distinction without omitting provisioning operations.

### Privacy before every exporter

Credentials and parameters stay inside the trusted app/database boundary; command text, errors and connection-derived identifiers are untrusted diagnostic inputs. Native Npgsql adds SQL text, connection fields and exception events automatically.

A production `BaseProcessor<Activity>` before every exporting processor normalizes Npgsql display names, tags and status. Rebuild from an explicit safe set: fixed `db.system.name`, fixed logical `db.namespace`, bounded `db.operation.name`, optional approved `db.query.text`, validated SQLSTATE or bounded client error category. Remove automatic source/connection IDs, addresses/ports and any unapproved fields. Keep descriptor/source-policy state in non-exported Activity custom properties, not baggage. Preserve duration/trace IDs/real parent.

Native exception events cannot be cleared through the supported processor API. Install one production-owned `ActivityListener` scoped to `Npgsql` solely for `ExceptionRecorder`, replacing its `ref TagList` with safe category/type, redacted message and stack fields before `Activity.AddException` creates the event. Configure NO sampling callbacks: it must not activate spans without production `.AddNpgsql()`. Bind listener lifetime to host/provider, initialize before database work, verify disposal across repeated hosts. Normalize non-Postgres `StatusDescription` separately at span end because the driver can put raw messages there. No reflection, test listeners or exporter-specific-only sanitization.

Keep driver logging disabled and never log exception objects/messages or raw SQL. Verify logs (including console), resources and metric dimensions as well as spans. Existing app logs record safe categories; do not add secrets to resource configuration. Existing bounded metrics remain unchanged.

### Bootstrap and asynchronous context

Bootstrap invokes shared telemetry before Build, starts the host/provider before ReconcileAsync, and creates a real bootstrap workflow activity. Stop/flush/dispose tracing and logging on success and failure with a bounded independent shutdown token; the operation's cancelled deadline must not prevent export. Inspect existing AppHost OTLP injection and verify short-lived process delivery; merely Build/resolving a logger does not start hosted telemetry.

HTTP/store work naturally parents to current workflow. Outbox snapshot/selection commands happen before the row's saved context is available: keep them standalone or under a genuine poll span. Do not attach them retroactively to the selected reservation. Existing publication context starts after selection; publication updates/retries parent there. Inbox insert parents to the existing propagated consumer context. Empty polls must not inherit prior events. Migrations use actual startup/bootstrap context or stand alone.

## Coverage and requirement mapping

| Path | Expected commands / context | Representative verification | Requirements |
| --- | --- | --- | --- |
| Inventory EquipmentStore | list/detail SELECT; HTTP parent | API real DB capture + Aspire | FR-001–005,007,009–011 |
| ReservationStore | availability/history/detail SELECT, reservation/outbox INSERT, cancellation lock/read/UPDATE/outbox | API book/cancel and controlled failure, workflow IDs | FR-001–005,007,009–011 |
| OutboxWorker | snapshot/select, published UPDATE, reschedule UPDATE | success/retry/empty poll with real DB; real message vs poll context | FR-001–003,006–007,009–011 |
| Notifications | inbox INSERT/dedup, history SELECT | propagated consumer and HTTP history | FR-001–004,006–007,009–011 |
| All DatabaseHealth | SELECT 1; health request | each service health endpoint | FR-001–003,006–007,009–010 |
| SqlMigrations/startup | advisory lock/unlock, ledger create/lookup/insert, embedded script | empty DB + repeat migration; direct and bootstrap paths | FR-001–010 |
| Bootstrap admin sources | role/membership/DB lookup, create/alter/revoke/grant, schema/extension | full ReconcileAsync, distinctive password, no SQL text | FR-001–003,006–010 |
| Unknown SQL / connection failure | generic command or safe connect failure, no fabricated execution | real PG production telemetry host, unavailable connection | FR-002–003,007–009 |

## Validation design

First failing regression: equipment list succeeds against real PostgreSQL but no native database child span is exported on baseline. Tests add only exporters/processors to actual production registration, never independent source subscriptions/listeners/instrumentation. Snapshot names, source/kind, IDs/parents, duration/status, all tags/events/links, resources, log state/exception/formatted text and metric dimensions at export time. Assert expected operations, not only some spans. Dispose providers between scenarios and avoid unrelated global Npgsql subscribers.

Do not use `PostgresFixture.Factory` unchanged for this proof: it replaces the production source with raw `NpgsqlDataSource.Create`. Configure the isolated connection before production application registration, or use the approved production source factory so source-purpose/callback/privacy configuration is exercised. Reuse exporter snapshot patterns from `TelemetryPrivacyTests`. Add a DatabaseBootstrap project reference to Backend.Tests if provisioning integration lives there; do not bypass its public reconciliation/host entry points.

After passing implementation, remove only production `.AddNpgsql()`, run the focused regression in a fresh isolated process, record missing-span failure, restore exact source, format and rerun. The production exception recorder must not mask missing collection. For the authorized adapter delta, repeat this mutation against the actual adapter registration, preserve historical evidence, rerun database tracing/privacy/bootstrap/worker tests and required quality checks, and refresh representative Aspire command and SQL-off evidence before independent delta review.

Privacy cases: sensitive parameter/result; approved SQL retaining placeholders; unknown SQL with both `$1` and sensitive literal; arbitrary migration text; capture setting off; admin SQL identical to a reviewed statement; secret-bearing ALTER ROLE; server exception containing sensitive MESSAGE/DETAIL; client/connection failure. Assert no sentinel anywhere exported, no SQL in names, and safe failure signals. Test registration/exporter ordering, all bootstrap source constructors and shutdown flush. Do not copy secrets into evidence reports.

Runtime evidence covers API read/write/cancellation, publication/consumption, health, empty poll, migration, administrative provisioning and controlled failure. Record representative trace IDs/links and coverage mapping; startup/polling naturally require separate traces. Show bootstrap spans after process exit and SQL-off retaining spans.

Run `npm run format-check`, `npm run lint`, `npm run check`, `git diff --check` on candidate revision. Freeze independent quality/security review and convergence. Tests/mutation/runtime evidence remain pending until implementation; design does not grant acceptance.

## Project Structure

```text
specs/003-database-tracing/
  spec.md
  plan.md
  research.md
  data-model.md
  contracts/database-telemetry.md
  quickstart.md
  tasks.md                         # after independent design review
src/Persistence/                  # shared source construction / reviewed SQL policy
src/ServiceDefaults/              # host telemetry / privacy / web defaults
src/DatabaseBootstrap/            # source purpose and telemetry lifetime
src/Inventory/                    # reviewed SQL
src/Reservations/                 # reviewed SQL / preserve outbox context
src/Notifications/                # reviewed SQL / preserve consumer context
tests/Backend.Tests/              # API/worker/production pipeline tests
tests/Smoke.Tests/                # bootstrap/runtime evidence where needed
```

**Structure Decision**: Extend existing boundaries; no new project or HTTP endpoint. Diagnostic/configuration contract is in `contracts/database-telemetry.md`.

## Complexity Tracking

No policy exceptions. The non-sampling exception listener is necessary because supported Activity APIs do not remove existing events; lifetime and missing-subscription regression checks prevent unintended activation.


## Prospective testing-policy supersession — feature 007

On 2026-10-16, the owner approved [feature 007’s testing policy](../007-aspire-independent-tests/supersession.md), which supersedes this document’s automated Aspire/AppHost and manifest-publication obligations and retired Smoke.Tests paths. Retained application/provider guarantees have [replacement coverage](../007-aspire-independent-tests/team/coverage-disposition.md); local orchestration is verified manually. Deployment manifest support is outside scope. Original requirements, task markers, acceptance status, review hashes, and evidence above remain historical records; they do not approve feature 007.
