# Implementation Plan: Aspire-independent application tests

**Branch**: `main` (explicit feature-directory override) | **Date**: 2026-10-16 | **Spec**: [spec.md](spec.md)

**Baseline**: `e1952952e82aa1a32e79285923db68f26f995aed`. The setup script reports the derived feature name `007-aspire-independent-tests`; it does not imply a Git branch switch. Use `SPECIFY_FEATURE_DIRECTORY=specs/007-aspire-independent-tests` for all Spec Kit operations.

## Current implementation amendment — 2026-10-19

This section supersedes the original design below wherever it requires one Backend.Tests project, xUnit v2, serialized execution, or no dependency upgrades. The remainder records the accepted original migration design; it is not the current scheduling instruction. See [authority and evidence](supersession.md#testing-organization-and-concurrency-amendment--2026-10-19).

- **Layout**: `tests/{Inventory,Reservations,Notifications,IdentityAccess,Persistence,DatabaseBootstrap,BrokerBootstrap,IdentityBootstrap,Integration}.Tests/`, plus `tests/TestSupport/` (a non-test support library). Each production responsibility owns its tests; scenarios exercising multiple production projects belong to Integration.Tests. Support helpers do not constitute another test module.
- **Runner**: shared `tests/Directory.Build.props` selects `xunit.v3.mtp-v2` 4.0.2 and native Microsoft.Testing.Platform executable projects; `global.json` selects Microsoft.Testing.Platform. Fixtures use v3 lifecycle APIs. The solution includes all nine test projects and TestSupport.
- **Concurrency**: each assembly declares `Parallelization(Mode = ParallelMode.All, MaxThreads = -1)`. Native `dotnet test --solution EquipmentReservation.slnx --max-parallel-test-modules 9` permits all current modules together. `scripts/quality.mjs` derives the module limit from the test-project inventory and passes `--no-build` after the required build; it does not schedule custom clusters.
- **Isolation**: PostgreSQL assembly fixtures create scenario-specific databases; test containers allow 512 connections for concurrent scenarios. Shared RSA signing/key-export/disposal is synchronized. Shared RabbitMQ and Keycloak collection exclusions and process-wide telemetry/environment class exclusions apply only inside their process. Every exclusion needs the hard constraint and smallest scope required by [the testing guide](../../docs/engineering/testing.md#backend-parallelism-is-the-default).
- **Provider lifecycle**: container-per-test is not the general policy. The Keycloak diagnostic-privacy scenario owns a dedicated container so prior negative-login diagnostics cannot contaminate its full-history assertions. Other scenarios retain their scoped/shared provider lifecycles and explicit cleanup.
- **Preservation**: public behavior, wire/security contracts, real-provider assertions, no automated Aspire orchestration, and manual local-development checks remain required. No production `src/` edits or provider image upgrades are part of this amendment. This organization is compatible with constitutional simplicity and useful-feedback principles; no constitutional amendment is required.
- **Validation**: retain exact case identities and assertions across moves, verify native discovery and concurrency-sensitive behavior, and run mandatory formatting, lint and full quality checks. Independent review, convergence and explicit acceptance must cover this amended revision before it is complete.

## Summary

Retain application and real-provider guarantees while eliminating automated AppHost construction, inspection, execution and publication. Move retained Smoke coverage into Backend.Tests, replace the two Aspire-dependent broker/recovery harnesses with Testcontainers and WebApplicationFactory, remove the obsolete project, and document the manual local-development boundary. No runtime source, wire contract, authorization policy, image version or concurrency optimization changes are authorized.

## Technical Context

**Language/Version**: existing .NET 10 / C# and Node ECMAScript modules; no upgrades.

**Primary Dependencies**: existing Microsoft.AspNetCore.Mvc.Testing 10.0.0, Testcontainers.PostgreSql 4.16.0 and its generic container APIs, xUnit 2.9.3, RabbitMQ.Client, production DatabaseBootstrap/BrokerBootstrap/IdentityBootstrap and service assemblies. Aspire.Hosting.Testing 13.6.1 is removed with Smoke.Tests. Reuse installed packages; do not add a second test framework.

**Storage**: isolated PostgreSQL 18.6 databases and RabbitMQ 4.3.6 durable queues; Keycloak 26.8.1. Use the matching RabbitMQ management image only for provider administration-denial contracts. No developer secrets or volumes.

**Testing**: Backend.Tests public HTTP behavior through WAF, real infrastructure via Testcontainers, existing provider contracts and production telemetry registration. Existing client/browser checks remain applicable; no product/browser behavior changes.

**Target Platform**: existing local .NET/Node toolchain and Podman runtime, including supported Unix file-mode observations.

**Project Type**: internal test-harness/tooling/documentation refactor in existing monorepo.

**Performance Goals**: remove orchestration overhead and improve diagnostic boundaries; no numerical speed target or parallelization work.

**Constraints**: preserve all distinct guarantees in research disposition matrix; no skips, weaker negative assertions, production-only test seams, source-generator suppressions or runtime changes. Keep all collection/assembly serialization; newly consolidated collections must not start executing concurrently.

**Scale/Scope**: baseline 40 test methods / 108 expanded cases in Smoke.Tests; verify exact baseline inventory in research.md. Existing backend behavior retained. Split mixed tests by guarantee rather than migrating/deleting whole files blindly.

## Constitution Check

Pre-research and post-design assessment:

| Principle / guide | Design assessment |
| --- | --- |
| I Simple design | One backend test project, reuse existing fixtures and provisioning; no new runtime abstraction. |
| II Test-first | Behavior-preserving harness refactor retains existing behavior expectations. Establish baseline and migrate incrementally; no invented failing product behavior. |
| III Public interfaces | HTTP requests through production pipelines, real PostgreSQL/RabbitMQ/Keycloak; direct provider contracts justify boundary-double fidelity. WAF cross-service journey keeps actual Inventory endpoint and service authority handler. |
| IV Useful feedback | Focused recovery phases, exact event IDs/envelopes/rows and diagnostic bounds; no raw test-count equivalence or retry-until-green. |
| V Observability | Preserve outbox/consumer signals and production-registered native HTTP/provider spans, trace parents and privacy assertions. No production telemetry change; retained tests must still catch missing production registration. |
| VI Resilience | Existing retry policies unchanged; preserve nack/return/timeout, transient/permanent failure, interrupted commit/ACK, duplicates and later progress tests. Infrastructure/client deadlines remain explicit. |
| Engineering standards | Apply testing, Aspire, ASP.NET Core, resilience, observability and formatting guides. Owner explicitly approved automated Aspire/publication removal and corresponding guide amendments. Test fixture raw JSON is permitted by ASP.NET Core guide; production generators remain untouched. |
| Workflow | Independent reviewer verdicts, convergence and separate final human acceptance remain required. No self-approval, publishing, merging or external issues. |

No constitutional exceptions or unresolved product decisions are required. Removing automated orchestration does not remove local development capabilities. Manual observations replace AppHost-specific acceptance evidence; real provider security/persistence remains automated.

## Project Structure and Ownership

```text
specs/007-aspire-independent-tests/
  spec.md                    # analyst
  plan.md                    # architect
  research.md                # architect; baseline and planned disposition
  data-model.md              # architect; coverage/evidence records, no DB changes
  quickstart.md              # architect; validation procedure
  tasks.md                   # architect after preparation review
  team/                      # coordinator, immutable review snapshots
  checklists/                # coordinator and designated requirements reviewer

tests/Backend.Tests/
  existing behavior tests and fixtures
  AssemblyInfo.cs            # retains assembly-wide sequentialization
  migrated provider/delivery contracts
  broker access Testcontainers fixture
  focused cross-service recovery tests
  Backend.Tests.csproj / packages.lock.json

tests/Smoke.Tests/             # removed after migration
scripts/quality.mjs            # one Backend.Tests invocation after existing build
EquipmentReservation.slnx      # remove Smoke entry
README.md
docs/engineering/{testing,aspire,formatting-and-linting}.md
AGENTS.md                     # only obsolete real-smoke wording, if applicable
```

**Structure Decision**: coder owns test/tooling/contributor-guide changes; analyst owns supersession amendments to affected prior specifications/plans. Architect owns only this feature design and task artifacts. Coordinator owns evidence/review state. Do not format another agent's files. No `src/` writes are authorized.

## Architecture and Trust Boundaries

1. **Application boundary**: production Inventory, Reservations and Notifications entry points hosted by separate WAF instances. Reservations named `inventory` HttpClient uses the Inventory TestServer handler while production `InventoryClient` acquires and attaches service authority through the existing `ServiceTokenClient`; retain that acquisition and authentication pipeline. There is no separate production service-token handler class. Narrow existing tests may retain faithful Inventory/identity doubles; focused cross-service replacement must not silently become another InventoryBoundary test.
2. **Provider boundary**: container settings and generated fixture credentials feed the production provisioning APIs. Broker definitions must come from BrokerProvisioning.Build/Configuration, database state from DatabaseProvisioner/migrations, and identity state from IdentityProvisioning. Test-only simplified grants/realm/schema are not replacements.
3. **Security boundary**: privileged setup connections stay fixture-owned; service hosts receive only scoped service credentials for scenarios whose guarantee depends on authority. Provider rights tests assert actual denials: RabbitMQ 403/530 and management denial; PostgreSQL 42501 and role flags/memberships. Preserve reserved/unicode URI handling and protected broker files. Logs/spans must exclude passwords, hashes, tokens and session/profile payloads.
4. **Lifecycle boundary**: containers own isolated durable state; WAF hosts and NpgsqlDataSource instances are recreated independently. Dispose clients/hosts before data sources and providers. Recreate data sources from stable fixture connection strings when hosts own/dispose them. Never reuse a disposed singleton or recreate an empty database and claim recovery.
5. **Manual local boundary**: ordinary AppHost startup/dashboard/admin consoles/bindings/persistent local state are manually checked using existing documented skills/lifecycle ownership. Publishing is unsupported, not a new manual publishing gate. No automated checks may construct even a nonstarted AppHost model.

## Design Details

### Provider fixture replacement

Replace BrokerAccessFixture's AppHost with a generic Testcontainers RabbitMQ management container, isolated credentials, resource-mapped production definitions/configuration, explicit AMQP and management readiness, and reliable cleanup. Construct scoped connection URIs with escaping and correct vhost. Keep exact grants/reverse-operation/default-exchange/other-vhost/management denials. Retain production topology declare and publisher-confirm/unroutable behavior. A focused malformed/unreadable import scenario verifies actual broker boot rejection and safe logs; worker resource Waiting and DCP staging lifetime are removed. Do not confuse a timeout with observed import rejection. Bound RabbitMQ normal setup to 60 seconds, failed-import observation to 60 seconds, and AMQP connection operations to the existing three-second client budget; management HTTP uses five seconds. Existing Keycloak fixture startup remains bounded at three minutes and provider HTTP at five seconds. Focused DB provisioning retains 120 seconds; cross-service recovery uses a bounded overall deadline up to three minutes with 60-second readiness-based recovery assertions. Dispose partial containers on startup failure and preserve safe exit/log diagnostics without secrets; record failure as failure. Cleanup must run in finally/await using, observing pending tasks before disposing hosts then sources then providers.

Retain RabbitMQ container file ownership/modes (999:999:600); conf-directory 700 from the mixed AppHost test must either be reproduced as a provider contract or explicitly mapped as host-staging orchestration. The implementation matrix must name that distinction, not silently lose it.

### Recovery replacement

Replace the eight-minute three-AppHost journey with bounded scenarios that expose these phases:

- Provision/migrate isolated databases and seed once; read baseline migration ledgers; book/cancel through actual services; record exact history/event snapshots and an equipment edit.
- Stop real broker; commit another booking/cancellation and observe unpublished stable envelopes. Dispose/recreate relevant WAF hosts while preserving stores; inspect pending state before replay.
- Recover broker and publisher with consumer host absent; verify publication, unchanged IDs/envelopes, queued messages and existing inbox unchanged. Restart broker with queued messages and verify retention before consumer starts.
- Start recreated consumer and query public APIs; assert exact inbox effects, booking history, equipment edit, unchanged migration ledgers and other-user empty history/inbox. Recreate hosts again where necessary to prove persisted inbox/history rather than in-memory state.
- Preserve unrelated legacy exchange/queue/message throughout direct provider lifecycle; no destructive cleanup outside owned fixture resources.

Tests may split these phases when shared guarantees remain traceable. Existing DatabaseProvisioningTests covers named-volume server recreation, seed preservation, password reconciliation and own-role isolation. IdentityProviderTests covers persisted subjects/passwords across provider restart; explicitly verify stable issuer and configured metadata authority there rather than relying on removed endpoint annotations. Do not assert OS process starts, actual application listeners or AppHost volume annotations.

### Concurrency and tooling

Move Smoke assembly serialization into Backend.Tests before merging independent collections. Existing PostgreSQL, Reservation delivery and Identity provider collection boundaries remain; no scheduling optimizations. Simplify quality command to one `dotnet test tests/Backend.Tests/Backend.Tests.csproj --no-build -m:1` after lint/build and frontend checks, propagating nonzero exit. Remove now-unused async parallel runner/imports. Solution build still builds ordinary AppHost; it does not run orchestration tests. Lockfile changes remove retired project and resolve direct provider assembly references without upgrades.

### Agreements and evidence

Research contains the complete baseline method/theory-argument list plus mixed-guarantee mapping. Coder records final test names, results and snapshot in team evidence; reviewers confirm every baseline row and every retained sub-guarantee. Analyst owns central `supersession.md` and 18 short prospective appended notices in each `spec.md`/`plan.md`/`tasks.md` of features 001–006. Notices preserve prior statuses, checkmarks and team artifacts. Feature005 FR-006/FR-011/SC-004 deployment-output support and assertions are explicitly superseded while local Development/loopback/access remains manual. Feature003 telemetry paths, privacy and registration-mutation sensitivity remain automated; its historical dashboard evidence is a manual boundary. Active guides receive corresponding policy text. Preserve historical tasks, reviews and accepted dates/hashes; notices identify replacement evidence rather than rewriting history. Do not globally replace historical Smoke paths.

## Implementation Ordering

1. Freeze baseline inventory/coverage matrix and establish environment/current suite result.
2. Add/retain serialization and migrate pure provider/delivery cases with existing assertions.
3. Rewrite broker fixture; preserve full success/denial/import/privacy contracts.
4. Replace cross-service recovery journey, completing mixed guarantee coverage.
5. Remove only mapped Aspire-only cases/helpers and retire project/package/quality references.
6. Update contributor manual check and supersession notices; audit all automated projects, including equivalent AppHost checks outside Smoke.
7. Run mandatory current-source gates, coverage review, independent quality/security reviews and convergence; obtain separate final human acceptance.

Tasks are generated only after the coordinator authorizes the preparation-reviewed design.

## Validation Strategy

Baseline inventory is exhaustive at method and expanded theory-case level; it is a completeness index, not a substitute for assertions. Run focused migrated delivery, broker, provider and recovery classes during implementation. Final required checks: exact-file format/reread after edits, `npm run format-check`, `npm run lint`, `npm run check`, `git diff --check`, solution/project/package/tooling audit for retired/Aspire-testing references, and frozen coverage mapping review. Required tests fail rather than skip without infrastructure. Record toolchain/runtime, command, exit, passed/failed/skipped counts and tested snapshot. Any source/analyzer fix invalidates affected evidence.

Manual local-development procedure validates documented observations and records results/failures separately; no automated AppHost or manifest assertions are restored. Existing unrelated browser coverage remains unchanged; this harness-only change adds no new browser feature gate. No production dependency/telemetry registration changed, so retain existing real-provider exported-span tests rather than inventing an unrelated tracing redesign.

## Complexity Tracking

No constitutional violations or extra abstractions proposed. Main tradeoff: WAF validates service pipelines and persistence/recovery but not separate OS process crashes/listeners or orchestration wiring; this is explicitly accepted scope. Serial consolidation can change total duration; performance tuning remains deferred.
