**Batch 4 verdict: changes_requested.** Two blocking quality findings remain.

Verified all 134 manifest file digests: zero mismatches; aggregate matches frozen B4 `3f4080a91b0ec60b5b570ec9112d3a4b442d39f27fdcd25403deb8da8f666952`.

| ID | Severity | Blocking | Owner | Finding |
|---|---|---|---|---|
| Q-B4-001 | High | Yes | Coder | Real RabbitMQ permanent configuration failures are classified as transient retries. |
| Q-B4-002 | Medium | Yes | Coder | Event timestamp validation loses the raw grammar needed to reject ambiguous/excessively precise inputs. |

**Q-B4-001**

Locations: `src/Reservations/OutboxWorker.cs` permanent classification; `src/Notifications/ReservationConsumer.cs` reconnect classification.

Both classify only `InvalidDataException`, `ArgumentException` and `InvalidOperationException` as permanent. Actual adapter topology failures propagate `OperationInterruptedException`; authentication failures can be wrapped by connection failures. Consequently, incompatible durable queue declarations and rejected credentials can continue scheduled retries rather than park the outbox event or stop consumer setup.

RabbitMQ documents incompatible declarations as `406 PRECONDITION_FAILED`; the pinned client’s `OperationInterruptedException` derives from `RabbitMQClientException`, outside the implemented classifier. [RabbitMQ property equivalence](https://www.rabbitmq.com/docs/queues#property-equivalence), [pinned exception source](https://raw.githubusercontent.com/rabbitmq/rabbitmq-dotnet-client/v7.2.2/projects/RabbitMQ.Client/Exceptions/OperationInterruptedException.cs).

This violates Constitution VI and the approved permanent-disposition clarification. Existing permanent tests inject generic synthetic exceptions, so they do not establish fidelity for actual broker failures.

Repair: explicitly classify provider failures using appropriate reply codes and nested authentication causes, preserving transient/uncertain transport retries. Add intended failing public-lifecycle tests using faithful provider exceptions and real-broker configuration failure coverage before fixing. Validate durable parking/no repeated cycle or restart publication, consumer stop, safe signals and repaired recovery.

**Q-B4-002**

Locations: `src/HelloMessaging/ReservationEventValidation.cs` `TryRead`/`FiniteUtc`; generated `ReservationEvent` DateTimeOffset contracts.

Validation runs after default deserialization and checks only resulting offset/tick alignment. This accepts seven-digit `.1234560Z` despite the six-digit contract, and can accept `.12345601Z` after silently discarding precision. Offset-free values can also pass when the service timezone is UTC. .NET’s parser interprets missing offsets as local time and discards excess fractional precision. [Pinned .NET parser source](https://raw.githubusercontent.com/dotnet/runtime/v10.0.0/src/libraries/System.Text.Json/src/System/Text/Json/JsonHelpers.Date.cs).

The current `.1234567Z` poison test only detects nonaligned ticks; it misses raw grammar/truncation. This violates the approved data-model validation boundary and FR-019.

Repair: validate original event timestamp grammar through a strict converter or explicit wire strings while retaining generated metadata. Add intended failing broker-consumer poison tests for missing offsets under UTC and excess fractional digits, followed by valid delivery; require zero invalid inbox entries and continued progress.

Other assessed behavior is sound: transactionally retained events, mandatory confirms, durable topology, ACK-after-inbox-commit, persistent EventId deduplication, actual redelivery crash-window coverage, poison rejection, bounded transient bursts, generated JSON/logging/regex and explicit inbox observation UI. Cancellation remains independent of messaging.

Reported gates passed four tooling, 35 Angular, 144 backend and 31 real smoke tests, zero skips/warnings; their coverage misses these findings. Chronology records distinguish intended reds from fixture failures and supplementary coverage.

No files changed or write-producing checks run. T037–T044 and SEC-001 actual browser closure remain pending. Preserve repair budget at two of three until coordinator assigns a bounded repair round; this review does not reset it.
