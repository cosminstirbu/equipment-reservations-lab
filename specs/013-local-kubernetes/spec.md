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

- Owner request: Allow running the release workflow from any branch. Coordinator interpretation: permit manual release invocation from any repository branch, retain automatic publication only for main, and retain promotion proposals only for main so unmerged sources are not adopted. This implementation scope does not authorize an actual publication run, commit or push.

## User Scenarios & Testing *(mandatory)*

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

### User Story 3 - Release reviewed immutable application versions (Priority: P2)

As a maintainer, I can validate changes safely and review a release update before the local environment automatically adopts it.

**Why this priority**: Repeatable reviewed releases make the deployment reproducible.

**Independent Test**: Exercise change classification, publication/promotion and reconciliation with the required separate authorization for external actions.

**Acceptance Scenarios**:

1. **Given** an untrusted or ordinary pull request, **When** validation runs, **Then** required application and deployment checks run without publication or exposure of publish credentials (AC-3.1).
2. **Given** an application change merged to main and separately authorized external execution, **When** release automation runs, **Then** it publishes images for both target architectures and proposes a reviewable update containing immutable references and source revision; an existing promotion or concurrent update is handled without lost changes (AC-3.2).
3. **Given** an approved merged deployment update, **When** reconciliation runs, **Then** the actual published release becomes active and drift is corrected; a deployment-only merge does not republish images or recursively propose promotions (AC-3.3).
4. **Given** a maintainer selects any repository branch and separately authorizes manual release execution, **When** the release workflow runs, **Then** it publishes images for both target architectures with source provenance; a non-main branch creates no promotion proposal and changes no deployment references, and an ordinary push to that branch does not trigger publication (AC-3.4).

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

### Edge Cases

- An incompatible architecture, insufficient VM resources, occupied port or missing tool produces actionable prerequisite failure, never automatic VM reconfiguration.
- Partial bootstrap reconciles missing configuration safely; permanent failures are not hidden by retries or fixed sleeps.
- Host login resolution alone is insufficient: both browser and workloads must reach and trust the same issuer.
- Forged proxy headers, mismatched issuers/audiences, unapproved origins/redirects and unauthorized writes remain rejected.
- Credentials, CA keys, dashboard login tokens and sensitive URLs must not leak through output, images, manifests, diagnostics or promotion artifacts.
- A rollback must not claim to reverse database schema changes automatically.
- Hosted-runner success cannot substitute for macOS networking, trust or VM-restart evidence.
- Temporary diagnostic data may disappear after viewer restart; business data may disappear after explicit reset/cluster deletion.
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
- **FR-011**: Validate pull requests without publication, protect fork/untrusted execution, minimize job permissions and pin external automation dependencies (AC-3.1).
- **FR-012**: Automatically publish application releases for both target architectures after application merges to main, and allow maintainers to invoke publication manually from any repository branch. Retain source provenance, limit promotion proposals to main with only local immutable-reference updates, and safely handle existing promotions and concurrency. Ordinary non-main pushes do not trigger publication; non-main publication changes no deployment references (AC-3.2, AC-3.4).
- **FR-013**: Automatically apply merged approved deployment changes and correct drift without a recursive publication/promotion loop on deployment-only changes (AC-3.3).
- **FR-014**: Expose only required application/login paths publicly within the local environment; keep databases, brokers, management, detailed health and identity administration internal or explicitly forwarded (AC-1.2, AC-4.2).
- **FR-015**: Authenticate operational browser access and internal telemetry ingestion; bound temporary telemetry and inspect actual success/failure exports for privacy, correlation and safe metric cardinality (AC-4.1, AC-4.2).
- **FR-016**: Retain everyday unpushed development with fresh bootstrapped identity storage, separate scoped identity database credentials and preservation of the old identity volume until explicit deletion (AC-4.3).
- **FR-017**: Provide separately invoked deployment verification and hosted ephemeral deployment checks while normal application tests remain independent of Kubernetes and AppHost; record local-only acceptance separately (AC-1.1–AC-4.3).
- **FR-018**: Provide a quickstart covering prerequisites, explicit trust/DNS actions, setup/status/access, safe credential retrieval, initial release/promotion permissions, failure recovery, state semantics and destruction (AC-1.1, AC-2.2, AC-2.4, AC-3.2, AC-4.2).
- **FR-019**: Review all repository scripts and test helpers and make ordinary audited tool operations stream both standard output and standard error during execution; explicitly capture operations whose output is machine-readable or sensitive (AC-4.4).
- **FR-020**: Preserve actionable captured-failure diagnostics: safe operation name, tool, duration, failure category, available exit status or signal, and bounded safe tails from both streams with truncation marked. For sensitive operations use safe projections and exclude secrets, raw arguments, environment values and input payloads; do not automatically persist raw logs or offer a privacy-bypassing debug mode (AC-4.5).
- **FR-021**: Surface cleanup failures and fail otherwise successful commands or tests; preserve the original primary failure when cleanup also fails, reporting cleanup failures separately (AC-4.6).

### Key Entities

- **Local environment**: One disposable demo target with durable business/identity/messaging state, distinct application/platform ownership and explicit lifecycle operations.
- **Credential bundle**: Private local secrets tied to durable state; reused until an explicit recovery/reset decision.
- **Release**: Source revision and immutable multi-architecture application image references proposed for review.
- **Promotion**: A reviewable local deployment-reference change with concurrency and loop prevention.
- **Verification record**: Environment, exact tested revision, command/action, exit status, result and nonsensitive evidence location; pending actions never count as passes.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: One documented fresh setup and one repeat setup succeed within the plan's recorded finite budgets, with no credential replacement, duplicate bootstrap effects or unrelated workload loss.
- **SC-002**: Login/logout, reservation/notification and every service's interactive documentation each pass representative permitted and forbidden operation checks without security bypasses.
- **SC-003**: All recorded durable fixtures survive each of pod replacement, ordinary release update and VM restart; missing credentials fail safely in one recovery exercise.
- **SC-004**: One real reviewed immutable release is adopted automatically, one deliberate drift is corrected and a deployment-only update produces zero recursive promotions.
- **SC-005**: Representative success and controlled failure exports show correlated workflow/dependency diagnostics, zero forbidden sensitive fields and enforced documented diagnostic limits.
- **SC-006**: One explicit reset followed by setup succeeds; ordinary synchronization/deletion safety and distinct lifecycle effects have recorded evidence.
- **SC-007**: Required application checks, deployment checks, local acceptance and development regression checks each have revision-matched results; independent reviews, convergence and explicit human acceptance remain required before completion.
- **SC-008**: Every repository script and test helper has a recorded output-handling assessment; representative ordinary operations expose both streams, and controlled captured failures cover start failure, timeout, signal termination, output on either stream and output exceeding the documented bound, with zero forbidden sensitive disclosures (AC-4.4, AC-4.5).
- **SC-009**: Controlled cleanup failures prove both unsuccessful cleanup after primary success and simultaneous primary/cleanup failure preserve the required overall result and diagnostics (AC-4.6).
- **SC-010**: Release verification covers manual invocation from main and a non-main repository branch, automatic publication restricted to main, and zero promotion proposals or deployment-reference changes from non-main publication; actual external executions require separate authorization (AC-3.2, AC-3.4).

## Assumptions

- The handoff's confirmed Q1–Q29 decisions are settled requirements; no new business interview is needed. Concrete versions, sizing, routes, trust, storage and compatibility proof are design work, not presumed successful here.
- Required delivery constraints are kind on the existing macOS Podman VM; the existing application/services plus PostgreSQL, RabbitMQ, Keycloak, bootstrap jobs and standalone Aspire Dashboard; Kustomize shared base/local overlay; Argo CD against the existing public repository; GHCR multi-platform digest references for linux/arm64 and linux/amd64. Technical contracts belong in the plan and handoff, rather than being inferred from success claims.
- The owner-approved narrow testing-policy amendment and deployed-documentation access adaptation must be materialized and independently reviewed before dependent implementation. Further policy changes require explicit owner approval.
- Downtime is acceptable. High availability, backups, automated credential rotation, service mesh, managed dependencies and long-term telemetry storage are excluded.
- Azure artifacts/provisioning and validated Azure runtime compatibility are excluded; eventual reuse allows environment-specific networking, trust, secrets, storage and sizing without application source changes.
- There is one supported local target, no local-dev/local-demo split or local image override/load workflow. CI-only test images do not establish another supported developer workflow.
- External publication, pushing/merging, GitHub settings changes and local trust/VM changes require separate explicit authorization/action. Generated automation alone cannot satisfy real release acceptance.
- No session/manual identity configuration migration is promised. Cluster deletion or explicit reset may erase demo data. Temporary telemetry may disappear on viewer restart.
