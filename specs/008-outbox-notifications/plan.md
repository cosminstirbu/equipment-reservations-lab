# Implementation Plan: Prompt Outbox Wake-ups

**Feature directory**: `specs/008-outbox-notifications` | **Date**: 2026-10-19 | **Spec**: [spec.md](spec.md)

**Baseline**: `5ab2ed2800b95a69f1522d617b510e3aeff47701` plus the confirmed feature requirements in the working tree. Work stays on the existing branch; Spec Kit resolves feature 008 explicitly. Independent preparation reviews are pending.

## Summary

Use an additive PostgreSQL insert trigger and a dedicated asynchronous listener to wake the existing sequential outbox processor. The database remains authoritative, RabbitMQ delivery remains at least once, and row locks distribute work across one to five replicas. Healthy fallback scans run every 30 seconds, with earlier persisted retry deadlines; observed listener failure restores ten-second idle polling. Notification and reconnect signals never bypass publication/database failure backoff.

## Technical Context

- **Language/version**: .NET 10, C# 14; SDK 10.0.301 in `global.json`.
- **Dependencies**: existing ASP.NET Core hosted service, Npgsql 10.0.3 and official Npgsql.OpenTelemetry 10.0.3; no new infrastructure or package required.
- **Storage**: existing PostgreSQL 18.6 reservation database and migrations; existing RabbitMQ provider and event contracts retained.
- **Testing**: existing xUnit v3/Microsoft Testing Platform, WebApplicationFactory, real isolated Testcontainers PostgreSQL and RabbitMQ; production OpenTelemetry registration plus test exporter.
- **Platform/type**: existing backend web service with background delivery; no API, UI, authorization or AppHost changes.
- **Performance**: first publish attempt within one second in the spec's healthy available-worker conditions; two idle statements per 30-second scan, approximately four/minute versus twelve/minute baseline, excluding one-time setup and transaction protocol messages which are counted separately in evidence.
- **Scope**: one additional leased connection per worker; one event in flight per replica; no batching, publisher reuse or independent snapshot optimization.

## Constitution Check

Applicable guides: [formatting](../../docs/engineering/formatting-and-linting.md), [testing](../../docs/engineering/testing.md), [ASP.NET Core](../../docs/engineering/aspnet-core.md), [resilience](../../docs/engineering/resilience.md), [observability](../../docs/engineering/observability.md), and their constitutional cross-references. No client or AppHost source changes planned. Aspire is used only for the required manual trace inspection under the existing local procedure.

Pre-research and post-design assessment: no policy exception identified. Design uses current infrastructure and focused code, test-first public behavior, real PostgreSQL semantics, bounded transient retry bursts, repeat-safe listener setup and existing duplicate-safe delivery. Official dependency tracing remains authoritative. Tests must record red evidence before behavior implementation; independent reviewers retain all verdict ownership. A feature is not complete until revision-matched checks, review, convergence and explicit human acceptance are recorded.

## Design

### Database signal and trust boundary (FR-001, FR-009, FR-010)

Add `002_outbox_notifications.sql`, a fixed-name `AFTER INSERT FOR EACH STATEMENT` trigger and invoker-rights trigger function that calls `pg_catalog.pg_notify('reservation_outbox_changed', '')`. Statement-level notification avoids per-row work for multirow inserts; empty insert statements can emit harmless extra signals. PostgreSQL queues delivery until commit; rollback sends nothing. No payload, identifier, timestamp or trace context crosses the notification boundary. Any database user can send advisory notifications, so the consumer ignores payload/PID, recognizes only the fixed channel, and still queries/locks durable work. Do not add elevated permissions or SECURITY DEFINER. Register the new migration's reviewed SHA-256 in `ServiceMigrations`; never modify migration 001. Service owner privileges remain scoped to its own database.

### Listener lifecycle (FR-002, FR-006–008, FR-012)

A focused `OutboxListener` collaborator owns a single connection leased from the existing instrumented `NpgsqlDataSource` for the listener's lifetime. It never shares this connection with transactions or other concurrent commands. Subscribe to `Notification`, execute fixed `LISTEN reservation_outbox_changed` in autocommit mode, await its completion, publish listening state and a scan signal, then continuously call `WaitAsync(TimeSpan.FromSeconds(30), token)`. A timeout is normal and performs no heartbeat SQL; it bounds passive waits, not a promise to detect a silent network black hole. Periodic processing scans preserve delivery even while a silent listener appears connected. No transaction remains open while listening. Native open/LISTEN exceptions enter recovery; no busy loops and no second listener connection while a previous one remains live.

Startup waits only for the first bounded setup attempt: success scans immediately after listening; transient failure permits immediate degraded processing while reconnect continues. Reconnection also emits a scan signal only after LISTEN succeeds. Permanent classification uses existing `DatabaseFailure.IsPermanent`; propagate the terminal fault to the worker, interrupt idle/backoff waits and cancel an in-flight attempt through linked cancellation. Observe and await listener task completion and dispose connection/subscription on halt or shutdown; no unobserved fire-and-forget task. Before returning a healthy listener connection to the pool, explicitly execute fixed `UNLISTEN reservation_outbox_changed` with an independent three-second cleanup budget; a cancelled stopping token must not suppress cleanup. Npgsql pool reset can be deferred until reuse, so disposal alone does not prove prompt removal of the server-side subscription. A broken/closed connection has no usable session to unregister; cleanup failure must still release the connection and remain safely classified/observable. This adds lifecycle-only SQL, not periodic idle queries.

### Lost-wakeup safety and processing (FR-002–005)

Use a bounded capacity-one async signal (channel or equivalent) with coalescing writes and a single processing reader. Only clear/consume pending work at the **start of a scan**, never after the empty scan. A notification during scanning, publishing, or transition to wait therefore remains pending. Signals contain no event data. Listener state/fault must be held separately and checked so a full signal slot cannot hide degradation or a terminal fault. A reconnect signal cannot be lost behind a previous insert signal: either one triggers a fresh scan after LISTEN.

The existing snapshot query gains a parameterized `min(next_attempt_at) FILTER (WHERE next_attempt_at > $1)` over unpublished rows, using the same captured UTC instant as ready selection. Preserve pending-count/oldest-age values. This is required deadline discovery in the current query, not a separate optimization. Keep the existing selection `FOR UPDATE SKIP LOCKED LIMIT 1`, publication transaction, stable identity and success/reschedule semantics. On success scan again immediately. On no ready row, release transaction/processing connection before waiting. Wait until notification/state change, earliest future deadline, or mode fallback (30s listening, 10s degraded), whichever occurs first. Compute remaining delay from the absolute persisted timestamp after query work; already elapsed future deadlines cause one immediate scan. Due rows locked by peers are excluded from future-deadline discovery so they cannot cause a zero-delay spin; fallback revisits them. Far-future parked rows are bounded by fallback and never overflow timer arithmetic.

Worker-wide failure delay retains existing backoff and parking behavior and is a separate phase: it waits its full delay with only shutdown/permanent listener fault able to interrupt it. During that delay, ordinary notification/reconnect signals remain coalesced for the next scan. Listener reconnect backoff has independent counters and scheduling; success in one loop cannot reset the other loop's failure protection.

### Resilience settings and repeat safety

| Operation | Budget/retry | Repeat safety and circuit decision |
| --- | --- | --- |
| Open listener | Existing Npgsql three-second connection timeout plus linked three-second setup cancellation budget | No side effect; retry only transient failures |
| LISTEN | Three-second command/setup attempt budget, cancellation propagated | Repeating LISTEN on the same session is idempotent; new session receives fresh registration |
| Listener wait | 30-second passive receive timeout and stopping token | No query/write; timeout is normal; official client wait is used |
| UNLISTEN cleanup | Independent three-second cancellation/command budget on the still-usable listener connection before pooled return | Repeated unregistration is harmless; no retry loop. Broken sessions are released; cleanup cannot indefinitely delay shutdown |
| Reconnect | Three attempts per burst, first immediate; delays before attempts two/three use base 1s/2s multiplied by jitter 0.75–1.25; after failed burst wait 10s then fresh burst | Bounded attempts and delays, no tight retry; repeated bounded probes are the half-open equivalent, so no separate breaker is justified |
| Processing database | Existing three-second connect/five-second commands and existing cancellation propagation | Reads repeat safely; transactions/conditional updates retain existing failure classification and at-least-once behavior; existing worker delay is rate protection, no additional breaker |
| Publish | Existing three-second attempt budget and persisted jittered 1s/2s then ten-second recovery cycle; permanent invalid message parked | Event ID stable, downstream inbox duplicate suppression retained; no new retry layer or breaker |

Logs and metrics distinguish normal wait timeout, transient unavailable, recovered, permanent failure and cancellation. Raw provider exceptions are not logged. Existing classified SQLSTATE and sanitized dependency exception events remain available.

### Observability (FR-011)

Keep existing official `Npgsql.OpenTelemetry` package and production `.AddNpgsql()` in `AddApplicationTelemetry`; use the existing `DatabaseTracing.Create` and privacy processor. Add fixed LISTEN and lifecycle UNLISTEN command descriptors to `OutboxWorker.Commands` (or concatenated listener commands) and replace the snapshot descriptor to match the changed parameterized SQL. Native spans cover connection setup, LISTEN, lifecycle UNLISTEN cleanup, snapshot/select, updates and commit as before. Admit the constant UNLISTEN command through the same exact-SQL policy and validate its exported safe operation identity/status/privacy alongside prompt session unregistration; do not log raw cleanup exceptions. Reviewed migration admission covers migration SQL. Existing producer activity restores the stored event trace; notification wakes do not manufacture a relationship to one event because coalescing may represent many events. Listener lifecycle is a separate background trace; LISTEN spans are children of a short listener setup activity. Processing publish spans keep their original event parent.

Npgsql's documented integration emits command/open spans, not application wake-up, reconnect-state or passive-wait outcomes. Custom code is limited to workflow/state signals for that gap: finite `outbox.listen` setup/reconnect workflow activities and bounded metrics/logs; no duplicate SQL spans or indefinite wait spans. Add `reservation.outbox.wakeups` counter with bounded `cause` values `notification`, `retry`, `fallback`, `degraded_poll`, `startup`, `reconnect`; listener transition counter with bounded `outcome` values `listening`, `unavailable`, `recovered`, `permanent_error`, `cancelled`. No instance/event/user identifiers in metric dimensions. Reuse source-generated logging with stable IDs; no channel payload, PID, exception text or connection string. Existing backlog gauges refresh on every processing scan; accepted healthy idle staleness is at most 30 seconds plus scan execution.

Retain current OTLP export/storage/sampling/retention configuration; local inspection is the Aspire dashboard. Verify actual exported safe operation names, SQL placeholders, status, timings and sanitized exception events using the production registration; a test-only ActivityListener is prohibited.

## Test design record

Extend existing delivery/recovery/telemetry cases before adding overlapping suites. Tests enter through service hosts/public worker lifecycle and reservation HTTP APIs; provider contract tests enter through actual Npgsql/PostgreSQL. Keep real worker, listener, scheduling logic, serialization, migrations, SQL/locking and telemetry registration. Real PostgreSQL uses isolated databases and production migrations; scoped worker hosts and queue names preserve parallel execution. Existing real broker tests establish publisher confirmations, whole-envelope identity and duplicate safety. A narrow faithful `IReservationPublisher` double may record attempt start or gate completion for worker coordination only; it cannot throw fabricated PostgreSQL exceptions or claim broker recovery. Its fidelity is limited to the existing publisher's async cancellation/attempt contract and provider contract tests. Clock/delay coordination remains a boundary-controlled schedule/time provider, not a mock listener or private-method test. No new solitary tests are needed. Include a scoped production runtime-role insertion/trigger test without DDL grants, and send a nonempty spoof notification to prove payloads never affect event reconstruction or exported telemetry.

| Behavior / observable regression | Boundary and evidence |
| --- | --- |
| Commit-only, empty payload, all insertion paths | Real trigger with a listener established before insert; prove no wake before commit/after rollback, wake after commit, including multirow insertion |
| Prompt idle wake | Real hosted worker ready/listening through observable lifecycle telemetry; commit via HTTP, record first publisher entry with monotonic time; isolated healthy run within 1s plus deterministic schedule proof that fallback was not advanced; do not rerun flaky failures into success |
| No lost wakes | Gate external publication; commit another row while busy and at observable idle transition; assert all durable rows delivered without advancing fallback; do not assert private callback order |
| Startup/reconnect with existing work | Restart host against same state; terminate scoped listener backend through PostgreSQL administrative control, insert while disconnected, observe new LISTEN and immediate delivery after recovery |
| Retry deadlines/restart/locked rows | Real persisted future `next_attempt_at`, host restart, controlled time; assert no early publish and attempt when due without insert. Hold peer row lock; verify bounded scan count, then eventual delivery after release. Parked row remains unpublished without spin |
| Backoff overlap | Real broker outage/faithful publish stall for attempt budget; inserts/reconnect cannot advance next attempt. Assert independent reconnect timing and current ten-second failed-burst protection |
| Degraded and permanent failures | Real scoped backend termination/network/provider failure, denied permission/schema/auth faults; observe ten-second polling and bounded reconnect bursts; permanent listener fault halts even if processing was waiting/busy |
| Replica/mixed generations | One and five real hosted workers and test-only legacy polling host behavior against same isolated DB; lock exclusivity, at most one publish in flight per worker, all IDs eventually delivered; retained duplicate-safe provider evidence |
| Migration/rollback compatibility | Apply new migration to old schema with data, reapply harmlessly through ledger; old polling host works; remove trigger and observe fallback processes inserts/manual repaired rows |
| Idle cost | Over controlled 90s-equivalent steady window count snapshot/select and every extra SQL operation through exported production spans; show two statements/30s versus two/10s. Report startup LISTEN/connect/transaction overhead separately and full totals transparently; WaitAsync timeouts add no SQL |
| Telemetry/privacy | Production AddNpgsql registration plus test exporter: real successful LISTEN and processing spans; real listener connection/open failure for setup classification; real controlled revised-snapshot permission/schema failure for command error status and exception-event redaction; safe parent relationships and bounded metric/log state transitions. Removing production registration makes evidence test fail |
| Shutdown/disabled messaging | Cancel idle, reconnect delay, backoff and gated publication; await disposal, scoped PostgreSQL session no longer listening; uncertain event stays pending. Disabled messaging creates no listener/publisher work |

Evidence clarification (preparation repair round 1): the fixed valid LISTEN command registers an advisory channel without a relation lookup or channel ACL. A forced LISTEN command error would require an unrepresentative SQL/context change, a standby fixture or a timing race. Keep native LISTEN operation instrumentation and prove its successful export; use a real connection/open fault for listener setup classification and a real revised-snapshot fault for failing native command export. This does not omit any operation instrumentation or controlled database-failure/privacy evidence.

For each behavior retain the red command/result before source implementation, then green evidence. Reuse existing narrow serialization exclusions only where their recorded shared-provider constraint applies; no blanket collection serialization for new tests. Time-controlled tests establish scheduling rules; record the real healthy latency observation separately so a generous eventual assertion cannot claim the one-second target.

## Project Structure

```text
specs/008-outbox-notifications/{spec,plan,research,data-model,quickstart,tasks}.md
specs/008-outbox-notifications/contracts/notifications.md
src/Reservations/OutboxWorker.cs
src/Reservations/OutboxListener.cs
src/Reservations/{Program,ReservationTelemetry,ReservationsLog,ServiceMigrations}.cs
src/Reservations/Migrations/002_outbox_notifications.sql
tests/Integration.Tests/ReservationOutboxTests.cs
tests/Integration.Tests/ReservationRecoveryTests.cs
tests/Integration.Tests/ReservationTelemetryTests.cs
tests/TestSupport/ (only scoped scenario/schedule support actually required)
README.md (operator behavior and evidence links)
```

## Handoff and Gates

After preparation review, generate stable dependency-ordered tasks mapped to FR/SC IDs with red tests preceding implementation. Required implementation handoff: `npm run format-check`, `npm run lint`, `npm run check` with Podman prerequisites; inspect formatting/readability, privacy, cancellation, race safety and contract preservation manually. Record representative Aspire trace inspection under the existing local procedure; unavailable evidence remains pending. Documentation artifacts require link/consistency/readability inspection. No policy deviations or unresolved product questions are proposed.
