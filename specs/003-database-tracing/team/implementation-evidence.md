# Database tracing implementation evidence

Source baseline: `6241fb1495412274b3de3242d7ec3eb36f9ee4b6`. Candidate is the working tree; final source hash/checks pending.

## Environment and scope

.NET pinned repository SDK, Npgsql 10.0.3, existing OpenTelemetry 1.19.1; Podman socket `/var/folders/6k/z9rq_rsj7gj5ghmy_rx43nzh0000gp/T/podman/podman-machine-default-api.sock`, PostgreSQL 18.6 Testcontainers. Tests use `DOCKER_HOST=unix://<socket>` and `TESTCONTAINERS_RYUK_DISABLED=true`. Sandbox socket bind initially blocked testhost; authorized escalated rerun accesses real PostgreSQL. No runtime skip.

All-path inventory follows plan: equipment list/detail; reservation availability/list/detail/book/cancel transaction commands; outbox snapshot/select/publish-update/reschedule/empty-poll; inbox insert/dedup/history; three service health checks; migration lock/ledger/lookup/script/record/unlock; bootstrap server-admin/per-database-admin/service-owned migration sources; physical connections and controlled failures.

## Test-first results

Commands use the environment above and `dotnet test tests/Backend.Tests --filter <filter> -m:1`.

- Initial equipment regression: real HTTP `/api/equipment` returned 200, production-known `Equipment.Hello` control activity was created and exported, exporter reported no failure; expected Npgsql Client command absent. Exit 1, intended missing-span failure. No test listeners/subscriptions/instrumentation added. Early fixture setup issue (Npgsql strips password from exposed connection string) fixed in private fixture helper before recording this red.
- Initial privacy/default/off/repeated-host scenarios: actual SQL succeeds and controlled server error is handled; assertions fail because no native spans export. Exit 1 (four initial cases including equipment).
- Full test-first batch filter `FullyQualifiedName~DatabaseTracingTests|FullyQualifiedName~DatabaseWorkerTracingTests|FullyQualifiedName~DatabaseBootstrapTracingTests|FullyQualifiedName~DatabaseTelemetryPrivacyTests`: 11 failed, zero passed, exit 1 before source implementation. API/worker/bootstrap paths performed their existing behavior; expected database operations absent. Poll/publication workflow spans existed; polling command assertions failed. Full provisioning and repeat completed, but expected per-database migration spans absent. No compiler failures.
- Control existing `FullyQualifiedName~IncomingHttpExportRedactsQuery`: pass, exit 0. Fresh first Inventory TestServer host did not export server spans on baseline; explicit known workflow proves exporter registration without adding subscriptions. HTTP correlation still requires final verification; this is not counted as HTTP server-span evidence.

## Implementation / validation

Focused production pipeline tests: final expanded batch 18/18 passed, zero skipped, exit 0 (about 9 seconds), using the four-class filter above. Bootstrap process-only red ran before lifecycle implementation: success exit 0 / failure exit 1 both produced no OTLP traces, so both expected bootstrap-span assertions failed (exit 1). After host-neutral registration/start and independent bounded trace/log shutdown, process tests pass against a local HTTP/protobuf collector and real PostgreSQL.

| Path | Automated evidence |
| --- | --- |
| Equipment list/detail + parameterized text | `EquipmentListExportsNativeDatabaseChildThroughProductionRegistration` uses Kestrel on ephemeral loopback, production datasource/registration, HTTP 200, native command parent equals actual exported HTTP server span. Privacy tests cover detail and private bound IDs/results. |
| Reservation availability/history/detail/book/cancel | `BookingCancellationReadsAndHandledConflictExportEveryCommandUnderTheirWorkflow` verifies all expected descriptors and two transaction command children of the booking workflow; overlap constraint remains HTTP409 and native error SQLSTATE23P01. |
| Handled inventory failure | `InventoryHandledDatabaseFailurePreserves503AndExportsSafeFailure`: HTTP503 retained, SQLSTATE42P01 exported safely. |
| Outbox poll/publication/retry | `OutboxSpansSeparatePollingFromPropagatedPublicationAndIncludeReschedule` success/retry cases verify snapshot/selection outside saved reservation trace; published/reschedule update children of actual producer; successful delivery followed by empty poll. |
| Inbox consumer/dedup/history | `InboxInsertDedupAndHistoryRetainActualConsumerContextAndHealthVisibility` runs actual ReservationConsumer with faithful broker boundary, propagated parent, two actual consumer spans and two child INSERTs, one persisted entry, HTTP/history and health visibility. |
| Health | Inventory SQL-policy health, Reservations API test and Notifications consumer test exercise shared health SELECT policy; runtime checklist covers all three deployed endpoints. |
| Bootstrap all source constructors | `FullProvisioningAndRepeatedMigrationsExportAdminAndReviewedServiceOperationsWithoutSecrets` uses a dedicated real PG fixture per case, reconciles twice with SQL-on/off, checks every service migration lock/ledger/lookup/apply/record/unlock descriptor and administrative text omission. |
| Short process lifecycle | `BootstrapProcessExportsBeforeExitOnSuccessAndFailure` runs actual executable to completion and checks delivered OTLP bootstrap trace, correct exit codes and sensitive-probe absence. |
| Unknown/admin/migration policy | Unknown literal+placeholder, arbitrary SqlMigration, wrong embedded content digest, exact reviewed command on admin source all remain text-off. |
| Connection errors | Auth failure SQLSTATE28P01 and client transport failure expose only safe connection span, no claim that a command executed; logical unknown identity and sanitized exported DisplayName. |

Reviewed scripts: the three unchanged initial migration resources; SHA-256 digests live explicitly in each owning ServiceMigrations file. All scripts were read completely: schema constraints, demo equipment seed values, fixed demo-user/status/event literals are approved structure. Script bytes/checksums were not changed. Runtime commands share executing SQL constants and descriptors; no duplicated independently maintained text catalog. Parameters/results never become descriptor state.

Export snapshots inspect sanitized DisplayName, tags, status, events, links/baggage, resource attributes, log formatted/state/exception/scope fields and metric dimensions. The internal native OperationName is retained separately only as an internal structural diagnostic: pinned OTLP exports DisplayName, so OperationName is not included in the wire-field privacy scan (reviewed targeted T005 clarification). Both attached exporters see sanitized events. Tests assert resource capture is present. Native Npgsql logging stays disabled. Existing metric dimensions and resilience budgets are unchanged.

Source/admission integration adds no package versions; project references and their generated lockfile edges changed. No new JSON, regular expressions or application log contracts were introduced; existing bootstrap logging remains source generated. No analyzer suppressions or disabled rules added.

## Missing-registration mutation

Fresh-process command: environment above, `dotnet test tests/Backend.Tests --filter FullyQualifiedName~EquipmentListExportsNativeDatabaseChildThroughProductionRegistration -m:1`.

Removed only `.AddSource("Npgsql")`, leaving the production ExceptionRecorder and all privacy configuration installed. Kestrel HTTP returned 200; exporter retained the workflow control, HTTP client and actual server spans. Expected native database command assertion failed, exit 1, no Npgsql spans. Restored source byte-for-byte, formatted/re-read, asserted identical SHA-256 `5c1464fa7122247364d145694b91bfcc220b45e677c20a9e78360b4e68c411b1`. Repeated this proof after final import cleanup; same intended missing-command failure and identical source restoration. Final restored fresh-process run passed 1/1, exit 0, no skipped tests (about 412 ms test time).

Scoped style verification across every owned .cs file passed after explicit import ordering/removal fixes; no semantic formatter auto-fix was used. Full format/lint/check, runtime evidence and independent review remain pending. No human acceptance recorded here.

## Frozen owned candidate

Manifest SHA-256 `e94c35f4c60a004ce24ca2a41a4015d2a50686f24eeaba87175adc88f92fadbe` across changed/new production, tests, lockfiles, root readme and quickstart (metadata files excluded).

```text
e17a80ce31ca20148d194b10a8c7183fcb0840cd6f41a8e09148c2f2691220b5  readme.md
539b503a7e4afe9df3ccaeec55fcfe4000e2fa2086c2e12e4e5a528491c79752  specs/003-database-tracing/quickstart.md
a361119ab90b7a65f9c7127df5a60be4f99e05a9197c28cc1ff46b44d27c2dff  src/DatabaseBootstrap/DatabaseBootstrap.csproj
af726d090f8a9a62a2485137371d04626202f70e063deaf573aacbb070383db9  src/DatabaseBootstrap/DatabaseProvisioner.cs
4145a058901222df4941a0875340f50b1599f89aea34b1fe198d0fec42a1042f  src/DatabaseBootstrap/Program.cs
2fcaba1663ba9a4a1ee16f121f706f817ec4fe5716c2c0732338f09ec834c1ac  src/Inventory/EquipmentStore.cs
d1904965703eb0efd5e524907394dbe503bb6f3b9e2cd5cc1754b267a0ec9f54  src/Inventory/Program.cs
7132c9f06d63a611994de52ffc9af1e7ad743ac6e4af76d3936a99cfe7e4f256  src/Inventory/ServiceMigrations.cs
3ab141007e1b423dc3cab809d20a886d87dd24af9dacd18089100e487ccdd007  src/Notifications/Program.cs
ec96c83383b763dce6ef66e7a04d629b4ce597df0986263589c927fd483c8bcd  src/Notifications/ReservationInbox.cs
1bbb891a8066c702504185349279ddb931cda19277a09a7c2162684fd375fde3  src/Notifications/ServiceMigrations.cs
fa042a592555670d3fc673fa0e264d9ce2a6b50cf7a0f96012c5c049c410cc86  src/Persistence/DatabaseTracing.cs
e7a85a31ff4b8f1ca2c7dc54f583b5a18603d59e1a0566fe52ac85a9eefeeaa4  src/Persistence/SqlMigrations.cs
5e8631fc9ec425b4941cce5caf0e7c6ccfbe9dfaa3bc43af1b8edf7fea4f04b7  src/Reservations/OutboxWorker.cs
4bc1b05a12502da559c5bc1c4d025414368891dad9a0e4b9fb174c99714dc900  src/Reservations/Program.cs
8f5c84e70f7ffa5737a7c3b1e7791b3766d36129102e6ba1cc98adfb1408c05c  src/Reservations/ReservationStore.cs
0fdc1c63b60cdba69e809082d7747df3bf01de52e9f79a3209de0db34efd5a0d  src/Reservations/ServiceMigrations.cs
2028ccb41fe1e678fecbdab5d7728230323c0a2529628af2f765f7b7df9cc0e3  src/ServiceDefaults/DatabaseTelemetryPrivacyProcessor.cs
5c1464fa7122247364d145694b91bfcc220b45e677c20a9e78360b4e68c411b1  src/ServiceDefaults/Extensions.cs
6edc77414e5d04bd2ebf41fa2987aadad03558fd8b3151f06c176f77462de3bd  tests/Backend.Tests/Backend.Tests.csproj
14e39ce28f5a54088050cb502831a31a31650eabff49e313c1305c0b6af117b4  tests/Backend.Tests/DatabaseBootstrapTracingTests.cs
a548e5dc9a725af44ad8e32763e76a2b52485de10599a3f938ef19f8cecbdf20  tests/Backend.Tests/DatabaseTelemetryCapture.cs
1c07e91997be8b21b4d39399fb87fe36e783549bbf77f34d9f91d4fead6fcc94  tests/Backend.Tests/DatabaseTelemetryPrivacyTests.cs
e9e14edf379d06610d489123bead0071eecea7f09ae3fdd36be2d61f9ff54c2d  tests/Backend.Tests/DatabaseTracingTests.cs
0ca3ce694bd592ebcb671620b1028a42edb54be856f0493fb8c46f2b63c69e1f  tests/Backend.Tests/DatabaseWorkerTracingTests.cs
8f267c4e5d96e5495e7fe02f1cf6f323820168d914969752a0e1a26f54084f21  tests/Backend.Tests/PostgresFixture.cs
e7cad81d56d21cb84e881e99b0f265d2326670cdac6fc4a794130c7ff74bcdab  tests/Backend.Tests/packages.lock.json
5a820d1df192c7835b9a33ca0260312925c3b29aa98ae6855e84772e563c5f77  tests/Smoke.Tests/packages.lock.json
```

## Final validation in progress

- `npm run format-check`: PASS, exit 0, all matched files formatted.
- `npm run lint`: PASS, exit 0; ESLint zero warnings, full solution build zero warnings/errors, suggestion-level .NET style verification passed.
- `env DOCKER_HOST=unix://<socket above> TESTCONTAINERS_RYUK_DISABLED=true npm run check`: running with authorized socket/container access; result pending.
- `git diff --check`: PASS, exit 0 before broad validation.
- Skill prerequisites resolved explicitly to `specs/003-database-tracing`; checklist gate requirements16/16 and observability-quality10/10, zero unchecked items. No `.specify/extensions.yml` exists, so before/after implement hooks are absent.

## Q-001 / T027 independent-review repair

The initial frozen candidate's full `npm run check` passed: tooling4, Angular39, Backend229, real smoke45, no skips, exit0. That historical result does not validate the subsequent correlation repair.

Test-first command: same Podman environment, `dotnet test tests/Backend.Tests --filter FullyQualifiedName~BootstrapProcessExportsBeforeExitOnSuccessAndFailure -m:1`. Added actual OTLP logs collection and public protobuf-contract decoding. Child test export enables numeric EventId attributes via `OTEL_DOTNET_EXPERIMENTAL_OTLP_EMIT_EVENT_LOG_ATTRIBUTES=true`; this changes only exporter diagnostic metadata, adds no instrumentation/subscriptions. EventId1 success log matched the root workflow; EventId2 failure log existed exactly once but had no exported trace ID, while actual root trace ID was nonzero. Intended red:1 failed/1 passed, exit1. Exit codes and privacy checks passed before the failing correlation assertion.

Production repair: emit EventId2 safe failure log inside the active bootstrap catch and return existing failure exit code1 there; outer catch handles startup failures where workflow was never created. One provisioning failure log remains. The two OTLP subprocess cases now both pass: success EventId1/failure EventId2 each exactly once, nonzero root trace/span IDs equal outcome log trace/span IDs, secret probes absent in traces/logs/console, original exit codes unchanged. Refreshed four-class focused command passed18/18, zero skipped, exit0 (about9s). Registration file still byte-identical SHA2565c1464fa..., so missing-registration mutation proof is unaffected by this bootstrap-only change. Original verifier closure remains pending; coder does not self-approve Q-001.

## Q-001 repaired candidate

Owned candidate manifest SHA-256 `4ed38a7b821a05deec2201e2f650e2425ed186ce8344bc1a360a92f11867d68a` (same scope as historical manifest above plus OtlpMessage helper).

```text
e17a80ce31ca20148d194b10a8c7183fcb0840cd6f41a8e09148c2f2691220b5  readme.md
539b503a7e4afe9df3ccaeec55fcfe4000e2fa2086c2e12e4e5a528491c79752  specs/003-database-tracing/quickstart.md
a361119ab90b7a65f9c7127df5a60be4f99e05a9197c28cc1ff46b44d27c2dff  src/DatabaseBootstrap/DatabaseBootstrap.csproj
af726d090f8a9a62a2485137371d04626202f70e063deaf573aacbb070383db9  src/DatabaseBootstrap/DatabaseProvisioner.cs
9162b573a9f5d74437d6fe22631c92b1378051401b19644c6a14f4532a17c9a7  src/DatabaseBootstrap/Program.cs
2fcaba1663ba9a4a1ee16f121f706f817ec4fe5716c2c0732338f09ec834c1ac  src/Inventory/EquipmentStore.cs
d1904965703eb0efd5e524907394dbe503bb6f3b9e2cd5cc1754b267a0ec9f54  src/Inventory/Program.cs
7132c9f06d63a611994de52ffc9af1e7ad743ac6e4af76d3936a99cfe7e4f256  src/Inventory/ServiceMigrations.cs
3ab141007e1b423dc3cab809d20a886d87dd24af9dacd18089100e487ccdd007  src/Notifications/Program.cs
ec96c83383b763dce6ef66e7a04d629b4ce597df0986263589c927fd483c8bcd  src/Notifications/ReservationInbox.cs
1bbb891a8066c702504185349279ddb931cda19277a09a7c2162684fd375fde3  src/Notifications/ServiceMigrations.cs
fa042a592555670d3fc673fa0e264d9ce2a6b50cf7a0f96012c5c049c410cc86  src/Persistence/DatabaseTracing.cs
e7a85a31ff4b8f1ca2c7dc54f583b5a18603d59e1a0566fe52ac85a9eefeeaa4  src/Persistence/SqlMigrations.cs
5e8631fc9ec425b4941cce5caf0e7c6ccfbe9dfaa3bc43af1b8edf7fea4f04b7  src/Reservations/OutboxWorker.cs
4bc1b05a12502da559c5bc1c4d025414368891dad9a0e4b9fb174c99714dc900  src/Reservations/Program.cs
8f5c84e70f7ffa5737a7c3b1e7791b3766d36129102e6ba1cc98adfb1408c05c  src/Reservations/ReservationStore.cs
0fdc1c63b60cdba69e809082d7747df3bf01de52e9f79a3209de0db34efd5a0d  src/Reservations/ServiceMigrations.cs
2028ccb41fe1e678fecbdab5d7728230323c0a2529628af2f765f7b7df9cc0e3  src/ServiceDefaults/DatabaseTelemetryPrivacyProcessor.cs
5c1464fa7122247364d145694b91bfcc220b45e677c20a9e78360b4e68c411b1  src/ServiceDefaults/Extensions.cs
6edc77414e5d04bd2ebf41fa2987aadad03558fd8b3151f06c176f77462de3bd  tests/Backend.Tests/Backend.Tests.csproj
3f091abf1ef6bad94b999703d35c03a53d7055a6e308794d1191374cba05d33c  tests/Backend.Tests/DatabaseBootstrapTracingTests.cs
a548e5dc9a725af44ad8e32763e76a2b52485de10599a3f938ef19f8cecbdf20  tests/Backend.Tests/DatabaseTelemetryCapture.cs
1c07e91997be8b21b4d39399fb87fe36e783549bbf77f34d9f91d4fead6fcc94  tests/Backend.Tests/DatabaseTelemetryPrivacyTests.cs
e9e14edf379d06610d489123bead0071eecea7f09ae3fdd36be2d61f9ff54c2d  tests/Backend.Tests/DatabaseTracingTests.cs
0ca3ce694bd592ebcb671620b1028a42edb54be856f0493fb8c46f2b63c69e1f  tests/Backend.Tests/DatabaseWorkerTracingTests.cs
f7bbfd29615a8a80e124768217761877088f37c8a4a4e5ed929a3ba51aee0de8  tests/Backend.Tests/OtlpMessage.cs
8f267c4e5d96e5495e7fe02f1cf6f323820168d914969752a0e1a26f54084f21  tests/Backend.Tests/PostgresFixture.cs
e7cad81d56d21cb84e881e99b0f265d2326670cdac6fc4a794130c7ff74bcdab  tests/Backend.Tests/packages.lock.json
5a820d1df192c7835b9a33ca0260312925c3b29aa98ae6855e84772e563c5f77  tests/Smoke.Tests/packages.lock.json
```

Final format/lint/fullcheck refresh pending.

Q-001 wire assertions follow the public [OTLP trace schema](https://github.com/open-telemetry/opentelemetry-proto/blob/main/opentelemetry/proto/trace/v1/trace.proto), [log schema](https://github.com/open-telemetry/opentelemetry-proto/blob/main/opentelemetry/proto/logs/v1/logs.proto), and pinned [exporter EventId option](https://github.com/open-telemetry/opentelemetry-dotnet/blob/core-1.19.1/src/OpenTelemetry.Exporter.OpenTelemetryProtocol/Implementation/ExperimentalOptions.cs). The small collector reader parses protobuf fields only to observe actual process output, not private application internals or independently emitted test spans.

Refreshed `npm run format-check`: PASS exit0. Refreshed `npm run lint`: PASS exit0, zero build/analyzer warnings/errors and style gate passed.

Coordinator supplied original-verifier closure of Q-001 on repaired snapshot `79a1bbac...` (250-file manifest), recorded in `team/quality-round-1.md`; security delta has no findings. T027 marked complete only after that explicit independent closure. Revised fullcheck running; T023 remains pending.

## Final repaired-candidate validation

All required automated commands passed on the frozen Q-001 repaired candidate:

| Command | Result |
| --- | --- |
| `npm run format-check` | Exit0, all matched files correctly formatted. |
| `npm run lint` | Exit0; ESLint, full .NET build with warnings treated as errors (zero warnings/errors), suggestion-level style gate pass. |
| `env DOCKER_HOST=unix:///var/folders/6k/z9rq_rsj7gj5ghmy_rx43nzh0000gp/T/podman/podman-machine-default-api.sock TESTCONTAINERS_RYUK_DISABLED=true npm run check` | Exit0; tooling4/4, Angular build and39/39 tests, real PostgreSQL Backend229/229 tests, real RabbitMQ/PostgreSQL/Aspire Smoke45/45 tests. Zero skipped tests. Smoke duration4m59s. |
| `git diff --check` | Exit0 after full validation. |

Post-check owned manifest still equals `4ed38a7b821a05deec2201e2f650e2425ed186ce8344bc1a360a92f11867d68a`; no source drift during checks. Final provider/mutation source SHA remains `5c1464fa7122247364d145694b91bfcc220b45e677c20a9e78360b4e68c411b1`.

T001–T020,T022–T023 and independently closed T027 have implementation evidence. Coordinator-owned Aspire runtime evidence T021, final independent verdicts T024, convergence T025 and explicit owner acceptance T026 remain separate pending gates; this coder report is not feature completion or acceptance. No branch/commit/staging/merge/deploy/publication/template changes performed.
