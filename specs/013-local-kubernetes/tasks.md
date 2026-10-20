# Tasks: Local Kubernetes and GitOps

Input: [spec](spec.md), [plan](plan.md), [research](research.md),
[data model](data-model.md), [runtime contract](contracts/runtime.md).
Tests are mandatory under constitution II and this feature's FR-017. Capture intended
red command/results before implementing every changed behavior. No item is complete
merely because a file exists. Coordinator records independent gates and evidence.

## Phase 1: Preparation

- [x] T001 Record exact baseline/host compatibility evidence and immutable image/action lock in specs/013-local-kubernetes/research.md (FR-001, FR-011); prove kind, host ingress TLS and pod canonical-host TLS without VM/trust changes.
- [x] T002 Materialize scoped owner-approved testing/OpenAPI guide amendments in docs/engineering/testing.md and docs/engineering/openapi.md; obtain independent exact-diff review before dependent code (FR-005, FR-017).
- [x] T003 Resolve exact deployment configuration/Dashboard option names and record independent design/security/checklist/analyze gates in specs/013-local-kubernetes/team/ (FR-001–FR-018); no dependent implementation until preparation verdicts pass.

## Phase 2: Foundation

- [x] T004 Add failing HTTP tests for configured deployment docs/callback prefixes and exact origin/forged headers in existing tests/Inventory.Tests/OpenApiTests.cs, tests/Reservations.Tests and tests/Notifications.Tests (FR-003–FR-005).
- [x] T005 Implement canonical production HTTPS origin/callback/docs options while retaining Development defaults in src/ApiDocumentation/ApiDocumentationExtensions.cs and src/Reservations/BrowserWriteGuard.cs; generated Servers and Scalar routes match contracts/runtime.md (FR-003–FR-005).
- [x] T006 Add failing provider/configuration tests for external issuer/internal admin endpoint and frontend HTTPS public config in tests/IdentityBootstrap.Tests and src/Web/auth-config.test.cjs (new focused config test beside existing module) (FR-003, FR-004, FR-006).
- [x] T007 Implement exact validated external issuer/WebRoot/docs registration, explicit internal admin endpoint and frontend config in src/IdentityBootstrap/IdentityProvisioning.cs, src/IdentityBootstrap/Program.cs and src/Web/auth-config.cjs; preserve PKCE, password retention and scoped authority (FR-003, FR-004, FR-006).
- [x] T008 Add failing real-provider bootstrap cases for fourth isolated Keycloak database/account and rerun password preservation in tests/DatabaseBootstrap.Tests (FR-006, FR-007, FR-016).
- [x] T009 Extend production database provisioning/configuration to Keycloak without weakening service isolation or silently rotating credentials in src/DatabaseBootstrap/DatabaseProvisioner.cs and src/DatabaseBootstrap/Program.cs (FR-006–FR-008, FR-016).
- [x] T010 Wire PostgreSQL-backed Keycloak through researched supported Aspire APIs in src/AppHost/Program.cs; preserve old identity volume, resource references and bootstrap ordering (FR-016).

## Phase 3: US1 — Complete local demo (P1)

Independent test: bounded fresh setup, actual login/business/docs behavior, diagnostic
failure/recovery, exact issuer TLS and no unrelated workload loss (AC-1.1–AC-1.4).

- [x] T011 [US1] Add failing production static/frontend proxy configuration tests in scripts/deployment-routing.test.mjs; assert allowed service paths, prefix handling and administrative/health denial (FR-002–FR-005, FR-014).
- [ ] T012 [US1] Add production Angular build/runtime proxy and nonroot container build definitions under deploy/images/ for APIs and bootstrap executables; use verified build/runtime digests, no secrets/layers, both Linux architectures (FR-001–FR-005, FR-012, FR-014).
- [x] T013 [US1] Add failing prerequisite/lifecycle public-interface tests in scripts/local-kubernetes.test.mjs for exact cluster ownership, missing tools/ports/resources/trust, finite failure and secret-free output (FR-001, FR-006, FR-018).
- [x] T014 [US1] Implement explicit prerequisite/setup/status interfaces in scripts/local-kubernetes.mjs and pinned kind/Traefik definitions under deploy/platform/; no VM/DNS/trust mutations, loopback published endpoints, canonical pod issuer DNS/CA (FR-001, FR-003, FR-004, FR-006).
- [x] T015 [US1] Create shared dependencies/services/bootstrap Jobs and resource/probe budgets in deploy/base/; reuse production provisioners/broker definition generation, four database scopes, wave ordering and bounded Job reruns/failure visibility (FR-001, FR-006, FR-014).
- [ ] T016 [US1] Create deploy/environments/local/ configuration with local DNS/trust/storage bindings and actual verified GHCR indexes; clear actionable prerequisite if initial release unavailable, no fabricated digests or local overrides (FR-001, FR-003–FR-006).
- [x] T017 [US1] Add failing separately invoked deployed HTTP smoke behaviors in scripts/deployment-smoke.test.mjs then implement scripts/deployment-smoke.mjs retaining real deployed identity/APIs/database/broker and bounded notification observations (FR-002, FR-006, FR-017).
- [ ] T018 [US1] Verify all service documents/Scalar callbacks/PKCE permitted write and denied operation, login/logout, dependency readiness/liveness recovery and complete-system resource measurements; record exact revision in specs/013-local-kubernetes/team/ (AC-1.1–AC-1.4).

## Phase 4: US2 — Persistence and safe recovery (P1)

Independent test: identifiable state survives ordinary lifecycle; missing credentials
stop safely; reset/teardown affect only explicitly requested environment (AC-2.1–AC-2.4).

- [x] T019 [US2] Add failing create-once private-file/missing-credential-state tests to scripts/local-kubernetes.test.mjs, including permissions and no replacement/secret output (FR-007, FR-008).
- [x] T020 [US2] Implement private ignored 0700 state/0600 bundle and pre-sync Secret provisioning in scripts/local-kubernetes.mjs and .gitignore; reject missing bundle with durable state and provide private recovery instructions (FR-007, FR-008).
- [x] T021 [US2] Configure local static Retain PVs/node affinity and explicit PVC binding in deploy/platform/ and deploy/environments/local/; protect PV/PVC Prune=false,Delete=false and platform namespace ownership (FR-007, FR-009).
- [x] T022 [US2] Add failing reconciliation/lifecycle destruction-scoping tests in scripts/local-kubernetes.test.mjs then implement distinct stop/reset/teardown guarded commands in scripts/local-kubernetes.mjs (FR-009, FR-010).
- [x] T023 [US2] Add Argo Application/AppProject ownership, no cascading finalizer, constrained repository/destination and self-heal configuration in deploy/argocd/local.yaml; ensure stop/reset cannot race reconciliation (FR-009, FR-010, FR-013).
- [ ] T024 [US2] Execute repeat setup, pod replacement, normal update, missing bundle and deletion/prune safety scenarios in scripts/deployment-smoke.mjs; record state/no duplicate/password-retention evidence in specs/013-local-kubernetes/team/ (AC-2.1–AC-2.3).
- [ ] T025 [US2] Record owner-executed VM restart persistence and explicit disposable reset/teardown then fresh setup in specs/013-local-kubernetes/team/; never modify/restart existing VM automatically (AC-2.1, AC-2.4).

## Phase 5: US3 — Reviewed immutable release (P2)

Independent test: fork PR cannot publish; real approved release yields both architectures,
reviewable narrow promotion, no lost concurrent edits or deployment-only loop (AC-3.1–AC-3.3).

- [x] T026 [US3] Add failing manifest policy/change-classification/promotion CAS tests in scripts/deployment-validation.test.mjs and scripts/promote-images.test.mjs (FR-011–FR-013).
- [x] T027 [US3] Implement manifest/schema/image-index validation and public promotion logic in scripts/deployment-validation.mjs and scripts/promote-images.mjs; update only local digests/provenance, reject changed promotion head and handle existing PR (FR-011–FR-013).
- [x] T028 [US3] Add fork-safe least-privilege pinned-action PR workflow including existing required checks and ephemeral kind deployment smoke in .github/workflows/validate.yaml; no publish credentials or pull_request_target execution (FR-011, FR-017).
- [x] T029 [US3] Add tested main application-change multiarch GHCR publication and separate minimal-permission promotion job in .github/workflows/release.yaml; serialize/CAS updates and exclude deploy/docs-only changes (FR-012, FR-013).
- [x] T030 [US3] Document first-publication/package/PR permission and account settings requirements in specs/013-local-kubernetes/quickstart.md; no settings change/push/publication implied (FR-018).
- [ ] T031 [US3] With separate explicit authorization, verify real published indexes, reviewed digest promotion, merged Argo adoption/drift correction and no deploy-only publication loop; retain exact source/digest/runner evidence in specs/013-local-kubernetes/team/ (AC-3.1–AC-3.3).

## Phase 6: US4 — Secure diagnosis and Aspire (P2)

Independent test: authenticated temporary diagnostics show correlated safe success/failure,
existing Aspire login/docs/telemetry work with new identity database (AC-4.1–AC-4.3).

- [x] T032 [US4] Add failing telemetry authentication/privacy/limits deployment checks in scripts/deployment-smoke.mjs and focused existing tests/Integration.Tests where production registration changes (FR-015).
- [x] T033 [US4] Configure standalone Dashboard BrowserToken, distinct OTLP/API keys, exact bounded count/memory/ephemeral-disk limits and production OTLP exporters under deploy/base/ and deploy/environments/local/ (FR-015).
- [x] T034 [US4] Implement loopback-only authenticated Argo/Dashboard access in scripts/local-kubernetes.mjs, suppress token-bearing startup URLs and document private credential entry in specs/013-local-kubernetes/quickstart.md (FR-014, FR-015, FR-018).
- [ ] T035 [US4] Inspect actual successful/failed SQL, broker, identity/bootstrap traces/logs/metrics, rejection of unauthenticated OTLP/UI access and resource limits in specs/013-local-kubernetes/team/; no forbidden fields or high-cardinality metrics (AC-4.1, AC-4.2).
- [x] T036 [US4] Manually validate isolated Aspire PostgreSQL-Keycloak startup/login/docs/telemetry and old-volume retention through project-local Aspire lifecycle skills; record evidence in specs/013-local-kubernetes/team/ (AC-4.3).

## Phase 7: Handoff and cross-cutting verification

- [x] T037 Complete executable operational quickstart/failure diagnosis/state/rollback/reset/trust and deferred Azure documentation in specs/013-local-kubernetes/quickstart.md and README.md (FR-018).
- [ ] T038 Run npm run format-check, npm run lint, npm run check with Podman and all new manifest/deployed checks; inspect all applicable standards and record revision/environment/exit/evidence in specs/013-local-kubernetes/team/ (SC-007).
- [ ] T039 Obtain independent final quality/security verdicts and run convergence after implementation; repair through targeted tasks while preserving IDs/history in specs/013-local-kubernetes/tasks.md and team/ (SC-007).
- [ ] T040 Record explicit human acceptance and reconcile spec/tasks/team completion metadata under protocol; pending external/local checks remain pending in specs/013-local-kubernetes/spec.md and team/ (SC-007).

## Dependencies and execution strategy

T001–T003 block all dependent code. T004 precedes T005; T006 precedes T007;
T008 precedes T009; T009 precedes T010. T011 precedes T012; T013 precedes T014;
T014/T012/Foundation precede T015–T018. US2 extends US1 lifecycle and US3 consumes
US1 images/US2 ownership; US4 consumes foundation and US1 real deployment. T019
precedes T020, T021 precedes T023, T022 precedes destructive operation implementation.
T026 precedes T027–T029; T032 precedes T033. T037–T040 follow all required story checks.
No task grants external publication, trust install, VM change or human acceptance.

US1 defines the first user-facing demonstration, but a complete running demo depends
on shared safety and operational work from US2–US4; US1 alone is not a standalone
implementation delivery. Scaffolding/build/test-first work T011–T015 and structural
T016/T017 preparation may proceed after foundation. Actual setup/synchronization,
runtime T016/T017 and acceptance T018 are blocked until T020 (private create-once
Secrets), T021 (Retain PVs), T023 (safe Argo ownership), T033 (authenticated bounded
Dashboard), and genuine first published GHCR indexes exist. Publication definitions
T029 and permissions T030 must exist before authorized first publication; the
first-publication portion of T031 supplies real image prerequisites. Remaining T031
release-update/drift evidence follows a running demo, so it does not create a circular
setup dependency. No runtime smoke may substitute placeholders or skip those protections.
T024, T025, T031 and T035 consume this fully integrated runtime. All four stories remain
required for requested delivery. Parallel opportunities are review-only or disjoint files only after
inputs freeze: image definitions versus lifecycle tests; manifest validation versus
promotion unit tests; actual quality/security reviews. A single coder must serialize
shared lifecycle/manifest edits. No [P] tasks are marked while these file dependencies
are unresolved; coordinator may assign disjoint bounded ownership after design freeze.

## Format and coverage

40 stable tasks: preparation 3, foundation 7, US1 8, US2 7, US3 6, US4 5,
handoff 4. All FR-001–FR-018 and AC-1.1–AC-4.3 have implementation/evidence tasks.
Unchecked acceptance/external/human tasks cannot be checked from generated files alone.

## Phase 8: Convergence

- [x] T041 Complete the missing deployed telemetry inspection from T032 in scripts/deployment-smoke.mjs and its public-interface tests: verify actual successful/controlled-failure span/log correlation, privacy and reported metric availability through the pinned Dashboard API with finite response/poll limits; retain detailed metric-dimension and retention-pressure inspection under T035, per FR-015, SC-005 and plan: telemetry validation (partial).
