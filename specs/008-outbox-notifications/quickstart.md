# Validation: Prompt Outbox Wake-ups

## Prerequisites

Use the pinned .NET SDK, repository npm dependencies and working Podman setup from the [application README](../../README.md). PostgreSQL 18.6, RabbitMQ and Keycloak test containers must start normally. Use isolated test databases with production migrations; do not run failure-injection scenarios against shared environments. Feature resolution remains `specs/008-outbox-notifications`.

## Automated verification

From repository root:

```sh
# Focused new PostgreSQL/listener/replica/telemetry contracts:
dotnet test --project tests/Integration.Tests --no-restore -- --filter-class '*OutboxNotification*'

npm run format-check
npm run lint
npm run check
```

The complete check builds and runs the production-aligned backend suite through Microsoft Testing Platform plus frontend/tooling checks. Before implementation, run the new focused test cases through the owning test project's MTP command and retain the intended failing result. After implementation retain green focused and full-check results with revision and environment. Actual red/green results and environmental limitations are recorded in [implementation evidence](team/implementation-evidence.md) and [telemetry evidence](team/telemetry-test-evidence.md).

Expected evidence:

1. A real PostgreSQL listener sees an empty signal after insert commit; none before commit or after rollback.
2. A healthy idle hosted worker begins publication within one second of a new commit; a schedule-controlled test independently proves notification rather than fallback caused the attempt.
3. Existing work drains immediately on startup/reconnect. Work inserted during processing or sleep transition cannot be stranded by a lost signal.
4. Persisted retries survive restart, wake at their deadline, do not publish early and cannot be accelerated by notifications. Peer locks and parked rows do not spin.
5. Scoped listener interruption produces degraded ten-second polling and bounded reconnect bursts. Permanent provider faults halt observably; reconnection establishes listening before scanning.
6. One and five replicas, plus old polling and new listening workers together, safely drain rows with unchanged event IDs/duplicate-safe consumption. Removing the trigger leaves fallback delivery working.
7. A representative steady 90-second equivalent idle window records two snapshot/select statements per 30 seconds instead of per ten seconds. Count every added SQL statement and separate one-time LISTEN/setup and transaction overhead transparently; passive waits generate no heartbeat queries.
8. Production OpenTelemetry export captures successful and controlled failed dependency operations with safe names, timings, outcomes and exception events, plus bounded listener/wake signals. Tests fail if production Npgsql registration is removed.
9. Shutdown during waits, backoff, reconnect and publication releases the listener session and does not mark uncertain work successful. Disabled messaging does no listener work.

## Local trace inspection

Follow the existing [manual local development procedure](../../README.md#manual-local-development-check); discover current endpoints from the running Aspire dashboard rather than hardcoding ports. Exercise a reservation transition while the worker is idle, then inspect a representative trace containing real PostgreSQL operations and RabbitMQ publication. Check the LISTEN setup trace separately from the event's restored producer trace. Record trace/test identifiers and privacy review in feature evidence. This manual prerequisite is pending until actually performed; automated tests do not substitute for it.

Contracts and detailed boundaries: [notifications](contracts/notifications.md), [data model](data-model.md), [test design and resilience](plan.md). No deployment, publication or external messaging is authorized by these checks.
