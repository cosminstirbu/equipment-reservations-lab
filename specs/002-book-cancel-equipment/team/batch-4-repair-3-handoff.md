Q-B4-001 and Q-B4-002 repairs are implemented and **source is frozen** for original reviewer validation. This remains implementation repair round **3 of 3**. T047/T048 remain unchecked pending reviewer closure; T046 remains pending browser/security evidence. No B5 work started.

Final snapshot: **137 paths**, SHA256 **`c40044c4771a1abf9df625520207a867298e75ff09f9fd6b8b021906376cd81a`**, independently confirmed by coordinator. Same aggregate algorithm; per-file manifest `/tmp/b4-repair-source-manifest.txt`.

Q-B4-001 now distinguishes permanent protocol/authentication/configuration failures from transport uncertainty. Nested authentication matches the [pinned client exception contract](https://raw.githubusercontent.com/rabbitmq/rabbitmq-dotnet-client/v7.2.2/projects/RabbitMQ.Client/Exceptions/BrokerUnreachableException.cs). Broker permanent failures retain durable parking and explicit repaired metadata reset. Known own-DB failures halt the worker without falsely publishing or parking; repaired restart resumes the unchanged event. The DB classifier uses explicit [SQLSTATE classes/codes](https://www.postgresql.org/docs/18/errcodes-appendix.html), preserving transient08006 and uncertainP0001 behavior.

Q-B4-002 adds a property-specific strict converter compatible with generated JSON metadata. It validates original timestamp strings before conversion: explicit zero UTC offset, at most six fractional digits and finite values. Default timestamp writer behavior remains unchanged.

Recorded intended failures before respective fixes:
- Recovery initial provider matrix: RED10/13 passed; expanded permanent AMQP/authentication matrix RED30/13 passed.
- Real RabbitMQ incompatible topology/rejected credentials: RED2/5 passed.
- PostgreSQL consolidation: RED11/49 passed, including actual42P01 outbox selection failure.
- Actual inbox42501 before commit: RED1/32 passed.
- Strengthened selected-event DB halt cases: RED5/55 passed.
- Actual Published-write42501 with scheduling writes permitted: RED1/7 passed; exposed incorrect parking after broker acceptance.
- Timestamp poison tests: RED9/23 passed, covering aligned seven digits, truncated eight digits and offset-free values under controlled UTC for all three timestamp fields.

Final focused commands all exit0:
- `dotnet test tests/Backend.Tests --filter FullyQualifiedName~ReservationRecoveryTests -m:1` — **60/60**,41s.
- `dotnet test tests/Smoke.Tests --filter FullyQualifiedName~ReservationOutboxTests -m:1` — **8/8**,56s.
- `dotnet test tests/Smoke.Tests --filter FullyQualifiedName~ReservationConsumerTests -m:1` — **33/33**.
- `dotnet test tests/Backend.Tests --filter FullyQualifiedName~SecurityBrowserWriteTests -m:1` — **48/48**,7s.

Actual provider tests prove permanent parking across cycles/restart, explicit repaired recovery, unACKed permission-fault redelivery with `Redelivered=true`, retained identical inbox entries, and no false Published/parking after permanent metadata failure. Actual mandatory return/nack, broker outage and originalP0001 crash recovery still pass. Supplementary ALL-update-denial coverage preceded the stronger retained Published-only regression; no retrospective red claim.

Final gates all exit0:
- `npm run format-check`
- `npm run lint` — zero warnings/errors; explicit analyzer repairs, no suppressions.
- `npm run check` — production Angular build; **4 tooling,35 Angular,191 backend,44 real smoke tests**, zero skipped. Backend1m13s; smoke2m30s.
- `git diff --check`

Exactly ten changed/new paths versus frozen B4:
`src/HelloMessaging/{ReservationEvent,ReservationFailure,ReservationTimestampConverter}.cs`,
`src/Notifications/ReservationConsumer.cs`,
`src/Persistence/DatabaseFailure.cs`,
`src/Reservations/OutboxWorker.cs`,
`tests/Backend.Tests/ReservationRecoveryTests.cs`,
`tests/Smoke.Tests/{ReservationConsumerTests,ReservationDeliveryFixture,ReservationOutboxTests}.cs`.
No removed files, new packages, production migrations or production-volume mutations.

Environment remains .NET10, Podman/Testcontainers, PostgreSQL18.6 and RabbitMQ4.3.6/client7.2.2. Generated metadata/regex/logging compiled without diagnostics. Exact feature prerequisites and read-only checklists passed; no extension hooks exist. Reviewer closure, SEC-001 browser evidence and final feature gates remain pending.
