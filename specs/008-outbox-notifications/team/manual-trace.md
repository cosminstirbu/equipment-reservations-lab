# Manual Aspire trace inspection — 2026-10-19

Status: PASS on production source frozen for implementation review round 0. Subsequent round-1 repairs change tests only; source hashes must remain equal for this evidence to apply.

## Session and commands

Exact target: `src/AppHost/AppHost.csproj`. Coordinator read local Aspire orchestration/monitoring skills and the repository manual procedure. No editor lifecycle tools are exposed. `aspire ps --format Json` was empty before starting. Started with `ASPIRE_CONTAINER_RUNTIME=podman aspire start --no-build --non-interactive --apphost src/AppHost/AppHost.csproj --format Json`, exit0; `aspire wait web` exit0. Existing ordinary secrets and named volumes were preserved. Descriptions and credential-bearing URLs remained in restrictive private temporary files.

Discovered the current Web URL from `aspire describe`, then ran the existing browser scenario using only privately retrieved employee-a credentials:

`npm --prefix src/Web run test:browser -- --grep 'real services book, conflict, cancel, rebook'`

Exit0: **1 passed (9.5s)**. Actual services handled booking, conflict, cancellation, rebooking and explicit inbox event-ID observation. Browser fixture cancels its own test reservations in cleanup; normal retained history remains. No existing reservations, provider volumes, secret stores or account identities were reset. Browser trace/screenshots/video were disabled by existing configuration.

## Exported trace observations

Used `aspire otel spans reservations --apphost src/AppHost/AppHost.csproj --format Json --limit 250` and the matching logs command. Inspected 84 spans and safe structured logs.

- Listener setup trace `23bad30313a1f0bd24e1ce1d4f764c4d`: `outbox.listen` span `68454bdbed6cbd69` status Ok; native `postgresql.connect` and `postgresql.outbox.listen` are children of that setup span.
- Representative event trace `f63157b9e936fb2ee204541cbe3f1947`: reservation workflow `e613a2461091bf3b` contains reservation/outbox writes. `reservation.publish` span `abe2159fcc486a16` has that workflow as parent, status Ok, duration73ms; native `postgresql.outbox.published` is its child.
- Three further publication spans succeeded (14ms,14ms,12ms). All four correlated publication logs report published. Actual inbox observations in the browser scenario establish broker-backed delivery for these transitions.
- Native revised snapshot and SKIP LOCKED selection were present (11 each across the observed startup, idle and event activity). SQL text contains reviewed templates and placeholders, including the future retry minimum; LISTEN uses the fixed channel. This mixed activity is not the controlled idle-rate benchmark.
- Listener setup trace is independent of restored event producer traces, as required for coalesced signals. Live logs include the safe listening state and four successful publication outcomes.

## Privacy and cleanup

Inspected exported attribute names, SQL values, log messages/attributes and trace relationships. Database attributes were bounded identity/operation fields and reviewed parameterized SQL; no parameter values, passwords, connection strings, bearer tokens, notification payloads or request bodies appeared. A scan for credential/connection/token patterns found zero, and the privately retrieved account password was absent. No failures were deliberately introduced into ordinary local storage; controlled failure and recovery/privacy exports are verified by real-provider automated tests.

`aspire stop --non-interactive --apphost src/AppHost/AppHost.csproj` exit0 explicitly reported the exact owned session stopped successfully. Only the coordinator-owned session was stopped; no force/reset/prune command was used. Private browser account fixture removed after use. Explicit UNLISTEN native cleanup is covered by production-export tests, since stopping the app ends its exporter and does not guarantee dashboard receipt of final cleanup spans.

This is the required representative live telemetry observation. It does not claim a complete new manual console, persistent-storage restart or accessibility review. Automated test evidence and independent reviews retain their own scope and ownership.
