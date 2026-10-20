# Runtime documentation contracts

Documents: `GET /openapi/v1.json`; UI: `GET /scalar/`; `/scalar` redirects. Available anonymously only in Development, identical across viewers, no business authorization relaxation. Scalar assets and `GET /oauth/callback` share the same Development mapping boundary. The exact registered OAuth callback is `/oauth/callback` on each service origin: minimal static HTML, no bundle/router/scripts/redirect, no-store and no-referrer; it leaves fragment state/code untouched for Scalar parent polling. OpenAPI 3.1, no operational endpoints. Security schemes: DocumentationOAuth (authorizationCode/S256 public equipment-docs, scope openid); Inventory may additionally describe its existing service bearer alternative.

| Service | Method / route | Operation ID / tag | Success | Expected errors |
| --- | --- | --- | --- | --- |
| Inventory | GET /api/equipment | ListEquipment / Equipment | 200 EquipmentItem array | 400,401,403,503 |
| Inventory | GET /api/equipment/{id} | GetEquipment / Equipment | 200 EquipmentItem | 400,401,403,404,503 |
| Reservations | POST /api/reservations | CreateReservation / Reservations | 201 Reservation, Location header | 400,401,403,404,409,413,415,500,503 |
| Reservations | GET /api/availability | GetAvailability / Availability | 200 Availability | 400,401,403,404,500,503 |
| Reservations | GET /api/reservations | ListReservations / Reservations | 200 Reservation array | 400,401,403,500,503 |
| Reservations | GET /api/reservations/{id} | GetReservation / Reservations | 200 Reservation | 400,401,403,404,500,503 |
| Reservations | POST /api/reservations/{id}/cancel | CancelReservation / Reservations | 200 Reservation | 400,401,403,404,409,413,500,503 |
| Notifications | GET /api/notifications | ListNotifications / Notifications | 200 InboxEntry array | 400,401,403,503 |

All success bodies application/json. Handler/middleware problems application/problem+json with actual optional extensions code/field where produced. 401 and authorization-policy 403 have no body; POST browser guard 403 has Problem Details. Preserve both possible 403 representations. Verify statuses against actual implementation; do not add speculative status responses for unreachable failures.

- Equipment id: required path string, existing equipment identifier validation. Equipment policy admits valid human identities or reservations-service equipment.read.
- Reservation id: required path string accepted via Guid.TryParse, nonempty GUID. Keep actual parsing behavior; do not impose a new route constraint.
- Booking input: required JSON object equipmentId/startAt/endAt strings; exact allowed keys, no duplicates or ownership fields, 4 KiB maximum. Existing timestamp syntax includes explicit offset and at most six fractional digits, normalized to UTC; start before end and not past. Metadata must not silently describe nullable optional inputs just because C# input uses nullable fields for validation.
- Availability: required equipmentId/startAt/endAt query strings with the same interval rules; no request body. No other query keys accepted.
- Cancellation: no required request body; existing guard permits empty or JSON null and rejects other bodies. Describe this accurately, without generating an editable object body or changing runtime acceptance.
- Reservation operations except availability require Employee. Availability and notifications require a validated human identity; their Human policy does not impose an additional role requirement. Identity is from bearer token, not request fields.
- Response schemas derive from actual named C# wire contracts, including camelCase names, dates, nullability and collections; never expose persistence models beyond existing response contracts. Problem extensions are optional because middleware/handlers differ.

Tests independently enumerate this table and actual schema properties, and validate parsed references and security requirements; handwritten Markdown records intended contract, not a second generated schema source.
