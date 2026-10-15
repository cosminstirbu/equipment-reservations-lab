# Reservation Event Contract

Separate from the unchanged hello event topology. Schema1 is a bounded typed JSON envelope 4 KiB maximum:

```json
{
  "schemaVersion": 1,
  "eventId": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
  "eventType": "ReservationConfirmed",
  "reservationId": "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
  "demoUserId": "demo-user",
  "equipmentId": "camera-001",
  "equipmentName": "Demo Camera",
  "startAt": "2026-10-15T10:00:00Z",
  "endAt": "2026-10-15T11:00:00Z",
  "occurredAt": "2026-10-14T09:00:00Z"
}
```

Cancellation uses the same fields with eventType ReservationCancelled and its own stable eventId/occurredAt. EventId generated once in the transition transaction, persisted in outbox, never regenerated on retry. Exactly one event per reservation/type is a database unique constraint. Equipment/user/time snapshots are sufficient for Notifications without accessing other services. IDs are nonempty UUIDs, user exactly demo-user, equipment ASCII 1..64, name nonblank 1..256; valid UTC finite timestamps and start<end. Unknown schema/type, missing/invalid/oversized data rejects safely without inbox changes or endless requeue. Require matching routing key/eventType and messageId/eventId; validate any trace headers before parsing. Arbitrary external message text is never accepted; consumer constructs plain-text message with no HTML execution.

Topology: durable direct exchange `reservations`; durable nonexclusive queue `reservation-notifications`; bindings `reservation.confirmed` / `reservation.cancelled`. No expiry/max-length-drop, persistent delivery mode, application/json content type, MessageId eventId, CorrelationId reservationId, schema header 1, optional bounded W3C traceparent/tracestate. Existing hello exchange/queue retains its prior declarations. Broker volume and stable credentials preserve messages across ordinary restarts.

Publisher uses mandatory routing and confirms. Returned/unroutable, nack, connection error and confirmation timeout never mark Published. Retry transient/uncertain failures with same envelope/ID under bounded scheduled policy in plan. Published means broker accepted; SPA must rely on inbox observation for notification arrival. Nontransient contract/config failures remain visible Pending failure signals and require repair; they cannot claim success or discard the committed event. Persist the finite microsecond scheduling sentinel `9999-12-31T23:59:59.999999Z` so normal cycles/restarts do not retry them; emit a bounded permanent-failure outcome. For a successfully parked permanent publication failure, explicit developer metadata reset after the underlying repair is the only rescheduling path, preserving the event ID/payload and reservation transition. Transient recovery continues automatically under the approved policy.

Consumer validates, inserts by EventId `ON CONFLICT DO NOTHING`, commits then manual ACK. Duplicate valid deliveries create no new row. Transient database failure never ACKs; close connection after bounded attempt so broker requeues unacknowledged delivery. Invalid contracts reject without requeue and record safe bounded telemetry. No network/database exception detail or payload is logged. Reconnection and due outbox retry continue after broker recovery without user rebooking. Transport delivery is at least once; exactly one stored notification per event is the promised effect.

Known permanent own-database failures (authentication, permission, missing schema/table or database/catalog configuration) halt the affected background worker with a safe bounded permanent-error signal until the underlying fault is repaired and the service is explicitly restarted. This also covers outbox connection/open/selection failures outside a selected-event attempt: an inaccessible database cannot reliably persist a parked due time, so the worker must stop instead of repeatedly attempting selection or claiming it parked the event. Preserve all committed reservation/outbox/inbox state; never mark an uncertain publication successful. Notifications leaves failed deliveries unACKed, closes its subscription and stops on permanent database failure; repaired restart permits broker redelivery and EventId uniqueness retains one inbox effect. Transient connection failures and unknown/uncertain provider outcomes retain bounded recovery, including broker acceptance followed by uncertain Published commit. Permanent publication parking applies only when its scheduling metadata can be durably written; a permanent failure of that database write requires worker stop/repaired restart instead.

Crash windows covered by tests: commit booking before publish; acceptance before outbox Published commit; inbox commit before ACK; consumer/broker down and service restarts. Delivery order does not alter reservation state and inbox identifies original transition and occurrence time.
