# Database tracing runtime evidence

Status: runtime checks passed on source snapshot `79a1bbac6bb4e7ca3ebce3a70f8973fbe48150899aac32b51e5f0fc71f5de058`; final independent verdicts, convergence and human acceptance are separate gates.

## Baseline

On 2026-10-15, the existing Aspire application returned HTTP 200 for equipment listing.
`aspire otel spans --apphost src/AppHost/AppHost.csproj --trace-id 65e0f4b2abc9822416b3ceae2b831c8d --format Json --non-interactive --nologo`
returned exactly one span, `GET /api/equipment`, despite the endpoint executing the real
PostgreSQL equipment query. No Npgsql child span was present. The source lacked a
production Npgsql subscription; workflow/database dependency metrics did not provide
command spans. This observation predates implementation and is not final evidence.

## Environment and commands

2026-10-15, existing local workstation and Podman; Aspire 13.6.1, PostgreSQL 18.6,
RabbitMQ 4.3.6, Npgsql 10.0.3 and OpenTelemetry 1.19.1. Used the binaries validated by
the final automated checks. All 250 source manifest entries matched after those checks.
No source changed during runtime validation. Existing volumes and external credentials
were retained; no reset or direct database repair was performed.

The exact AppHost was `src/AppHost/AppHost.csproj`. No editor lifecycle tools were
available; used the installed orchestration and monitoring skills with explicit CLI
targeting. Normal stops preserved volumes. Representative commands (output containing
resource configuration was redirected to private files):

```sh
env ASPIRE_CONTAINER_RUNTIME=podman aspire start --apphost src/AppHost/AppHost.csproj --no-build --format Json --non-interactive --nologo
aspire wait inventory --apphost src/AppHost/AppHost.csproj --timeout 90 --non-interactive --nologo
aspire wait reservations --apphost src/AppHost/AppHost.csproj --timeout 90 --non-interactive --nologo
aspire wait notifications --apphost src/AppHost/AppHost.csproj --timeout 90 --non-interactive --nologo
aspire describe --apphost src/AppHost/AppHost.csproj --format Json --non-interactive --nologo
aspire otel spans --apphost src/AppHost/AppHost.csproj --format Json --limit 3000 --non-interactive --nologo
aspire otel logs database-bootstrap --apphost src/AppHost/AppHost.csproj --format Json --limit 20 --non-interactive --nologo
aspire export --apphost src/AppHost/AppHost.csproj --output /tmp/db-tracing-evidence/default-export.zip --non-interactive --nologo
```

Endpoints came from `describe`, not assumed service ports. Public HTTP requests supplied
distinct W3C trace parents. The initial normal run exercised equipment list/detail,
availability, booking, overlap conflict, reservation detail/history, cancellation,
durable notification observation and all three health endpoints. One validation booking
was created and cancelled through the API; its two transition event IDs were both
observed in the inbox. Subsequent runs performed reads only.

## SQL-on workflow evidence

| Scenario | HTTP | Trace ID | Database evidence |
| --- | --- | --- | --- |
| Equipment list | 200 | `20534cd8b6504df1b03cc853001e8831` | HTTP server plus `postgresql.equipment.list` child, two spans total |
| Equipment detail | 200 | `2d53f8bd9b7b4ca1bb017720238da9cd` | Reviewed query text retains `$1` |
| Availability | 200 | `b7485dbf34634d1b94aabc805d7c4b2b` | Inventory query and reservation availability command |
| Booking | 201 | `723014e729a34af7b4a2235cd1e637f2` | 11 spans: Inventory query, reservation/outbox inserts, async publish/update, consume/inbox insert |
| Conflict | 409 | `96b8ac24f14a4d2cade26104abd46fb3` | Failed database insert is observable without raw exception detail |
| Cancellation | 200 | `85ccc0a1a33443dd8d2c0b463d6f8b29` | 10 spans: lock/find/cancel/outbox insert, publish/update and consume/inbox insert |
| Reservation history | 200 | `7e7de5b0b3d1438888ba9b7d35917ee3` | `postgresql.reservation.list` |
| Notification history | 200 | `92a17a13b7a94271a6589ceef5709f1e` | `postgresql.inbox.list` |

Both inbox inserts had `reservation.consume` as their actual parent. Both published
updates had `reservation.publish` as their actual parent. An initial sample contained
76 outbox snapshot/selection commands with no reservation parent, including empty polls.
All three service health requests produced `postgresql.database.health` commands.

The visible parameterized example was:

```sql
SELECT id, name, operational FROM equipment WHERE id=$1
```

## Bootstrap and migrations after process exit

`database-bootstrap-pfvdphda` was Finished, exit 0, before telemetry inspection.
Its trace `8b481461ac1099cf5195174f667726d0` contained the root `database.bootstrap`
and 58 native spans: seven connections, 39 administrative/unknown commands and 12
service migration lock/ledger/lookup/unlock commands. All 39 administrative command
spans omitted SQL text; the reviewed service migration commands retained approved text.
The completed structured log matched the root trace ID and span ID.

Existing persistent databases already had their migrations, so this startup correctly
exercised repeated migration lookup rather than reapplying scripts. Fresh script
application, digest mismatch, all provisioning constructors, SQL-off, and success/failure
process export/log correlation are additionally covered by the 18 real PostgreSQL
focused tests documented in `implementation-evidence.md`. No path was approved for omission.

## Controlled outage and recovery

Stopped only `postgres-nbxmtzyr` with `aspire resource ... stop`, requested each service's
health once, then immediately restored it with `aspire resource ... start`. No force,
volume deletion, credential change or schema modification was used.

| Service health | HTTP | Trace ID | Safe failure signal |
| --- | --- | --- | --- |
| Inventory | 503 | `b0514a87bc7341cd9c86231509d1c103` | Database health failure, SQLSTATE `57P01` |
| Notifications | 503 | `ac2e103355d24be0b6c64edeca48fb54` | Database health failure, SQLSTATE `57P01` |
| Reservations | 503 | `e4316dd41ebf4c4eb71b2604a0c8886c` | Safe connection-failure spans for its DB and Inventory dependency |

After resource readiness, seven real API/health requests returned 200 and each had native
database spans. Connection failure spans were not represented as successfully executed SQL.

## SQL-off and restoration

Stopped the exact AppHost and started a fresh session with:

```sh
env ASPIRE_CONTAINER_RUNTIME=podman DatabaseTracing__CaptureSqlText=false aspire start --apphost src/AppHost/AppHost.csproj --no-build --format Json --non-interactive --nologo
```

All four .NET processes inherited the setting. The CLI sample had 117 database spans
across bootstrap, Inventory, Reservations and Notifications, **zero** `db.query.text`
attributes, and all seven API scenarios had native spans and HTTP 200 results. The
separate exported snapshot had 105 database spans and zero SQL text attributes; differing
counts reflect separate sampling times. Operation names, timing, identities and correlation
remained present. `telemetry-audit-off.json` records the full inspected export scope.

Stopped the SQL-off session, then restarted without that override. All three services
were healthy. Seven read-only API/health scenarios returned 200 and each had approved SQL
text in native spans again. The current equipment-detail trace is
[d0174ab5c2a0457abf1daba4f10fddda](http://127.0.0.1:15888/traces/detail/d0174ab5c2a0457abf1daba4f10fddda).
The default session remains available for owner review while human acceptance is pending.

## Privacy inspection

See `telemetry-audit-default.json` and `telemetry-audit-off.json`. Inspected all application
trace/log JSON and application console records for bootstrap and the three services,
including resources, span names/tags/status/events and log fields. The default export
contained 387 application spans, 259 database spans, 192 approved SQL text spans and
16 sanitized database exception events. Both exports had zero exact matches for six
live secret values and the local account, zero connection-string Password fields and
zero forbidden raw HTTP attributes. Native database attributes were restricted to the
documented safe set; exception messages/stacks used the fixed safe replacements.

Raw archives remain in a local directory with mode 0700 and are not committed. Resource
configuration contains private values; DCP system-launcher records and infrastructure,
frontend and installer console diagnostics were explicitly excluded from application
telemetry acceptance. No whole-archive sanitization or universal future-input guarantee
is claimed. Aggregate metrics remain covered by production-export capture and existing
bounded-dimension tests; the CLI export was not represented as a metrics export.
