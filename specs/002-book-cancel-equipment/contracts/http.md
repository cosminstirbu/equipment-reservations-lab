# HTTP Contracts

All routes use same-origin Angular proxy to fixed loopback APIs. No authentication; server assigns `demo-user`, and every trusted local caller sees the same learning data. JSON camelCase, generated System.Text.Json metadata, 4 KiB request cap. Reject unexpected request fields to avoid misleading user/name/status overrides. Successful times emit UTC ISO8601 Z with at most six fractional digits.

## Browser write admission

All Reservations API POSTs, including hello compatibility, follow [browser write policy](browser-write-policy.md) before body parsing or external/database effects. Reject forbidden context with 403 / `browser_write_forbidden`; creation additionally requires application/json UTF-8 and otherwise 415 / `unsupported_media_type`. Cancellation remains bodyless and its independent origin guard applies even without Content-Type. Trusted canonical loopback origins can have Web/proxy/backend port differences; originless local CLI without browser metadata remains supported. No authentication/user isolation is added.

## Time input

`startAt`/`endAt` strings must be ISO8601 date/time with explicit Z or ±HH:mm and 0..6 fractional digits, finite supported .NET/PostgreSQL values (UTC years 0001..9999, excluding DateTime/DateTimeOffset MinValue and MaxValue infinity sentinels). Reject offset-free, malformed, missing, excessive precision or null values with 400. Normalize UTC; compare `[start,end)`. Creation requires start < end and start >= microsecond-normalized authoritative TimeProvider sample immediately before insert. Availability validates the same shape/date ordering/past rule but remains advisory. Browser displays local timezone plus offset and round-trips entered wall time; nonexistent DST times reject, ambiguous values require an explicit offset choice before request.

## Inventory

GET `/api/equipment` → 200 array `{ id,name,operational }`, sorted id. GET `/api/equipment/{id}` → 200 item; 400 malformed identifier; 404 unknown. Existing `camera-001` and name preserved. Adding `operational` is intentional additive evolution; hello still selects the known camera and validates its old fields.

## Reservations

GET `/api/availability?equipmentId=...&startAt=...&endAt=...` → 200 `{ equipmentId,startAt,endAt,available,advisory:true }`. Availability validates equipment over the fixed Inventory contract so unknown/non-operational items are clear errors; it never allocates. Escape query values, including plus signs in offsets. Confirmed overlaps alone make available false.

POST `/api/reservations` body `{ equipmentId,startAt,endAt }` → 201 plus Location `/api/reservations/{id}`, body Reservation. No broker call/notification requirement. No automatic retry. Rejects 400 malformed/date/non-operational, 404 unknown equipment, 409 confirmed overlap, 503 Inventory unavailable/unusable or persistence dependency unavailable. A state/event transaction must commit before 201. Cancellation is independent of Inventory and broker.

GET `/api/reservations` → 200 array of Reservation, newest confirmed first with id tie-breaker; empty `[]` distinct from failure. GET `/api/reservations/{id}` → 200 Reservation, 404 missing, 400 malformed UUID.

POST `/api/reservations/{id}/cancel` with no body → 200 Reservation Cancelled. Row lock, Cancelled returns unchanged including after original start; Confirmed may transition only current time < start. 409 at/after start; 404 unknown; 400 malformed UUID. No additional event on idempotent 200. No automatic request retry despite repeat-safe cancellation; explicit user retry/refresh is permitted.

Reservation: `{ id,demoUserId:'demo-user',equipmentId,equipmentName,startAt,endAt,status:'Confirmed'|'Cancelled',confirmedAt,cancelledAt:null|string,confirmationEventId,cancellationEventId:null|string }`. Event IDs identify notification observation; they do not imply delivered or processed. History can recover IDs after lost response. Published status is not presented as inbox-delivered status.

## Notifications

GET `/api/notifications` → 200 array of InboxEntry, ordered occurredAt descending/eventId, empty `[]`; 503 DB unavailable. InboxEntry `{ eventId,reservationId,demoUserId,equipmentId,equipmentName,eventType:'ReservationConfirmed'|'ReservationCancelled',startAt,endAt,occurredAt,receivedAt,message }`. Matching transition eventId present means observed inbox entry; absence means not yet observed, even if broker accepted publication. UI explains saved booking/cancellation remains valid and explicit refresh can be used later. Inbox API remains available during consumer/broker outage.

Existing GET `/api/notifications/{correlationId}` and POST `/api/hellos` preserve prior hello contracts/semantics. Namespace list root does not replace the GUID hello lookup.

## Errors and UI behavior

Problem Details includes safe status/title/detail plus stable `code` (`invalid_request`,`invalid_interval`,`start_in_past`,`equipment_not_found`,`equipment_not_operational`,`booking_conflict`,`cancellation_started`,`reservation_not_found`,`inventory_unavailable`,`persistence_unavailable`,`browser_write_forbidden`,`unsupported_media_type`). Field-specific validation information contains no raw bodies, connection strings, upstream responses or stack traces. Unexpected faults 500 remain distinct from business errors; cancelled requests propagate cancellation and uncertain results prompt refresh, never an automatic resubmit.

UI loading/empty are distinct for equipment/history/inbox; action states distinguish availability advisory, saving, saved Confirmed/Cancelled, matching inbox not observed and notification load failure. Disable only in-flight actions, preserve focus, label all inputs, announce status. Clear stale availability when item/date inputs change. Keep saved state when inbox fails. No background browser polling, realtime push or user-isolation claim is introduced for this feature.
