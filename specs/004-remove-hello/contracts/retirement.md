# Interface Contract: Hello Retirement

**Verification delta — 2026-10-15**: The owner directed removal of absence-only regression tests. The interface semantics below remain unchanged; verify deletion through source/configuration/documentation inspection. Retain positive booking/security/persistence/telemetry tests and isolated state-preservation checks.

## Removed interfaces

- Browser `/hello`: no hello view/action; ordinary SPA booking fallback or not-found allowed.
- Reservations `POST /api/hellos`: no registered hello handler, success, compatibility or deprecation result. Direct plain/local requests ordinarily return 404; shared host guards/errors may still apply.
- Notifications `GET /api/notifications/{id}`: no transient hello lookup; ordinary 404. Durable booking inbox collection remains.
- Angular proxy hello mapping and hello client removed.
- Production hello exchange/queue declarations, consumers, publishers, Equipment.Hello sources/meters and outcomes removed. No broker delete/purge operation added.

## Preserved interfaces

Inventory equipment collection/detail, availability query, reservation create/list/detail/cancel and notification inbox collection keep existing routes, statuses, JSON names, bounded-input/security handling and booking meaning. Existing booking spec/contracts remain authoritative for those interfaces.

Reservation AMQP exchange `reservations`, queue `reservation-notifications`, direct keys `reservation.confirmed` and `reservation.cancelled`, durable entities, persistent publications, mandatory routing/publisher confirms, prefetch/manual acknowledgement, schema 1, message ID/EventId, correlation ID/ReservationId, and validated traceparent/tracestate headers remain unchanged. No TTL/cap is added. Existing JSON converter preserves UTC precision. CLR namespace changes from HelloMessaging to ReservationMessaging do not change payloads or broker names.

Shared equipment-ID validation remains exactly 1–64 ASCII letters/digits/hyphen/underscore, including camera-001; invalid Unicode/whitespace/path separators remain rejected. Existing event-envelope limits and validation remain unchanged.

Operational `/alive`, `/health`, `/health/workers` remain. Remove only hello consumer readiness; preserve reservation worker, dependency and database health, recovery and observable safe failures.

`UserSecretsId=equipment-hello-apphost-local`, credentials and persisted data remain untouched. Legacy hello broker artifacts are not active interfaces: they are left idle, undeleted and unconsumed. Historical specifications/review records remain evidence of prior versions only.
