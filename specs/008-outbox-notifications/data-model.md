# Data Model: Prompt Outbox Wake-ups

## Durable outbox event (unchanged)

`reservation_outbox` retains its existing columns, constraints, foreign key, unique reservation/event-type pair and partial `(next_attempt_at,event_id)` index for unpublished rows. Event identity, envelope, trace context, attempts, `next_attempt_at` and `published_at` remain authoritative. No new durable event state is introduced.

Transitions remain pending → publishing under a row lock → published on confirmed publication plus committed metadata; transient failure → pending with increased attempts and future eligibility; permanently invalid message → pending parked at the existing far-future timestamp. An uncertain publish can be repeated with the same ID. Permanent database failure halts instead of falsely marking success or parking work.

## Database objects (additive migration 002)

- Fixed channel `reservation_outbox_changed`, empty string payload.
- Invoker-rights trigger function calls `pg_catalog.pg_notify` with those constants and returns normally.
- `AFTER INSERT FOR EACH STATEMENT` trigger on `reservation_outbox`; updates and deletes do not signal. The existing migration ledger owns once-only application. Existing migration 001 is immutable.
- Function and channel names contain no identifiers from records. No SECURITY DEFINER or expanded cross-database authority.

## Ephemeral replica state

- Listener: establishing → listening; transient failure → degraded/reconnecting → listening; permanent failure → halted; cancellation → stopped. No more than one dedicated connection per live replica.
- Worker: scanning/publishing → idle waiting or failure backoff; signal reception never ends failure backoff. Permanent listener faults end processing.
- Pending signal: zero or one advisory token; coalesces notifications/reconnect scans; state/fault stored independently so coalescing cannot hide them. Consume only before scanning.
- Deadline snapshot: current count, oldest occurrence, minimum unpublished `next_attempt_at` strictly greater than the scan timestamp. Rows due but locked by peers do not create zero-delay loops. Recompute each scan; restart reads persisted timestamps.

The listener contains no durable identity assignment and never substitutes notification data for a table lookup. Multiple replicas share only database state and receive the same signal independently. See [notification contract](contracts/notifications.md) and [plan](plan.md).
