# Implementation Plan: Feature 1 — Book and Cancel Equipment

**Branch**: `002-book-cancel-equipment` | **Date**: 2026-10-14 | **Spec**: [spec.md](spec.md)

**Baseline**: HEAD `0f3ee965011ddf3fc473ea1a5bba6bfa3acdc7b1`; frozen spec SHA-256 `e2822291af872664bc42c6a252e1c7e020216570b92b323b4bbe003b8b18cb96`. This document proposes a design; independent verdicts belong to reviewers.

## Summary

Extend the existing Angular / ASP.NET Core / Aspire / HTTP / RabbitMQ walking skeleton. PostgreSQL stores Inventory, Reservations and Notifications in three separately credentialed databases. A partial GiST exclusion constraint authoritatively rejects overlapping confirmed intervals. Booking/cancellation and stable outbox events commit together. An asynchronous worker publishes durable reservation events; an idempotent consumer commits inbox entries before acknowledging delivery. Browser inbox refresh is explicit. Preserve hello APIs, contracts and transient hello topology as a compatibility journey.

## Technical Context

**Language/Version**: Existing .NET 10/C# 14, SDK 10.0.301, Angular 22.2.2, TypeScript 6.0, Node 24.15.0/npm 11.12.1; retain committed versions.

**Primary Dependencies**: Retain Aspire 13.6.1, RabbitMQ.Client 7.2.2, RabbitMQ image 4.3.6 and OpenTelemetry packages. Add Aspire.Hosting.PostgreSQL 13.6.1, Npgsql 10.0.3 and Testcontainers.PostgreSql 4.16.0, pin lockfiles. PostgreSQL image `postgres:18.6` selected from official supported-version listing; verify image availability and package restore before implementation depends on them. Any unavailable selection is a reported prerequisite, never a silent downgrade.

**Storage**: One PostgreSQL server, named persistent volume, fixed databases `inventory`, `reservations`, `notifications` and distinct service credentials. RabbitMQ gets a persistent data volume and stable secret credentials. Direct parameterized Npgsql with focused persistence classes; versioned SQL migrations, no ORM/repository hierarchy.

**Testing**: WebApplicationFactory public HTTP behavior with real production migrations on isolated Testcontainers PostgreSQL databases; faithful Inventory HTTP doubles plus provider contracts. Real RabbitMQ adapter/recovery contracts and small Aspire orchestration smoke suite. Angular rendered Vitest tests and Playwright real journey/axe; required manual keyboard/focus/status review.

**Target Platform / Project Type**: Trusted local workstation web application orchestrated through Aspire/Podman. All listeners/proxies loopback, no authentication or user isolation.

**Performance Goals**: No throughput SLA; bounded I/O and deterministic recovery checks (60 seconds after healthy dependencies return). Local data has no expiry or automatic reset.

**Constraints / Scope**: One fixed `demo-user` identity, two reservation states, explicit refresh, no production deployment. Existing 4-KiB request/event cap remains. Every compile-time-known JSON contract uses generated metadata; structured logs use generated LoggerMessage; constant regexes use GeneratedRegex where relevant.

**Applicable guides**: [ASP.NET Core](../../docs/engineering/aspnet-core.md), [Angular](../../docs/engineering/angular.md), [Aspire](../../docs/engineering/aspire.md), [Testing](../../docs/engineering/testing.md), [Observability](../../docs/engineering/observability.md), [Resilience](../../docs/engineering/resilience.md), [Formatting/linting](../../docs/engineering/formatting-and-linting.md).

## Constitution Check

Pre-research and post-design: no proposed policy exceptions and no remaining product ambiguity. Requirements specify already-Cancelled repetitions succeed even after original start. Human final acceptance and reviewer gates remain pending.

| Principle | Design and required evidence |
| --- | --- |
| Simple idiomatic design | Three existing services; direct Npgsql SQL; one deployment-only bootstrap process, focused outbox worker/consumer, no mediator or generic repositories. |
| Test first | Each behavior batch begins with an intended failing public-interface test; retain red/green command evidence. Infrastructure setup enables real database tests before business implementation. |
| Public behavior tests | Real migrations and DB collaborators behind HTTP; external Inventory/broker boundaries deliberately doubled only in focused tests and checked against real providers. |
| Useful deterministic feedback | Controlled TimeProvider, barrier-coordinated requests, isolated database data, bounded state observation rather than arbitrary sleeps, diagnostic recovery deadlines. |
| Correlated observability | Workflow spans, saved W3C event context, generated logs, bounded-label metrics, captured success/conflict/outage evidence without secrets. |
| Bounded safe resilience | No browser/write/Inventory HTTP retry; bounded broker attempt bursts with durable scheduled retries and stable IDs; inbox DB uniqueness and ACK-after-commit. |
| Workflow | Reviewed spec/design/tasks before code; independent frozen implementation reviews, convergence, manual accessibility and explicit human acceptance required. |

## Project Structure

```text
specs/002-book-cancel-equipment/
  spec.md plan.md research.md data-model.md quickstart.md
  contracts/http.md contracts/events.md
  tasks.md                      # generated only after design review
  team/                         # coordinator owned
src/AppHost/                    # PostgreSQL/broker volumes, secret parameters, bootstrap dependencies
src/DatabaseBootstrap/          # one-shot orchestration-only role/database provisioning and migrations
src/Persistence/                # generic migrations/DB failure classification, no domain state
src/Inventory/                  # own equipment SQL migration/store and HTTP contracts
src/Reservations/               # own migrations, reservation allocation/cancellation, outbox worker
src/Notifications/              # own inbox migration/store and durable reservation consumer
src/HelloMessaging/             # preserve hello contracts; add typed reservation envelopes/topology
src/ServiceDefaults/            # operational telemetry/readiness only
src/Web/src/app/                # booking feature, preserve hello compatibility section
src/Web/browser-tests/
tests/Backend.Tests/            # existing tests plus database-backed API behavior
tests/Smoke.Tests/             # broker contracts and AppHost startup/restart journey
README.md
```

The small shared Persistence library handles migration bookkeeping and a generic database-failure classification utility only; it never knows business entities or owns domain persistence. Domain SQL/migrations remain in each owning service. Bootstrap references their migration assemblies and is an explicitly privileged infrastructure process, not a fourth domain service. APIs never receive its admin credential. Tests can call the same public migration entry points against isolated databases. No shared database tables, cross-service queries or foreign keys across databases.

## Persistence and concurrency

See [data model](data-model.md). Availability reads confirmed overlaps and is advisory. Creation validates input, contacts Inventory and verifies its usable operational record, opens a DB transaction, obtains authoritative time immediately before writing, and inserts a Confirmed reservation and its confirmation outbox event. Do not publish or await a broker in the request path. The exclusion constraint uses equipment equality and `tstzrange(start_at,end_at,'[)')` overlap, restricted to Confirmed records. PostgreSQL arbitrates concurrent writes; only a named overlap constraint violation / SQLSTATE `23P01` maps to 409. Other database faults remain failures. The losing transaction leaves zero reservation/event rows. Tests must demonstrate real concurrent transactions, adjacency, containment, partial overlap, different items and stale availability.

For cancellation, transactionally load the row `FOR UPDATE`; unknown is 404. Check Cancelled first and return it without another event, regardless of time. For Confirmed, sample authoritative time after obtaining the lock; reject current time >= start. Update status and cancelled timestamp and insert a uniquely constrained cancellation event, then commit. The row lock serializes competing cancellations and prevents duplicate transitions. Exclusion index membership disappears only through committed cancellation. A booking competing with cancellation can wait, conflict, or succeed after the cancellation commits, and must never overlap committed Confirmed state. No Inventory call is needed for cancellation.

Clock boundary: inject TimeProvider for rule evaluation and tests; the service clock is authoritative. Normalize accepted instants to UTC before comparisons. Reject non-microsecond-aligned input rather than silently round PostgreSQL precision. Truncate clock samples to microseconds for consistent equality rules; equal start/current time is allowed, equal cancellation/current time rejected. At request completion refresh history if the response was interrupted; no automatic side-effect retry or booking idempotency claim is added.

Inventory operational validation occurs at the HTTP observation before DB allocation; there is no distributed transaction with Inventory. No operational-status editing workflow is introduced. Invalid Inventory responses are dependency failures. Parameterize all values; SQL identifiers in bootstrap are fixed allowlisted names with proper identifier/literal quoting, never user input.

## Durable messaging

[Event contract](contracts/events.md) defines stable event IDs and self-contained transition details. Outbox state and reservation transition are in one transaction. An outbox worker selects one due row `FOR UPDATE SKIP LOCKED`, performs one bounded confirmed publication while holding the lock, and marks Published only after mandatory publisher confirmation. On uncertain outcome, leave Pending and retry with the identical EventId. A crash after broker acceptance and before the Published commit can duplicate transport delivery; inbox uniqueness makes that safe. This simple local strategy holds a lock during at most a three-second broker attempt; it avoids claim leases/fencing not needed at this scale. Dispose transaction before waiting/backoff. Persistent attempt/due metadata survives restarts.

Use a new durable direct exchange `reservations`, durable queue `reservation-notifications`, bindings `reservation.confirmed` and `reservation.cancelled`; persistent messages, manual ACK, prefetch 1, mandatory publication with confirmations. No message TTL or length-drop policy can discard committed events. Preserve existing hello exchange/queue behavior without redeclaring different durability. Broker disk volume preserves queued events across ordinary recreation. Confirmations acknowledge broker acceptance, never inbox completion.

Notifications validates bounded envelopes, inserts inbox by EventId with `ON CONFLICT DO NOTHING`, commits, then ACKs. Duplicates ACK successfully without another row. Invalid/unknown-schema events reject without requeue; record safe rejection telemetry and allow valid messages to progress. A transient database failure must not ACK: close/reconnect after bounded delay so unacknowledged delivery returns. Consumer restarts/reconnects after broker recovery. Event occurrence/identity defines history; delivery ordering never mutates Reservations. No consumer cross-database lookup is allowed.

## Trust boundaries and startup

Targeted SEC-001 amendment: [browser write policy](contracts/browser-write-policy.md) requires server admission before all Reservations POST effects, rejects foreign/opaque origins and originless browser metadata, admits canonical loopback browser origins/direct local CLI, and requires JSON media type for creation. It explicitly handles Web proxy/backend port differences. The policy is a local browser-origin guard, not authentication or user isolation; independent amendment design reviews passed as linked in the policy; implementation evidence and finding closure remain required. Other D1 design decisions remain unchanged.

Browser → loopback development proxy → fixed APIs; Reservations → fixed Inventory HTTP endpoint; service → own PostgreSQL database; outbox → broker → Notifications. Demo user is display/correlation only, never authorization. Browser cannot select demo user, upstream host, database or queue; direct callers have the same local access and no isolation guarantee.

AppHost provisions PostgreSQL/RabbitMQ volumes and loopback host proxies with no admin UI. Stable secret parameters live outside committed configuration (AppHost user-secrets or explicit environment). Bootstrap runs each startup after PostgreSQL readiness: create/reconcile the three fixed non-superuser roles/databases; no CREATEDB/CREATEROLE/replication/bypass-RLS or role memberships; revoke PUBLIC CONNECT on service databases and `postgres`/`template1`; grant each role only its own database; harden schema PUBLIC grants. Service roles may own/migrate their own DB as a deliberate local simplification, but cannot connect to others. Bootstrap can rotate service-role passwords on existing volumes from current secret parameters. Stable PostgreSQL admin and RabbitMQ credentials are required across persistent volume recreation; never generate unrelated replacements at restart.

Bootstrap applies versioned transactional SQL migrations under each own role, using a per-database advisory lock and migration ledger/checksum; fail on modified applied migrations. Install `btree_gist` in Reservations under suitable provisioning privileges before service-role migrations. Seed camera-001/Demo Camera operational, laptop-001/Demo Laptop operational, projector-001/Demo Projector non-operational using INSERT-on-conflict-do-nothing so startup does not overwrite status/data or duplicate records. Existing hello tests/UI select camera-001 rather than assuming a one-record catalog; document this intentional catalog expansion with equivalent hello coverage. Existing memory notifications remain transient for hello compatibility; new reservation inbox is durable.

APIs wait for successful bootstrap and their own database, never broker availability. Reservations booking readiness reflects DB and Inventory; broker/worker health is independently visible without gating writes or the SPA. Notifications HTTP inbox remains available during broker outage if its database is healthy. SPA must not wait for broker-dependent consumer health. Liveness remains process-only. Inspect actual sockets/Podman mappings and negative cross-database connections: resource URL labels alone do not prove loopback or isolation. Disable Npgsql parameter/exception detail logging and sanitize automatic instrumented connection details. Preserve source-generated JSON/logging and safe Problem Details.

## Dependency policy

| Boundary | Per operation / overall budget | Retry and repeat safety | Breaker / observable failure |
| --- | --- | --- | --- |
| Browser HTTP | 5s each | None, explicit refresh after uncertain write | None; distinct saved/pending/error messages |
| Reservations → Inventory | 3s, request budget 8s | None; safe GET but simple immediate failure | Omit at local scale; 503, span/log/error counter |
| Service → PostgreSQL | 3s connection, 5s command, 8s write request | No automatic transaction retry | Omit: bounded calls and readiness; safe 503/500, diagnostic counter |
| Outbox → RabbitMQ | 3s complete connect/channel/declare/publish attempt | At most 3 transient attempts per burst, exponential backoff with jitter (base1s, cap4s); after burst persist due time <=10s and retry in a new scheduled cycle. Stable EventId and durable dedup make repeats safe. Permanent malformed/schema errors are failed signals, never false Published. | Omit: scheduled backoff bounds load; pending count, attempts/errors/latency, oldest age |
| Consumer broker setup/ACK | 5s setup, 3s ACK; 5s DB command | At most 3 transient reconnect attempts per burst, same jitter; next scheduled burst <=10s. Unacked transient DB failure redelivers; invalid data never retries. | Omit: local dependency, bounded reconnect; connected status, rejection/duplicate/error signals |
| Bootstrap/migration | 3s connection, 30s each migration, 120s overall | Startup fails on error; rerun migrations through ledger after explicit restart | None; resource failed, safe diagnostic |

Jitter/randomness and TimeProvider delays are injectable for deterministic retry tests. Recovery suites observe state with a 60-second bound after actual dependency readiness, not after an arbitrary sleep. Persistent transient retries continue across bounded scheduled cycles because losing committed events is forbidden; each operation/burst remains bounded. Existing hello uses its previous no-retry semantics.

Permanent publication disposition is durable Pending, never Published: after a nontransient contract/configuration failure, set only attempt scheduling metadata to the finite UTC microsecond sentinel `9999-12-31T23:59:59.999999Z` (not .NET MaxValue/PostgreSQL infinity). Ordinary worker cycles and restarts do not make that event due again. Record a fixed bounded permanent-failure outcome; do not log payloads or raw exception details. After repairing the underlying code/contract/configuration, the developer explicitly resets next_attempt_at for the identified still-unpublished event to current UTC using its own Reservations database credential. This metadata-only repair preserves reservation state, event ID and immutable payload; it introduces no browser action or automatic retry of permanent errors. Transient broker failures retain the existing scheduled recovery policy. Verify one attempted permanent publication, no second attempt after the next scheduled worker cycle or restart, unchanged Pending/Published state and event identity, and resumed publication only after explicit repaired-metadata reset. This clarifies D1’s already-required transient-only retry policy, not a new reservation state/schema or business workflow.

Known permanent own-database failures (authentication, permission, missing schema/table or database/catalog configuration) halt the affected background worker with a safe bounded permanent-error signal until the underlying fault is repaired and the service is explicitly restarted. This also covers outbox connection/open/selection failures outside a selected-event attempt: an inaccessible database cannot reliably persist a parked due time, so the worker must stop instead of repeatedly attempting selection or claiming it parked the event. Preserve all committed reservation/outbox/inbox state; never mark an uncertain publication successful. Notifications leaves failed deliveries unACKed, closes its subscription and stops on permanent database failure; repaired restart permits broker redelivery and EventId uniqueness retains one inbox effect. Transient connection failures and unknown/uncertain provider outcomes retain bounded recovery, including broker acceptance followed by uncertain Published commit. Permanent publication parking applies only when its scheduling metadata can be durably written; a permanent failure of that database write requires worker stop/repaired restart instead. Verify regression-first that permanent open/selection/persistence faults do not enter another worker recovery cycle, committed events remain intact, repaired restart redelivers once, and transient/uncertain provider failures still recover under the original budgets.

## Observability

Keep Aspire dashboard OTLP backend and AlwaysOn local sampling. The pinned Aspire 13.6.1 AppHost dashboard uses local SQLite Run diagnostic persistence by default, retaining up to 10 unpinned runs per application; this is local development evidence, separate from PostgreSQL application-state durability and not a production telemetry backend. [Dashboard persistence](https://aspire.dev/dashboard/data-persistence/). Register a reservation ActivitySource/Meter alongside Equipment.Hello. HTTP auto-instrumentation covers Inventory calls; add booking/conflict/cancel/outbox publish/inbox consume spans and generated structured outcome logs. Persist only traceparent/tracestate with outbox so worker/retries propagate producer context; consumer extracts validated W3C headers. Reservation/event/equipment IDs may be trace/log correlation, never metric labels. Metrics: operation/outcome counts and latency, outbox pending/oldest age/attempt errors, inbox stored/duplicate/rejected, broker connected, DB/dependency errors. No raw URLs, identities, bodies, credentials or raw exceptions as labels/logs. Capture correlated success, cancellation, conflict and controlled Inventory/broker failures; inspect exported evidence for secrets and metric cardinality (SC-017).

## Validation and implementation sequencing

Baseline coordinator evidence: `npm run check` passed 4 tooling, 6 Angular, 16 backend, 2 real smoke tests, zero skipped. It does not close legacy manual accessibility finding Q-001.

1. Test-first infrastructure and migrations: fresh provisioning, two startups no seed duplication/overwrite, ledger/checksum behavior, negative credential isolation, loopback listener inspection, isolated DB fixtures. Record red/green evidence before dependent behaviors.
2. Test-first Inventory and booking HTTP: contract/operational status, strict offsets/precision/body size, invalid/past/equal/reversed dates, no-event rejection, Inventory malformed/unavailable, persistent Confirmed, overlaps/adjacency/different item/stale availability, barrier-coordinated concurrent conflict at DB boundary.
3. Test-first cancellation/list: boundary controlled time, repeated after-start and concurrent cancellation, release/rebook, competing book/cancel, retained history, rollback leaves zero partial event/state, interrupted response recovery.
4. Test-first broker/outbox/inbox: atomic commit rollback, initial outage and recovery, consumer outage, publisher uncertainty/duplicate delivery, crash after publication and before mark, crash after inbox commit and before ACK, restarted workers/DB-backed dedup, malformed/oversized/unknown events followed by valid event; real broker provider contracts.
5. Test-first rendered Angular states then real browser browse/check/book/view/cancel/inbox journey; UTC conversion/DST round-trip validation, disable repeated clicks, distinct saved vs not-yet-observed event state, explicit refresh and destroyed-component cancellation. Axe plus required manual keyboard/focus/status evidence.
6. Final fresh documented AppHost smoke proves provisioning/restart persistence and old hello path with expanded seed lookup. `npm run format-check`, `npm run lint`, `npm run check`, browser checks, vulnerable/transitive dependency audit, configuration/telemetry inspection. Report actual results/environment/frozen revision; missing prerequisites stay pending. Freeze snapshots for independent reviewers and latest converge; source changes invalidate affected evidence.

## Acceptance evidence map

These are planned checks, not claimed passes. Tasks must map each row to explicit test/inspection IDs and later revision-matched actual results.

| Criteria | Required evidence |
| --- | --- |
| SC-001 | Fresh AppHost bootstrap/migrations/seeds; second startup same rows/status; migration ledger/checksum tests and README reproduction. |
| SC-002 | API201 Confirmed, stable ID/UTC interval read after Reservations restart with real DB. |
| SC-003 | Table-driven HTTP invalid interval/timezone/precision, unknown/nonoperational item; query real DB for zero reservation/outbox effects. |
| SC-004 | Real DB identical/containment/partial overlap HTTP409, existing allocation unchanged. |
| SC-005 | Both adjacency boundaries and independent equipment HTTP201 on production schema. |
| SC-006 | Barrier-coordinated two concurrent HTTP requests on real DB, exactly one 201 / one 409 and one reservation/event; named constraint existence verified. |
| SC-007 | Availability true, intervening competing booking 201, stale request 409. |
| SC-008 | Cancel future record 200, restart read Cancelled, released interval 201, history unchanged. |
| SC-009 | Repeated/concurrent cancellation, including already-Cancelled after start, one DB transition/outbox and one persisted inbox event. |
| SC-010 | Controlled clock just before/exactly at/after start cancellation boundary, rejected state/event unchanged. |
| SC-011 | Ordinary Inventory/Reservations/Notifications and AppHost/broker restart persistence; pending outbox resumes and seeds not reset. |
| SC-012 | Real broker initial outage, consumer outage, reconnect after recovery; publication-mark and inbox-ACK crash windows, duplicate transport yields one inbox/event, bounded 60s after readiness. |
| SC-013 | Faithful Inventory unavailable/timeout/malformed provider response gives 503, real DB zero state/event; contract check against real Inventory. |
| SC-014 | Rendered Angular success/failure/empty/loading/pending, timezone round-trip/offset tests, Playwright real journey/axe and required manual keyboard/focus/status evidence. |
| SC-015 | Original check suite and real hello journey retained; only documented seed-expanded lookup replaces one-item assertions with equivalent camera behavior. |
| SC-016 | Actual listener/Podman mapping inspection; negative cross-DB role connections/privilege metadata; committed secret scan and independent scope/config security verdict. |
| SC-017 | Captured correlated booking/cancel/conflict/Inventory and broker failure signals; payload/credential absence inspection and bounded metric-label assertions. |
| SC-018 | Independent artifact/source/UI scope review confirms only requested workflow; no added approval/authentication/live updates. |

## Complexity Tracking

No requested constitutional exceptions. Privileged bootstrap and tiny migration library serve concrete cross-database provisioning/test reuse. This plan does not approve itself, waive accessibility, grant final acceptance, or authorize external actions.


## Prospective testing-policy supersession — feature 007

On 2026-10-16, the owner approved [feature 007’s testing policy](../007-aspire-independent-tests/supersession.md), which supersedes this document’s automated Aspire/AppHost and manifest-publication obligations and retired Smoke.Tests paths. Retained application/provider guarantees have [replacement coverage](../007-aspire-independent-tests/team/coverage-disposition.md); local orchestration is verified manually. Deployment manifest support is outside scope. Original requirements, task markers, acceptance status, review hashes, and evidence above remain historical records; they do not approve feature 007.
