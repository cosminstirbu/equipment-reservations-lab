# Transient data model

| Entity | Fields and invariants |
| --- | --- |
| Equipment | `id`: `camera-001`; `name`: `Demo Camera`. Exactly one hardcoded seed, authoritative in Inventory. |
| HelloRequested v1 | `correlationId`: new nonempty GUID; `equipmentId`: validated <=64-character ASCII identifier; `equipmentName`: confirmed seed name; `requestedAt`: UTC timestamp. JSON <=4 KiB. W3C trace context in broker headers. |
| Notification | `correlationId`, `message`, `createdAt`, `expiresAt` (created +5 minutes). At most 1,000 records; oldest evicted first; expired never returned. |

Reservations does not store state. Notifications is thread-safe and supports a single consumer plus concurrent HTTP lookup; expiry/capacity checks are atomic. Clock is supplied by TimeProvider for deterministic behavior tests.

UI transitions: loading → ready/error; ready → pending-send → pending-notification → success/error. A result carries the returned correlation ID. Only one send/wait can be active. Success, error, deadline or component destruction cancels the wait and in-flight request. A new deliberate send generates a new operation.

Broker uses durable nonexclusive queue metadata for RabbitMQ4.3.6 compatibility, a non-durable exchange, and transient/non-persistent messages. No volume or delivery/replay guarantee is supplied. Restarting services resets in-memory state; AppHost recreation of the ephemeral broker container removes broker state. Queue metadata may survive a process restart inside the same container; this is not a promised recovery capability. Restarting just Notifications clears its stored results and does not promise recovery of previously acknowledged messages. No replay, deduplication or exactly-once guarantee is supplied.
