# Data Model: Book and Cancel Equipment

## Ownership

Three databases and distinct credentials: Inventory equipment, Reservations allocations/outbox, Notifications inbox. No cross-database reads or foreign keys. One fixed string identity `demo-user` is assigned server-side; it is not an access-control boundary. Equipment names are captured in transition snapshots; Notifications never reads Inventory/Reservations.

## Inventory equipment

`equipment`: `id` ASCII identifier 1..64 primary key; `name` nonblank 1..256; `operational` boolean not-null. Seeds preserve camera-001/Demo Camera, add operational laptop-001/Demo Laptop and non-operational projector-001/Demo Projector. INSERT ON CONFLICT DO NOTHING retains existing records; migrations never reset mutable data.

## Reservations

`reservations`: UUID `id` PK, `demo_user_id` fixed demo-user, `equipment_id`, bounded `equipment_name` snapshot, `start_at`, `end_at`, `confirmed_at`, nullable `cancelled_at` (all finite UTC timestamptz, microsecond precision); `status` Confirmed/Cancelled. Nonnull timestamps, `start_at < end_at`, status allowlist and consistency check (Confirmed has null cancelled_at; Cancelled has nonnull cancelled_at). API samples current time for creation/cancellation; a time-relative CHECK is inappropriate because persisted historical records must remain valid.

Install btree_gist. Named exclusion `reservations_no_confirmed_overlap`: EXCLUDE USING gist (`equipment_id` WITH =, `tstzrange(start_at,end_at,'[)')` WITH &&) WHERE (`status` = 'Confirmed'). The constraint itself enforces allocation across all transactions. Its SQLSTATE 23P01 only maps to booking conflict when constraint name matches. DB isolation READ COMMITTED is sufficient because the exclusion handles the cross-row invariant; cancellation row locks handle per-record transitions.

State machine: absent → Confirmed on valid booking; Confirmed → Cancelled only before start; Cancelled → Cancelled idempotent result/no write at any time. No other states/transitions. No row deletion. Read history ordered `confirmed_at DESC,id`, include both states. Creation writes and cancellation update include outbox insert in the same transaction.

## Outbox

`reservation_outbox`: UUID `event_id` PK, UUID `reservation_id` FK within own database, `event_type` ReservationConfirmed/ReservationCancelled, `schema_version` 1, `demo_user_id`, `equipment_id`, `equipment_name`, UTC `start_at/end_at/occurred_at`, nullable `traceparent/tracestate`, `attempt_count` nonnegative, `next_attempt_at`, nullable `published_at`. Unique (`reservation_id`,`event_type`) ensures at most one event per legal transition. Typed columns avoid arbitrary JSON serialization contracts. Payload remains unchanged after commit; publication metadata alone changes. Preserve published rows for evidence/history; no cleanup policy in this feature.

Select pending due rows with row lock/SKIP LOCKED; at most one publisher owns each locked row. Mark published only after confirmed mandatory broker acceptance. Transient/uncertain attempts release lock and schedule next due time; restarts resume due Pending events. Transaction failures leave state and event both uncommitted.

Permanent publication disposition is durable Pending, never Published: after a nontransient contract/configuration failure, set only attempt scheduling metadata to the finite UTC microsecond sentinel `9999-12-31T23:59:59.999999Z` (not .NET MaxValue/PostgreSQL infinity). Ordinary worker cycles and restarts do not make that event due again. Record a fixed bounded permanent-failure outcome; do not log payloads or raw exception details. After repairing the underlying code/contract/configuration, the developer explicitly resets next_attempt_at for the identified still-unpublished event to current UTC using its own Reservations database credential. This metadata-only repair preserves reservation state, event ID and immutable payload; it introduces no browser action or automatic retry of permanent errors. Transient broker failures retain the existing scheduled recovery policy.

Known permanent own-database failures (authentication, permission, missing schema/table or database/catalog configuration) halt the affected background worker with a safe bounded permanent-error signal until the underlying fault is repaired and the service is explicitly restarted. This also covers outbox connection/open/selection failures outside a selected-event attempt: an inaccessible database cannot reliably persist a parked due time, so the worker must stop instead of repeatedly attempting selection or claiming it parked the event. Preserve all committed reservation/outbox/inbox state; never mark an uncertain publication successful. Notifications leaves failed deliveries unACKed, closes its subscription and stops on permanent database failure; repaired restart permits broker redelivery and EventId uniqueness retains one inbox effect. Transient connection failures and unknown/uncertain provider outcomes retain bounded recovery, including broker acceptance followed by uncertain Published commit. Permanent publication parking applies only when its scheduling metadata can be durably written; a permanent failure of that database write requires worker stop/repaired restart instead.

## Notification inbox

`reservation_inbox`: UUID `event_id` PK (also entry ID), reservation UUID, fixed demo_user_id, type/schema version, equipment identifier/name, UTC interval/occurred_at/received_at, bounded plain-text generated `message`. EventId unique persists duplicate suppression. Event values are validated before INSERT; conflicts return existing receipt without another row. A repeat valid event with the same ID is ignored; invalid envelopes are rejected, not used to replace existing content. Ordering `occurred_at DESC,event_id` is deterministic and independent of transport arrival. No TTL/deletion/unread workflow. The existing memory hello NotificationStore remains compatibility-only.

## Migration ledger

Each database has `schema_migrations` version PK, applied_at UTC and checksum. Ordered embedded SQL migrations run under advisory lock and individual transactions. Re-running identical applied versions is a no-op; differing checksum fails startup. Extension provisioning is admin bootstrap work. Service schema migrations run with the corresponding own role. New feature migrates deterministic memory equipment to seeded SQL; no preexisting reservations/inbox require import. Existing transient hello notification behavior stays documented.

## Validation boundaries

Untrusted API/event timestamps require finite offset-bearing ISO8601 values (reject MinValue/MaxValue infinity sentinels) with at most six fractional digits; normalize before persistence, reject missing timezone rather than infer it. Validate IDs, field lengths, status/event allowlists/schema and required timestamps before DB calls; reject event invalid interval/type or unrelated user. Use 4 KiB maximum bodies/events, no request-supplied user/name/status fields. Checks defend stored invariants; server owns current-time validation. Parameterized SQL only.
