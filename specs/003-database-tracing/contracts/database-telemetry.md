# Database Telemetry Contract

Configuration/export contract only; existing application contracts unchanged.

**Authorized registration delta — 2026-10-15**: Shared production registration uses `Npgsql.OpenTelemetry` 10.0.3 `.AddNpgsql()`, subscribing to the same native source as the original direct registration. All exported fields, privacy guarantees, source purposes and settings below remain binding.

## Configuration

`DatabaseTracing:CaptureSqlText` / `DatabaseTracing__CaptureSqlText` defaults true for the supported local app. False removes text while preserving command spans. Existing `OTEL_EXPORTER_OTLP_ENDPOINT` enables export for web services and bootstrap.

Administrative provisioning and unknown/unreviewed text are always omitted. Reviewed migration text is eligible on a service migration source even during bootstrap.

## Exported spans

| Field | Contract |
| --- | --- |
| source / kind | `Npgsql` / Client |
| display name | bounded reviewed operation or `postgresql.command`; safe connection label |
| `db.system.name` | `postgresql` |
| `db.namespace` | fixed logical database from source policy |
| `db.operation.name` | bounded descriptor or fixed unknown fallback |
| `db.query.text` | optional exact reviewed template, placeholders retained, never substituted |
| duration/status | native duration; errors preserved; successful Unset means non-error, not missing failure instrumentation |
| SQLSTATE / error category | validated SQLSTATE or bounded safe client category |
| exception event | safe type/category, redacted message/stack; no raw diagnostic details |
| correlation | actual current workflow parent; no retroactive polling attribution |

Remove unapproved source/connection IDs, addresses/ports and connection-derived fields. SQL must not appear in names or alternate tags/events/logs/resources. No parameter/result/secret/payload capture. Existing user/equipment correlation permissions remain governed by the constitution.

## Behavioral invariants

Each sampled in-scope executed command produces a span, including no-request startup/polling work. Connection failure does not imply SQL executed. Separate internal transaction-control spans are not promised. SQL execution, budgets, retries, persistence, endpoints, authorization and messaging remain unchanged.

Tests add exporters only to production registration, never Npgsql source subscriptions/listeners. The narrowly scoped production exception recorder has no sampling callbacks. Removing production `.AddNpgsql()` must fail the expected-span regression in isolation. Every exporter sees already-sanitized telemetry.
