# Broker queue counter freshness evidence — Q-BROKER014-001

This is author evidence for the approved round6 defect repair, not an independent
verdict or live AKS acceptance. The reviewed external monitor route remains exactly
GET /api/queues/equipment/reservation-notifications without query parameters or body.
The proxy now injects only the fixed upstream query
?disable_stats=true&enable_queue_totals=true. TLS verification, the single queue,
monitoring tag, ^$ AMQP permissions and backup-only port-forward authority are unchanged.

## Pinned provider and authoritative source

The existing immutable RabbitMQ image
`docker.io/library/rabbitmq@sha256:54cb013d76cd1fd6c0a0708f34062ad61c452bb6f016b434c6c33f1a765d2b58`
reports RABBITMQ_VERSION=4.3.6 in its image metadata. Official v4.3.6 resolves to
commit `7a34a0caf4fa5cf4009cb934ea7a94dbe7e08095`.

The normal queue API assembles asynchronous management statistics. Its historical
range is rounded from request wall time; the formatting layer resamples stored
slides into that requested range. Therefore neither HTTP Date nor the newest
historical bucket timestamp establishes that the queue process was observed after
publisher quiescence. Waiting one or two nominal intervals does not establish
collection progress if statistics processing is delayed or suspended. Sources:
[queue endpoint](https://github.com/rabbitmq/rabbitmq-server/blob/7a34a0caf4fa5cf4009cb934ea7a94dbe7e08095/deps/rabbitmq_management/src/rabbit_mgmt_wm_queue.erl#L40),
[request-relative ranges](https://github.com/rabbitmq/rabbitmq-server/blob/7a34a0caf4fa5cf4009cb934ea7a94dbe7e08095/deps/rabbitmq_management/src/rabbit_mgmt_util.erl#L1249),
[range formatting](https://github.com/rabbitmq/rabbitmq-server/blob/7a34a0caf4fa5cf4009cb934ea7a94dbe7e08095/deps/rabbitmq_management/src/rabbit_mgmt_stats.erl#L29).

The supported fixed query selects queue_with_totals instead. It calls
rabbit_amqqueue:info with totals. For the current classic queue, that dispatches a
synchronous request to the live queue process, whose handler reads ready length
and unacknowledged count from its current state. It bypasses the management metrics
collector entirely. A successful response is a current queue-process observation
for that request, not a collector sample. This proof is specific to classic queues;
other queue types must fail closed until separately qualified. Sources:
[direct totals branch](https://github.com/rabbitmq/rabbitmq-server/blob/7a34a0caf4fa5cf4009cb934ea7a94dbe7e08095/deps/rabbitmq_management/src/rabbit_mgmt_wm_queue.erl#L131),
[classic synchronous call](https://github.com/rabbitmq/rabbitmq-server/blob/7a34a0caf4fa5cf4009cb934ea7a94dbe7e08095/deps/rabbit/src/rabbit_classic_queue.erl#L503),
[current-state totals](https://github.com/rabbitmq/rabbitmq-server/blob/7a34a0caf4fa5cf4009cb934ea7a94dbe7e08095/deps/rabbit/src/rabbit_amqqueue_process.erl#L1140),
[queue request handler](https://github.com/rabbitmq/rabbitmq-server/blob/7a34a0caf4fa5cf4009cb934ea7a94dbe7e08095/deps/rabbit/src/rabbit_amqqueue_process.erl#L1303).

## Actual provider regression

The existing native broker test retains the pinned RabbitMQ and nginx providers,
real AMQP confirmed publication and acknowledgement, normally trusted TLS, scoped
monitor credentials and all prior write/path/authentication negatives. Only its own
ephemeral broker receives test-admin rabbitmqctl eval to suspend
rabbit_mgmt_metrics_collector:name(queue_coarse_metrics). No production permission
or operational command was added.

After an observed zero and collector suspension, the real AMQP fixture publishes
and confirms one message. The normal management API still reports ready0, while
the direct totals API reports ready1. The original proxy then reports ready0 and
fails the intended assertion: "Monitor accepted cached zero after confirmed
publication" (RED, 1 passed/1 failed,30.29s). This establishes the defect without
assuming any finite statistics delay.

After the fixed upstream query, the monitor observes ready1, then unacked1 after
basic.get, then ready0/unacked0 after acknowledgement, with the sampled collector
still suspended. It rejects client-supplied queries including the same fixed
query. All prior TLS, monitor authentication, AMQP publish/read/delete and HTTP
mutation denials remain exercised. GREEN:2/2, zero skips,19.28s; final explicit
classic-type assertion recheck is recorded below. Captured provider output and
fixture credentials remain private. Cleanup attempts the fixture process, all
owned Podman resources and the validated temporary directory on both RED and GREEN.

The operational adapter still must prove publisher termination and its existing
consumer/timeout preconditions. A queue read cannot prohibit future publication;
it removes the stale sampled-zero gap only. Real AKS transport and actual hosted
backup identity qualification remain pending.

Final recheck with the explicit classic queue-type assertion:
AZURE_PROVIDER_CONTRACTS=1 node --test scripts/azure-broker.test.mjs — PASS2/2,
zero skips,19.65s. Scoped ESLint (max-warnings0) passed before this native recheck.

Coordinator-requested final three-counter qualification: every observed ready/unacked
state now also requires messages == messages_ready + messages_unacknowledged.
AZURE_PROVIDER_CONTRACTS=1 node --test scripts/azure-broker.test.mjs — PASS2/2,
zero skips,22.74s. All suspended-collector, classic, authentication, TLS and write/path
denials remain enabled. This replaces only the tested native-file snapshot, not the
historical evidence above.
