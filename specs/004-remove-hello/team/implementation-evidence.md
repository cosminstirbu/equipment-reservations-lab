# Implementation evidence

Baseline: `5cfd6233e9d466e9a525f2fe18a30d1aa90015f7`. Feature directory resolved explicitly by prerequisite script. No extension hooks file. All preparation checklist items checked. Podman prerequisite passed during preparation. AppHost UserSecretsId remains `equipment-hello-apphost-local`; no secret values inspected/exported. Historical SHA-256 manifest: historical-manifest.json. No schema or dependency version changes authorized.

## Concern mapping

- Validation/malformed/oversized/dependency failures: BookingTests; InventoryTests; ReservationConsumerTests envelope rejection.
- Browser origin/media/host and no rejected-write effects: SecurityBrowserWriteTests; booking.browser.spec.ts foreign-origin journey.
- Durable state/outage/restart/repeat safety: BookingSmokeTests, ReservationOutboxTests, ReservationConsumerTests, ReservationRecoveryTests.
- Broker confirms/routing/unroutable rejection: adapted BrokerContractTests. Legacy state preservation: BookingSmokeTests isolated volumes scenario.
- Operational health: OperationalTests; booking worker recovery tests.
- Production telemetry/database tracing/privacy: BookingTelemetryTests, ReservationTelemetryTests, DatabaseTracingTests, DatabaseWorkerTracingTests, TelemetryPrivacyTests and remaining database privacy tests.
- Accessibility/keyboard/pending/focus: booking.spec.ts and booking.browser.spec.ts.
- Removed obsolete-only contracts: hello transient notification expiration/store limits, hello TTL/queue cap and send/result/correlation identity. These have no booking replacement contract.

Implementation/check evidence follows below.

## Foundation checks and superseded test-first evidence

- `dotnet test tests/Backend.Tests --filter 'FullyQualifiedName~BookingTests|FullyQualifiedName~InventoryTests' -m:1`: exit 0, 31 passed, 0 failed/skipped after extraction, and again after project/namespace rename (6s tests each). Escalated execution required for .NET sockets/Podman.
- Exact-file format initially failed inside sandbox: build-host named-pipe SocketException(13). Re-run escalated exit 0. An early validation attempt before formatting finished is excluded from evidence.
- Before deletion, new HTTP retirement tests had expected red results: old POST handler returned 503 versus expected 404; malformed lookup returned 400 versus expected 404; unknown GUID lookup already returned 404 (2 failed, 1 passed).
- Root test first had Angular resource setup error (excluded), then failed specifically on existing Connectivity demo text.
- Owner subsequently explicitly requested no old-feature absence tests. All newly authored HTTP/root retirement tests and browser absence assertions were removed; these red runs are historical implementation chronology only, not retained acceptance requirements. Positive booking tests remain.

## Cleanup and positive regression checkpoints

- `dotnet test tests/Backend.Tests --filter 'FullyQualifiedName~BookingTests|FullyQualifiedName~SecurityBrowserWriteTests|FullyQualifiedName~OperationalTests' -m:1`: exit 0, 81/81 passed, no skips (11s).
- `npm --prefix src/Web test`: exit 0, 33 tests across 3 files, no skips (1.65s); JSDOM reports existing canvas limitation, real-browser axe follows.
- Full .NET run: Backend.Tests 216/216 passed, no skips (1m3s); smoke phase pending below.
- Initial static-analysis build exposed xUnit `Assert.NotNull` void overload; fixed using nullable result plus separate assertion. Build then 0 warnings/errors; suggestion gate requested import sorting after namespace rename, explicitly fixed without suppressions. Final checks below supersede exploratory runs.
- Legacy fixture is within existing positive durability smoke scenario, seeds durable obsolete-name artifacts and a persistent message on random test-owned volumes; passive count/consumer checks across broker/AppHost restarts preserve state. Durability intentionally avoids the historical transient exchange/TTL semantics (obsolete contracts); developer data is never targeted.
- Active hello references: AppHost UserSecretsId; isolated BookingSmokeTests legacy-state fixture; README link and separate docs/history retirement note. No current feature actions/examples remain. Historical paths and evidence are untouched.
- No absence-only tests retained per owner steering. Existing malformed/oversized/Inventory timeout/no-effects coverage already sufficient, so no duplicate tests added. Hello transient expiry/TTL/cap/send assertions retired rather than translated.
- `historical-manifest.json` verifies all prior feature bytes unchanged. NuGet non-project package lock records match baseline exactly; only project references renamed/reordered. Web lock changes only package name.

## Full preflight suite result

`dotnet test EquipmentReservation.slnx -m:1` (escalated for .NET/Podman): exit 0; Backend 216/216, Smoke 44/44, zero failed/skipped. Smoke duration 3m47s (quiet default logger), so no stalled/deadline failure occurred. This run includes isolated named-volume retained-state fixture and adapted broker contracts. Final `npm run check` follows after final import-only source fixes; its outcome is authoritative.

`npm run lint`: exit 0 after import fixes; .NET build 0 warnings/errors and style/suggestion verification clean. `npm run format-check`: exit 0; final check repeats format verification on frozen candidate. `git diff --check`: exit 0.

Frozen source candidate: `candidate-source-manifest.json`, 168 existing/new active source/config/test/docs files; manifest SHA-256 `2d340fae1e3d9849b9729d38772bdc3735ead780e130d73438d5365dea031a07`. No source changes after freeze.

## Authoritative final check and runtime ownership

`npm run check` (escalated, Podman running): exit 0 on frozen manifest. Formatting/style/ESLint pass, build 0 warnings/errors, tooling 4/4, Angular build pass, Vitest 33/33, Backend 216/216, Smoke 44/44 (3m45s), zero skips. No generator diagnostics. No source edits follow this check.

`aspire ps --format Json --non-interactive --nologo` returned [] before owned runtime start. With lifecycle/monitoring skills loaded and no lifecycle tool exposed, started exact `src/AppHost/AppHost.csproj` through `env ASPIRE_CONTAINER_RUNTIME=podman aspire start --apphost src/AppHost/AppHost.csproj --no-build --format Json --non-interactive --nologo`; exit 0, owned AppHost PID 24819/CLI PID 24815. Ordinary startup reuses existing secret identity/volumes; no isolated-secrets mismatch or reset. Dashboard token/resource configuration kept out of committed evidence. `aspire wait web --status up` passed. Discovered current Web `http://127.0.0.1:60418`; resource services healthy.

## Browser, runtime telemetry and recovery

- `env API_WEB_URL=http://127.0.0.1:60418 BROWSER_EXECUTABLE='/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge' npm --prefix src/Web run test:browser`: exit 0, 9/9 passed (12.6s), no retries/skips. Four success/failure focus-restoration cases; real keyboard create/conflict/cancel/rebook and explicit event-ID inbox observation; held loading/empty/pending/error boundary accessibility; DST boundaries; hostile alias and opaque-null browser writes return actual 403 and preserve durable history. Real-browser axe includes color contrast. Native human acceptance remains separate.
- `python3 /tmp/hello-retirement-runtime.py book`: exit 0, create 201, cancellation 200, both durable inbox events observed. Reservation `2a026949-3967-4737-8856-3d87a6b52a02`; events `6484e8d2-eeb1-49f1-8119-8eab4c30e4bb` and `7aff0784-78d1-486c-90bd-951ec61bf963`.
- `aspire otel spans --apphost src/AppHost/AppHost.csproj --format Json --limit 3000 --non-interactive --nologo` and `aspire otel logs reservations --apphost src/AppHost/AppHost.csproj --format Json --limit 100 --non-interactive --nologo`: exit 0, captured privately; reviewed selected safe spans/logs in runtime-telemetry-evidence.json. No resource configuration/credentials committed.
- Booking trace `6c250adf0f500152d414305b85db9d72`: request `86731450f6317716` → book `b2db80b455ffeb08`; native reservation.insert and outbox.insert.confirmed children; Inventory HTTP/equipment.find correlated. Publish `81210c0073cc65d6` and consume `1d0039a2ad3c216f` both retain the saved workflow as parent; inbox.insert `791ff595ed455577` is child of consume. outbox.published is child of publish.
- Cancellation trace `e40919184a23d5d8fca921e51f3432bf`: request `5d2ea85262ee3ab7` → cancel `97b53598e78835c1`; native find/lock/cancel/outbox.insert.cancelled; publish `d4ec7b37f0e080b0` and consume `b55e4eea58f937bb` share saved cancel parent; inbox.insert `09026332ba5a0e1c` parents to consume.
- Existing broker tracing uses application workflow instrumentation; no native broker instrumentation claim added. Actual preserved relationship is saved-workflow siblings for publish/consume, not a new publish→consume hierarchy.
- Controlled actual Inventory outage: `aspire resource inventory stop ...` exit 0; runtime script failure exit 0 confirms reservations /health 503 and booking 503. Trace `570e0f6af345628823547eb08b16d0dd` records request503, reservation.book Error `inventory_unavailable`, HTTP timeout with safe error.type. Structured rejection log has only Operation/Outcome and same trace. Real browser conflict also exports native SQLSTATE `23P01` safely in trace `772f9faadc380e19842a0c9d67906011`.
- `aspire resource inventory start ...`, `aspire wait inventory --status healthy --timeout 120 ...`, and runtime script recovered: all exit 0; reservations /health returns 200. Data/secrets untouched beyond intentional representative cancelled bookings/history.
- Export inspection: placeholder SQL only, no parameter values/results, message/request bodies, connection strings, credentials, tokens, raw exceptions or unapproved personal data. Identifiers used for trace correlation only; bounded metrics verified in BookingTelemetryTests/ReservationTelemetryTests. Aspire CLI span output lacks exception-event fields: exception-event privacy is established by passing production-pipeline DatabaseTelemetryPrivacyTests/TelemetryPrivacyTests, not asserted from absent CLI data.
- `aspire stop --apphost src/AppHost/AppHost.csproj --non-interactive --nologo`: exit 0; stopped our owned PID24819 session after Inventory restored. Final `aspire ps --format Json --non-interactive --nologo`: exit 0, [] — no owned AppHost remains. Persistent volumes/secrets retained, no force/purge/delete.

No extension hook configuration exists, so after-implement hooks are inapplicable. Implementation T001–T022 complete; independent verdicts, convergence and explicit completed-result acceptance belong to coordinator gates T023/T024.
