Batch3 **T021–T026 completed**, marked `[X]`, and frozen for independent review.

Snapshot: **`bf246f5f76035a77f30c58b2472e56ed7f8b4db8ad69eed3bd50e758136e6c87`**, **115 paths**, unchanged B1 manifest algorithm. No spec/design/team-report edits.

Implemented cancellation with `SELECT ... FOR UPDATE`, followed by a fresh READ COMMITTED projection. Already-Cancelled returns the unchanged record before checking time. Confirmed cancellation samples the authoritative clock after locking, requires `now < start`, and atomically commits status/timestamp plus one stable cancellation outbox event. It makes no Inventory or broker call.

Added explicit history refresh, deterministic ordering, local timezone/offset display, Confirmed/Cancelled states, event IDs, pending controls, cancellation errors, uncertain-response recovery, subscription disposal, and focus fallback when cancellation removes its button. Cancellation now emits bounded `cancel/cancelled` metrics, correlated reservation/event IDs, persisted trace context, and the existing generated outcome log.

Changed paths:

- `src/Reservations/ReservationStore.cs`
- `src/Reservations/ReservationEndpoints.cs`
- `src/Web/src/app/booking/booking-api.ts`
- `src/Web/src/app/booking/booking.ts`
- `src/Web/src/app/booking/booking.html`
- `src/Web/src/app/booking/reservations.spec.ts`
- `tests/Backend.Tests/CancellationTests.cs`
- `tests/Backend.Tests/CancellationConcurrencyTests.cs`
- `tests/Backend.Tests/CancellationTelemetryTests.cs`
- Feature task markers T021–T026 only.

Recorded red → green:

- `dotnet test tests/Backend.Tests --filter 'FullyQualifiedName~CancellationTests|FullyQualifiedName~CancellationConcurrencyTests' -m:1`: **13 failed**, absent cancellation route returned 404; confirmed booking and real PostgreSQL prerequisites worked. Initial implementation then **13 passed**.
- Strengthened contention with six requests blocked on a real row lock. `dotnet test tests/Backend.Tests --filter FullyQualifiedName~ConcurrentCancellationReturnsOneStableEventAndTimestamp -m:1` exposed **1 failure**: five responses omitted cancellationEventId because projection subqueries retained the pre-lock snapshot. The fresh projection fix resolved it.
- Combined filter including `CancellationTelemetryTests`: after working cancellation HTTP, **13 passed / 1 failed** specifically because outcome remained `success` rather than `cancelled`. Instrumentation then **14 passed**.
- `npm --prefix src/Web test -- src/app/booking/reservations.spec.ts`: initially **8 failed**, compiled rendered UI lacked explicit history refresh; implementation then **8 passed**. Added one supplementary assertion for existing subscription disposal, bringing history coverage to **9 passing tests**; this extra assertion is not claimed as preimplementation red.

Final gates all exit **0**:

- `npm run format-check`
- `npm run lint`
- `npm run check`: **4 tooling, 26 Angular, 83 backend, 3 real infrastructure smoke tests passed; 0 skipped**. Build **0 warnings/errors**. Backend 23s; smoke 1m9s.
- `git diff --check`

Environment remains .NET10, Angular22.2.2, PostgreSQL18.6 Testcontainers, RabbitMQ4.3.6, running Podman. No dependency or migration changes. Exact-file formatting/rereading completed after each source edit; no analyzer suppressions. Replaced unsupported `Array.toSorted` with equivalent copy-and-sort to match configured TypeScript libraries. No extension hooks file exists.

Manifest construction remains sorted/deduplicated tracked and untracked nonignored paths under `src/`, `tests/`, `scripts/`, `.codex/hooks/`, plus the eight previously specified root files. SHA256 receives each UTF-8 path, NUL, and raw SHA256 file digest. No saved manifest file.

Pending: independent reviews and coordinator browser acceptance. JSDOM emits a canvas availability notice during passing axe assertions. US3 delivery/inbox workers remain unimplemented; this is not full-feature completion.
