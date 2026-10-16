# HTTP authorization contract

All `/api` endpoints require strict bearer authentication. `/alive`, `/health`, `/health/workers` are operational probes, remain minimal loopback anonymous endpoints, and disclose no owned application data. No permissive CORS; browser uses existing proxy. Run authentication/authorization before business/browser-write validation so missing/invalid authority is consistently 401. Retain BrowserWriteGuard as additional defense for authorized writes.

| Endpoint | Human authority | Service authority |
| --- | --- | --- |
| GET /api/equipment | Any validated human | Inventory equipment.read only |
| GET /api/equipment/{id} | Any validated human | Inventory equipment.read only |
| GET /api/availability | Any validated human | Denied |
| POST /api/reservations | Employee, derived owner | Denied |
| GET /api/reservations | Employee, own only | Denied |
| GET /api/reservations/{id} | Employee, own only | Denied |
| POST /api/reservations/{id}/cancel | Employee, own only | Denied |
| GET /api/notifications | Any human, own only | Denied |

Missing/malformed/expired/wrong-signature/issuer/audience/type authority → 401. Valid principal without policy → 403. For authorized Employee, unknown or foreign reservation ID → identical 404 Problem Details. Existing validation/conflict/dependency semantics remain after authorization. Insufficient internal service permission returns 401/403 from Inventory, translated by Reservations to safe existing inventory_unavailable 503 before any reservation/outbox write. Do not return token/provider response details.

Bodies retain existing strict named booking fields equipmentId/startAt/endAt and null cancellation body. Reject caller ownership fields/queries with 400 and no effects. Define forbidden identity-like header set case-insensitively: X-User-Id, X-User-Key, X-Owner-Id, X-Owner-Key, X-Demo-User-Id, X-Subject, X-Issuer, X-Authenticated-User, X-Forwarded-User. Apply to all protected application endpoints; legitimate Authorization bearer is required and is not an ownership override. Reject unknown query fields on endpoints with no query contract and retain exact availability equipmentId/startAt/endAt fields. Reject nonempty cancellation bodies/owner fields. No arbitrary caller-supplied owner value changes scope. Every HTTP path uses server identity, including requests without these headers.

Response Reservation and InboxEntry replace demoUserId with userKey; no issuer/subject/email/token. Availability retains equipmentId/startAt/endAt/available/advisory only, with no reservation/owner details. Named contracts and collections use generated .NET JSON metadata. Global allocation, ordering, timestamp precision and cancellation semantics remain unchanged.
