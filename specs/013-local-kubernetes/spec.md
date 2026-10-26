# Feature Specification: Local Kubernetes and GitOps

**Feature Branch**: `013-local-kubernetes`

**Created**: 2026-10-20

**Status**: Implementation in progress — preparation independently reviewed; runtime, release and human acceptance pending

**Input**: Implement the approved decisions in [handoff](../../docs/local-kubernetes-handoff.md) and [planning interview](../../docs/local-kubernetes-planning.md) from main revision `4dd685c4e34288f94e932dcd49beb22eea965075` in an isolated worktree.

## Clarifications

### Session 2026-10-21

- Q: Which script operations should expose tool output? → A: Across all repository scripts and test helpers, ordinary audited commands stream both standard output and standard error; machine-readable and sensitive operations explicitly capture output.
- Q: What diagnostics remain available for captured and sensitive failures? → A: Report a safe operation name, tool, duration, exit status or signal when available, and failure category; show bounded safe standard-output and standard-error tails with marked truncation, or safe projections for sensitive output, without secrets, raw arguments, environment values or input payloads. Do not automatically save raw logs or provide a privacy-bypassing debug mode.
- Q: What happens when cleanup fails? → A: Cleanup failure fails an otherwise successful command or test; when primary and cleanup operations both fail, retain the primary failure and report cleanup problems separately.
- Q: What scope and authority does this approval establish? → A: The owner approved this amendment, all scripts and test helpers, a mandatory discoverable engineering guide, implementation and independent review within feature 013. Existing commits do not establish feature acceptance, and this batch does not authorize commits, pushes or workflow execution.

### Session 2026-10-22

- Local qualification amendment: support Windows/WSL Podman while preserving macOS trust, private-state and capacity checks. The owner approved an explicit experimental Windows 8 GiB trial; the normal 11000 MiB minimum remains unchanged. Setup must validate Windows system trust and owner-restricted ACLs rather than omit those checks. See [qualification and evidence](team/windows-local-setup.md).
- Historical owner request: Allow running the release workflow from any branch. The initial coordinator interpretation retained main-only promotion; the confirmed component-pipeline amendment below supersedes that restriction. This implementation scope does not authorize an actual publication run, commit or push.
- Confirmed component-pipeline decisions: Run quality prerequisites first, then seven separate reusable component workflows in parallel. Historical PR build topology (superseded by the 2026-10-23 workflow split below): pull requests build affected images for both target architectures without publication or publish secrets, including forks, and always produce a final required summary even when no component is affected. Main pushes publish affected components using transitive build-input impact and each component's successful publication baseline; uncertainty selects all. Manual runs from any repository branch select all components and may publish and commit validated component-specific local GitOps updates directly to main. Component failures do not cancel or block other components. Failed-job reruns retain successful results only from the same run and source SHA; missing required artifacts fail clearly and require a fresh run. Stale same-component promotions are blocked or refreshed, unrelated component proposals remain intact, and identical digests are a no-op. Each result retains exact source SHA and branch; a complete seven-image release is not required. New compatibility gates and preproduction environments are outside this amendment.

### Session 2026-10-23

- Dashboard storage: retain telemetry across Pod replacement using dedicated persistent
  storage and Resume mode. Ordinary setup/stop retain it; explicit reset or cluster
  teardown deletes it. Existing ephemeral history need not migrate. Count retention
  and resource limits remain; local PV capacity is not a hard filesystem quota.
  See [storage decision and evidence](team/dashboard-persistence.md).
- Interactive Argo access remains open until interruption or failure; Dashboard access
  and setup/smoke retain finite deadlines. Admit namespaced Pods and ReplicaSets in
  the local AppProject to inspect workload children while retaining Secret, wildcard
  and cluster-resource exclusions. These permissions also authorize management of
  the admitted kinds; they are not visibility-only. See [qualification](team/windows-local-setup.md).
- The owner authorized temporary live Argo tracking of
  `fix/cross-platform-local-kubernetes` for testing until merge. The committed default
  remains main; restore it after merge. This does not introduce automatic branch
  selection in setup or accept the feature.

- Remote Argo CD bootstrap: the owner selected remote Kustomize instead of Helm or
  maintaining a copied upstream installation manifest. Deliver the final implementation
  and local runtime evidence, preserving Argo CD v3.5.5, existing local patches,
  image digests, security and lifecycle behavior. Network fetching is acceptable;
  use an immutable upstream reference and verify integrity before installation.
- Replacement authorization: only the existing Argo CD installation may be replaced
  for this amendment; no migration support is required. Preserve the cluster and all
  application databases, broker state, Dashboard history and application credentials.
  Recreate Argo CD's reconciliation configuration as needed. This does not authorize
  commits, pushes, remote publication or feature acceptance.

## Workflow validation/release amendment - 2026-10-23

Owner confirmed PR validation and main release workflows. Both classify once, then
run full application quality and ephemeral Kubernetes verification concurrently.
PRs verify all seven disposable AMD64 images without separate multi-architecture
component builds or publication, including forks. Main publication/promotion requires
both validations, then rebuilds only affected components for AMD64/ARM64. ARM64
failures may first surface after merge; smoke-tested and published images are separate
builds. Manifest-only validation retains its narrow allowlist and skips Kubernetes.
Main's trusted ancestor must prove both full quality and Kubernetes success, so later
manifest changes cannot bypass failed runtime verification. Manual repository-branch
dispatch retains full validation/all-component release. Re-enable deployment after
EX-013-002; prior failed runtime evidence and human feature acceptance remain pending.
See [implementation and verification plan](plan.md#pr-validation-and-main-release-split-2026-10-23).

## Application reporting amendment - 2026-10-23

Owner approved application test reporting through Test Reporter and separate
backend/frontend coverage through ReportGenerator in full PR/main quality. Coverage
is informational, with no percentage gate. Both application suites are attempted after
a test failure; build/setup prerequisites still gate their dependent tests. Preserve
ordinary local check behavior with explicit reporting mode available. Reports include
eligible unexecuted application code and exclude tests/generated code, AppHost and
tooling. Use readonly workflow summaries and downloadable assessed reports, without
PR comments, extra write permissions or external reporting services. Missing expected
reports or report generation failure fails quality. No raw output attachments are
published. Manifest-only quality is unchanged; broader feature acceptance is pending.
Design and verification: [application reporting](team/application-reporting.md).

## Direct component promotion amendment - 2026-10-22

The owner approved direct component promotion to main after successful quality,
publication and candidate manifest validation, replacing the earlier promotion-PR
and required-merge-before-adoption design. Each component owns a dedicated image
patch and release record; bootstrap updates retain their own Job identity. Main
updates use a fresh exact parent and atomic non-force expected-head update, preserve
unrelated changes, reject stale same-component targets and retain identical-digest
no-ops. Promotion has contents:write and Actions evidence read access, with no PR
write permission or automatic branch-rule bypass. Validate formatting, committed
state and real pinned Kustomize/static policy before updating main. GITHUB_TOKEN
pushes do not trigger recursive push workflows. Existing approval of manual
promotion from repository branches remains. Existing promotion PRs are retired.
This amendment supersedes conflicting proposal/merge-only language below and in
historical preparation/evidence; it does not accept the feature or add preproduction.
Current implementation design: [direct promotion](team/direct-component-promotion-design.md).

## User Scenarios & Testing *(mandatory)*

The owner additionally approved manifest-only pull-request and main-merge validation without application tests. Eligibility depends on the complete actual changed-path set being within an explicit manifest/metadata allowlist, never a branch name. The lightweight quality gate validates formatting, committed component/provenance/bootstrap consistency and appropriate static rendering/structure/policy without application builds/tests, runtime checks or image builds. Manifest-only PRs select no downstream images; main manifest changes add no image-build impact, but previously full-quality-validated unpublished component work remains independently eligible for downstream publication retry. Mixed changes, source, scripts, workflows, build inputs, unknown paths or uncertain comparisons retain full quality validation. Main eligibility must also establish that outstanding source changes have successful trusted full-quality evidence; an event's previous revision alone cannot conceal earlier failed or unvalidated source changes. Manual runs retain full quality validation. Generator formatting repairs retain regression tests and the full source-change quality gate.

### User Story 1 - Set up and use the complete local demo (Priority: P1)

As a developer, I can set up the complete demo on my existing machine, sign in, reserve equipment and observe its notification without assembling services manually.

**Why this priority**: A reproducible working application is the primary outcome.

**Independent Test**: Follow the quickstart on a supported prepared machine and complete the business flow through its public entry points.

**Acceptance Scenarios**:

1. **Given** documented prerequisites and explicit developer DNS/trust setup, **When** fresh setup runs, **Then** all application, identity, persistence, messaging, bootstrap and diagnostic components become usable within documented finite budgets, without resetting the existing VM or disturbing unrelated workloads (AC-1.1).
2. **Given** the running demo, **When** a user signs in, reserves equipment and views notifications, **Then** existing authorization, ownership and eventual notification behavior hold without duplicate effects; login/logout and both permitted and forbidden calls work (AC-1.2).
3. **Given** deployment documentation access is enabled, **When** a user opens each service's document and interactive UI through the application origin, signs in and attempts a permitted write and denied operation, **Then** routes, callbacks, contracts and existing browser-write protections work; default non-development exposure remains disabled (AC-1.3).
4. **Given** a failed or unavailable dependency, **When** setup or a workflow executes, **Then** bounded failure diagnostics identify the prerequisite, readiness recovers after restoration, and dependency outages do not cause liveness restart loops (AC-1.4).

### User Story 2 - Preserve data and recover safely (Priority: P1)

As a developer, I can repeat setup, update or restart the demo without losing reservations, identities, credentials or messaging state, and deliberately reset disposable data when needed.

**Why this priority**: Safe reruns prevent ordinary operation from destroying demo work.

**Independent Test**: Create identifiable durable state, perform each lifecycle action, and verify retained state or explicitly requested destruction.

**Acceptance Scenarios**:

1. **Given** existing business and identity data, **When** setup/bootstrap repeats, a deployment updates, pods are replaced or the Podman VM restarts, **Then** durable state and credentials remain usable and existing user passwords are not overwritten (AC-2.1).
2. **Given** durable state and missing local credential files, **When** setup runs, **Then** it stops with recovery instructions without generating replacements or changing existing credentials (AC-2.2).
3. **Given** managed resources and durable state, **When** ordinary synchronization, drift correction or accidental application deletion occurs, **Then** storage is protected; documented intentional resource removal is distinguishable from deleting data (AC-2.3).
4. **Given** an explicit destructive reset or cluster teardown request, **When** the documented command runs, **Then** reconciliation cannot recreate resources mid-operation, destruction is clearly scoped, and fresh setup succeeds afterward; stop, application reset and complete teardown have distinct documented effects (AC-2.4).

5. **Given** the approved upstream installation and local configuration, **When** setup installs Argo CD and repeats, **Then** it uses verified immutable upstream content without a committed copy of the full upstream manifest, retains the selected controller version, image digests and security settings, and reconciliation and authenticated operational access work (AC-2.5).
6. **Given** unavailable upstream content or an integrity mismatch, **When** setup attempts the installation, **Then** it fails within its recorded finite budget with actionable safe diagnostics before applying unverified installation content or replacing a working installation (AC-2.6).
7. **Given** an existing local demo with recorded durable fixtures, **When** the authorized Argo CD replacement and subsequent setup, setup rerun and stop/resume checks run, **Then** reconciliation is restored and the cluster, application database and broker data, Dashboard history and application credentials remain intact; migration of the prior Argo CD installation is not required (AC-2.7).

### User Story 3 - Release reviewed immutable application versions (Priority: P2)

As a maintainer, I can validate changes safely and review a release update before the local environment automatically adopts it.

**Why this priority**: Repeatable reviewed releases make the deployment reproducible.

**Independent Test**: Exercise change classification, publication/promotion and reconciliation with the required separate authorization for external actions.

**Acceptance Scenarios**:

1. **Given** an untrusted or ordinary pull request, including a fork, **When** validation runs, **Then** quality and ephemeral Kubernetes verification pass, with all seven images built for AMD64 and exercised together without publication or exposure of publish credentials; no separate multi-architecture component build runs, and a final required summary reports both validation outcomes (AC-3.1).
2. **Given** a change merged to main and separately authorized external execution, **When** release automation runs after applicable quality and Kubernetes verification gates pass, **Then** affected components independently publish images for both target architectures and commit validated component-specific local immutable-reference updates directly to main with exact source SHA and branch; successful components proceed despite another component's failure (AC-3.2).
3. **Given** a validated deployment update committed to main, **When** reconciliation runs, **Then** the actual published component releases become active and drift is corrected; deployment-reference changes alone do not select otherwise-current components for publication or recursively propose promotions. Outstanding unpublished build-input changes since a component's last successful publication still select that component on a later main merge, including a deployment-only merge (AC-3.3).
4. **Given** a maintainer selects any repository branch and separately authorizes manual release execution, **When** the release workflow runs after full quality and Kubernetes verification pass, **Then** all seven components independently publish for both target architectures and may commit validated component-specific local GitOps updates directly to main with exact source SHA and branch; ordinary non-main pushes do not trigger publication (AC-3.4).
5. **Given** component build inputs or unsuccessful prior component publication, **When** affected components are selected, **Then** selection includes transitive shared references, Dockerfiles, lockfiles, ignore rules, global and pipeline inputs relative to each component's successful publication baseline; uncertainty selects all, and a failed component remains eligible on later main runs (AC-3.5).
6. **Given** one component fails and another succeeds, **When** failed jobs are rerun, **Then** successful results from the same run and source SHA are retained without requiring all seven images to succeed; missing required artifacts cause a clear failure directing a fresh run (AC-3.6).
7. **Given** concurrent component promotions, **When** a successful publication commits a validated update, **Then** stale same-component updates are blocked or refreshed, unrelated component updates are preserved, and an identical deployed digest produces no change; an initial component update may leave other components explicitly unreleased without inventing image references or claiming complete-demo readiness (AC-3.7).
8. **Given** a pull request or main merge whose complete actual changed-path set is confidently limited to explicitly allowed manifest and metadata files, with successful trusted full-quality and Kubernetes-verification evidence for outstanding source changes on main, **When** validation runs, **Then** the lightweight quality gate runs formatting, committed component/provenance/bootstrap consistency and appropriate static render/structure/policy checks without application builds or tests, runtime checks or image builds, and the required summary reports this validation path. Manifest-only PRs select no downstream images; main manifest changes add no build impact, while previously full-quality-validated unpublished component work may independently retry downstream publication under AC-3.3 and AC-3.5 (AC-3.8).
9. **Given** mixed changes, source, scripts, workflows, build inputs, an unknown path, uncertain comparison or earlier failed/unvalidated source quality or Kubernetes verification, **When** validation is selected, **Then** full quality and Kubernetes verification remain required regardless of branch name; manual runs always retain full validation, and source generator fixes retain failing regression evidence followed by passing full source-change checks (AC-3.9).

### User Story 4 - Diagnose securely and retain everyday development (Priority: P2)

As a developer, I can inspect correlated success/failure diagnostics securely and continue using the existing everyday development workflow.

**Why this priority**: Deployment must remain diagnosable without exposing secrets or replacing development ergonomics.

**Independent Test**: Inspect actual exported telemetry and local operational access, then exercise the existing development workflow with its new identity storage.

**Acceptance Scenarios**:

1. **Given** successful and controlled failing workflows, **When** diagnostics are inspected, **Then** correlated traces, structured logs and metrics include relevant database, broker, identity and bootstrap operations, contain no forbidden sensitive fields and obey documented finite resource/retention limits (AC-4.1).
2. **Given** operational interfaces and ingestion, **When** unauthenticated access is attempted, **Then** it is rejected; browser interfaces require authentication through loopback-bound forwarding and internal telemetry ingestion is authenticated (AC-4.2).
3. **Given** the existing development identity volume, **When** development starts with new persistent identity storage, **Then** realm/demo accounts are bootstrapped, login, API documentation and correlated telemetry work, and the old volume remains until explicitly removed; old sessions/manual configuration need not migrate (AC-4.3).
4. **Given** an ordinary audited tool operation in any repository script or test helper, **When** it executes, **Then** both standard output and standard error remain visible during execution; machine-readable results remain capturable without corrupting their consumers (AC-4.4).
5. **Given** a captured tool failure, **When** the script reports it, **Then** the developer receives the safe operation name, tool, duration, failure category and available exit status or termination signal, plus bounded safe tails from both output streams with truncation marked; sensitive operations provide safe diagnostic projections without exposing secrets, raw arguments, environment values or input payloads, automatically saving raw logs, or offering a privacy-bypassing debug mode (AC-4.5).
6. **Given** script or test cleanup fails, **When** the result is reported, **Then** an otherwise successful operation fails; if a primary failure also occurred, it remains the primary diagnostic and cleanup failures are reported separately (AC-4.6).
7. **Given** telemetry already ingested by Dashboard, **When** its Pod is replaced or ordinary setup/stop is performed, **Then** retained telemetry remains available through authenticated access; explicit application reset or cluster teardown removes it, and the documented storage allocation is not represented as a hard filesystem quota (AC-4.7).

### Edge Cases

- An incompatible architecture, insufficient VM resources, occupied port or missing tool produces actionable prerequisite failure, never automatic VM reconfiguration.
- Partial bootstrap reconciles missing configuration safely; permanent failures are not hidden by retries or fixed sleeps.
- Host login resolution alone is insufficient: both browser and workloads must reach and trust the same issuer.
- Forged proxy headers, mismatched issuers/audiences, unapproved origins/redirects and unauthorized writes remain rejected.
- Credentials, CA keys, dashboard login tokens and sensitive URLs must not leak through output, images, manifests, diagnostics or promotion artifacts.
- A rollback must not claim to reverse database schema changes automatically.
- Hosted-runner success cannot substitute for macOS networking, trust or VM-restart evidence.
- Retained Dashboard telemetry survives Pod replacement; existing ephemeral history is not migrated. Explicit application reset or cluster deletion removes telemetry and business data. Local storage is not a backup or a hard byte quota.
- A tool may fail to start, time out, terminate by signal, report only on standard output or standard error, or exceed the diagnostic output bound; each case retains actionable safe failure information.
- A successful operation followed by failed cleanup is not successful overall; simultaneous primary and cleanup failures must not replace or obscure the primary cause.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Provide one complete single-instance local demo, bounded setup and operational commands, prerequisite inspection and actionable failures without automatic VM changes or trust installation (AC-1.1, AC-1.4).
- **FR-002**: Preserve existing authenticated reservation, ownership, browser-write and notification behavior through the deployed public application entry points, with no duplicate retry effects (AC-1.2).
- **FR-003**: Provide one trusted HTTPS application origin for frontend and service-specific API/document/UI/callback routes, and a separate stable HTTPS identity issuer reachable by browsers and workloads (AC-1.2, AC-1.3).
- **FR-004**: Preserve exact issuer/audience validation, certificate verification, PKCE S256, explicit redirects/origins, scoped service authority and trusted proxy boundaries without using development mode as a workaround (AC-1.2, AC-1.3).
- **FR-005**: Make deployed API documentation explicitly configurable while retaining default non-development denial, service-specific contracts and authenticated permitted/denied operations (AC-1.3).
- **FR-006**: Reconcile prerequisite configuration in dependency order with finite deadlines, bounded safe retries, diagnosable failure and appropriate readiness/liveness separation (AC-1.4, AC-2.1).
- **FR-007**: Preserve durable application, identity and broker state across ordinary updates, setup reruns, pod replacement and VM restart; reconcile missing configuration without deleting data or overwriting existing passwords (AC-2.1).
- **FR-008**: Generate credentials once in ignored permission-restricted local files, provision them before application synchronization, reuse them and fail safely when durable state outlives credential files (AC-2.1, AC-2.2).
- **FR-009**: Protect durable resources from ordinary synchronization and accidental application deletion; document reconciliation ownership, pruning and intentional removal (AC-2.3).
- **FR-010**: Provide distinct stop, explicitly destructive application reset and cluster teardown operations, suspending reconciliation as necessary, with successful setup after reset (AC-2.4).
- **FR-011**: Separate PR validation from main release. Run full quality and ephemeral Kubernetes verification concurrently after scope classification. PRs build and exercise all seven disposable AMD64 images without separate multi-architecture component builds. Main component publication/promotion requires both validations before rebuilding affected components for AMD64/ARM64. Keep PR/fork execution free of publication and publish secrets; minimize permissions, pin external automation dependencies and always report a final required summary, including no affected components. Pull requests and main merges confidently limited by their complete actual changed-path set to an explicit manifest/metadata allowlist instead use a lightweight quality gate with formatting, committed component/provenance/bootstrap validation and appropriate static render/structure/policy checks, without application builds/tests, runtime checks or image builds within that gate. Manifest-only PRs select no downstream images; main manifest changes add no build impact but do not erase previously full-quality-validated publication backlog eligible under FR-013 and FR-022. Main eligibility must prove outstanding source changes passed trusted full quality, using a successful full-quality and Kubernetes-verification ancestor baseline or equivalent bounded evidence; comparison only to the previous push revision is insufficient. Branch names do not establish eligibility; mixed, source, script, workflow, build-input, unknown or uncertain changes and failed/unvalidated source quality require full validation. Manual runs always require full quality and Kubernetes verification (AC-3.1, AC-3.8, AC-3.9).
- **FR-012**: Publish affected components independently for both target architectures after main merges; manual invocation from any repository branch selects all seven components and permits validated component-specific local GitOps commits directly to main. Preserve exact source SHA and branch, immutable references and atomic non-force expected-main updates after candidate validation. Ordinary non-main pushes do not publish; no complete seven-image release is required (AC-3.2, AC-3.4).
- **FR-013**: Automatically apply merged approved deployment changes and correct drift. Deployment-reference changes alone must not select otherwise-current components for publication or create recursive promotions; outstanding unpublished build-input changes remain eligible against each component's successful publication baseline even on a later deployment-only main merge (AC-3.3, AC-3.5).
- **FR-014**: Expose only required application/login paths publicly within the local environment; keep databases, brokers, management, detailed health and identity administration internal or explicitly forwarded (AC-1.2, AC-4.2).
- **FR-015**: Authenticate operational browser access and internal telemetry ingestion; retain Dashboard telemetry across Pod replacement and ordinary setup/stop, with explicit reset/teardown destruction semantics. Apply documented retention/resource limits without claiming a local PV provides a hard byte quota; inspect actual success/failure exports for privacy, correlation and safe metric cardinality (AC-2.4, AC-4.1, AC-4.2, AC-4.7).
- **FR-016**: Retain everyday unpushed development with fresh bootstrapped identity storage, separate scoped identity database credentials and preservation of the old identity volume until explicit deletion (AC-4.3).
- **FR-017**: Provide separately invoked deployment verification and hosted ephemeral deployment checks while normal application tests remain independent of Kubernetes and AppHost; record local-only acceptance separately (AC-1.1–AC-4.3).
- **FR-018**: Provide a quickstart covering prerequisites, explicit trust/DNS actions, setup/status/access, safe credential retrieval, initial release/promotion permissions, failure recovery, state semantics and destruction (AC-1.1, AC-2.2, AC-2.4, AC-3.2, AC-4.2).
- **FR-019**: Review all repository scripts and test helpers and make ordinary audited tool operations stream both standard output and standard error during execution; explicitly capture operations whose output is machine-readable or sensitive (AC-4.4).
- **FR-020**: Preserve actionable captured-failure diagnostics: safe operation name, tool, duration, failure category, available exit status or signal, and bounded safe tails from both streams with truncation marked. For sensitive operations use safe projections and exclude secrets, raw arguments, environment values and input payloads; do not automatically persist raw logs or offer a privacy-bypassing debug mode (AC-4.5).
- **FR-021**: Surface cleanup failures and fail otherwise successful commands or tests; preserve the original primary failure when cleanup also fails, reporting cleanup failures separately (AC-4.6).
- **FR-022**: Select affected components conservatively using transitive shared references, Dockerfiles, lockfiles, ignore rules, global and pipeline inputs. Main publication selection uses each component's successful publication baseline so failed publication is not forgotten; uncertain impact selects all components (AC-3.5).
- **FR-023**: Execute seven separate reusable component workflows in parallel after quality prerequisites. A component failure must not cancel or block unrelated component work. Failed-job reruns retain successful same-run, same-SHA results; missing required artifacts fail clearly with instructions for a fresh run (AC-3.2, AC-3.6).
- **FR-024**: Scope promotion updates to dedicated per-component image/record files, validate candidates before atomic direct-to-main commits, reject stale same-component targets, preserve unrelated component updates and treat an identical deployed digest as a no-op. Permit initial partial publication/promotion records while unknown or unpublished components remain explicitly and safely unreleased; never fabricate references or claim complete-demo readiness from a partial release (AC-3.7).

- **FR-025**: Obtain the approved Argo CD installation from verified immutable upstream content without maintaining a full copied upstream manifest. Preserve the approved controller version, image digests, local configuration, security and repeatable setup behavior. Reject unavailable or integrity-invalid upstream content within finite budgets before applying unverified content or replacing a working installation (AC-2.5, AC-2.6).
- **FR-026**: Limit this amendment's authorized local replacement to Argo CD and restore its reconciliation configuration afterward. Preserve the existing cluster and all application database data, broker data, Dashboard history and application credentials; retain setup rerun, stop/resume and authenticated access behavior. Supporting migration of the prior Argo CD installation is outside scope (AC-2.7).

- **FR-027**: Provide assessed application test results and separate backend/frontend
  coverage in full PR/main quality using Test Reporter and ReportGenerator, per the
  owner-approved application reporting amendment; missing expected reports or failed
  generation fails quality, while coverage percentages remain informational (SC-015).

- **FR-028**: Provide independently runnable deployed application acceptance cases
  through Node CLI and VS Code, against preexisting bootstrapped infrastructure.
  Keep mutation prerequisites owned per case, clean up active reservations, retain
  audit history, run serially by default and publish separate privacy-assessed test
  results without coverage. Preserve separate persistence lifecycle verification.

### Key Entities

- **Local environment**: One disposable demo target with durable business/identity/messaging state, distinct application/platform ownership and explicit lifecycle operations.
- **Credential bundle**: Private local secrets tied to durable state; reused until an explicit recovery/reset decision.
- **Release**: One component's immutable multi-architecture image with exact source SHA and branch; publication does not require all seven component images to succeed together.
- **Publication baseline**: A component's last successful publication source, retained independently so another component's success cannot conceal unpublished changes.
- **Promotion**: A reviewable component-specific local deployment-reference change with concurrency and loop prevention, requiring merge before adoption.
- **Verification record**: Environment, exact tested revision, command/action, exit status, result and nonsensitive evidence location; pending actions never count as passes.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: One documented fresh setup and one repeat setup succeed within the plan's recorded finite budgets, with no credential replacement, duplicate bootstrap effects or unrelated workload loss.
- **SC-002**: Login/logout, reservation/notification and every service's interactive documentation each pass representative permitted and forbidden operation checks without security bypasses.
- **SC-003**: All recorded durable fixtures survive each of pod replacement, ordinary release update and VM restart; missing credentials fail safely in one recovery exercise.
- **SC-004**: One real reviewed immutable component release is adopted automatically and one deliberate drift is corrected. Deployment-reference changes alone produce zero publication selections or recursive promotions for otherwise-current components; a later deployment-only main merge still selects a component with outstanding unpublished build-input changes since its successful publication baseline (AC-3.3, AC-3.5).
- **SC-005**: Representative success and controlled failure exports show correlated workflow/dependency diagnostics, zero forbidden sensitive fields and enforced documented diagnostic limits.
- **SC-006**: One explicit reset followed by setup succeeds; ordinary synchronization/deletion safety and distinct lifecycle effects have recorded evidence.
- **SC-007**: Required application checks, deployment checks, local acceptance and development regression checks each have revision-matched results; independent reviews, convergence and explicit human acceptance remain required before completion.
- **SC-008**: Every repository script and test helper has a recorded output-handling assessment; representative ordinary operations expose both streams, and controlled captured failures cover start failure, timeout, signal termination, output on either stream and output exceeding the documented bound, with zero forbidden sensitive disclosures (AC-4.4, AC-4.5).
- **SC-009**: Controlled cleanup failures prove both unsuccessful cleanup after primary success and simultaneous primary/cleanup failure preserve the required overall result and diagnostics (AC-4.6).
- **SC-010**: Release verification covers main and non-main manual invocation selecting all seven components, automatic publication restricted to affected components on main, validated direct-to-main component promotions from either branch; actual external executions require separate authorization (AC-3.2, AC-3.4).
- **SC-011**: Verification covers fork pull requests, no affected components, transitive/shared build inputs, uncertain impact and an earlier component publication failure; results prove applicable quality and Kubernetes verification precede publication, PR AMD64 deployment builds run without publication credentials, main publishes affected multi-architecture images, required summary always reports both validation outcomes, and failed components remain selected until successfully published. Manifest-only eligibility and checks are separately established by SC-013 (AC-3.1, AC-3.5).
- **SC-012**: Controlled independent component failures, same-run reruns, missing artifacts, concurrent/stale promotions and identical digests prove successful components proceed independently, source provenance is preserved, invalid result reuse fails clearly, unrelated proposals survive and unchanged digests produce no update (AC-3.6, AC-3.7).
- **SC-013**: Verification proves eligible manifest-only pull requests and main merges run formatting and committed component/provenance/bootstrap plus static render/structure/policy validation with zero application build/test, runtime or image-build execution inside the lightweight quality gate; invalid manifest state fails. Manifest-only PRs select no downstream images; a main manifest-only push adds no build impact yet retains independent downstream retry of previously full-quality-validated unpublished components. Mixed changes, misleading branch names, unknown paths, unavailable/uncertain comparisons and earlier failed/unvalidated source quality select full validation. A failed source-quality or Kubernetes-verification run followed by a manifest-only main push cannot bypass full validation or permit publication based on that failure; manual runs always select full quality and Kubernetes verification. Generated promotion artifacts satisfy committed formatting, with the generator fix verified by regression tests and source-change quality checks (AC-3.8, AC-3.9).

- **SC-014**: One locally tested controller replacement, one setup rerun and one stop/resume exercise restore healthy reconciliation and authenticated access while every recorded application database, broker, Dashboard and credential fixture is retained. Verification additionally covers unavailable upstream content and integrity mismatch, with zero unverified installation content applied and no replacement of a working installation on either failure (AC-2.5–AC-2.7).

- **SC-015**: Full PR/main quality provides Test Reporter summaries and separate
  ReportGenerator backend/frontend coverage summaries and downloadable HTML reports.
  Both application suites are attempted after test failure; original failure remains
  observable, and missing/malformed reports fail. Controlled private markers in raw
  output/attachments are absent from published results. Local default checks and
  manifest-only behavior remain unchanged; coverage percentages do not gate quality.

- **SC-016**: Each deployed scenario can run alone or with the serial suite; missing
  prerequisites and failed/missing results fail visibly. Kubernetes verification
  publishes named-case summaries and downloadable test-only results after failures.
  Normal application/provider checks do not discover the live suite. IDE behavior
  and real deployed success require corresponding runtime evidence.

## Assumptions

- The handoff's confirmed Q1–Q29 decisions are settled requirements; no new business interview is needed. Concrete versions, sizing, routes, trust, storage and compatibility proof are design work, not presumed successful here.
- Required delivery constraints are kind on the existing macOS Podman VM, plus the owner-approved Windows/WSL qualification described above; the existing application/services plus PostgreSQL, RabbitMQ, Keycloak, bootstrap jobs and standalone Aspire Dashboard; Kustomize shared base/local overlay; Argo CD against the existing public repository; GHCR multi-platform digest references for linux/arm64 and linux/amd64. Technical contracts belong in the plan and handoff, rather than being inferred from success claims.
- The owner-approved narrow testing-policy amendment and deployed-documentation access adaptation must be materialized and independently reviewed before dependent implementation. Further policy changes require explicit owner approval.
- Downtime is acceptable. High availability, backups, automated credential rotation, service mesh, managed dependencies and long-term telemetry storage are excluded.
- Azure artifacts/provisioning and validated Azure runtime compatibility are excluded; eventual reuse allows environment-specific networking, trust, secrets, storage and sizing without application source changes.
- There is one supported local target, no local-dev/local-demo split or local image override/load workflow. CI-only test images do not establish another supported developer workflow.
- External publication, pushing/merging, GitHub settings changes and local trust/VM changes require separate explicit authorization/action. Generated automation alone cannot satisfy real release acceptance.
- No session/manual identity configuration migration is promised. Cluster deletion or explicit reset may erase demo data. Temporary telemetry may disappear on viewer restart.
- Component-pipeline compatibility verification uses the existing compatibility tests. New OpenAPI compatibility gates and preproduction environments are outside this amendment.
