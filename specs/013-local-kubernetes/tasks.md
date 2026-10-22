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

Original 40 tasks: preparation 3, foundation 7, US1 8, US2 7, US3 6, US4 5,
handoff 4; T041 preserves the earlier convergence history. T042–T050 append the
owner-approved diagnostics batch. All FR-001–FR-021 and AC-1.1–AC-4.6 have
implementation/evidence tasks across 50 stable IDs.
Unchecked acceptance/external/human tasks cannot be checked from generated files alone.

## Phase 8: Convergence

- [x] T041 Complete the missing deployed telemetry inspection from T032 in scripts/deployment-smoke.mjs and its public-interface tests: verify actual successful/controlled-failure span/log correlation, privacy and reported metric availability through the pinned Dashboard API with finite response/poll limits; retain detailed metric-dimension and retention-pressure inspection under T035, per FR-015, SC-005 and plan: telemetry validation (partial).

## Phase 9: US4 — Whole-script diagnostics amendment (2026-10-21)

Goal: every repository script/test helper has an explicit operation assessment and
preserves useful safe output. Independent test: real public process/CLI outcomes
prove both-stream visibility, safe capture/failure categories, privacy and both
cleanup result combinations (AC-4.4–AC-4.6; SC-008–SC-009).

- [x] T042 [US4] Obtain independent preparation quality/security verdicts for FR-019–FR-021, docs/engineering/tooling.md and its index row, plan.md and team/diagnostics-design.md; record explicit gates in specs/013-local-kubernetes/team/ before dependent code.
- [ ] T043 [US4] Add failing real-process regression tests in scripts/process.test.mjs for public stdout/stderr streaming before exit, machine capture, both bounded 4000-character tails/truncation, exit/spawn/timeout/output-limit/termination categories, and private marker exclusion from all displayed/serialized failures; retain red commands/results in specs/013-local-kubernetes/team/ (FR-019, FR-020).
- [ ] T044 [US4] Implement minimal classified synchronous execution and safe failure rendering in scripts/process.mjs per team/diagnostics-design.md, with fixed safe labels, validated tool/status/signal/category/duration, private default, separate public tails, finite capture budgets and no raw error causes/log persistence (FR-019, FR-020).
- [ ] T045 [US4] Extend scripts/deployment-ci.test.mjs, scripts/local-kubernetes.test.mjs and scripts/deployment-smoke.test.mjs with failing public CLI regressions using real process execution/provider executable shims for ordinary both-stream progress, safe captured failures and HTTP phase/status projections, private markers and forward spawn/exit/shutdown behavior; retain real runner/outer catches and red evidence in specs/013-local-kubernetes/team/ (FR-019, FR-020).
- [ ] T046 [US4] Apply per-operation policies in scripts/deployment-ci.mjs, scripts/local-kubernetes.mjs and scripts/deployment-smoke.mjs; retain machine parsing, allowlisted Job diagnostics, private credential/TLS/apply/auth flows and all publication/ownership guards; expose safe live-forward lifecycle failures and actionable smoke phases (FR-019, FR-020).
- [ ] T047 [US4] Add failing regression cases then repair cleanup and output handling across scripts/deployment-routing.test.mjs, scripts/deployment-ingress.test.mjs, scripts/deployment-dashboard.test.mjs, scripts/deployment-broker-retention.test.mjs, scripts/deployment-database-bootstrap.test.mjs, scripts/deployment-config-rollout-live.mjs and affected lifecycle/CI code: attempt every owned cleanup, fail primary success on cleanup failure, preserve primary failure with separate safe cleanup diagnostics; retain red/green evidence in specs/013-local-kubernetes/team/ (FR-019–FR-021).
- [ ] T048 [US4] Complete every remaining inventory row in specs/013-local-kubernetes/team/diagnostics-design.md against all scripts/*.mjs, including quality/npm, promotion, validation, OpenAPI, diagnostics, browser workflow, contract/config tests and their helpers; add failing regressions before behavior repairs, preserve sound paths with call-site evidence, and remove unsafe raw error echoes without losing safe categories (FR-019, FR-020, SC-008).
- [ ] T049 [US4] Run revision-matched real-process/CLI and changed live-provider suites, npm run format-check, npm run lint, npm run check and required deployment checks; record Windows limitations and real POSIX signal/provider evidence or pending prerequisites in specs/013-local-kubernetes/team/diagnostics-verification.md; inspect privacy classifications and safe both-stream/cleanup output manually (FR-019–FR-021, SC-008, SC-009).
- [ ] T050 [US4] Obtain independent quality/security reviews and coordinator convergence for this batch in specs/013-local-kubernetes/team/; retain prior reports, bounded repair counts and pending T018/T024/T025/T031/T035/T038–T040 acceptance gates; no feature completion, commit, push or workflow trigger follows automatically (SC-007–SC-009).

Dependencies: T042 blocks T043–T048. T043 precedes T044; T044 and T045 precede
T046. T047 tests precede each cleanup repair. T048 tests precede each remaining
behavior repair. T049 follows all implementation; T050 follows fresh checks and
freezes the reviewed snapshot. T043/T045 may proceed in parallel only under disjoint
test ownership; T046/T047 share code and must serialize or receive explicit file
ownership. T048 may run alongside other repairs only for disjoint files. No blanket
[P] marker promises shared-file independence. This bounded batch improves US4
diagnostics but does not replace the complete local demo or external release gates.

## Phase 10: Convergence

- [x] T051 CRITICAL Resolve DQ-P001 through an explicit human-owner scoped test-first exception or keep affected gates pending: identify the six contracts in team/findings.json, rationale, owner and date; retain current regression coverage and have the original quality reviewer validate closure without reconstructing historical red evidence, per Constitution II and T043/T045/T048 (contradicts).
- [ ] T052 Complete remaining revision-matched Kubernetes/provider qualification with pinned kubectl/kind/OpenSSL in a compatible environment, run the full deployment suite including CI fixture/config/ingress/database contracts, retain diagnostics and fix any demonstrated failure through test-first implementation; update team/diagnostics-verification.md and re-review evidence without treating unavailable prerequisites as passes, per FR-017/FR-019–FR-021, SC-007–SC-009 and T049/T050 (partial).
- [ ] T053 Complete the retained full-feature release/local/runtime/acceptance obligations from T012/T016/T018/T024/T025/T031/T035/T038–T040 with real immutable published indexes, approved promotion/adoption, supported-host trust/persistence/recovery and deployed telemetry evidence, final reviews/convergence and explicit human acceptance; external actions and VM/trust/destruction require their existing separate authorization, per FR-001–FR-018 and SC-001–SC-007 (partial).

## Phase 11: US3 — Manual publication from repository branches

Independent test: the public publication CLI and parsed workflow/real Bash changes
step establish AC-3.4/SC-010 without contacting GHCR or creating a promotion PR.

- [x] T054 [US3] Obtain independent preparation quality/security verdicts for the FR-012/AC-3.4/SC-010 amendment, plan.md, quickstart.md and team/branch-release-design.md in specs/013-local-kubernetes/team/; preserve prior diagnostics findings and pending acceptance gates.
- [x] T055 [US3] Extend existing public publication CLI event/ref matrix in scripts/deployment-ci.test.mjs and workflow/real Bash changes-step checks in scripts/deployment-validation.test.mjs; retain failing manual feature/nested-branch evidence, block unsupported events/refs before Docker, verify main-only promotion/global concurrency/least permissions and exact source provenance, per team/branch-release-design.md (FR-012, SC-010).
- [x] T056 [US3] Implement matching event/ref eligibility in .github/workflows/release.yaml and scripts/deployment-ci.mjs: manual nonempty refs/heads branches, automatic main push only, explicit main-only promotion, unchanged global serialized concurrency, validation, dual-platform SHA publication and permission boundaries (FR-011–FR-013, AC-3.4).
- [x] T057 [US3] Run affected publication/workflow/Bash suites, npm run format-check, npm run lint and applicable required checks; inspect quickstart behavior against code and record tested snapshot/environment/exit statuses and unavailable checks in specs/013-local-kubernetes/team/branch-release-verification.md without triggering remote publication (SC-010).
- [x] T058 [US3] Obtain independent quality/security reviews and coordinator convergence for branch publication in specs/013-local-kubernetes/team/; retain earlier incomplete tasks, separate external-action authorization and explicit human acceptance requirements (SC-007, SC-010).

T054 blocks T055; intended red evidence from T055 precedes T056. T057 follows
implementation and T058 follows fresh verification/frozen review. Shared workflow/CLI
ownership serializes these tasks. No historical task checkbox or bounded repair count
is reset by this appended batch; its implementation is not full-feature acceptance.

- [x] T059 [US3] Retire owner-identified temporary diagnostic plumbing from commit 623bfaf through targeted edits in .github/workflows/validate.yaml, scripts/deployment-ci.mjs, scripts/deployment-ci.test.mjs and scripts/deployment-validation.test.mjs: capture failing job-absence/retired-CLI rejection tests first, remove image-build-diagnostics plus diagnostic-only builder option/diagnose-build route, retain normal build metadata/cleanup coverage and overlapping safe-output/manual-branch release changes; record checks and include the combined snapshot in final review under specs/013-local-kubernetes/team/ (owner follow-up 2026-10-22; no new product SC).

T059 shares T055/T056 files and executes serially under coder ownership before final
T057/T058 verification/review. Preserve all historical task markers and evidence.

## Phase 12: US3 — Independent component pipelines (2026-10-22)

This current amendment supersedes conflicting combined-release/main-only promotion
implementation instructions in historical tasks; their IDs/status/evidence remain.
Independent tests: quality-gated PR/main/manual selection, failed-component recovery,
same-run reruns and independent partial-state/stale/no-op promotion (SC-010–SC-012).
Exact file ownership/interfaces: team/component-pipelines-design.md.

- [x] T060 [US3] Obtain independent preparation quality/security verdicts for current spec/plan/tasks and specs/013-local-kubernetes/team/component-pipelines-design.md, including readonly PR/common-core graph, trusted wrapper permissions, baseline evidence, rerun intent and independent promotion; coordinator records frozen snapshot before code (FR-011, FR-022–FR-024).
- [x] T061 [US3] Owner B adds failing component schema/partial-state/own-bootstrap-hash and complete-runtime prerequisite cases in scripts/deployment-validation.test.mjs and scripts/local-kubernetes.test.mjs, then implements validateComponentRelease/readComponentState/verifyComponentIndex in scripts/deployment-validation.mjs and partial-state guards in scripts/local-kubernetes.mjs; use deploy/environments/local/releases/NAME.json, retain genuine source provenance and reject missing runtime components before mutation (FR-012, FR-024).
- [x] T062 [US3] Owner A adds failing real temporary-Git impact/baseline tests in scripts/component-selection.test.mjs before implementing catalog/selectComponents and bounded baseline discovery in scripts/component-pipelines.mjs; include transitive API/bootstrap references, locks/ignore/global/pipeline inputs, rename/deletion, PR merge-base, failed publication followed by docs/deployment-only changes, unknown impact, absent/expired/force-push baseline and empty selection (FR-022, SC-011).
- [x] T063 [US3] Owner A adds failing run/artifact/intent tests in scripts/component-selection.test.mjs before implementing validateRunIntent/validatePublicationEvidence and public CLI evidence reuse in scripts/component-pipelines.mjs; verify exact component/repository/ref/SHA/run/attempt/producer-job, success inside failed parent, bounded fixed-member ZIP, captured expected target/proposal, retained same-run results and missing-artifact fresh-run failure (FR-023, SC-012).
- [x] T064 [US3] Owner B adds failing public promotion/transport regressions in scripts/promote-images.test.mjs before adapting scripts/promote-images.mjs to component-specific managed branches/PRs and fresh exact-parent patches: first partial component, unchanged-digest no-op preserving deployed provenance, divergent manual source, newer same-lineage rejection, changed expected target/proposal, unrelated main advance/component preservation, human-edit rejection and non-force CAS; update only selected record/image and own bootstrap suffix (FR-012, FR-024).
- [x] T065 [US3] Owner C adds failing public single-component CLI and workflow/real Bash regressions in scripts/deployment-ci.test.mjs and scripts/component-workflows.test.mjs: both-platform PR no-push, main affected/manual all, seven independent wrapper outcomes, readonly fork permissions, required always summary, missing rerun artifacts and no sibling barrier; retain intended red evidence before dependent changes (FR-011–FR-012, FR-023).
- [x] T066 [US3] Owner C implements single-component build/publication result in scripts/deployment-ci.mjs; replace duplicate release entrypoint with .github/workflows/validate.yaml parent, seven component-NAME.yaml trusted build/promote wrappers and component-build.yaml common core; quality once, readonly PR direct calls, least-permission trusted jobs, own-component dependencies, per-component results, promotion-only global serialization and final always summary; pin new actions by verified official SHA (FR-011–FR-012, FR-023).
- [x] T067 [US3] Architect updates specs/013-local-kubernetes/quickstart.md and contracts/runtime.md for independent records/partial initial state, own-source promotion, baseline/retry/rerun limits and explicit merge boundary; coordinator registers new focused suites in package.json without editing worker-owned modules; preserve all prior pending local/runtime/human obligations (FR-018, FR-022–FR-024).
- [ ] T068 [US3] Run focused public CLI/Git/HTTP/artifact/workflow suites and pinned actionlint or equivalent reusable-workflow semantic validation, npm run format-check, npm run lint, npm run check and applicable deployment checks; record source snapshot/environment/exits/provider fidelity and unavailable prerequisites in specs/013-local-kubernetes/team/component-pipelines-verification.md; inspect impact/privacy/trust/CAS manually (SC-010–SC-012).
- [x] T069 [US3] Obtain independent final quality/security verdicts and coordinator convergence on the combined component implementation in specs/013-local-kubernetes/team/; preserve earlier findings/rounds/tasks and all pending authorized live-release/local/runtime/human acceptance gates; do not commit, push or run remote workflows automatically (SC-007, SC-010–SC-012).

Dependencies/ownership: T060 blocks dependent code. T061 record schema precedes
dependent A/C schema consumption. T062/T063 share A's files and serialize; T064
consumes A's frozen intent schema and B's state seam. T065 may proceed in parallel
with B/A after public interfaces freeze; T066 consumes their schemas/CLI outputs.
T061/T064 share B files and serialize. T067 docs/check-registration can run alongside
disjoint source work. T068 follows integration; T069 freezes fresh checked source.
Each mixed test/implementation task requires intended red before its implementation,
not one red test for all contracts. A/B/C must not edit each other's owned files.
This increment delivers component pipelines, not full feature acceptance.

CP-S001 targeted preparation repair binds T065/T066/T068: assert and implement
`queue: max` with `cancel-in-progress: false` on every globally serialized promotion
job. Cover all seven queued siblings and canceled/missing selected promotion outcomes
as required-summary failure; overflow beyond GitHub's 100 pending limit must remain
visible with recovery guidance. Use a schema validator supporting the current queue
property or record incompatible tooling as pending; retain intent/CAS freshness guards.

Rerun clarification for T063/T065: later-attempt missing/expired component result
requires fresh dispatch when an earlier exact producer job succeeded. If every prior
producer failed/canceled or did not reach the build, result absence is legitimate:
available=false permits rebuilding that component. Verify producer history, not just
artifact absence. Original intent remains mandatory on all later attempts. Capture
intended red/green evidence for both branches; this clarifies retained-success Q9,
not a new product requirement or exception.

Retained-selection clarification for T063/T065/T066: original run intent includes
top-level selected (catalog-ordered unique known component names; empty allowed).
First attempt selects then captures selected/target intent once after quality; later
attempts load original intent before emitting its exact selection, without querying
newer baselines to recalculate it. Add intended-red regression for full rerun after
successful publication/failed promotion remaining selected and reusing its result
to retry promotion, plus malformed/absent intent and retained-empty selection cases.

## Phase 13: Convergence

- [ ] T070 [US3] Complete current component-pipeline qualification on the reviewed source: use an adequate queue-aware workflow semantic validator without removing queue:max, restore access to the existing container API and run the full required application check, and run applicable pinned Kubernetes/provider checks through retained T052; record exact revision/environment/results and obtain independent evidence review in team/component-pipelines-verification.md. Keep unavailable checks pending and preserve separate authorization for hosted publication/promotion/workflow execution and T053 human/runtime acceptance, per SC-007/SC-010–SC-012, plan component verification and T068 (partial).

## Phase 14: US3 — Generated formatting and scoped manifest quality

Current FR-011, AC-3.8/AC-3.9 and SC-013 permit scoped static quality on proven
allowlisted PR/main metadata changes; manual and unproven/mixed changes remain full.
Main publication selection/failed-component retry obligations remain unchanged.

- [x] T071 [US3] Record coordinator-owned generated-formatting regression and repair evidence for scripts/promote-images.mjs and scripts/promote-images.test.mjs in specs/013-local-kubernetes/team/manifest-quality-verification.md: actual Prettier red before block-YAML/newline splice fix, all seven successive component outputs and retained legacy formatting green; preserve synchronous API, field allowlists/provenance/CAS and inspect independent review (existing formatting requirement, SC-013).
- [x] T072 [US3] Obtain independent preparation quality/security verdicts for current spec/plan/tasks and specs/013-local-kubernetes/team/manifest-quality-design.md, freezing exact path allowlist, main full-quality ancestor proof, partial-state static boundary and unchanged required quality/summary graph before new classifier/workflow code (FR-011, SC-013).
- [x] T073 [US3] Add failing real-Git/public-CLI and narrow Actions HTTP regressions in scripts/manifest-quality.test.mjs before implementing scripts/manifest-quality.mjs selection/baseline seams: allowlisted PR/main, mixed/unknown/rename/delete/history uncertainty, exact trusted successful full-quality ancestor, prior failed source plus later metadata merge, static-success not advancing full baseline, API budget/provenance failures and manual always full (AC-3.8, AC-3.9).
- [x] T074 [US3] Add failing static partial/complete/unreleased and real pinned-Kustomize generator regressions in scripts/manifest-quality.test.mjs and affected scripts/deployment-validation.test.mjs before implementing explicit static policy/context in scripts/manifest-quality.mjs and scripts/deployment-validation.mjs: only validated missing known aliases allowed, present records exact, immutable third-party images, existing Secret/storage/resource policies unchanged, runtime incompleteness still fails; no invented digest or provider/readiness claim (AC-3.8, SC-013).
- [x] T075 [US3] Add failing workflow/real-shell regressions in scripts/component-workflows.test.mjs before adapting .github/workflows/validate.yaml quality steps: exact required job/needs, safe classification outputs, scoped root-only format/committed/render/policy lane, checksum-pinned kubectl, no application build/tests/runtime/image calls in static lane, full lane and trusted full-quality completion marker, manual full, required summary mode and failure propagation (FR-011, AC-3.9).
- [x] T076 [US3] Run focused generator/real-Git/Actions/static/Kustomize/workflow regressions, formatting/lint and applicable full implementation checks; inspect scope/provenance/partial-state boundaries, report command/environment/revision/exits and unavailable prerequisites in specs/013-local-kubernetes/team/manifest-quality-verification.md; no hosted workflow or external publication is authorized (SC-013).
- [x] T077 [US3] Obtain independent quality/security verdicts and coordinator convergence on generated-format repair plus scoped quality gate in specs/013-local-kubernetes/team/; preserve T070 and all earlier pending full-feature/local/provider/human acceptance obligations and historical exceptions (SC-007, SC-013).

T071 existing-defect repair is independent of new gate preparation and retains its
own test-first evidence. T072 blocks T073–T075 new behavior. Assign explicit helper,
validator and workflow file ownership before edits; T073/T074 share helper/tests and
serialize, while independent workflow red tests may proceed against frozen interfaces.
Every behavior's intended red precedes its repair; T076 follows integrated changes,
T077 follows fresh checked snapshot. No old task status or repair counter is reset.

## Phase 15: Convergence

- [ ] T078 [US3] Qualify the current manifest-quality workflow snapshot with an adequate queue-aware workflow semantic validator, without stripping or weakening retained concurrency settings; record source-matched results and independent evidence review in team/manifest-quality-verification.md. Coordinate with retained T070, preserve T052/T053 and all full-feature runtime/human acceptance gates; limited stripped-copy actionlint is not full validation (SC-007, SC-013, plan: applicable quality branches; partial).

## Phase 16: Backend stability follow-up

- [x] T079 Record the whole-tree backend stability audit and clarify lifecycle/readiness, admission, cleanup and verification guidance in docs/engineering/testing.md; retain evidence and unresolved findings in team/backend-test-stability-audit.md. No scheduling or acceptance waiver.
- [ ] T080 Qualify the delivery-fixture restart AMQP readiness repair on PR #15 CI at the pushed revision. Retain the existing failing real-provider regression and normal full concurrency; investigate subsequent actual failures rather than treating reruns as repair evidence. Track BTS-001 through BTS-005 separately and preserve T070/T078 and feature acceptance gates.
