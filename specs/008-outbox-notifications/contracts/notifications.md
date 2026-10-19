# Internal PostgreSQL Notification Contract

This adds no HTTP API or broker envelope change.

| Property | Contract |
| --- | --- |
| Channel | Fixed `reservation_outbox_changed`, scoped to the reservation database |
| Payload | Empty string; receiver ignores payload and notifying PID |
| Producer | Insert-only statement trigger, invoked for every insertion path |
| Visibility | Commit only; rollback produces no signal; redundant signals may coalesce |
| Meaning | There may be durable work; no ownership or event count is implied |
| Consumers | All listening replicas; each claims durable rows using existing SKIP LOCKED transaction |
| Durability | None; startup/reconnect/fallback scans provide recovery |
| Compatibility | Existing polling workers ignore notifications; absent trigger still permits fallback delivery |

A consumer completes LISTEN before startup/reconnect scan, continuously receives outside transactions, and preserves a pending signal received while processing. Notification contents cannot authorize publication, alter retries or shorten backoff. Signals are visible to database users and may be spoofed by a database principal; processing still validates durable records and existing permissions.

Healthy fallback is 30 seconds; degraded idle fallback is ten seconds; captured earlier future retry deadlines wake sooner. Active failure backoff overrides ordinary wakes. One dedicated listener connection per replica is required. Delivery remains at least once with stable event IDs and unchanged RabbitMQ schema. Cancellation unregisters the subscription before returning a healthy connection to the pool using fixed `UNLISTEN reservation_outbox_changed` with an independent three-second cleanup budget, then releases the connection and retains uncertain work for redelivery. Broken sessions are released without waiting indefinitely for cleanup. Explicit unregistration avoids deferred pooled-session reset retaining the subscription. The fixed cleanup command uses native Npgsql tracing and reviewed SQL admission with the same privacy rules as LISTEN; it is lifecycle overhead, not idle polling.

Telemetry exports fixed operation identities and bounded state/cause labels only. No payload, PID, credentials or raw provider error text is logged. Exact budgets and tests are in [plan.md](../plan.md).
