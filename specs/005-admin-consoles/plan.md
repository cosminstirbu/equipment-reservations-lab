# Implementation Plan: Local Administration Consoles

**Branch**: `main` (feature directory `005-admin-consoles`; no branch created) | **Date**: 2026-10-15 | **Spec**: [spec.md](spec.md)

**Input**: Clarified specification and owner-confirmed console choices. Baseline HEAD `9878407026878e966c0b442cd0f62f9f409f140d`.

## Summary

Enable the installed Aspire RabbitMQ Management and pgAdmin integrations only when the AppHost is running in Development and its execution context is run mode. Preserve existing resources, versions, secret-store identity, generated persistent passwords, data volumes, bootstrap provisioning, service accounts and telemetry registrations. Expose dynamic, proxied HTTP console endpoints on loopback, explicitly exclude admin endpoints from service references, and prove both advertised and backing host bindings are local. No custom admin application or new business API is introduced.

## Technical Context

**Language/Version**: C# 14 / .NET 10, existing pinned SDK unchanged.

**Primary Dependencies**: Aspire.Hosting.AppHost, PostgreSQL, RabbitMQ and Testing 13.6.1; new pgAdmin image explicitly pinned to `dpage/pgadmin4:9.18.0` through the integration callback; RabbitMQ 4.3.6 management variant; PostgreSQL 18.6. Existing Aspire/PostgreSQL/RabbitMQ package and server versions remain unchanged; the newly introduced pgAdmin image uses the security-reviewed pin.

**Storage**: Existing `equipment-reservations-postgres` and `equipment-reservations-rabbitmq` named volumes. pgAdmin has no added persistent volume. Application databases remain provisioned by DatabaseBootstrap, not additional `AddDatabase` calls.

**Testing**: Existing xUnit/Aspire.Hosting.Testing and real Podman infrastructure; existing Testcontainers PostgreSQL fixtures remain authoritative for application behavior. Browser workflow verification uses existing Playwright tooling or supported computer-use capability against isolated data. No infrastructure doubles for this orchestration feature.

**Target Platform**: Trusted developer workstation, current macOS/Podman environment; IPv4 and IPv6 host exposure inspected. No remote-development support.

**Project Type**: Small AppHost orchestration addition and developer documentation.

**Performance Goals**: No new throughput/latency target. Both interfaces become available through normal startup within bounded test readiness budgets (existing AppHost smoke startup uses three minutes).

**Constraints**: Dynamic ports; local-only exposure; publish and non-Development exclusion; no application-role elevation; existing storage/credential identity preserved; no secret values in committed evidence.

**Scale/Scope**: One broker console, one pgAdmin console, three existing databases, no new application service.

## Constitution Check

Pre-design and post-design assessment: design conforms; implementation and independent reviews must establish evidence, not infer completion from this assessment.

- I: built-in integrations and one conditional AppHost configuration block; no speculative wrapper framework or custom UI.
- II: write behavioral AppHost tests before source edits; record expected failing results for missing consoles and development/publish isolation. Add isolated real-service workflow tests where automation provides reliable public behavior coverage.
- III: test the AppHost model/public endpoints and real broker/database. Model assertions verify public orchestration contracts; they do not substitute for runtime browser/network checks. Existing narrow broker contract tests continue using real RabbitMQ; no new doubles. Real isolated PostgreSQL remains mandatory.
- IV: bounded readiness and operation timeouts, unique test resources, cleanup in finally/disposal, no fixed sleeps. Keep end-to-end checks focused on changed behavior.
- V: no production client or dependency instrumentation is added or changed. Existing production database and broker instrumentation remains untouched and existing observability/privacy tests run. Console lifecycle/readiness uses Aspire resource diagnostics; console-generated SQL/messages are developer administration, not newly instrumented application workflows. No browser telemetry capture containing credentials. Evidence must redact secrets, request bodies and connection strings.
- VI: no new application remote call or resilience pipeline. Third-party consoles retain their own supported behavior; no custom retry/circuit-breaker layer. Test HTTP calls have a ten-second per-request timeout and one three-minute overall readiness deadline; no automatic mutation retries. Failed dependency readiness stays visible in Aspire and tests fail diagnostically.
- Engineering guides: README, aspire.md, aspnet-core.md, testing.md, observability.md, resilience.md, formatting-and-linting.md apply. Angular source unchanged. No new application JSON/logging/regex contracts planned; if helpers introduce compile-time-known application contracts, use supported generators. Tests may independently parse external JSON per existing guide.
- Gates: frozen revision checks, independent quality/security verdicts, convergence and explicit final human acceptance required. No policy exceptions proposed.

## Design

### Resource and lifecycle configuration

After existing server construction, inside `IsRunMode && IsDevelopment()` only, apply `postgres.WithPgAdmin(...)` with callback `.WithImageTag("9.18.0")` and `messaging.WithManagementPlugin()`. Apply the Rabbit plugin after its existing pinned image tag so the built-in integration selects the matching 4.3.6 management variant; verify resulting tag and AMQP behavior. Leave ordinary broker/Postgres resources enabled outside this condition. pgAdmin should wait for Postgres; readiness of all application databases follows existing bootstrap completion and must be accounted for by validation. Do not introduce a reverse dependency that makes application startup depend on a console.

The installed integration defaults to pgAdmin 9.15; override only this new console image to 9.18 because official subsequent release notes document stored-XSS and credential-redirection fixes (SEC-005-D1). Assert the configured tag and actual running version before the first-start binding gate; rerun affected model/publish, runtime binding, browser and recreation evidence on 9.18. Preserve 9.15 results as historical only.

pgAdmin's built-in generated server registration uses the existing Postgres administrator parameter over the internal Aspire container network. It connects to the server maintenance database and can browse all three bootstrap-created databases. Do not create duplicate database resources merely to register them. Keep desktop/no-login configuration and do not add volumes for pgAdmin. Exclude pgAdmin from manifest (built-in default) as defense in depth; the run/development guard is the primary guarantee that neither pgAdmin nor Rabbit management image/endpoint exists at publish time.

### Trust boundaries and host binding

The browser has administrator powers; the dashboard token is not an authorization boundary for direct console URLs. Local OS users and containers on Aspire's local network are trusted; other computers are outside the boundary. No tunnel, forwarding, wildcard bind or LAN endpoint is permitted.

For both new HTTP endpoints configure `TargetHost = "127.0.0.1"`, `IsProxied = true`, no fixed `Port`, `IsExternal = false`, and `ExcludeReferenceEndpoint = true`. Enable endpoint proxy support on pgAdmin and retain it on the broker. Use endpoint-update callbacks rather than duplicate endpoint definitions. Rabbit's management endpoint identity comes from its installed integration/public ManagementEndpoint, not a guessed fixed URL. Existing AMQP/Postgres endpoint behavior remains intact.

This configuration follows the existing AppHost binding pattern, but the configured URL is not proof of effective isolation. Before accepting it inspect BOTH Aspire proxy listener addresses and Podman backing published ports. Every host-accessible console port must bind only loopback, including IPv6; no `0.0.0.0`, `::` or non-loopback publication may pass. Attempt direct HTTP/TCP connection using discovered non-loopback addresses, including backing ports, with bounded timeouts. Run assertions against actual listeners/Podman metadata, so lack of a routable LAN interface is not mistaken for isolation. If the pinned integration/runtime cannot achieve these bindings with supported configuration, stop and route the technical blocker to coordinator/security rather than ship unauthenticated pgAdmin or change scope. Runtime binding proof is a mandatory implementation gate.

### Verification and requirement mapping

| Requirements | Evidence |
| --- | --- |
| FR-001, FR-005, FR-006 | Failing-then-passing Development model/startup tests for console endpoints/dynamic ports and actual loopback HTTP availability; non-Development and publish output lack console resource, management endpoint and management-image mutation. Runtime listener/publication inspection plus non-loopback attempts. |
| FR-002 | Real Rabbit management HTTP auth rejects unauthenticated administration and accepts existing parameter credentials; browser login and isolated exchange/queue/binding/consumer/message inspect, publish, inspect/get and purge. |
| FR-003, FR-004 | Browser pgAdmin opens without login/registration/password entry, sees all databases/tables and executes SQL against each using disposable table/schema objects; insert/edit/delete/drop effects checked. A direct Npgsql connection alone cannot prove pgAdmin setup. |
| FR-007, FR-008 | Assert unchanged volume names/secret identity and no pgAdmin volume; reuse existing persistence/role/booking checks. With isolated storage verify sentinel state survives AppHost restart; recreate pgAdmin and repeat automatic connection without restored settings. Do not operate destructively on owner data. |
| FR-009, FR-010 | README/quickstart review, credential-free evidence/log review, full application/check/observability suites unchanged and passing. |
| FR-011 | Coordinator records revision-matched checks, independent reviews, convergence and acceptance. |

Keep tests focused: a small AppHost console test class can cover model/run and auth contracts; extend existing smoke helpers only where needed. Existing BrokerContractTests currently assumes a single Rabbit endpoint and removes Postgres while leaving other resources by name. Adapt it to select AMQP by its public endpoint name and remove pgAdmin when its Postgres dependency is removed; retain all existing topology behavior assertions. Other isolated AppHost fixtures must not accidentally create unresolved console dependencies.

Browser workflow evidence may be obtained with a bounded reusable Playwright scenario or documented computer-use session, but both consoles' actual UI workflows must be exercised before completion. Record exact commands/actions, outcomes and tested revision. Preserve authentication secrecy: pass credentials in process-local memory; do not echo them, attach authentication traces, save secret-bearing screenshots or log raw environment/container inspection dumps.

## Project Structure

```text
specs/005-admin-consoles/
  spec.md
  plan.md
  research.md
  data-model.md
  quickstart.md
  contracts/admin-consoles.md
  tasks.md                     # generated after preparation review
src/AppHost/Program.cs          # console wiring only
README.md                      # local access instructions
tests/Smoke.Tests/
  AdminConsoleTests.cs          # focused new orchestration coverage
  BrokerContractTests.cs        # preserve AMQP assertions with extra endpoint
  SmokeStartup.cs               # only if isolation/lifecycle helpers need extension
src/Web/                       # existing browser tooling, no product UI changes
```

**Structure Decision**: Extend existing host/tests/docs. A browser verification script may be added under existing tooling with explicit coder ownership; no standalone admin service. No tasks generated during plan phase.

## Complexity Tracking

No constitutional violations or exceptions. Effective runtime binding remains a proof obligation, not an approved assumption.
