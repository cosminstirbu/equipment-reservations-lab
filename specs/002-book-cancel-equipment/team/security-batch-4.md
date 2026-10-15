**Batch 4 security verdict: changes_requested.**

Feature: `specs/002-book-cancel-equipment`. Independently verified all 134 manifest file digests and aggregate `3f4080a91b0ec60b5b570ec9112d3a4b442d39f27fdcd25403deb8da8f666952`.

**Confirmed shared finding Q-B4-001**

**Category/severity:** code/policy, medium, blocking. Deduplicated with the verifier’s finding.

**Scenario and preconditions:** A permanent broker topology or credential configuration fault produces a RabbitMQ provider exception. Workers repeatedly attempt an operation that cannot succeed without repair.

**Evidence:** `OutboxWorker.AttemptAsync` and `ReservationConsumer.ExecuteAsync` classify only `InvalidDataException`, `ArgumentException` and `InvalidOperationException` as permanent. `ReservationPublisher` and `ReservationSubscription` propagate provider failures without translating permanent protocol/authentication faults. Consequently, `OperationInterruptedException` for permanent broker configuration replies and authentication failures nested in `BrokerUnreachableException` enter scheduled retry paths. This contradicts constitution VI and the approved transient-only/permanent-disposition policy. Current permanent-failure tests exercise synthetic boundary exceptions rather than these provider shapes.

**Remediation:** Explicitly classify relevant permanent broker protocol/authentication/configuration errors, including nested connection failures, while preserving automatic recovery for transient outages, returns/nacks and uncertain publication.

**Verification:** Regression-first tests through worker/consumer public lifecycle using faithful provider exceptions or controlled real broker failures. Prove permanent faults stop scheduled attempts across the applicable lifecycle; outbox events remain unchanged/unpublished; repaired explicit recovery succeeds. Re-run affected recovery/provider tests and frozen reviews.

**Other inspected controls**

- Durable separate reservation topology, persistent messages, mandatory confirmations and pending-event retention.
- Transactional inbox uniqueness and ACK-after-commit; poison rejection without requeue and transient database redelivery.
- Bounded envelope/schema/ID/time validation, strict trace-context handling, generated serialization/logging and bounded telemetry labels.
- Own-database access remains preserved.
- Browser guard validates canonical Host/Origin, rejects originless browser metadata, enforces booking JSON media type and protects cancellation/hello before side effects.

No additional confirmed security vulnerability found.

**SEC-001:** HTTP implementation addresses the inspected attack path, but the finding remains open until revision-matched actual browser/proxy evidence and original reviewer closure. No waiver.

**Supplied evidence:** Full gates passed with four tooling, thirty-five Angular, 144 backend and 31 real smoke tests, zero skips/warnings; 48 HTTP security cases and real return/nack, poison, redelivery/crash-window checks passed. Those checks do not resolve Q-B4-001.

Final listener, secret/dependency and exported telemetry checks remain pending. No files changed or write-producing probes executed.
