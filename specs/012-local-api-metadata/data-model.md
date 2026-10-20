# Documentation model inventory

No persistence entities, relationships or transitions change. Five existing public models need model-level and every-property prose:

| Model | Declared properties | Meaning to preserve |
| --- | --- | --- |
| EquipmentItem | id, name, operational | Catalog identifier/name and operational state |
| ReservationInput | equipmentId, startAt, endAt | Three required non-null valid string inputs; reject extra fields; offset timestamp, max six fractional digits; start before end and not past |
| Reservation | id, userKey, equipmentId, equipmentName, startAt, endAt, status, confirmedAt, cancelledAt, confirmationEventId, cancellationEventId | Owned reservation; Confirmed/Cancelled lifecycle; cancellation timestamp/event identifier null until cancelled |
| Availability | equipmentId, startAt, endAt, available, advisory | Interval availability result; advisory does not lock or reserve equipment |
| InboxEntry | eventId, reservationId, userKey, equipmentId, equipmentName, eventType, startAt, endAt, occurredAt, receivedAt, message | Owned notification; source event and receipt timestamps have distinct meanings; existing event names preserved |

Standard ProblemDetails fields type/title/status/detail/instance and optional application extensions code/field receive shared descriptions without requiredness/type changes. Describe only declared generated properties, preserving any framework extension support. ReservationInterval, InventoryItem and broker/internal contracts are not reachable public models and remain outside scope.

All C# types, JSON names, formats, required arrays, defaults, field sets and lifecycle transitions remain unchanged; descriptions add meaning rather than validation.
