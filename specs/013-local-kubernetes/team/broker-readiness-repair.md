# RabbitMQ startup readiness repair

Owner request: fix intermittent RabbitMQ setup failures observed on PR 15, run
39769077548 at source 3b23573. This is a bounded test-infrastructure repair, not
feature acceptance or authorization to push, dispatch workflows or change the VM.

## Evidence and diagnostic boundary

Attempt 1: 564 backend cases, 525 passed and 39 failed. A shared Notifications
fixture failed its first AMQP connection in ResetQueueAsync during initialization.
Attempt 2: 563 passed and one BrokerBootstrap executable/import test failed its
first publisher connection. Notifications passed. Both failures report
BrokerUnreachableException / IOException (connection.start was never received) /
EndOfStreamException. Both setups previously considered an internal TCP listener
sufficient readiness before making one AMQP connection attempt.

Ranked explanations: (1) TCP-open precedes successful AMQP readiness; (2) transient
host-side transport/load failure after startup; (3) invalid credentials or imported
definitions. The first two predict connection establishment can recover without
changing credentials; the third must remain a permanent failure. Neither CI output
proves the exact server-side trigger. Existing rootful and rootless Podman endpoints
both fail their read-only info probes, so a local real-provider reproduction is
currently unavailable; no VM or service was started or reconfigured.

## Design and test boundary

Retain the real client, production provisioning and live-container contracts.
Add a narrow fixture connection-establishment seam that returns the successful
connection, so callers use the connection that actually established readiness.
The injected operation replaces only external AMQP connection establishment;
retry classification, cancellation, bounds and diagnostics remain real. Its
generic result preserves the established connection without a second probe/open
race. Policy tests use an opaque successful external connection handle and actual
RabbitMQ exception types with the observed nested EOF shape. This deterministic
algorithm boundary is justified independently of application behavior; it does
not claim to prove real RabbitMQ startup or messaging.

The existing live BrokerBootstrap import/publish/consume test and Notifications
fixture retain actual broker/client/provider verification. No test serialization,
test retry or application timeout change is planned. Only initial connection
establishment is retried; queue mutations and message publication are outside the
retry boundary. Runtime recovery tests retain their existing connection behavior.

Bounds: maximum 12 attempts, 60 seconds overall, five seconds per connection
attempt, 100ms exponential delay capped at two seconds with bounded jitter.
Retry only known transport/timeout failures; reject authentication, ambiguous and
unknown failures, including mixed aggregates. Caller cancellation propagates.
No circuit breaker is warranted for this finite setup operation. Safe diagnostics
identify startup phase, attempt count and fixed category without retaining raw
exceptions, credentials or connection strings.

Provider contract reference: the official [RabbitMQ .NET guide](https://www.rabbitmq.com/client-libraries/dotnet-api-guide#automatic-recovery-from-network-failures)
documents that initial connection failures require explicit application handling;
automatic recovery applies after an established connection. Installed client 7.2.2
XML docs and the two observed CI exception chains establish the failure shapes.

## Red/green and verification

The new connection seam initially performed one attempt, retaining the old setup
behavior. Before implementing recovery, the focused class ran with 10/10 intended
failures (exit 2): handshake/EOF, refused/reset/timeout could not reach a subsequent
successful connection; permanent failures lacked safe phase diagnostics; cancellation
and exhaustion contracts failed. This is a deterministic reproduction of the
connection-boundary defect, rather than a claimed reproduction of the CI broker's
server-side timing condition.

After bounded recovery, those 10 cases passed. A further regression showed that
an unrelated OperationCanceledException was incorrectly retried (expected exception
not thrown); it passed after limiting cancellation retries to an expired attempt
token. Added coverage confirms a stalled cancellation-aware connection attempt is
cancelled and a subsequent connection can establish readiness.

A real RabbitMQ 7.2.2 client also connects to an isolated loopback TCP listener that
reads its actual AMQP protocol header and closes before sending connection.start.
The connection policy recovers from that actual client failure to the next successful
external connection handle. This validates the failure-double boundary against the
real client and TCP behavior; it does not simulate or claim a successful authenticated
broker handshake. The existing actual broker tests still own that provider contract.
The pinned [ConnectionFactory source](https://github.com/rabbitmq/rabbitmq-dotnet-client/blob/v7.2.2/projects/RabbitMQ.Client/ConnectionFactory.cs#L502-L536)
confirms that cancellation of the supplied connection token propagates, while other
initial connection failures are wrapped as BrokerUnreachableException.

Final focused command on Windows arm64 / .NET SDK 10.0.301:
`dotnet test --project tests/BrokerBootstrap.Tests/BrokerBootstrap.Tests.csproj -- --filter-class '*BrokerReadinessTests'`:
exit 0, 13 passed, zero failures/skips, 14.802 seconds. All source edits were formatted
and reread. Initial analyzer runs found name inference/import/lambda/style issues;
those were repaired explicitly, with behavior tests rerun afterward.

Final `npm.cmd run format-check`: exit 0. Final `npm.cmd run lint`: exit 0,
solution build zero warnings/errors and ESLint/style verification passed. Whitespace
and author inspection passed. The change is confined to test infrastructure and
its regression coverage; no production application or workflow source changed.
Required real-broker
and full backend validation remain pending while the existing runtime is unavailable.
Both configured Podman endpoints fail read-only info probes; no runtime changes,
external dispatches, commit or push were performed. No passing CI rerun alone is
treated as proof that the flake is eliminated, and feature acceptance stays pending.
