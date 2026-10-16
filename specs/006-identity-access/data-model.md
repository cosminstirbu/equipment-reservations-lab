# Identity and Access data model

## Validated identity

Inputs: exact validated issuer and one opaque nonempty subject (maximum 255 UTF-8 bytes); signed principal_kind/azp distinguish humans from service. Internal `userKey`: lowercase 64-character SHA-256 hex over UTF-8 canonical compact JSON array of issuer and subject, shared implementation. Canonical serialization uses compact Utf8JsonWriter with default JavaScriptEncoder and no indentation; implementations must not independently concatenate strings. Roles are explicit `Employee`, `Approver`, `EquipmentStaff`; no implicit composition. Profile names/emails are display-only. No local user registration table or cross-database identity foreign key.

## Owned records

Fresh reservation, outbox and inbox tables replace demo_user_id with `user_key text NOT NULL` constrained to 64 lowercase hex characters. User history indexes start with user_key followed by existing descending time/id sort. Reservation-to-outbox relationship and unique `(reservation_id,event_type)` remain; inbox event_id remains primary deduplication key. SQL registry in production DatabaseTracing must be updated with changed parameterized statements.

Create receives key only from validated human principal; reservation and outbox insert use same key/transaction. Find/list are keyed by owner; cancellation row lock AND subsequent read/update include id and owner. Unknown/foreign gives identical 404. Confirmed overlap constraint stays global by equipment and interval, never per-owner. Confirmed → Cancelled before start, existing Cancelled → same Cancelled result even after start, no second transition/event. Availability queries all users and returns no owned records.

## Event and inbox

Schema version 1 is retained for the replacement contract; no compatibility with previous demo envelope. Named `userKey` replaces `demoUserId` in event, outbox mapping, responses and inbox. Existing IDs, timestamps, content type/schema headers, routes, traceparent/tracestate validation and 4096-byte envelope bound remain. Validator checks key shape and no unknown JSON fields. Consumer persists only key and event data, not browser authority. Delayed/duplicate delivery and logout never change recipient. Inbox list requires current human key.

## Provider configuration

Realm `equipment`, four provisioned usernames, explicit roles and clients from identity contract. Opaque existing user IDs preserved across normal provisioning. Persistent secret parameters contain credentials; no secrets stored in application tables/config exports. A deleted/recreated subject is a different identity and inherits no history.

## Browser session state

States: initializing → signed-out → authenticating → authenticated → expired/signed-out; failure produces recoverable signed-out state. Each identity transition increments generation and clears reservations/saved record/inbox/pending responses. Late old-generation results discarded. Protected actions require active human token; booking/history/cancel additionally Employee. No queued write survives transition. Safe equipment/date form input may remain. Tokens in adapter memory only, transient callback state cleaned after use.

## Initialization boundary

Owner deletes old volumes once; fresh schema scripts can change without migration/compatibility. No automated destructive reset. Old schema/checksum fails safely. Subsequent restarts preserve provider state, equipment, reservation/outbox/inbox records and broker messages.
