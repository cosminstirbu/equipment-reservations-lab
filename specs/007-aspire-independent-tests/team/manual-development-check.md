# Manual local-development check — 2026-10-16

## Scope and ownership

Coordinator followed/reviewed the approved manual procedure using installed Aspire orchestration/monitoring skills. Exact target: `src/AppHost/AppHost.csproj`. No editor lifecycle tools were available. `aspire ps --format Json` was empty before start. Only coordinator-started sessions were stopped/restarted; no manifest was generated. Runtime `src/` is unchanged from accepted e195295 baseline. This is one local-development observation, not an automated Aspire test suite.

## Observations

| Action | Expected | Actual |
| --- | --- | --- |
| CLI startup (`aspire start --no-build`, exact target) and `aspire wait web` | App and providers ready; provisioning completes | Pass: PostgreSQL, RabbitMQ, Keycloak, Inventory, Reservations, Notifications, Web and pgAdmin healthy; database/identity bootstrap finished. Initial Web readiness13.8s, restart21.0s. |
| Authenticated dashboard HTTP | Protected dashboard link opens | HTTP200 using private printed link; token never copied into shared evidence. Resource links were available from describe. |
| Web/auth configuration | Client and authority configuration reachable | HTTP200 for Web and auth-config.json. Edge displayed Equipment reservations and Sign in to continue. Clicking Sign in reached real equipment-realm username/password screen over trusted local HTTPS, without bypassing certificate validation. |
| RabbitMQ administration | Unauthenticated rejected, existing credential accepted | API overview401 without authentication,200 with existing guest/broker credential privately read from existing store. No credential printed or placed in shell arguments. |
| pgAdmin access and registration | No separate console login; existing DB registered | HTTP200 and Edge Object Explorer opened without login. Expanded existing postgres connection and Databases(4): inventory, notifications, postgres, reservations. Server connected. No data/schema write action used. |
| Proxy and backing container bindings | Loopback only before password-free use | All described endpoints loopback. podman port showed postgres5432, messaging5672/15672, pgAdmin80, identity8443/9000 published exclusively on127.0.0.1. |
| Ordinary storage/session restart | Same existing state and volume definitions | Seven public application tables across all three service DBs had identical row counts and content digests before/after owned-session stop/start, including migration ledgers, catalog, reservation/outbox/inbox data. Same PostgreSQL/RabbitMQ/Keycloak volume descriptors. Containers recreated normally; no claim their process/container IDs stayed equal. |
| Cleanup | Stop own session; retain operator state | Exact-target stop succeeded twice (restart and final cleanup). Only two check-created browser tabs closed. No sample business objects created, no deletes/purges, no ordinary volumes or secret store reset. |

## Evidence and limits

Private startup/resource descriptions remain in restrictive temporary files `/tmp/007-manual-*.json`; they may contain credential-bearing URLs/environment and are deliberately not committed. Before/after data content was inspected only as counts/digests, with no business rows copied into shared reports.

This observation validates the changed manual boundary and guide usability. Interactive product booking/keyboard/browser regression flows were not repeated: no runtime/client source changed, prior accepted006 product-browser evidence remains historical, and current factories/provider/recovery plus frontend checks supply refactor evidence. This report does not relabel prior browser acceptance as a new run.

Two read-only helper attempts needed correction (UTF8 BOM parsing for existing secrets; supplying existing Postgres authentication privately); neither changed data, failed runtime behavior, nor generated passing application evidence.
