# Public documentation coverage matrix

This is a review inventory, not a handwritten OpenAPI document. Current generated documents remain authoritative; no route or status set changes.

| Service / operation | Method and path | Inputs/header | Existing response codes |
| --- | --- | --- | --- |
| Inventory ListEquipment | GET /api/equipment | None | 200,400,401,403,503 |
| Inventory GetEquipment | GET /api/equipment/{id} | Required path id, existing string equipment identifier | 200,400,401,403,404,503 |
| Reservations CreateReservation | POST /api/reservations | Required application/json ReservationInput body; 201 Location header | 201,400,401,403,404,409,413,415,500,503 |
| Reservations GetAvailability | GET /api/availability | Required string queries equipmentId/startAt/endAt; no extra query fields | 200,400,401,403,404,500,503 |
| Reservations CancelReservation | POST /api/reservations/{id}/cancel | Required string path id, nonempty GUID; existing absent requestBody metadata retained | 200,400,401,403,404,409,413,500,503 |
| Reservations ListReservations | GET /api/reservations | None; authenticated owner | 200,400,401,403,500,503 |
| Reservations GetReservation | GET /api/reservations/{id} | Required string path id, nonempty GUID | 200,400,401,403,404,500,503 |
| Notifications ListNotifications | GET /api/notifications | None; authenticated owner | 200,400,401,403,503 |

All rows need meaningful operation prose and every response description, not merely standard status labels. Describe actual success, invalid input/ownership fields, unavailable providers, missing records, conflicts, payload size/media type and unexpected failures only where declared. Authorization401 is empty; read403 is empty. Write403 can be an empty authorization denial or optional application/problem+json from browser-write guard. Do not invent bodies for empty errors. Cancellation body constraints (empty or JSON null) remain in operation prose without adding requestBody structure.

Create body retains 4 KiB limit, duplicate/additional/ownership field rejection, timestamp constraints. Availability retains manually read queries. Creation Location remains relative reservation URL. Every documented parameter/header/body needs prose. Paths, IDs, tags, status sets, security, schema fields/types/nullability/formats/requiredness/content types remain unchanged except descriptions.

All five application schemas/33 properties and framework ProblemDetails/declared properties require prose; see [model inventory](../data-model.md). Use record declarations for app model prose, bound path parameter attributes, endpoint metadata/local transformers for operation prose, narrow shared correction for framework errors and schema inference.
