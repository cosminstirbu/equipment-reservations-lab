# Implementation Plan: Retire the Hello Walking Skeleton

**Branch**: `main` (explicit feature-directory override; no branch created) | **Date**: 2026-10-15 | **Spec**: [spec.md](spec.md)

**Baseline**: `5cfd6233e9d466e9a525f2fe18a30d1aa90015f7`. Scope is the owner's six confirmed retirement decisions. Independent design review and implementation remain pending.

**Targeted owner-directed delta — 2026-10-15**: Do not retain tests whose sole purpose is to assert that hello is absent. T005/T006 baseline red evidence remains historical; those test deliverables are superseded and must be removed. Verify removal through source/configuration/documentation inspection while retaining positive booking, guard, persistence and telemetry tests. Constitution and engineering policies are unchanged. This design delta requires targeted independent review.

## Summary

Remove the complete hello vertical slice, retain the booking application and its contracts, rename its shared messaging project to `ReservationMessaging`, and preserve useful checks through bookings. No schema migration, package upgrade, resource purge, credential change, or compatibility endpoint is needed. Historical evidence stays byte-for-byte intact; add separate retirement context.

## Technical Context

**Language/Version**: .NET 10/C# 14, SDK 10.0.301; existing TypeScript 6.0.3 and Angular 22.2.2.

**Primary Dependencies**: existing ASP.NET Core Minimal APIs, Npgsql 10.0.3, RabbitMQ.Client, Aspire and OpenTelemetry; reuse committed package versions and locks. No new package.

**Storage**: existing PostgreSQL per-service databases, persistent reservation outbox/inbox and durable reservation RabbitMQ topology. No schema/data changes. Retain obsolete broker resources without declaring or consuming them.

**Testing**: xUnit, WebApplicationFactory, PostgreSQL Testcontainers, real RabbitMQ/Aspire smoke tests, Angular TestBed/Vitest, Playwright and axe. Podman preflight succeeded at preparation; availability must still be checked at execution.

**Target Platform / Type**: existing trusted local workstation demo, three web services plus Angular proxy and bootstrap, local Aspire dashboard/OTLP.

**Performance Goals**: preserve booking latency budgets and eliminate hello work; no new throughput target.

**Constraints**: zero successful hello operations; no endpoint aliases/deprecation; preserve booking wire contracts, all state, local exposure and privacy; preserve `equipment-hello-apphost-local` UserSecretsId. No external publish/merge/deploy/issues.

**Scale/Scope**: hello UI/API/broker/telemetry retirement, shared assembly rename, mixed-test replacement, current documentation. Prior feature agreements/review snapshots are outside edit scope.

## Constitution Check

Pre-research and post-design assessment: design proposes compliance with no exceptions; independent verdicts pending.

| Principle / guide | Planned evidence |
| --- | --- |
| I Simple design | Delete orphan types and registrations; rename the existing library rather than add a layer. |
| II Test first | Retain positive booking behavior tests through removal and internal rename; test changed retained behavior first where applicable. Owner withdrew absence-only retirement tests; preserve already recorded red evidence as historical, not retained-test evidence. |
| III Public-interface behavior | API requests, rendered booking UI, real PostgreSQL and broker topology/delivery tests; narrow Inventory boundary doubles retain existing real-provider coverage. |
| IV Useful feedback | Isolated data, bounded deadline waits, explicit route-removal assertions; no sleeps added or tests of private arrangement. |
| V Correlated observability | Preserve booking sources/meters, generated logs, Npgsql registration and privacy processors; remove only hello registration; production exporter and representative Aspire trace proof. |
| VI Safe resilience | Preserve current per-dependency timeouts, repeat safety and recovery policies; no retries/breakers/topology limits introduced. |
| Engineering standards | README, aspnet-core, angular, aspire, testing, resilience, observability, formatting-and-linting guides apply. Preserve source-generated JSON/logger/regex behavior and inspect diagnostics. Format each edited source path before next read/test/edit; full format-check/lint/check before reviews. |

## Architecture and trust boundaries

Browser requests cross the existing local proxy to Inventory, Reservations and Notifications. Keep local target validation, same-origin/browser-write guard, 4 KiB bounded request processing and safe errors on the remaining booking endpoints. Remove `/api/hellos` proxy mappings and handler; remove Notifications `/api/notifications/{id}` hello lookup, leaving durable `/api/notifications` unchanged. Common guard/error middleware may still run on unmatched addresses. Direct owning-service requests should demonstrate no hello handler, normally 404 for same-origin/plain requests. `/hello` may receive ordinary SPA fallback displaying bookings, never a hello screen.

Reservations still verifies Inventory input, commits reservations and outbox atomically, and asynchronously publishes persistent reservation events with mandatory routing/confirm to the durable reservations exchange and reservation-notifications queue. Notifications validates the unchanged envelope and saves idempotently before acknowledgement. Rename only CLR project/namespace, never wire routing keys, schema version, payload properties, identifiers, timestamps, persistence or headers. Retained hello messages cannot match reservation routing or instantiate a hello consumer after removal.

Database/remote responses and broker messages remain untrusted. Extract `EquipmentIdValidation` from `HelloRequested.cs`, retaining exactly 1–64 ASCII letters/digits/hyphen/underscore. Its public consumers are Inventory detail, reservation validation/Inventory response validation, and reservation-event validation. Preserve generated regex and reservation JSON/timestamp metadata. Remove `Equipment` and `MessagingJsonContext` only once usage search establishes that deletion of the hello slice leaves them orphaned; booking uses InventoryItem and its own generated context.

Rename `src/HelloMessaging/HelloMessaging.csproj` to `src/ReservationMessaging/ReservationMessaging.csproj`, namespace and project references in solution/services/tests, then regenerate affected project locks without dependency upgrades. Preserve the RabbitMQ connection factory's recovery-disabled and timeout configuration in a neutral `RabbitConnection` type; remove hello topology constants/declaration. Update references in publisher/subscription/health and tests. No new project boundary is introduced. Rename current web package identity from equipment-hello to equipment-reservations with matching lock metadata.

Remove HelloPublisher, HelloConsumer, NotificationStore, hello-only DTOs/JSON entries/generated logger methods, hello ConsumerStatus/ConsumerHealth, dedicated client files/tests, and registrations. Preserve ReservationConsumerStatus/health, TimeProvider needed by bookings, operational endpoints and database readiness. Repoint readiness failure measurements to existing bounded reservation dependency telemetry with dependency `inventory`/`broker` and outcome `unavailable`; retain structured error/health results. Remove Equipment.Hello from sources/meters; replace the database-tracing control source with an existing retained source without broadening tracing subscriptions.

## Dependency and resilience inventory

| Dependency | Preserved policy and contract | Verification |
| --- | --- | --- |
| Inventory HTTP | Named client and operational-name lookup 3s; caller cancellation, no new retries/hedging/breaker; read-only repeat safe | Booking malformed/missing/nonoperational/503 cases; readiness tests |
| PostgreSQL | Existing connect 3s/command 5s, migration 30s/unlock 3s; bootstrap overall 120s; existing transactions/constraints and no new retries/breakers | Full real-DB API, concurrency, cancellation, migration, tracing/privacy suite |
| Broker publisher | Existing 3s connection/publication budget, confirms, mandatory persistent events; outbox owns existing bounded transient backoff/jitter and durable retry schedule | Real broker routing, outbox replay and controlled outage/recovery |
| Broker consumer | Existing 5s connection configuration, prefetch 1, manual settlement, existing bounded recovery schedule; inbox dedup preserves repeat safety | Real broker malformed envelope, redelivery/ack interruption and restart |
| Browser/proxy | Existing 5s proxy/client budgets and booking cancellation/pending behavior | Booking browser tests and axe |

No dependency implementation is added or upgraded. Keep existing decisions to omit circuit breakers for durable worker recovery and avoid changing provider behavior under a removal task.

## Telemetry preservation

Official integrations stay as implemented: Npgsql.OpenTelemetry 10.0.3 `.AddNpgsql()` production registration and existing ASP.NET Core/HTTP instrumentation; existing custom SQL-admission/exception privacy handling addresses documented native instrumentation gaps from feature 003. Existing workflow instrumentation remains the source of reservation broker publish/consume context; do not add or claim new native broker instrumentation. This change removes hello operations only, so no new instrumentation research/library is required.

Preserve `Equipment.Reservations`, `Equipment.ReservationMessaging`, `Equipment.Notifications`, `Equipment.DatabaseBootstrap`, Npgsql and framework collection, exporter settings, sampler and database privacy policy. Expected booking trace: HTTP request → reservation workflow → native database insert/outbox, saved publication context → publish → consume/inbox insert, plus independent polling/health spans as before. Logs retain structured safe categories and trace correlation; metrics retain bounded operation/outcome/dependency dimensions with no identifiers. Check real success, controlled failure and recovery using production registration, exported attributes/events and current dashboard traces. Historical hello telemetry evidence remains historical.

## Coverage replacement and requirement mapping

| Retired or mixed coverage | Booking validation path | Requirements |
| --- | --- | --- |
| Hello Angular and browser journeys | Existing booking create/history/cancel/inbox, keyboard and axe; inspect root/navigation/template and proxy removal | FR-001,002,004,007,009 |
| ReservationsTests hello HTTP cases | Existing BookingTests/InventoryTests cover validation and dependencies; add only missing malformed/oversized/timeout safeguards; inspect removed route declarations | FR-002,004,007,009 |
| NotificationsTests transient store | Durable inbox/delivery/replay tests; inspect removal of old lookup declaration and store | FR-002–004,007 |
| HelloSmokeTests / hello portions BookingSmokeTests | Booking smoke restart/outage, outbox/consumer tests; preserve booking assertions and state | FR-003,004,006,007 |
| BrokerContractTests hello topology | ReservationTopology confirms/routing/mandatory-unroutable/rejection plus existing persistent replay coverage | FR-003,004,007,009 |
| Hello TTL and queue-cap checks | Delete: these are obsolete hello contracts. Do not add TTL/caps to reservation topology | FR-004,007 |
| SecurityBrowserWriteTests and browser foreign-origin hello post | Retain/create+cancel browser boundary checks through bookings; no mutation on rejected requests | FR-007,009 |
| Hello metric test and database source control | Reservation metric bounded-dimension coverage and retained source production-capture control; existing booking/DB privacy tests | FR-007,009,010 |
| Shared names, project locks and current README/formatter example | Rename audit/build and current booking instructions; separate `docs/history/hello-retirement.md` with links to original evidence | FR-005,008 |
| Existing state/secret/resource handling | Source diff proves no deletion/reset/purge path added; isolated startup/restart smoke preserves records and retained obsolete broker artifacts | FR-006 |
| Final checks/reviews/convergence/acceptance | Revision-matched team evidence and coordinator completion-metadata check | FR-011 |

## Validation strategy

Verify handler/UI/proxy removal by inspecting source/configuration/documentation and recording the relevant diff/path evidence. Do not create or retain old-route, root-absence or obsolete-page automated tests. Already captured red results are historical only. Behavior-preserving assembly rename requires no invented failing test. Keep existing booking validation/concurrency/recovery assertions. Delete wholly obsolete tests; record why each infrastructure/security/privacy/accessibility concern is covered by a named retained or adapted test. A preservation test may deliberately declare legacy broker resources in an isolated fixture before app startup, then verify passive existence/count and no consumption/deletion afterward; production code must never declare them. Do not manipulate a developer's existing broker or secrets for evidence.

Required checks: `npm run format-check`, `npm run lint`, `npm run check`, relevant full booking Playwright suite against current discovered AppHost Web endpoint and supported installed browser, `git diff --check`. Capture a representative booking/notification/cancellation Aspire trace with Npgsql operations and publish/consume relationships plus controlled failure/health recovery evidence. Record commands, environment, exit codes, case names, trace IDs and exact reviewed source snapshot. No new dependency-registration mutation is required because the existing regression remains and production registration is not changed except removal of hello.

Audit all tracked active source/tests/config/current docs for case-insensitive hello references. Allowed residuals: AppHost UserSecretsId, historical directories/evidence, separate retirement context, and isolated legacy-resource fixtures that prove preserved state. Absence-only retirement tests are removed by owner direction. A raw zero-search-results assertion would contradict the preservation contract. Compare prior specs/reports/hashes against baseline without editing them. Required unavailable checks remain pending. Source fixes after review invalidate affected checks/reviews.

## Project Structure

```text
specs/004-remove-hello/
  spec.md
  plan.md
  research.md
  data-model.md
  contracts/retirement.md
  quickstart.md
  tasks.md                         # after independent design review
src/ReservationMessaging/          # renamed existing library, reservation contracts/validation/factory
src/Reservations/                  # remove hello endpoint/publisher, preserve booking
src/Notifications/                 # remove transient store/consumer/lookup
src/Inventory/                     # renamed shared validation use
src/ServiceDefaults/               # hello source/meter registration removal only
src/Web/                           # root booking UI/proxy/package metadata
src/AppHost/AppHost.csproj         # inspect unchanged preserved secret identity
EquipmentReservation.slnx          # renamed project reference
tests/Backend.Tests/               # HTTP/security/telemetry regression preservation
tests/Smoke.Tests/                 # booking/broker/state preservation
README.md
docs/engineering/formatting-and-linting.md
docs/history/hello-retirement.md    # separate history note, no historical evidence edits
```

**Structure Decision**: Reuse current boundaries; no schema, new service, package, generalized routing layer or data cleanup utility.

## Complexity Tracking

No constitutional violation or policy exception requested. Historical preservation and isolated legacy-resource fixtures are required evidence, not production compatibility behavior.
