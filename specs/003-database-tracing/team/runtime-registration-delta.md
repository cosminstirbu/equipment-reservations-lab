# AddNpgsql runtime validation

Date: 2026-10-15. Source snapshot `17d49d5e859ac45eaf5231448ccd629f73750ed2f04f6aa95c0381644cbe88c4`, 250-file manifest; current binaries passed all required automated checks. This is refreshed evidence for the documented registration delta T030, supplementing historical full-feature runtime evidence without relabeling its revision.

## Exact environment and commands

Installed Aspire orchestration and monitoring skills; no editor lifecycle tools exposed. Exact AppHost `src/AppHost/AppHost.csproj`, existing Podman and persistent volumes. Used normal stops, no force/reset/deletion. Starts used `env ASPIRE_CONTAINER_RUNTIME=podman aspire start --apphost src/AppHost/AppHost.csproj --no-build --format Json --non-interactive --nologo`. SQL-off start additionally set `DatabaseTracing__CaptureSqlText=false`; restored start omitted it. Each session used `aspire wait inventory`, `aspire wait reservations`, `aspire wait notifications` with exact AppHost, `--timeout 90 --non-interactive --nologo`, all exit 0. Endpoints discovered from private `aspire describe --apphost src/AppHost/AppHost.csproj --format Json --non-interactive --nologo` output.

Read-only HTTP scenarios supplied unique W3C trace parents: equipment list/detail, reservation history, notification history and each of three health endpoints. All seven returned HTTP 200 in each of the three fresh sessions. No new booking or direct database write was used for this delta; bootstrap retained its normal reconciliation. Actual current API write/worker/failure paths are covered by the refreshed 18 focused real-PostgreSQL tests and full 229 backend/45 smoke checks, including bootstrap process success/failure and exception/log privacy. Historical full workflow/outage evidence remains explicitly tied to its earlier snapshot.

Queried native spans with `aspire otel spans --apphost src/AppHost/AppHost.csproj --format Json --limit 3000 --non-interactive --nologo`. Exported privately with `aspire export --apphost src/AppHost/AppHost.csproj --output /tmp/db-tracing-evidence/registration-on-export.zip --non-interactive --nologo`, and equivalent `registration-off-export.zip`. Commands exited 0; private raw resources/archives are excluded from committed artifacts.

## Results

| Session | Scenarios | Native/SQL evidence |
| --- | --- | --- |
| SQL-on default | 7/7 HTTP 200 | Each trace contains native database commands with reviewed SQL. Export audit: 112 application spans, 90 database spans, 40 reviewed SQL attributes. |
| SQL-off | 7/7 HTTP 200 | Each trace retains native commands; CLI and export both show 77 database spans and zero SQL attributes. Spans cover bootstrap and all three services. |
| Default restored | 7/7 HTTP 200 | Each trace again contains native database commands with reviewed SQL. All three services healthy. |

The default bootstrap resource was Finished, exit 0, before inspection. Trace `349eef6d650b6c3f21f6f44dfa99cbd3` contains the root plus 58 native spans. Administrative/generic and connection spans have no SQL; reviewed migration lock/ledger/lookup/unlock commands remain eligible. Existing volumes exercise migration lookup, not fresh script application; the current automated fresh-database tests cover script application and digest admission.

All scenario/status/trace IDs are in [runtime-registration-scenarios.json](runtime-registration-scenarios.json). Current default equipment-detail trace: [80bc6703b7c949cc9d474e0716a2e6c6](http://127.0.0.1:15888/traces/detail/80bc6703b7c949cc9d474e0716a2e6c6). The default session remains available for owner review while explicit acceptance is pending.

## Privacy evidence and limits

[SQL-on audit](telemetry-audit-registration-on.json) and [SQL-off audit](telemetry-audit-registration-off.json) inspect four application trace exports, four structured-log exports and application console records. Both checked six exact live secrets and local account identity, connection Password fields and forbidden raw HTTP attributes: zero matches. Every observed native database attribute belongs to the safe set; safe names/timing retained; administrative SQL omitted. No database failure occurred in these read-only runtime samples, so they do not claim new live exception-event evidence; current focused success/failure tests inspect those fields through the unchanged production pipeline.

Raw archives/resource configuration are private, not declared sanitized. Infrastructure, frontend, installer and DCP system-launcher records are excluded from application telemetry acceptance. Metrics privacy remains covered by automated capture; CLI export is not a metrics export. This evidence covers the supported trusted local application and observed scenarios, not arbitrary future input or a production retention/access solution.

No source changes during runtime. Independent final reviews and coordinator convergence remain separate gates; this report is not human acceptance.
