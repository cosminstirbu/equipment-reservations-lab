# Hello contracts

All APIs are local-only JSON, reached from Angular through fixed same-origin proxy paths. No authentication/authorization is implemented. Remote requests have explicit deadlines. Safe Problem Details include status/title/detail and correlation/trace identifier where available; never stack traces or dependency secrets.

| Endpoint | Success | Rejection/failure |
| --- | --- | --- |
| Inventory `GET /api/equipment` | 200 `[{"id":"camera-001","name":"Demo Camera"}]` | 503 safe dependency failure if unavailable through client |
| Inventory `GET /api/equipment/{id}` | 200 equipment object | 400 malformed ID; 404 unknown ID |
| Reservations `POST /api/hellos` body `{"equipmentId":"camera-001"}` | 202 `{"correlationId":"<GUID>"}` only after Inventory confirmation and broker publisher confirmation | 400 missing/malformed ID/JSON; 413 >4 KiB; 404 unknown equipment; 503 Inventory/broker error or deadline |
| Notifications `GET /api/notifications/{correlationId}` | 200 `{"correlationId":"<GUID>","message":"Hello received for Demo Camera"}` | 400 malformed/empty GUID; 404 not yet delivered, expired or evicted |
| Each backend `GET /alive` / `GET /health` | 200 process liveness / dependency readiness respectively | Dependency failure changes readiness, not liveness |

Polling treats 404 as pending within the absolute 30-second deadline; other failures become errors immediately. Proxy paths route exclusively to their named API, preserve downstream statuses and impose request timeouts.

## Broker contract

One non-durable direct exchange `hello`, one durable nonexclusive queue `hello-notifications`, fixed routing key `hello.requested`, one consumer. Queue arguments: `x-message-ttl=30000`, `x-max-length=1000`, `x-overflow=reject-publish`. Topology declared/bound consistently before publication/consumption. No management endpoint or data volume. Messages are transient/non-persistent. Queue metadata durability is required for supported RabbitMQ4.3.6 behavior, not a persistent delivery/replay guarantee. AppHost ephemeral container recreation clears broker state; Notifications restart clears its stored messages. Do not enable deprecated transient_nonexcl_queues.

HelloRequested JSON fields: correlationId, equipmentId, equipmentName, requestedAt. Content type application/json; traceparent/tracestate headers; correlation ID property. Validate size, GUID, identifier and bounded equipment name before storage. Mandatory publisher confirmations reject unroutable/nack/deadline as failure. No automatic recovery/retry; acknowledgement after storage; invalid payload rejected without requeue. Channel operations are serialized safely and cancellation is propagated. A publish-confirm timeout has uncertain delivery and is never automatically resent.
