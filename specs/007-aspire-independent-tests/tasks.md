# Tasks: Aspire-independent application tests

**Input**: `spec.md`, `plan.md`, `research.md`, `data-model.md`, `quickstart.md` in `specs/007-aspire-independent-tests/`.

**Preparation baseline**: design independently quality/security approved at snapshot `80c04f3afd6a9a06e80c1105b940676d18a8fddb59dddef76e4de9115ed4201a`; implementation tasks and resulting source require their own reviews. Use `SPECIFY_FEATURE_DIRECTORY=specs/007-aspire-independent-tests` for every Spec Kit command.

**Scope**: behavior-preserving test migration. Existing tests are the behavior baseline; no invented failing product behavior is required. Preserve distinct assertions; test code changes and focused replacement tests are expressly requested. No runtime `src/` edits, dependency upgrades, parallelization optimization, external publication, merging or issue creation.

**Ownership**: coder owns tests, solution, quality tooling and contributor guidance; analyst owns central supersession register and 18 prospective historical notices; coordinator owns evidence/state, runtime ownership, independent review/convergence orchestration and acceptance. Reviewers alone own their verdicts. No worker is alone; do not overwrite another worker or format their files. `[P]` denotes disjoint document work, never test scheduling.

## Phase 1: Setup

- [x] T001 Coordinator records accepted baseline `e1952952e82aa1a32e79285923db68f26f995aed`, existing accepted validation evidence, current Podman/toolchain/socket prerequisites and ownership in `specs/007-aspire-independent-tests/team/implementation-evidence.md`; preserve historical records. No full rerun of obsolete Aspire suite is required; run focused baseline cases only if needed (FR-010/012).
- [x] T002 Coder copies the complete 40-method/108-case inventory and mixed-guarantee map from `specs/007-aspire-independent-tests/research.md` into a final-disposition working table in `specs/007-aspire-independent-tests/team/coverage-disposition.md`, retaining exact original names/theory arguments and placeholders for final executable evidence; audit all `tests/` for equivalent mixed orchestration checks outside Smoke (FR-001/002/005a).

## Phase 2: Foundation

- [x] T003 Coder retains assembly-wide sequential execution by moving the rule from `tests/Smoke.Tests/AssemblyInfo.cs` into `tests/Backend.Tests/AssemblyInfo.cs`, and adds only necessary existing-version production provider/project references to `tests/Backend.Tests/Backend.Tests.csproj` with corresponding `packages.lock.json` updates; keep existing collection serialization and packages/image versions unchanged (FR-006/010/011).

**Checkpoint**: T001–T003 complete before test migration. Do not delete the Smoke project until all retained assertions have executable replacements.

## Phase 3: US1 — Validate application guarantees without orchestration (P1)

**Goal**: preserved delivery/provider contracts run through WAF/Testcontainers inside Backend.Tests.

**Independent test**: run migrated delivery, provisioning, broker, identity and telemetry classes with current supported Podman settings; inspect each mapped assertion and negative case. No AppHost construction/model/runtime/publication occurs in migrated tests.

- [x] T004 [US1] Coder moves `ReservationDeliveryFixture.cs`, `ReservationOutboxTests.cs`, `ReservationConsumerTests.cs` from `tests/Smoke.Tests/` to `tests/Backend.Tests/`, updating namespaces/imports and retaining every existing fact/theory argument, exact envelope/ID assertions, real broker/DB failures, bounded retry/permanent halting, commit/ACK recovery, deduplication, poison progression and correlated bounded privacy signals; record focused execution in `team/implementation-evidence.md` under this feature (FR-002/003/004).
- [x] T005 [US1] Coder moves `DatabaseProvisioningTests.cs` into `tests/Backend.Tests/`, preserving named-volume PostgreSQL recreation, role flags/no memberships, cross-database 42501, seed/edit retention and password reconciliation; retain production DatabaseProvisioner/migrations and focused passing evidence (FR-004/005/005a).
- [x] T006 [US1] Coder moves `IdentityProviderFixture.cs`, `IdentityProviderTelemetryTests.cs`, `ServiceIdentityContractTests.cs` and provider-only `IdentityProviderTests` class into `tests/Backend.Tests/`; preserve every human role/audience/PKCE/callback/password-grant/service-authority rejection and safe-log/span assertion. Extend provider restart observations to explicit stable issuer/subject/password and configured metadata authority guarantees formerly mixed with hosting tests; keep production registration/mutation sensitivity and current deadlines/cleanup (FR-002/004/005a).
- [x] T007 [US1] Coder rewrites broker setup in `tests/Backend.Tests/BrokerContractTests.cs` and a focused `tests/Backend.Tests/BrokerAccessFixture.cs` using Testcontainers and production BrokerProvisioning definitions/configuration, fixture-only privileged administration, URI-escaped scoped credentials, bounded AMQP/management readiness and partial-start cleanup. Preserve topology/confirms/both routes/unroutable/persistent bodies/manual ACK/reject, all 12 actual 403 forbidden-operation cases, both 530 other-vhost denials, both management denials and exact grants; run focused contracts (FR-003/004/005a).
- [x] T008 [US1] Coder splits/moves mixed `tests/Smoke.Tests/BrokerImportTests.cs` into `tests/Backend.Tests/BrokerImportTests.cs`: preserve normal restart/durable message/grants, both reserved/unicode credential cases, protected configuration/definition ownership/modes, and both malformed/unreadable import rejection plus password/hash-free diagnostics. Use actual observed provider failure within 60 seconds, never timeout-as-proof; remove only worker Waiting/DCP staging lifetime. Explicitly classify former conf-directory 700 observation in `team/coverage-disposition.md` (FR-002/004/005a).

**Checkpoint**: all provider/delivery tests pass independently; failure diagnostics remain safe. Record exact replacement names and cases. Newly impossible provider guarantees go to coordinator/owner before removal.

## Phase 4: US2 — Preserve durable recovery behavior (P1)

**Goal**: focused service-host/container lifecycle scenarios replace the three-AppHost journey.

**Independent test**: restart real broker and recreate service hosts with identical isolated state; inspect pending/queued data before replay/consumption and compare exact public history/inbox/event identities after recovery.

- [x] T009 [US2] Coder creates a focused WAF lifecycle fixture in `tests/Backend.Tests/BookingRecoveryFixture.cs` (or local helpers in `BookingRecoveryTests.cs`) hosting actual Inventory/Reservations/Notifications; route Reservations inventory HttpClient through Inventory TestServer while retaining production InventoryClient/ServiceTokenClient acquisition/authentication pipeline. Provision real isolated stores through production provisioners, keep scoped service connections, recreate data sources safely across hosts, dispose hosts before providers and bound startup/recovery as plan requires (FR-004/005/005a/010).
- [x] T010 [US2] Coder replaces application portions of `tests/Smoke.Tests/BookingSmokeTests.cs` in `tests/Backend.Tests/BookingRecoveryTests.cs`: capture exact catalogue/equipment edit/all-three migration-ledger baseline, reservation/confirmation/cancel snapshots and initial inbox; commit booking/cancel while broker stopped; recreate publisher hosts against the same databases and inspect identical pending IDs/envelopes before replay; recover broker with consumer absent and inspect queued stable events/unchanged inbox. Run focused behavior checks (FR-003/005/005a).
- [x] T011 [US2] Coder completes `tests/Backend.Tests/BookingRecoveryTests.cs` to restart broker with queued work before consumer activation, recreate consumer/other relevant hosts, verify exact histories/statuses/event IDs and single identical inbox effects, retained equipment edits/unchanged migration ledgers/hashed ownership and foreign-user empty history/inbox. Preserve unrelated legacy exchange/queue/message/zero-consumer state throughout direct provider/application lifecycle here or in `tests/Backend.Tests/RetainedBrokerStateTests.cs`; identify exact replacements in `team/coverage-disposition.md` (FR-002/004/005/005a).

**Checkpoint**: recovery evidence proves durable state identity and observations before replay, not just eventual counts. OS process timestamps, actual application listeners and AppHost annotations are intentionally excluded.

## Phase 5: US3 — Operate the revised test boundary (P2)

**Goal**: one required backend suite, accurate guides/manual checks and preserved historical agreements.

**Independent test**: final quality command runs every retained backend test, active solution/packages/tooling have no retired test dependency, and manual guide/supersession register describe approved policy accurately.

- [x] T012 [US3] Coder removes mapped Aspire-only tests/helpers (`AdminConsoleTests`, `BrokerPublicationTests`, `IdentityHostingTests`, `SmokeStartup`, DCP metadata/staging helpers and replaced `BookingSmokeTests`) and retires `tests/Smoke.Tests/` after T004–T011 coverage is resolved; remove its entry from `EquipmentReservation.slnx`, linked-fixture duplication and obsolete Aspire testing references/lockfile. Audit all automated test projects for equivalent AppHost/manifest checks, splitting mixed assertions before removal (FR-001/002/006).
- [x] T013 [US3] Coder simplifies `scripts/quality.mjs` to one `dotnet test tests/Backend.Tests/Backend.Tests.csproj --no-build -m:1` after existing build/frontend gates; remove obsolete two-suite async runner/unused imports, preserve nonzero failure propagation and existing unrelated tooling behavior. Validate with relevant `scripts/quality.test.mjs` checks and final check execution; no new scheduling work (FR-006/007/011).
- [x] T014 [US3] Coder updates `README.md`, `docs/engineering/testing.md`, `docs/engineering/aspire.md`, `docs/engineering/formatting-and-linting.md` and obsolete smoke-only wording in `AGENTS.md` where applicable: one backend integration suite, real provider prerequisites, no automated Aspire/publishing, documented manual local startup/dashboard/admin/access/loopback/persistence/ownership/cleanup observations with safe credential handling. Honor agent-document skill instructions if editing AGENTS.md; preserve unrelated browser gates and local capabilities (FR-008/009/010).
- [x] T015 [P] [US3] Analyst writes `specs/007-aspire-independent-tests/supersession.md` and appends prospective linked notices to each `spec.md`, `plan.md`, `tasks.md` under `specs/001-hello-world-skeleton/`, `specs/002-book-cancel-equipment/`, `specs/003-database-tracing/`, `specs/004-remove-hello/`, `specs/005-admin-consoles/`, `specs/006-identity-access/` (18 files). Identify exact superseded obligations, especially 005 FR-006/FR-011/SC-004 publishing support/assertions; preserve local manual guarantees and all retained 003 telemetry/006 provider contracts. Never change old status, task markers, hashes, acceptance or team reports; link new evidence without pretending old reviews cover it (FR-009).
- [x] T016 [US3] Coordinator executes/reviews manual local-development procedure in `specs/007-aspire-independent-tests/quickstart.md` using exact AppHost/session ownership and installed Aspire skills; record expected/actual startup/dashboard/client/admin/access/binding/persistence/cleanup observations in `team/manual-development-check.md`, preserving ordinary volumes/secrets and no manifest generation. Failed/unavailable observations remain explicit pending evidence (FR-008/010).

## Phase 6: Cross-cutting validation, review and acceptance

- [x] T017 Coder finalizes `specs/007-aspire-independent-tests/team/coverage-disposition.md` for all 40 baseline methods/all 108 cases and each mixed guarantee with final exact executable names and retained/redundant/Aspire-only/explicit-owner-removal rationale; record focused commands/results/snapshot in `team/implementation-evidence.md`. Verify runtime `src/` unchanged, serialization retained, no active retired/Aspire-testing references; resolve any unmapped guarantee before handoff (FR-001–011, SC-001/002/003).
- [x] T018 Coordinator arranges current-source `npm run format-check`, `npm run lint`, `npm run check`, `git diff --check` and applicable focused checks; capture environment/commands/exits/counts/no skipped prerequisites and frozen source/artifact manifest in `specs/007-aspire-independent-tests/team/validation.md`. Coder must already format/reread every edited source file before further reads/tests/edits. Fixes invalidate affected evidence; independent review starts only after required checks pass (FR-007/010/011/012).
- [x] T019 Coordinator freezes writes and obtains verifier/security independent implementation verdicts covering code, coverage equivalence, safe failure/provider contracts, manual boundary, supersession accuracy and unchanged concurrency/runtime scope; persist actual reviewer reports in `specs/007-aspire-independent-tests/team/` and findings/state. Reviewers validate their own finding closure; never infer pass from absence of findings (FR-012, SC-001–006).
- [x] T020 Coordinator executes `speckit-converge` after implementation on current `specs/007-aspire-independent-tests/tasks.md`, records latest no-gap evidence in `team/convergence.md`, and routes appended tasks/fixes through coder and affected checks/reviews without rewriting completed IDs/history (FR-012).
- [x] T021 Coordinator presents completed implementation, current validation/review/convergence outcomes and any explicit limitations for separate human acceptance; record the actual owner's decision/date in `specs/007-aspire-independent-tests/team/human-acceptance.md` only after it occurs. Leave this unchecked until final acceptance; pre-work scope confirmation is insufficient (FR-012).
- [x] T022 Coordinator performs completion-metadata inspection of `specs/007-aspire-independent-tests/spec.md`, `tasks.md` and `team/run-state.json`; after T021 acceptance is recorded, set exact Complete status/date and consistent state/task metadata as a metadata-only edit, preserving historical source/review snapshots and naming any gate still pending accurately. Do not report complete otherwise (FR-012).

## Dependencies and execution order

- Setup T001–T002 precedes foundation T003; T003 blocks test migrations.
- US1 T004–T008 runs in bounded coder sequence; T007 precedes broker-dependent T008.
- US2 T009 depends on migrated provider/delivery foundation; T010 depends on T009; T011 depends on T010. Full US1/US2 coverage must resolve before T012 deletes old project/tests.
- US3 T013 depends on T012; T014 follows confirmed final boundary T012–T013. T015 may proceed after foundation independently of coder files and must reconcile final replacement references after T017. T016 follows T014 and does not require automated AppHost tests.
- T017 requires T004–T015. T018 requires T016–T017 and all source/docs writes complete. T019 follows successful checks/freeze. T020 follows implementation and independent review; new gaps append tasks, trigger affected revalidation/reviews, then converge again. T021 requires T018–T020 pass/no gaps. T022 requires actual T021 acceptance.
- Coordinator obtains verifier `speckit-analyze` and security preparation confirmation on this tasks artifact before implementation begins; it is a preparation gate recorded in team state, not a self-approval task.

## Parallel work examples

- **US1**: coder migrates provider/delivery files while reviewers read the frozen baseline; no other worker edits those files. Tests remain serialized.
- **US2**: coder owns recovery fixture/tests as one bounded sequence; independent reviewers may inspect earlier frozen mapping read-only, but cannot approve changing source.
- **US3**: T015 analyst edits only central register/historical notices while coder performs T012–T014 in tests/scripts/guides. Neither edits the other's files; coordinator owns runtime/session operations and evidence.

## Implementation strategy and task accounting

The first independently useful increment is US1 migrated provider/delivery coverage (5 tasks); it cannot alone satisfy full feature completion. Add US2 durable recovery (3 tasks), then retire obsolete harness and complete US3 guidance/tooling/agreements/manual validation (5 tasks). Setup/foundation comprise 3 tasks; final validation/review/convergence/acceptance comprise 6 tasks: **22 total**. Existing behavior expectations are retained throughout refactoring; do not add product behavior to manufacture a red phase. Freeze final source before review. No merge/deploy/publish follows automatically.
