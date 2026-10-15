# Implementation Plan: Feature 0 — Hello World Walking Skeleton

**Branch**: `001-hello-world-skeleton` | **Date**: 2026-10-13 | **Spec**: [spec.md](spec.md)

## Summary

One local Angular screen proves Inventory HTTP → Reservations HTTP → Inventory HTTP → RabbitMQ → Notifications → Angular polling. Aspire AppHost orchestrates host processes and one ephemeral RabbitMQ container using Podman. There are no reservations, identity, database, retries, deployment, outbox, or deduplication.

## Technical Context

- C# 14 / ASP.NET Core .NET 10 LTS; SDK 10.0.301 pinned in global.json; runtime 10.0.9 installed.
- Angular 22.2.2 stable, strict TypeScript 6.0 family, RxJS 7.8 family; Node 24.15.0/npm 11.12.1. Pin exact package versions plus lockfile during setup; never prerelease. Angular22.2.2 official registry engines accept Node24.15.0, and compiler-cli peer TypeScript range is >=6.0 <6.1.
- OpenTelemetry stable exporter 1.19.1 and instrumentation 1.19.0; retain existing correlated telemetry design and verify restore/audit.
- Aspire SDK/Hosting/AppHost/JavaScript/RabbitMQ 13.6.1; RabbitMQ image 4.3.6; official RabbitMQ.Client 7.2.2. Verify restore/image availability before implementation depends on them.
- Minimal APIs, typed JSON contracts and safe Problem Details. Shared service defaults contain operational configuration only. Shared messaging project contains event contract and the single fixed broker topology, not business logic.
- One fixed seed (`camera-001`, `Demo Camera`), memory only; Notifications capacity 1,000, FIFO eviction, five-minute TTL, controlled TimeProvider for tests.
- .NET public HTTP behavior tests using WebApplicationFactory; Angular TestBed/Vitest rendered behavior tests; one AppHost integration smoke test against real processes and broker. No performance SLA beyond explicit deadlines; one developer and one screen.
- Applies constitution 1.1.0 and engineering guides angular.md, aspnet-core.md, aspire.md, testing.md, observability.md, resilience.md.

## Constitution Check

Pre-research and post-design assessment: no policy exceptions or unresolved product decisions. This is design compliance, not reviewer approval.

| Principle | Design and required evidence |
| --- | --- |
| Simple design | Three explicitly requested service boundaries, Minimal APIs, one screen; no speculative abstractions. |
| Test first | Record intended failing behavioral tests before implementing each behavior; rerun after implementation. |
| Public behavior tests | HTTP entry points and rendered UI; real internal collaborators. Faithful external HTTP/broker doubles with provider-contract/real-broker checks. |
| Useful feedback | Controlled time for expiry/polling, isolated state, bounded integration deadlines and diagnostic errors. |
| Correlated telemetry | ASP.NET/HttpClient OTEL plus hello producer/consumer spans and propagated W3C context, structured logs, bounded-label outcome/error/latency metrics. |
| Bounded resilience | Explicit deadlines, zero automatic retries/recovery, no hedging; omit circuit breakers for this local demo and surface dependency failures directly. |
| Workflow | Independent frozen-revision quality/security review, convergence and explicit human acceptance remain required. |

Deferred authentication/authorization is the owner's explicit local-only scope decision. It is not an implemented capability. Every host listener must be loopback; the application is inappropriate for shared deployment.

## Project Structure

```text
src/AppHost/
src/ServiceDefaults/
src/HelloMessaging/
src/Inventory/
src/Reservations/
src/Notifications/
src/Web/
tests/Backend.Tests/
tests/Smoke.Tests/
README.md
specs/001-hello-world-skeleton/{spec,plan,research,data-model,quickstart,tasks}.md
specs/001-hello-world-skeleton/contracts/hello.md
specs/001-hello-world-skeleton/team/
```

## Connectivity and trust boundaries

AppHost declares resource references and WaitFor readiness: Reservations references Inventory and RabbitMQ; Notifications references RabbitMQ; Web references the three APIs. Web's fixed Angular development proxy reads explicitly injected endpoint references, one exact target per API path. The browser uses same-origin relative URLs; no permissive CORS is required. Service discovery supplies the fixed Inventory address to Reservations; callers cannot choose upstream URLs.

Use explicit loopback host configuration for AppHost dashboard/resource service/OTLP, API listeners and Angular dev server. Keep broker AMQP behind Aspire's loopback host proxy, with no management endpoint or volume. Configure supported endpoint host/proxy options, then inspect actual Podman mappings and host listeners: URL labels or IsExternal=false alone do not prove isolation. If the stable hosting API cannot enforce loopback container mappings, stop and route this blocker rather than weaken AC8. Aspire-generated per-run broker credentials stay out of committed files, browser configuration and telemetry; preserve dashboard token protection.

Bound POST JSON and event payloads to 4 KiB. Equipment ID is a nonempty ASCII identifier of at most 64 characters; correlation ID is a nonempty GUID. Do not reflect upstream exception details, connection strings or request bodies. No PII is used.

## Dependency policy

| Boundary | Budget | Retry/recovery | Breaker and failure signal |
| --- | --- | --- | --- |
| Browser API calls | 5 seconds each | None | None; rendered understandable error |
| Reservations → Inventory | 3 seconds | None | None; 503 Problem Details, error metric/span/log |
| Reservations → RabbitMQ | 3 seconds connect/channel/publish-confirm; request overall 8 seconds | None; automatic/topology recovery disabled | None; 503 and failed producer signal |
| Consumer broker initialization/readiness | 5 seconds per operation; cancellation on stop | No reconnect/redelivery loop | Readiness unhealthy and consumer failure signal; restart needed after outage |
| Notification polling | 500 ms observation interval; 30-second absolute deadline including stalled requests | Observation only; never resend hello | Stop on success, error, deadline or destroy |

Use one non-durable direct exchange `hello`, durable nonexclusive queue `hello-notifications`, routing key `hello.requested`. Declare/bind the identical topology before publishing and consuming; queue TTL 30 seconds, max length 1,000, overflow reject-publish. Publish mandatory with publisher confirmations and await broker acceptance before returning 202. A nack/unroutable/timeout is failure; uncertain outcome is not retried. One consumer, prefetch 1, manual acknowledgement after in-memory storage; invalid events are rejected without requeue. Publish messages as transient/non-persistent. Durable queue metadata avoids RabbitMQ4.3.6 deprecated transient nonexclusive queue rejection; it does not provide persistent delivery or replay. The broker has no volume and its state clears when AppHost recreates the ephemeral container. Notifications restart clears stored messages; no recovery or duplicate suppression is promised.

## Observability

OTEL ASP.NET/HttpClient traces/logs/metrics export to the Aspire dashboard; local dashboard memory is the only telemetry store, resets on AppHost restart, no production backend. Sample all local demo traces. One custom hello producer span injects traceparent/tracestate into event headers; consumer extracts parent context and records delivery/storage. Correlation ID and equipment ID may appear in traces/logs, never metric dimensions. Metrics use operation/outcome only and include latency/errors, published/consumed hello outcomes and readiness/dependency health. Do not log raw exception objects containing credentials or HTTP payloads. Validate a successful trace chain and controlled dependency-failure telemetry in dashboard or captured OTEL output; credentials and request bodies absent.

## Validation strategy

1. Test first through HTTP: Inventory seed/unknown contract, Reservations valid/invalid IDs, Inventory failure/timeout, broker refusal/timeout/unroutable/nack and zero publish effects for invalid equipment. Use narrow faithful boundary doubles and contract checks against Inventory and real broker.
2. Notifications public HTTP/consumer boundary: lookup, malformed/oversized event rejection, TTL and oldest eviction using controlled time, capacity remains 1,000, no requeue on invalid events.
3. Angular rendered tests: loading, pending, correlation/result, errors, blocked duplicate clicks, absolute timeout despite a stalled request, no requests after result/destroy; fake clock and HTTP boundary only. Run axe on screen states and manually review keyboard/focus/live announcements.
4. Small automated AppHost smoke launches running services and actual RabbitMQ, waits bounded readiness, sends known item, checks unique correlation and notification message. A second deliberate send has a distinct GUID. Broker-backed adapter contract verifies actual confirmations and queue routing/limits; negative-path API tests prove Inventory call and no-publish semantics. Resource-unavailable failures must fail diagnostically, never skip.
5. Build backend and Angular, run all focused tests, smoke, inspect Podman port mappings and host listeners, scan committed configuration for secrets, verify fresh documented startup and reset semantics. Record commands, exit status and frozen revision in team evidence.

## Complexity Tracking

No constitutional violations identified. Three services are explicitly requested. No deployment artifacts or extra infrastructure are planned.
