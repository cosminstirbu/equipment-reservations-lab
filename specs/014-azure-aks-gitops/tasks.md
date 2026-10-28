# Tasks: Azure AKS GitOps learning environment

**Input**: [spec](spec.md), [plan](plan.md), [research](research.md),
[data model](data-model.md), [operations contract](contracts/operations.md),
[validation guide](quickstart.md). Design baseline independently passed preparation
reviews; this task list requires analyze/security review before implementation.

Tests are mandatory for changed behavior under the constitution and SC-005. Each
test-first task records intended red before its dependent implementation. Real
process/helper collaborators remain real; provider fixtures establish only their
stated boundary, never live Azure acceptance. Only actual success checks a task.

## Phase 1: Setup

Execution now follows the owner-approved [milestone checkpoints](milestones.md).
Task IDs and historical evidence are preserved; shared tasks are delivered in
slices and remain unchecked until all their requirements have evidence. Use current
verification profiles when planning new changes; any change to an explicit existing
task acceptance requirement must be identified and agreed before dependent work.

- [X] T001 Record pinned Terraform 1.17.0, TFLint 0.65.0/AzureRM rules 0.33.0, Trivy 0.76.1, kubectl 1.35.8, providers, official artifact checksums/platforms and immutable security-policy digest in infra/azure/tools.lock.json; use existing private .cache downloads only after verification.
- [X] T002 [P] Add safe nonfunctional configuration examples and source/output ignore paths in infra/azure/examples/environment.json and .gitignore; actual IDs/CIDRs/ACME decisions remain validated private inputs, never usable sample defaults.
- [X] T003 [P] Record CLI/process/provider test design, source-output classifications and exact planned red commands in specs/014-azure-aks-gitops/team/implementation-evidence.md, preserving reviewed plan hashes and existing test-boundary contracts.

## Phase 2: Foundational prerequisites

- [ ] T004 Write failing public quality-CLI/actual tool fixture tests in scripts/azure-quality.test.mjs for invalid format/configuration/Azure lint/security, immutable policy selection, missing scanner/policy failure and private error leakage; record red before T005.
- [ ] T005 Implement identical local/CI fmt-check, backend-free init/validate per root, TFLint Azure rules and offline pinned-policy Trivy gates plus explicit local formatter in scripts/azure-quality.mjs, infra/azure/.tflint.hcl, infra/azure/trivy.yaml and package.json; every enabled finding/scanner error blocks without approved scoped exception.
- [ ] T006 Write failing public configuration/cost/plan command tests in scripts/azure-infrastructure.test.mjs for required taxRate, fixed EUR120 tax-inclusive gate, unsupported region/SKU/patch, private output, stale plan/revision/input/state lineage/serial and expired approval; deterministic parsers retain real implementation boundaries.
- [ ] T007 Implement strict private configuration and read-only Azure capability/quota/identity/current retail BOM preflight in scripts/azure-infrastructure.mjs; show running/stopped pre-tax and actual tax-inclusive EUR costs for 40 hours, no credits, and fail before paid resources if billed estimate exceeds fixed120 or tax/prerequisites are unknown.
- [ ] T008 Write failing public lease and cleanup contract tests in scripts/azure-operations.test.mjs for operation serialization across local/workflows, admission maximum 30 minutes, independent five-minute reaper, abrupt owner death, unrelated range preservation, reaper failure and residual access blocking subsequent mutation.
- [ ] T009 Implement private Blob global operation leases, baseline authorized-IP reconciliation and bounded post-Terraform runner /32 admission/cleanup in scripts/azure-operations.mjs; enforce “No admission during TF; unexplained baseline drift blocks,” with honest best-effort expiry and safe primary-plus-cleanup failures.
- [ ] T010 Add Terraform native/mock-provider resource contract tests in infra/azure/foundation/tests/foundation.tftest.hcl and infra/azure/environment/tests/environment.tftest.hcl before resource implementation, covering retained boundaries, secret-free state design, scoped grants, workload security and supported node/storage inputs.
- [ ] T011 Implement retained foundation root in infra/azure/foundation/ including deny-default state/recovery Storage and recovery vault with persistent operator CIDRs, state/versioning/locking, DNS zone, recovery Blob/versioned RSA key, workload RG shell and separate constrained identities; no app secret-value resources, shared-key auth disabled even if provider returns computed key fields in protected state.
- [ ] T012 Implement environment root in infra/azure/environment/ for two Standard_D4s_v5 system nodes, AKS Free/Ubuntu/Overlay-Cilium/Entra/API CIDRs, explicit Managed64Gi OS disks budgeted at Premium P6, Standard SSD PVC policy/LB/IPs, ACR Basic, generation vault, per-service Workload Identities and scoped roles; provider cannot force Standard SSD OS tier, actual BOM including supplied tax must not exceed fixed120 before paid provision; consume retained RG and commit exact provider lockfile.
- [ ] T013 Implement private Terraform saved-plan/security scan/review projection/apply and safe backend bootstrap/migration in scripts/azure-infrastructure.mjs; require immutable SHA/input-policy hashes/state lineage-serial/expiry association, no silent replan, no plans/state in public logs/artifacts and no Kubernetes provider startup dependency.

## Phase 3: US1 - Secure application hosting (P1, MVP)

**Goal**: Existing application works on trusted browser endpoints with private dependencies.
**Independent test**: Fresh local provision passes HTTPS/login, six deployed journeys,
private-endpoint denial and pod-replacement persistence (US1-A1–A4).

- [ ] T014 [US1] Write failing rendered Azure manifest/provider boundary tests in scripts/azure-deployment.test.mjs for host/TLS/path exposure, per-workload secret authorization, distinct probes, security/resource budgets, Azure storage and unchanged local overlay before T015–T019.
- [ ] T015 [US1] Build separate app Kustomize overlay in deploy/environments/azure/ reusing deploy/base, exact images/digest patches and bootstrap Job identities/order; reference committed reviewed runtime/ configuration generated from allowlisted Terraform outputs, reject stale generation/output hash and placeholders before bootstrap, patch four hosts/trust/per-workload Secrets without changing local behavior.
- [ ] T016 [US1] Implement Azure Standard SSD Retain StorageClass/PVC patches, deny-default network paths and workload runtime/probe budgets in deploy/platform/azure/ and deploy/environments/azure/; do not expose DB, RabbitMQ management, identity admin or OTLP endpoints.
- [ ] T017 [US1] Implement per-service/bootstrap ServiceAccounts and scoped SecretProviderClasses in deploy/platform/azure/secrets/ plus private post-Terraform secret generation/rotation in scripts/azure-infrastructure.mjs; no app values in Terraform or secret CLI arguments, verify reload/restart contract.
- [ ] T018 [US1] Implement pinned Traefik public LoadBalancer/Ingress routes, exact client-IP trust and same-namespace operator IPAllowList CRDs in deploy/platform/azure/ingress/; use externalTrafficPolicy=Local, trusted443, redirect-only80, safe logs and public realm/assets-only Keycloak paths.
- [ ] T019 [US1] Implement pinned cert-manager DNS-01 Workload Identity, staging/trusted issuers and four-host certificates in deploy/platform/azure/certificates/; require real delegation/owner ACME terms/contact, preserve account/cert recovery state, never disable certificate verification.
- [ ] T020 [US1] Implement verified pinned Argo bootstrap and restrictive Azure AppProjects/initial Applications in scripts/azure-infrastructure.mjs and deploy/argocd/azure/; installer solely owns Argo installation and Argo solely owns downstream resources, with PVC/critical resource deletion protection.
- [ ] T021 [US1] Extend existing deployed configuration/private diagnostic-forward tooling in scripts/deployed-test-config.mjs and scripts/azure-operations.mjs only where needed, test-first in scripts/deployed-tests.test.mjs; retain six HTTP-only cases and no invented Dashboard APIs.
- [ ] T022 [US1] Run owner-assisted local provision and actual DNS/HTTPS/login/deployed/negative-network/secret-rotation/pod-replacement checks, recording exact revision and safe evidence in specs/014-azure-aks-gitops/team/local-acceptance.md; missing prerequisites remain pending.

## Phase 4: US2 - Approved reproducible infrastructure pipeline (P1)

**Goal**: Review/check/apply from immutable revision using OIDC, then recreate locally
validated workload through workflow after safe teardown.
**Independent test**: PR checks/no apply, protected approved apply, rejected unauthorized
destroy, fresh hosted recreation (US2-A1–A5). Final teardown depends on US5 verified backup.

- [ ] T023 [US2] Write failing parsed-workflow/public command tests in scripts/azure-workflows.test.mjs for fork privilege denial, exact reviewed revision/plan, no public plans/state, approval, concurrency, wrong destroy confirmation and trusted runner cleanup before T024–T027.
- [ ] T024 [US2] Add source-only PR Terraform gates and protected trusted plan/apply in .github/workflows/azure-infrastructure.yaml using shared commands, SHA-pinned actions, job-scoped OIDC, private Blob saved plans, exact review/state/input checks and environment concurrency; untrusted forks never receive cloud identity.
- [ ] T025 [US2] Add separate approved environment-confirmed workload destroy in .github/workflows/azure-destroy.yaml and scripts/azure-infrastructure.mjs; require “Workload destroy cannot target it” for foundation, fresh verified backup/drain and no branch-delete trigger.
- [ ] T026 [US2] Implement independent trusted-main five-minute admission reaper workflow with separate scoped identity in .github/workflows/azure-operations.yaml; no manual approval, no generic Azure request interface, stale/error summaries and next-operation fail-closed reconciliation.
- [ ] T027 [US2] Configure documented retained OIDC subject/environment/branch/reviewer prerequisites through infra/azure/foundation/ and docs/azure-aks.md; avoid pretending managedClusters/write is property-only and retain single-owner approval limitations.
- [ ] T028 [US2] Integrate infrastructure-only path classification/gates in .github/workflows/pull-request.yaml and scripts/manifest-quality.mjs with regression tests in scripts/manifest-quality.test.mjs; preserve app CI provenance and prevent infrastructure-only image rebuilds.
- [ ] T029 [US2] Validate actual fork/unapproved/stale apply/destroy denial, private plan handling and hosted approved creation after T048 teardown, recording same-revision evidence in specs/014-azure-aks-gitops/team/workflow-acceptance.md; require clean fresh installation before restoration.

## Phase 5: US3 - Safe stop/start and cost control (P1)

**Goal**: Stop compute, preserve data, restart only to a proven ready environment.
**Independent test**: Booking/login/broker/secrets/certificate/history survive cycle;
seasonal schedule/override and stopped backup behavior verified (US3-A1–A4).

- [ ] T030 [US3] Write failing lifecycle/safety-stop CLI tests in scripts/azure-operations.test.mjs for actual provider transitions, settling interval, readiness failure, expiring override, both Bucharest seasonal offsets, failed cleanup and stopped backup without start before T031–T033.
- [ ] T031 [US3] Implement bounded actual AKS stop/start, required settling, refreshed connection information and trusted-certificate/secret/login/persistence/messaging/deployed readiness in scripts/azure-operations.mjs; no successful readiness on incomplete checks.
- [ ] T032 [US3] Add manual approved start/stop and unattended nightly23:00 Europe/Bucharest stop in .github/workflows/azure-operations.yaml using separate trusted-main stop-only identity/environment, no approval wait for schedule, bounded external override and stale/missed-run reporting.
- [ ] T033 [US3] Add exact scoped stop-only role and external override/last-run storage in infra/azure/foundation/; identity cannot start/apply/destroy/read secrets/change API, and shared operation lease prevents conflicting work.
- [ ] T034 [US3] Run actual stop/start plus safety-stop/override/missed-run/abrupt-runner qualification and persistence checks, recording seasonal deterministic tests separately from actual provider evidence in specs/014-azure-aks-gitops/team/lifecycle-acceptance.md.

## Phase 6: US4 - Protected diagnostics and GitOps releases (P2)

**Goal**: Independent operator login, correlated three-day history, reviewed release/drift.
**Independent test**: Positive/negative Entra and source access, Keycloak outage operator
login, history survives restart, reviewed release/drift/protected deletion (US4-A1–A5).

- [ ] T035 [US4] Write failing operator/telemetry manifest/provider contract tests in scripts/azure-observability.test.mjs for app-role assignment, anonymous/source denial, backend auth/privacy/retention and real supported query shapes before T036–T039.
- [ ] T036 [US4] Implement Terraform Entra Argo/Dashboard registrations/app roles/group assignment and private confidential-client credential provisioning in infra/azure/foundation/ and scripts/azure-infrastructure.mjs; no password resource/state, document enrollment/removal/lockout and controlled Argo break-glass.
- [ ] T037 [US4] Configure Entra OIDC frontend and operator-only IP routes in deploy/argocd/azure/ and deploy/environments/azure/; keep diagnostic API/ingestion private and require assignment independent of Keycloak availability.
- [ ] T038 [US4] Deploy immutable authenticated TLS Collector fanout and internal Prometheus/Loki/Tempo/Grafana in deploy/platform/azure/telemetry/ with 72h retention, finite ingestion/cardinality/8Gi stores and reviewed resource budgets; no raw debug export or fifth public host.
- [ ] T039 [US4] Implement production-exporter receiver/vendor API contract and correlated-history/privacy/metric-label checks in scripts/azure-observability.test.mjs and scripts/azure-operations.mjs; distinguish count/time/capacity configuration from elapsed retention and test actual pinned backends.
- [ ] T040 [US4] Extend existing promotion/publication in scripts/component-pipelines.mjs and scripts/promote-images.mjs plus .github/workflows/azure-images.yaml so each component is built once and published to both GHCR and ACR, verify remote multi-platform digest/source parity before reviewed local/Azure promotion, fail closed on partial publication and reuse proven digest for retries/ACR recreation; add intended-red tests in scripts/component-workflows.test.mjs and scripts/promote-images.test.mjs, preserving affected-component provenance.
- [ ] T041 [US4] Verify actual Entra positive/negative/source/Keycloak-outage access, break-glass, correlated history restart/capacity, reviewed release/drift and rejected destructive prune; record evidence in specs/014-azure-aks-gitops/team/operations-acceptance.md.

## Phase 7: US5 - Full workload-loss recovery (P2)

**Goal**: Verified externally encrypted backup restores original identity/booking after loss.
**Independent test**: Source booking/identity -> drained verified point -> teardown -> clean
workflow recreation -> explicit restore and original-user login (US5-A1–A4).

- [ ] T042 [US5] Write failing recovery public CLI/crypto/provider contracts in scripts/azure-recovery.test.mjs for drain/quiesce, GCM tamper/hash/schema mismatch, wrap-only versus unwrap authority, failed verification, seven-successful retention, stale/missing point and reseed exclusion before T043–T046.
- [ ] T043 [US5] Implement random per-object AES-256-GCM data key/unique96-bit nonce and version-pinned RSA-OAEP-256 retained-vault wrap/unwrap in scripts/azure-recovery.mjs; enforce “RSA key never exported; wrap/unwrap authorities separate,” private memory/files and bounded safe failure cleanup.
- [ ] T044 [US5] Implement running-only quiesce/drain, app+Keycloak logical dumps/roles/compatible secrets/ACME bundle, encrypted staged upload, isolated actual restore verification and complete-point marker in scripts/azure-recovery.mjs; preserve last good point on partial failure and retain seven successful daily sets.
- [ ] T045 [US5] Implement explicit confirmed compatible restoration with protected unwrap, suspended reconciliation/writers/bootstrap reseeding, credential-before-data restore and original login/booking verification in scripts/azure-recovery.mjs; clean creation remains independent, no blind mutation retry.
- [ ] T046 [US5] Add running-only scheduled backup and separately approved manual restore in .github/workflows/azure-recovery.yaml plus scoped wrap/write and restore-read/unwrap identities in infra/azure/foundation/; stop/apply/backup/restore share external serialization.
- [ ] T047 [US5] Create recorded booking/user and fresh complete recovery point with actual isolated verify/drain, enumerate retained foundation/key/secret compatibility and prove bad inputs block teardown in specs/014-azure-aks-gitops/team/recovery-acceptance.md.
- [ ] T048 [US5] Execute approved workload-only teardown after T047, verify original workload/disks removed and retained inventory intact, then perform T029 workflow clean recreation before any restore; record safe commands/revisions/outcomes in specs/014-azure-aks-gitops/team/recovery-acceptance.md.
- [ ] T049 [US5] Execute explicit protected restore after clean recreation, verify original user login/booking/messaging and measure actual working-session duration; record safe encrypted-point/compatibility/failure evidence in specs/014-azure-aks-gitops/team/recovery-acceptance.md.

## Phase 8: Cross-cutting verification and handoff

- [ ] T050 Write final operator/deployment runbook in docs/azure-aks.md and discovery links in README.md covering exact shared commands, cost/retained inventory, approvals, domain delegation, secret rotation, missed schedules/reaper, recovery and accepted availability limitations; do not edit feature 013 artifacts.
- [ ] T051 Run revision-matched format-check/lint, focused/full affected tooling, real Terraform native/source/plan/security negative and clean gates, provider lock checks, Kustomize/schema and workflow validation; record commands/environment/status and unavailable checks honestly in specs/014-azure-aks-gitops/team/checks.md.
- [ ] T052 Obtain independent quality and security implementation reviews against frozen current code/design/tasks with original reviewers validating finding closure; coordinator records reports and findings in specs/014-azure-aks-gitops/team/.
- [ ] T053 Coordinator runs speckit-converge on implemented current tasks, appends targeted remaining work without rewriting completed IDs, and resolves/revalidates gaps in specs/014-azure-aks-gitops/tasks.md and team/convergence.md.
- [ ] T054 Coordinator reconciles all acceptance evidence/tasks/reviews/convergence and records explicit human acceptance before completion metadata updates in specs/014-azure-aks-gitops/spec.md and team/run-state.json; pending live/hosted/browser gates remain accurately named.

## Dependencies and execution order

Setup T001–T003 -> foundational T004–T013 -> story implementations. T004 precedes
T005, T006 precedes T007/T013, T008 precedes T009, T010 precedes T011/T012.
Native static/mock tests do not need paid infrastructure. Do not provision until
regional cost/quota/identity preflight passes. Full infrastructure execution waits
for preparation gates, implementation checks and the required concrete approvals.

US1 implementation T014–T021 provides local application MVP; US2/US3/US4/US5 can
then develop independently around the shared contract, but shared-file changes serialize.
US4 historical stack is required before full startup/history acceptance. US5 verified
backup T047 precedes actual destruction; T048 precedes hosted recreation T029;
T029 clean success precedes T049 restore. This is an acceptance ordering dependency,
not a circular code implementation dependency. US2 final acceptance depends on the
US5 guard, even though US2 pipeline implementation precedes backup implementation.

## Parallel opportunities

Bounded implementation ownership seams: one owner for shared quality/tool locks and
package scripts, one for both Terraform roots/provider locks, one for Azure
Kustomize/platform/Argo directories, one for lifecycle/recovery commands and their
workflows. Assign these only after analyze/security preparation gates; repository
team capacity and explicit coordinator assignment control actual delegation.

Shared config contract, implemented/validated by T007 before parallel consumers:
version, environment, generation, subscriptionId, tenantId, region, domain,
operatorGroupObjectId, operatorCidrs, acmeEmail, acmeTermsAccepted,
kubernetesVersion, nodeVmSize, nodeCount, githubRepository, gitRevision,
foundationBackend, environmentBackend and recoveryKeyVersion. No secret values.
Environment defaults may name codingfunlab.com/westeurope/two D4s_v5, but missing
identity/CIDR/ACME acceptance never receives a permissive fallback. Actual secret
inventory is derived from existing deploy/base key requirements and mapped by workload;
do not independently invent duplicate credential naming across Terraform/CSI/scripts.

Terraform emits a private machine-readable outputs projection for scripts:
workload_resource_group_name, aks_cluster_name, aks_resource_id, acr_login_server,
workload_key_vault_uri, recovery_key_id/version, state/recovery storage identifiers,
dns_zone_name/nameservers, persistent_api_cidrs and per-workload client IDs. Consumers
must parse selected outputs, not dump terraform output -json into logs or commit a
second generated inventory. T007/T013 owns validation and safe projection; Terraform
owner provides shape, manifest owner consumes generated non-secret runtime inputs.
All npm command identifiers/flags remain exactly those in contracts/operations.md.

- Setup: T002 examples and T003 evidence record are disjoint after tool inputs known.
- US1: after T014 red, routing T018 and certificates T019 may use disjoint owned
  directories; app/secret/network changes require coordinated overlay integration.
- US2: after T023 red, infrastructure T024 and destroy T025 workflows are distinct;
  both depend on shared command contract and merge before actual hosted execution.
- US3: lifecycle command T031 and foundation role/storage T033 can proceed after red
  with explicit disjoint ownership; integrate before workflow T032 runtime checks.
- US4: operator identities T036 and telemetry T038 are separate scopes after red;
  root Terraform files and shared CLI/package edits remain serialized.
- US5: crypto implementation T043 and workflow skeleton T046 can be assigned to
  disjoint owners after tests, but workflow execution waits for T044/T045 and grants.

Only T002/T003 carry [P] because later work shares integration paths or depends on
unfinished task contracts. Parallel examples are conditional opportunities, not
permission for workers to overwrite another owner's files.

## Implementation strategy and traceability

Suggested MVP is foundational toolchain/infrastructure plus US1 local secure browser
acceptance. The full approved feature includes every later story; MVP alone is not
completion. Implement finite batches: deterministic tooling -> Terraform -> app/GitOps
-> pipelines -> lifecycle/operators/history -> recovery -> live rehearsal/handoff.

| Requirements | Tasks |
| --- | --- |
| FR001–006,016,021 | T014–T022,T031,T035–T039 |
| FR007–012 | T001–T013,T023–T029,T047–T048 |
| FR013 | T020,T028,T040–T041 |
| FR014–015 | T008–T009,T026,T030–T034 |
| FR017–019 | T042–T049 |
| FR020 | T035,T038–T039,T041 |
| FR022 | T006–T007,T011–T012,T050 |
| FR023–024 | T003,T006,T008–T009,T013,T030,T042–T054 |
| FR025 / SC011 dual-registry artifact parity | T040,T041,T051 |
| FR026 / SC012 protected Blob request auditing | T058,T060,T051 |
| SC001–010 | Story acceptance tasks T022,T029,T034,T041,T047–T049 and T051–T054 |

Counts: 91 tasks; setup/foundation17, US1 twelve, US2 thirteen, US3 five, US4 seven,
US5 thirty-two, cross-cutting five. All task lines contain checkbox, sequential stable
ID, required story label within story phases and concrete file path. No task is
prechecked by planning, and no absent live evidence is inferred from unit fixtures.

## Targeted steering/design tasks appended after implementation started

Preserve all T001–T054 IDs/status. These additions implement runtime-source consistency
without regenerating completed history. Execute after Terraform output contract exists,
before T020 bootstrap and T022/T029 acceptance.

- [ ] T055 [US1] Add failing public projection/generation tests and implement allowlisted non-secret Terraform-output to committed reviewed runtime configuration in scripts/azure-infrastructure.test.mjs, scripts/azure-infrastructure.mjs, deploy/environments/azure/runtime/ and deploy/platform/azure/runtime/; mismatched generation/digest, unknown/secret fields and placeholders block bootstrap, no untracked Argo source or parameter overrides.
- [ ] T056 [US1] Integrate reviewed runtime-config change and protected post-merge bootstrap/reconcile phase in .github/workflows/azure-infrastructure.yaml and scripts/azure-infrastructure.mjs; initial apply reports configuration-review-pending until actual merged SHA/output hash passes and readiness completes; add failing workflow contracts in scripts/azure-workflows.test.mjs.

- [ ] T057 Add failing public concurrent network-admission/reaper tests then implement operational DNS If-Match gate in scripts/azure-operations.test.mjs, scripts/azure-operations.mjs, infra/azure/foundation/ and .github/workflows/azure-operations.yaml; verify Storage admission then release DNS BEFORE waiting Blob, revalidate after Blob and test Blob-holder cleanup/renewal/reaper interleavings. Use exact tags equipment-admission-UUID JSON {cidr,expires}, maximum ten/resource, DNS equipmentOwner/equipmentExpires/equipmentHeartbeat, constant reserved TXT, preserve unrelated tags. Initial human If-None-Match create precedes exact-record role binding; no TF record-content owner or guaranteed TTL. Test lost gate/uncertain writes fail closed, exact scoped roles/DNS grant conditions, initial-only null keyVersion and recurring environment grants. Add explicit future recovery_key_expiration_date,365-day initial lifetime, near-expiry/rotation/historical unwrap tests and verified rewrap or reviewed expiry extension; no AVD-AZU-0014 suppression.

- [ ] T058 Add intended-red Terraform/transform/privacy contract tests then implement dedicated retained Log Analytics workspace, workspace-transformation DCR attachment BEFORE state/recovery Blob diagnostic settings and strict stored-column allowlist in infra/azure/foundation/audit.tf, infra/azure/foundation/tests/foundation.tftest.hcl and scripts/azure-operations.test.mjs; retain30days/no archive, protective daily quota.03GB, scoped operator query rights, no raw sink/bypass change or queue-only substitute; prove actual stored-row privacy/read-write-delete evidence and visible audit gaps before destructive acceptance.
- [ ] T059 [US5] Add failing exact recovery authorization/quiesce/verification tests and implement narrow pinned PostgreSQL-client exec, isolated verification Job and safe writer/reseed/GitOps control in scripts/azure-recovery.test.mjs, scripts/azure-recovery.mjs and deploy/platform/azure/recovery/; obey the reviewed operation permission contract, never grant ClusterAdmin or arbitrary Argo/AppProject/Deployment-spec writes, and record actual provider RBAC/admission denial evidence.
- [ ] T060 Add required explicit taxRate and fixed120 inclusive-tax cost tests/calculation plus audit ingestion/processing reserve in scripts/azure-infrastructure.test.mjs, scripts/azure-infrastructure.mjs and infra/azure/examples/environment.json; safely activate only the eleven exact human-approved rule/resource exceptions from specs/014-azure-aks-gitops/team/proposed-policy-exceptions.md, leave all other findings including actual Blob auditing/SEC-TF001 blocking, and record tax/budget/audit evidence in docs/azure-aks.md.

- [ ] T061 [US2] Test and implement installer-only exact-AKS Azure RBAC Cluster Admin candidate in infra/azure/environment/ and its native tests, activating only after independent targeted security review; keep other actors without broad data grants and local/admin credentials disabled. In scripts/azure-operations.test.mjs and team/authorization-qualification.md require actual separate backup/restore SP named exec/scale allow+deny probes with azure_rbac_enabled=true before DB/recovery authority activation; failure blocks without unsupported native-RBAC claims or broad fallback. Cover canonical OIDC output maps, exact two source-secret copies and attributes.exp>now+30days in scripts/azure-infrastructure.test.mjs.
- [ ] T062 [US5] Add real pinned PostgreSQL role/dump/restore/schema/extension/RLS/denial tests then implement cloud-only reviewed recovery SQL Job in deploy/platform/azure/recovery/database-bootstrap.sql and its Job/CSI templates; create fixed equipment_backup read role and equipment_restore exact four-owner SET memberships without global privileges, coordinate three canonical recovery secret keys with primary/GitOps, use verification-only PostgreSQL server Job/Service with bounded cleanup, no app DatabaseProvisioner behavior changes. Extend T058 with actual create/bind/qualify/enable audit staging tests in infra/azure/foundation/tests/foundation.tftest.hcl, no workspace-DCR cycle or unsupported association; record approved SEC-D002 scope without claiming zero intermediate persistence.

- [ ] T063 Add failing handoff/proof-isolation tests then implement retained private bootstrap/qualification containers and durable allowlisted foundation/environment exports in infra/azure/foundation/, scripts/azure-infrastructure.test.mjs and scripts/azure-infrastructure.mjs; apply reads foundation projection without foundation-state access, only exact actors write their proof containers, challenge/projection writers are installer/apply, hosted bootstrap rejects stale/secret/unknown/foreign-generation data and expired-artifact dependence.
- [ ] T064 [US2] Implement protected actual backup/restore identity qualification jobs and proof generation/validation in .github/workflows/azure-recovery.yaml, scripts/azure-operations.mjs and scripts/azure-operations.test.mjs after intended-red tests; benign credential-free named controls only, bind proof to actual principal/cluster/CA/generation/reviewed probe-role hashes/nonce/expiry<=24h, real named allow/deny requests plus SSAR, replay and wrong-principal failures. No local-human/installer impersonation or self-asserted qualification marker; record actual hosted proof before activation.
- [ ] T065 [US5] Split real recovery bindings/CSI/SQL Job/clients into optional deploy/argocd/azure/recovery-application.yaml sourcing deploy/platform/azure/recovery/ excluded platform root; generator third recoveryFiles map targets its runtime/ under same projection hash/generation, no TF cache qualification fields. Publish actual nonsecret output snapshot after ordinary app readiness BEFORE hosted probes, remove exact harmless fixture clients only after valid private proofs/reviewed recovery-activation.json, then activate real clients/SQL. Add failing staging/cycle/proof-expiry tests in scripts/azure-deployment.test.mjs and scripts/azure-infrastructure.test.mjs; report app-ready/recovery-pending and gate new recovery operations on current proof, no fictional Argo expiry timer.

- [ ] T066 [US5] Add failing recurring qualification tests then implement fresh own-identity inline actual allow/deny probes under each backup/restore operation lease in scripts/azure-operations.test.mjs, scripts/azure-operations.mjs and .github/workflows/azure-recovery.yaml; initial both-actor apply challenge gates activation only, scheduled backup needs no fresh apply/restore approval. Actor-owned create-only mode=operation proof binds nonce/lease/current activation/roles/probe hashes/cluster CA/generation/principal and <=15minute phase-start validity, no caller boolean/cache. Verify exact production Role/RoleBinding names through narrow get, final no-op production exec/scale, cleanup after expiry and canonical three equipment-recovery WI subjects; reject changed activation/roles without requalification.

- [ ] T067 [US5] Add intended-red native RabbitMQ/proxy/HTTP drain contracts then implement equipment_backup_monitor monitoring-only ^$ resource permissions via Azure-only broker user setup, protected private backup credential and fixed equipment-broker-monitor exact-portforward proxy in deploy/platform/azure/recovery/, scripts/azure-recovery.test.mjs and scripts/azure-recovery.mjs; real running ready0/unacked0 plus outbox0, verified management TLS, strict queue GET-only routes, no message/admin rights, no broker Pod wildcard or fake rabbitmq-0, no PG HTTP binary/KV-read expansion, safe bounded errors/owned-forward cleanup.
- [ ] T068 [US5] Add failing ownership/activation and restore-read authorization tests then implement installer-only generated recovery-qualification-bindings.json excluded Kustomize, no-WI qualification SA, reviewed Pod-reference removal and platform exact-commit Synced BEFORE UID-checked retained probe cleanup/real App activation in scripts/azure-runtime.test.mjs, scripts/azure-infrastructure.test.mjs, deploy/platform/azure/ and scripts/azure-provisioning.mjs; restore gets exact five Deployment/scale GET only, patch/update denied, no broad read or grant.

- [ ] T069 [US2] Migrate scripts/azure-qualification.mjs, scripts/azure-provisioning.mjs and producer workflows to COMPLETE authoritative version2 contract in specs/014-azure-aks-gitops/team/qualification-schema-v2-proposal.md at reviewed A9D5A72D9DBC8C029F729D322060C0649C02877864955269059955625299F1D8; intended-red v1/dirty/actualHEAD/callerSHA/transitive-import/package-lock/loader/preload/replay/role cases before migration, independent complete closure+fixed manifest and pre-npm/Node sanitized launch, actual private-process/principal proof tests and unchanged-app-only positive. Preserve all IDs/status; preparation PASS is not source/live approval.

- [ ] T070 [US5] Add intended-red termination/read-scope tests and implement the reviewed observation contract in scripts/azure-recovery.test.mjs, scripts/azure-recovery.mjs and deploy/platform/azure/recovery/; exact five Deployment selectors plus zero matching Pod objects including terminating/orphan/old rollout, honest equipment-only pods/list, exact Argo equipment-azure GET and seed-Job GET, restore scale-write denial, bounded errors/cleanup and actual hosted authorization probes.
- [ ] T071 [US5] Add intended-red exact encrypted inventory/ordering tests then implement six exact identity vault-secret continuity objects and five exact Kubernetes ACME/TLS objects in scripts/azure-recovery.test.mjs, scripts/azure-recovery.mjs, infra/azure/environment/ and deploy/platform/azure/recovery/; reject all extra secrets/admin/old-owner/global-role credentials, keep new DB passwords without granting their read, enforce exact object scopes/attributes/resourceVersion/URI-checksum reconciliation. Prove actual pinned PostgreSQL authentication and cert-manager/Pebble old-account recovery negatives before activation; preparation PASS is not live evidence.
- [ ] T072 [US5] Repair Q-BROKER014-001 in deploy/platform/azure/recovery/ and scripts/azure-recovery.mjs using only fixed upstream disable_stats=true&enable_queue_totals=true with unchanged external raw GET/TLS/monitoring authority; native regression suspends management queue_coarse_metrics after cached zero and proves current ready/unacked/final-zero independently of collector/history timestamps. Require original quality closure. Test failed consumed activation as replay-deny/new challenge+both proofs and authorized harmless fixture reinstallation after reviewed inactive rollback, never implicit resume or overwrite of real clients, in scripts/azure-infrastructure.test.mjs and scripts/azure-qualification.mjs.

- [ ] T073 [US5] Add intended-red exact binding ownership/issuer-scope/drift tests then implement reviewed addendum BEBA835182937453AE258E890764A1EB683CA08940DA64977CBA74D7B61D39B7 in scripts/azure-runtime.test.mjs, scripts/azure-provisioning.mjs, scripts/azure-qualification.mjs and deploy/platform/azure/; generate installer-only recovery-continuity-bindings.json excluded all Kustomizations, six exact reviewed actor bindings after proof+lease activation, platform-owned unbound Roles/ClusterRoles, backup and restore GET exactly two ClusterIssuers. Preserve existing AppProject destinations/whitelist, include real roles/bindings/subjects in closure and operation drift checks, require native allow/deny plus actual hosted qualification; no pending/bootstrap production grants or broad read fallback.

- [ ] T074 [US5] Test-first implement exact own-actor Role/RoleBinding GETs in equipment-recovery,equipment,cert-manager,argocd and exact own ClusterRole/ClusterRoleBinding GET in deploy/platform/azure/recovery-controls/roles.json, scripts/azure-qualification.mjs and scripts/azure-recovery.mjs per reviewed proposal38A807 sections2–3; deny other names/actors/list/watch/write, bind actual subjects/roleRefs/hash before secret use, require native and hosted authorization evidence. No vault-management permission is included.
- [ ] T075 [US2] Test-first implement reviewed immutable-definition versus exact source/target installation-state versus separate activation-record classification in infra/azure/qualification-definition.json, scripts/azure-qualification-launch.mjs, scripts/azure-provisioning.mjs and their tests. Enumerate every actual applicationFiles/platformFiles/recoveryFiles filename from immutable generator; unknown paths fail closed, no deploy/runtime glob exclusions. Permit only reviewed literal fixture-reference removal/UID cleanup/already-hashed installation, bind both maps before proofs, reject policy/template changes and activation import/self-reference/replay. Keep vault CandidateA blocked pending owner authority decision; do not include activation record bytes in their own definition hash.

- [ ] T076 [US5] Test-first implement owner-approved CandidateA guards and G0–G2 staged exact-vault grants in infra/azure/foundation/, infra/azure/environment/ and native tests; enforcing retained modeAll deny for both vault families, fixed security invariants/no recover exemption, recurring policy/exemption/role-assignment mutation denied, operational assignments absent until verified actual human policy qualification. Exact workload backup/restore/reaper and retained recovery writer scopes only; no data-role or scanner-exception expansion.
- [ ] T077 [US5] Test-first implement real guard qualification/publisher/validator in scripts/azure-infrastructure.mjs and scripts/azure-operations.mjs with private create-only evidence and protected workflow integration; human G1 parent-policy tests precede grants, G3 actual actors prove own authorized parent policy denials versus child/RBAC denials plus data isolation before use. Bind actual principal/API/vault-generation/assignment-policy-role-source hashes/correlation/expiry, verify unchanged rejected mutations and compliant admission/cleanup, reject caller booleans/fabricated cases/stale records. Require actual both-vault Azure evidence before backup/restore/reaper/OIDC-copy admission; owner approval alone is not evidence.

- [ ] T078 [US5] Implement independently reviewed vault phase/evidence addendum8D9A8D9D64E753949A25DC51D0B57A92F569AF7C2BB05ACC4BECFD395172EA1A through intended-red tests in infra/azure/foundation/, scripts/azure-infrastructure.mjs and guard helper/workflows; separate guard-evidence human writer/read-only consumers and guard-apply-evidence exact apply writer, no operations-prefix trust or WORM claim. Preserve existing apply Contributor for compliant hosted creation under qualified retained guards; actual per-generation hosted proof precedes population/grants, no recurring human token for unchanged family. Verify both selected APIs2026-02-01 and2024-11-01, actual response provenance, record-purpose/inherited-role isolation and no forged booleans; source tests never imply live qualification.

- [ ] T079 [US2] Test-first implement approved release-data addendum2881E804A4724D8362742C14DB0118B2DBAE432950750E269BA3F9D2B357E05C in infra/azure/qualification-definition.json, scripts/azure-qualification-launch.mjs and related tests; enumerate exact28 paths and strict per-component image-only target table (broker Deployment rabbitmq/initContainers definitions sole exception), exact local/Azure schemas, remote matching-digest OCI/GitHub provenance and counterpart consistency. Reject unknown29th path/duplicate keys/adjacent patch fields/foreign images/executable imports; valid routine promotion preserves complete unchanged loaded-code/authority closure without initial two-actor reapproval. No glob exclusions, legacy aggregate exception or inferred live acceptance.

- [ ] T080 [US5] Test-first implement approved guard lifetime/probe addendum3B7943398775A9DF47D92D7AD233CE9C5E56BC5330D8DAF2F95429EA0B4F34C0 in guard helper/CLI/workflows and tests: exact human-policy-family null-expiry tuple checks versus<=24hour generation consumption and fresh<=15minute own operation proofs. Require actual completed activation and target integrity beyond consumption existence; fail replay/partial activation, no daily human/apply requirement for unchanged tuple. Initial fixed human probe only create-owned DELETE/finally matching soft-delete checks, no adoption/purge/random fallback; private conditional create is not WORM. Actual Azure proof remains mandatory.

- [ ] T081 [US5] Test-first implement reviewed live release access proposalB82C66DF7312C07FEA3CAAFD3BBA7DFCDC8275BFD46595B431B16EC93A3F0768 in infra/azure/environment/, .github/workflows/azure-recovery.yaml and release verification modules; exact current ACR AcrPull for backup/restore, repository contents/actions/packages read with existing OIDC only, static28 validation before config and actual OCI/GitHub same-artifact provenance after verified outputs. Deny push/delete/admin/foreign scope, prove actual private package Actions GET access and credential cleanup; no mode/admin/PAT/visibility change or inferred access. Actual hosted positive/negative checks remain acceptance gates.

- [ ] T082 [US2] Test-first implement approved integration B23C1E3121D3373A7CB98E7BD9FE0A6EF5D0D601B87FAC37C52903B2CC041E26 in scripts/azure-infrastructure.mjs, scripts/azure-provisioning.mjs, scripts/azure-runtime.mjs and qualification launch modules: distinct initial creation/deferred-grants plan then actual G2 and separately reviewed grant saved plan, real apply-owned receipt/private binding before unchanged grant-plan apply, actual ordinary activation independent recovery, no caller phase/bool/replan. Use shared exact canonical public generatorInput/hash schema/version and full14 output map validation; no actor foundation-state access or hidden full-root hash dependency.
- [ ] T083 [US5] Test-first implement approved integration exact peer-initial-proof and consumption GET-only/no-list ABAC reads, actual historical-at-consumption/current-target validation and narrow ARM authority inspection in infra/azure/foundation/, guard helper, scripts/azure-recovery.mjs and related tests/workflows; preserve actual producer/container separation, own fresh probes and existing authority truth. Qualify selected resource/RG role-definition/assignment/permissions endpoints with real identities, fail closed on unsupported/ambiguous/incomplete results, no subscription Reader fallback or broader grants.
- [ ] T084 [US1] Test-first implement approved ACME privacy addendum59AF97F0F953104E33678BE6643DDE70345CA08367F850B1567C752B8A5197BA in scripts/azure-runtime.mjs, sanitized configuration/public projection and related render/schema tests; omit optional email in both pinned issuers, never serialize private contact, preserve exact account URI/key recovery/DNS01/terms/TLS evidence. Actual staging issuance/renewal remains pending; no replacement service or email alert promise.

- [ ] T085 [US5] Test-first implement approved batch7 B8B2E68ED1C1D34538B3193A7E187D17E3DF84DF738A1618FCFB22F484F2ED7D exact five inspection-role/binding descriptors and explicit minimal active-object reads in infra/azure/foundation/, vault_guard output/cache schema and guard helper. Implement fixed inert canary request templates/semantic checks with actual approved human setup later, no active-guard mutation/high-privilege target. Keep canary denial and actual active-object inherited/effective authority checks distinct; fail ambiguous/unsupported lookup and conditional-delegation cases, no Reader fallback. Native/provider evidence remains required.
- [ ] T086 [US5] Test-first implement batch7 durable fixed human/apply evidence pointers in guard helper/CLI and actor-safe vault_guard descriptor: exact references, producer-only container ownership, existing handle schemas, ETag/lease conditional publication, current full tuple and actual completed ordinary activation validation. Never select newest/list result, treat consumption as activation or infer WORM. Implement own-only recurring recovery observer and exact equipment-azure-recovery Application GET in actor continuity Roles; no peer-RBAC/global-admission reads.
- [ ] T087 [US5] Test-first implement batch7 private completion/catalog version2 and protected pointId selector in scripts/azure-recovery.mjs and public recovery CLI/provider: trusted actual backup producer independently collects sourceIdentity/exact six source-secret facts, marker binds metadata/object hashes and actual producer, restore freezes authenticated selected marker context before decoding payload. Prove zero writes for wrong source tenant/vault/generation/version/hash/point, denied marker mutation and no bundle-self-anchor; retain actual backup-writer trust without signature/WORM claims. Actual Azure read/write/provider and full recovery acceptance remain pending.

- [ ] T088 [US5] Test-first implement approved canary staging A7C8FE1F570A40180C0C21254D2B64FD73C3986786D80B4E502677884CF2700B in foundation/guard helper/CLI and native tests: F0 no future-object bindings; human read-only fixed prepare plan; later explicitly authorized human create and actual fixture evidence; separate F2 immutable finalization plan with source-bound typed g3_canary_fixture_evidence and current GET verification; F3 final tuple qualification. No caller-ready flag, automatic fixture provisioning/import, parent read fallback or daily human recreation step; actual fixture approval/API scope/probe evidence stays pending.

- [ ] T089 [US5] Test-first implement approved delegation descriptor8C23435CF9DE19C1F7E70F9A51668CD85B224F4A1026633791A6A89888C54445 in foundation vault_guard outputs, strict actor cache and guard helper pure parser/equivalence/evaluator. Bind actual existing apply/destroy assignment/role/raw condition/semantic hashes and source-derived exact rules, preserve base ANYServicePrincipal truth, reject unknown syntax/inherited groups/conditions or scope lookup failure. No new permission, active-policy write probe or broad Reader fallback; actual Azure conditional behavior remains gate.
- [ ] T090 [US5] Test-first implement approved UID clarificationFE36A01C67B106878883C524DE8A1A95D2F92BFCB7813E1DEAED6D707B5498C6 in recurring recovery observer/proof and operation adapters: actual current nonempty UID/exact spec/trusted revision/SyncedHealthy, fresh own proof capture and sameUID recheck before first mutation/destructive phase. Reject recreation/empty/deleting/foreign target with zero next writes and owned cleanup; allow legitimate resourceVersion-only updates. No historical UID invention/global lock claim/new access.
- [ ] T091 [US5] Test-first implement approved recovery writer inspectionEC5C2C188FCC7EB96B88F0B0AAD3DB3A7BF48199F519B0184E212695FC57087A in source-bound vault_guard descriptor, guard helper and recovery selector/publisher; use existing retainedRG authority inheritance and exact container query, complete actual inherited writer/role audit under lease before completion/selection. Block unexpected writers/groups/conditions/pagination/unsupported scopes with zero restore writes; preserve trusted backup/human-admin boundary and retention without signer/WORM claim or new grants. Actual provider qualification remains pending.
