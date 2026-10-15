# Data Model: Preserved Booking State

No schema migration, stored-record rewrite or data purge is part of retirement.

| Entity | Retained fields / relation | Rule |
| --- | --- | --- |
| Equipment | Existing Inventory identity, name and operational state | Equipment ID: 1–64 ASCII letters/digits/hyphen/underscore; same validation after extraction |
| Reservation | Existing ID, demo-user identity, equipment snapshot, start/end, status and timestamps | Existing availability/overlap constraints, future interval and cancellation rules unchanged |
| ReservationEvent | SchemaVersion, EventId, ReservationId, EventType, DemoUserId, EquipmentId, EquipmentName, StartAt, EndAt, OccurredAt | Existing schema 1; confirmation/cancellation only; same generated JSON and UTC precision rules |
| Outbox record | Existing event payload and publication/recovery/trace state | Atomic with reservation transition, persistent/repeat safe |
| InboxEntry | Existing event identity, reservation identity and visible notification fields | One entry per distinct transition event; durable deduplication |
| Local resources | Existing databases, secrets, reservation and legacy hello broker artifacts | No deletion/reset/purge or secret-ID change |

Relationships remain Inventory → Reservation snapshot, Reservation → transition Event → Outbox → broker → InboxEntry. Creation produces confirmation; valid cancellation produces cancellation; repeat cancellation does not duplicate the transition. No transition or state is added.

Retired runtime-only model: HelloRequested, HelloInput/HelloResult, transient Notification/NotificationStore and their expiration state. Their old broker messages remain uninterpreted. Equipment hello DTO and MessagingJsonContext are removed only if orphaned after hello deletion; no retained wire representation changes. Namespace/assembly renaming is internal and does not alter JSON or stored payloads.
