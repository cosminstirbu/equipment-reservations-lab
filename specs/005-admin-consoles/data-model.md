# Data Model: Local Administration Consoles

No application schema, wire contract, domain entity or migration changes.

| Operational entity | Configuration / relationship | Invariants |
| --- | --- | --- |
| RabbitMQ console | Management plugin on existing `messaging` resource; current password parameter | Development/run only, loopback dynamic HTTP, normal login, same AMQP resource and volume |
| pgAdmin console | Disposable `pgadmin` container pinned to `dpage/pgadmin4:9.18.0`, associated with existing `postgres` server | Development/run only, loopback dynamic HTTP, no separate login, generated internal admin server registration, no persistent settings volume |
| Application databases | `inventory`, `reservations`, `notifications`, created by existing bootstrap | Existing schemas/records/application roles retained; console admin may browse and modify each |
| Retained state | Named Postgres/Rabbit volumes and AppHost user-secrets identity | Names/contents/password generation and persistence remain unchanged |

Lifecycle: local Development startup creates console resources; dependency readiness permits administration. AppHost restart preserves underlying state. pgAdmin recreation may discard preferences but regenerates its connection. Publish/non-Development models contain no console resource or broker management endpoint/plugin mutation. Intentional administrator actions may mutate data; test objects are isolated and cleaned up.
