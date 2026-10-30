# Feature Specification: Cost-conscious Azure learning environment

**Feature Branch**: `014-azure-aks-gitops` (created by coordinator; initial baseline was `main`)

**Created**: 2026-10-26

**Status**: Implementation in progress - source qualification, live acceptance, current-revision independent reviews, convergence and explicit human acceptance pending

**Input**: Implement the agreed Azure learning environment with the feature team: production-style security, reproducible infrastructure and delivery, stop/start cost control, browser access, and demonstrated recovery. The human-approved deployment constraints and conversation decisions are recorded in [decisions.md](decisions.md); exact approved security exceptions and processing scope are maintained in [the scoped approval record](team/proposed-policy-exceptions.md).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Use a securely hosted application (Priority: P1)

As the environment owner, I can deploy the existing equipment reservations application and use it through a stable, trusted HTTPS address, with its existing login and booking behavior intact.

**Why this priority**: A working browser-accessible application is the purpose of the environment.

**Independent Test**: Provision a fresh environment, authenticate through the normal browser flow, and execute the existing deployed application acceptance journeys.

**Acceptance Scenarios**:

1. **Given** the domain has been delegated and provisioning is complete, **When** a user opens the application hostname, **Then** the browser accepts its certificate without disabling verification and the normal identity redirect and return flow succeeds. (US1-A1)
2. **Given** authenticated users and initialized equipment, **When** the deployed application journeys run, **Then** booking, authorization, and messaging outcomes match the existing application contracts. (US1-A2)
3. **Given** an external unauthenticated client, **When** it attempts access to internal data, messaging, secret, or telemetry ingestion endpoints, **Then** those endpoints are unavailable through public application routes. (US1-A3)
4. **Given** a pod is replaced, **When** the application recovers, **Then** existing persisted bookings and identities remain available without reseeding. (US1-A4)

---

### User Story 2 - Recreate the environment through an approved pipeline (Priority: P1)

As the environment owner, I can review infrastructure changes, approve their application, and reproduce locally tested infrastructure through the repository workflow without distributing long-lived cloud credentials.

**Why this priority**: Reproducibility and controlled changes are core learning outcomes, rather than a one-off manual installation.

**Independent Test**: Exercise a pull request, verify its checks and plan, then run an approved creation from the recorded revision after workload teardown.

**Acceptance Scenarios**:

1. **Given** proposed infrastructure changes, **When** the pull-request workflow runs, **Then** formatting, validation, lint, security, and applicable plan checks report results without applying infrastructure. (US2-A1)
2. **Given** a reviewed revision and authorized approval, **When** its apply runs, **Then** only that revision is applied, operations sharing state are serialized, and deployment authentication uses short-lived federated credentials. (US2-A2)
3. **Given** infrastructure validated locally and a successful pre-teardown backup, **When** workload infrastructure is destroyed and recreated through the workflow, **Then** a fresh installation passes the same browser and deployed application checks while the retained foundation remains intact. (US2-A3)
4. **Given** a request to destroy infrastructure, **When** the environment-name confirmation or required approval is missing or wrong, **Then** destruction does not proceed. Branch deletion never implicitly destroys infrastructure. (US2-A4)
5. **Given** no cloud credentials on a contributor's machine, **When** they run the documented source checks, **Then** the deterministic checks can execute without provisioning resources. (US2-A5)

---

### User Story 3 - Stop safely and resume work (Priority: P1)

As the owner paying for a learning environment, I can stop compute between sessions and restart it without losing application state or silently accepting a broken environment.

**Why this priority**: Limiting idle compute is necessary to the agreed spending target.

**Independent Test**: Create a booking, stop and start the environment, and verify the booking, login, messaging, secrets retrieval, certificates, and operational endpoints.

**Acceptance Scenarios**:

1. **Given** a running environment, **When** the operator invokes stop, **Then** compute stops without destroying persistent state or the retained foundation, and the operation reports its actual outcome. (US3-A1)
2. **Given** a stopped environment, **When** start is invoked, **Then** it reports ready only after certificate, login, persisted-data, messaging, secret-access, and deployed acceptance checks succeed. Failures remain failures with safe diagnostics. (US3-A2)
3. **Given** the daily safety-stop time of 23:00 Europe/Bucharest, **When** there is no valid time-limited override, **Then** the stop workflow is invoked, accounting for daylight-saving changes. A valid override expires and cannot disable the schedule permanently. (US3-A3)
4. **Given** the environment is stopped during a backup schedule, **When** the schedule runs, **Then** it does not start compute solely to take an unchanged-data backup. (US3-A4)

---

### User Story 4 - Diagnose and release through protected operational tools (Priority: P2)

As an operator, I can access browser-based deployment and diagnostics tools, inspect recent correlated telemetry, and deploy reviewed application configuration independently of infrastructure changes.

**Why this priority**: These capabilities teach operations without requiring high availability or a large managed-service footprint.

**Independent Test**: Authenticate to both operator hostnames from an allowed address, inspect a known workflow's telemetry, and merge an approved deployment configuration change.

**Acceptance Scenarios**:

1. **Given** an allowed operator network address and operator identity, **When** the operator opens either operational hostname, **Then** trusted HTTPS and operator login are required; anonymous, unauthorized, and disallowed-address requests are denied. (US4-A1)
2. **Given** the application identity provider is unavailable, **When** an authorized operator accesses the deployment or diagnostics tools, **Then** operator authentication remains independent; a documented emergency deployment-tool access procedure remains available. (US4-A2)
3. **Given** reviewed deployment configuration is merged, **When** reconciliation runs, **Then** the declared release is deployed and unmanaged drift is corrected; ordinary releases do not require an infrastructure apply. (US4-A3)
4. **Given** persistent data or a critical platform resource is accidentally removed from desired configuration, **When** reconciliation runs, **Then** explicit deletion protection prevents silent destructive deletion. (US4-A4)
5. **Given** a known workflow produces telemetry, **When** the operator investigates it, **Then** correlated diagnostic signals are available and a bounded three-day historical store survives pod replacement and cluster stop/start; full teardown need not preserve that history. (US4-A5)
6. **Given** a trusted application release is ready for publication, **When** the existing promotion flow publishes it to both agreed registries, **Then** each destination contains the same immutable image content for the same source release, the existing local deployment flow remains supported, and reviewed cloud deployment configuration references its destination's verified immutable image. (US4-A6)
7. **Given** either registry publication fails or content verification finds different images, **When** the promotion flow completes, **Then** it reports failure and does not promote the release or update deployment references as successful; retry can reuse an already verified publication without substituting a different release. (US4-A7)
8. **Given** either retained state or recovery storage is accessed, **When** a representative authorized or denied Blob operation occurs, **Then** a protected audit record is available to an authorized operator with useful operation/outcome evidence, privacy controls, and enforced retention/usage bounds; its cost is included in the approved monthly estimate. (US4-A8)

---

### User Story 5 - Recover data after complete workload loss (Priority: P2)

As the owner, I can restore a booking and its associated login identity from an external recovery point into newly created infrastructure.

**Why this priority**: Persistent disks alone do not establish recovery from deletion or cluster loss.

**Independent Test**: Record a booking and its user, drain messaging, take and verify a backup, destroy the workload, demonstrate clean recreation, explicitly restore, then verify the original user's access and booking.

**Acceptance Scenarios**:

1. **Given** a running environment with data, **When** a scheduled backup succeeds, **Then** a recoverable point containing application and identity data and a compatible secret-recovery procedure is stored outside the workload teardown boundary. Retention keeps seven successful daily recovery points once available. (US5-A1)
2. **Given** a destructive rehearsal is requested, **When** a fresh backup is missing, failed, or not verified, or messaging has not drained, **Then** the rehearsal cannot destroy workload data. (US5-A2)
3. **Given** a clean recreated environment and selected verified recovery point, **When** the operator explicitly initiates restore, **Then** the original user can log in and see the recorded booking within one working session, using at worst the latest successful daily recovery point. (US5-A3)
4. **Given** a backup failure or incompatible restore input, **When** the operation completes, **Then** failure is visible, no successful recovery is claimed, and safe diagnostics identify the failed phase without exposing private data. (US5-A4)

### Edge Cases

- DNS delegation is incomplete, a hostname points to old infrastructure, or issuance/renewal is unavailable: readiness must fail rather than bypass certificate verification.
- Certificates expire while compute is stopped: startup must recover trusted HTTPS before reporting success.
- The operator's public IP changes: retain a documented authenticated procedure to update access restrictions without broadening them permanently.
- Cloud capacity, permissions, subscription policy, or quota prevents provisioning: surface the prerequisite failure; do not substitute a more expensive or less secure architecture silently.
- Overlapping stop/start, apply, destroy, or scheduled backup operations must not race against the same environment or corrupt state.
- An approved plan becomes stale or the requested revision changes: require a new plan/review rather than applying unreviewed changes.
- An untrusted pull request must not obtain privileged cloud credentials or private plan/state contents.
- Identity data is restored but credentials or client configuration differ: fail recovery until compatibility is restored, without leaking secret values.
- Messaging fails to drain: block the first destructive recovery rehearsal; recovery of messages in flight is outside this initial exercise.
- A single-instance dependency fails or nodes are maintained: downtime is acceptable, but failure and recovery must be observable.
- Backup retention must not count failed backups as successful points or delete the only verified recovery point during teardown preparation.
- Security scanning cannot execute or policies cannot load: fail the gate rather than report a clean scan.
- One registry accepts an image while the other fails, a destination cannot be verified, or registry content differs: fail release promotion without advancing deployment references. Do not assume publishing to separate registries is an atomic transaction.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The environment MUST host the existing application and required dependencies without changing its reservation, authorization, or delivery contracts. (US1-A2)
- **FR-002**: Users MUST access application and login endpoints through stable, publicly trusted HTTPS hostnames with working identity redirects. (US1-A1)
- **FR-003**: Only explicitly approved browser routes MUST be publicly exposed; data, broker management, administrative identity interfaces, secrets, and telemetry ingestion MUST remain internal or operator-restricted as applicable. (US1-A3, US4-A1)
- **FR-004**: Operators MUST authenticate independently of the application identity provider, with least privilege, source-address restrictions for operator browser routes and cluster administration, and documented emergency deployment-tool access. (US4-A1, US4-A2)
- **FR-005**: Workloads MUST retrieve only authorized secrets using scoped identities; committed configuration and routine diagnostics MUST contain no secret values or long-lived deployment credentials. (US1-A3, US2-A2, US3-A2)
- **FR-006**: Workloads MUST have explicit resource budgets, distinct startup/readiness/liveness behavior, least-privilege runtime security, and permitted network paths only. Dependency outages MUST NOT be disguised as healthy service. (US1-A2, US1-A3, US3-A2)
- **FR-007**: Infrastructure MUST be reproducible from reviewed repository configuration, with remote locked state, one owner per resource, and a separately retained bootstrap foundation. (US2-A2, US2-A3)
- **FR-008**: Pull requests MUST run deterministic formatting, validation, lint, source security, and applicable plan checks. Enabled security findings and scanner execution errors MUST block unless a finding has a specific human-approved exception. (US2-A1, US2-A5)
- **FR-009**: Local and workflow checks MUST use the same repository commands and pinned tool, provider, module, plugin, action, and security-policy inputs; automatic formatting MAY modify local files, while CI MUST only check formatting. (US2-A1, US2-A5)
- **FR-010**: Infrastructure apply MUST require explicit approval of the reviewed revision, short-lived federated authentication, and serialized state-changing operations. Private plans/state MUST NOT be published in workflow logs or public artifacts. (US2-A2)
- **FR-011**: Destroy MUST be a separate manual workflow requiring explicit environment-name confirmation and approval. The retained foundation and external recovery location MUST remain outside workload destruction. (US2-A3, US2-A4)
- **FR-012**: The implementation MUST first support and validate local provisioning, then demonstrate complete workload teardown and clean recreation through the workflow. (US2-A3)
- **FR-013**: Application delivery MUST use immutable image references and reviewed versioned configuration, reconcile merged desired state and drift, and protect persistent data and critical platform resources from accidental deletion. (US4-A3, US4-A4)
- **FR-014**: The operator MUST be able to stop/start through manual workflows without deleting state; startup MUST run readiness and deployed application checks before reporting success. (US3-A1, US3-A2)
- **FR-015**: A daily 23:00 Europe/Bucharest safety stop MUST support a time-limited override and daylight-saving changes. Stop/start MUST remain distinct from infrastructure destruction. (US3-A3)
- **FR-016**: Persistent application and identity data MUST survive pod replacement and cluster stop/start without reseeding. (US1-A4, US3-A2)
- **FR-017**: The environment MUST take backups while running, retain seven successful daily recovery points outside workload destruction, and expose backup failures; a stopped environment MUST NOT start solely for backup. (US3-A4, US5-A1, US5-A4)
- **FR-018**: Destructive recovery rehearsal MUST require drained messaging and a fresh verified external backup. Ordinary creation MUST remain independent of explicit manual restoration. (US2-A3, US5-A2, US5-A3)
- **FR-019**: Recovery MUST demonstrate the original user's login and booking after restoration of application/identity data and compatible secrets, with a target of the latest successful daily point and completion within one working session. (US5-A3, US5-A4)
- **FR-020**: Operators MUST have correlated traces, logs and metrics, bounded three-day historical retention that survives stop/start, and protected live diagnostics. Telemetry MUST comply with repository privacy and cardinality rules; full teardown need not retain it. (US4-A5)
- **FR-021**: Certificate issuance and renewal MUST be automated after documented domain delegation and subscriber agreement; readiness MUST verify trust after start. No certificate-verification bypass is acceptable. (US1-A1, US3-A2)
- **FR-022**: Planning MUST produce a region-specific cost estimate separating running-hour costs from retained stopped costs, assuming 40 running hours/month, excluding credits, including protected audit logging and applicable taxes, and comparing against a EUR 120/month tax-inclusive target. The applicable tax rate MUST be supplied or discovered before paid provisioning rather than inferred from timezone. Exceeding that target MUST return to the owner for architecture revision before paid workload provisioning. (SC-001)
- **FR-023**: Documentation and acceptance evidence MUST distinguish tested production-style practices from accepted single-instance downtime and explicitly identify deferred availability capabilities. (SC-002, SC-008)
- **FR-024**: Operational failures MUST preserve useful phase/outcome evidence, bounded waits and cleanup, without leaking tokens, credentials, private plans, authenticated payloads or personal data. Failed prerequisite, cleanup, security or readiness checks MUST NOT be counted as success. (US2-A1, US3-A2, US5-A4)
- **FR-025**: The existing image publication and promotion flow MUST publish the same immutable source-release image content to both agreed registries and verify each destination before promoting the release or advancing its deployment references. Partial publication, unverifiable content, or different image content MUST fail promotion. Retries MUST preserve source-release identity and MAY reuse verified successful publications; existing local deployment support MUST remain intact. (US4-A6, US4-A7)
- **FR-026**: Both retained state and recovery storage MUST provide protected Blob access auditing with least-privilege operator access, privacy-safe operation/outcome evidence, bounded retention and usage, and costs included in the tax-inclusive monthly target. Auditing an unused storage protocol MUST NOT substitute for actual Blob auditing, and absent audit evidence MUST NOT be represented as a successful audit check. (US4-A8, SC-012)

### Key Entities

- **Environment**: One owner-operated learning installation; has a desired revision, running/stopped state, approved access addresses, hostnames and lifecycle history.
- **Retained foundation**: State backend, federated deployment identity, delegated DNS zone and external recovery location that survive workload destruction.
- **Deployment revision**: Reviewed infrastructure and workload configuration with immutable images, plan evidence and approval association.
- **Recovery point**: Successful dated backup set, verification result, application/identity compatibility information and retention status; contains sensitive data.
- **Operator**: Authorized administrator whose identity is independent of application users; may approve changes and initiate lifecycle/recovery operations within assigned privileges.
- **Safety-stop override**: Explicit authorization to postpone scheduled stopping, with a mandatory expiry.
- **Security exception**: Specific finding or rule scope, rationale, human approver, owner and date; never a blanket scanner disablement.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Before paid workload provisioning, the owner can inspect a West Europe estimate for 40 running hours/month showing running and stopped costs separately, protected audit logging, the evidenced applicable tax rate and tax-inclusive total compared with EUR 120/month, excluding credits.
- **SC-002**: One locally validated installation is torn down and one fresh workflow-created installation passes all selected existing deployed acceptance journeys; retained resources are enumerated and verified intact.
- **SC-003**: All four agreed browser endpoints use trusted HTTPS; positive operator access and anonymous, unauthorized, and disallowed-address denial are demonstrated.
- **SC-004**: One stop/start cycle preserves a recorded booking and user identity and passes certificate, secret-access, login, messaging and deployed application checks.
- **SC-005**: The same invalid-format, invalid-configuration, lint and selected security violations fail local and workflow gates; a clean configuration passes with identical pinned inputs. No gate silently passes when its scanner fails.
- **SC-006**: A restore into recreated infrastructure demonstrates the original user's login and recorded booking from the latest successful daily recovery point within one operator working session, with actual elapsed time recorded.
- **SC-007**: A safety-stop test demonstrates both scheduled execution and override expiry, including both seasonal UTC offsets; stopped backup handling does not start compute.
- **SC-008**: A representative request and messaging workflow has correlated diagnostic evidence, historical data survives a pod restart and stop/start, and configured retention/capacity bounds enforce the three-day target. Evidence distinguishes retention configuration from any elapsed-time observation.
- **SC-009**: An accidental deletion and an unauthorized apply/destroy attempt are prevented by the configured protections; reviewed routine release and drift correction complete without an infrastructure apply.
- **SC-010**: Independent quality/security reviews, required checks, convergence and explicit human acceptance are recorded for the tested revision before the feature is called complete.
- **SC-011**: One release is verified with identical immutable image content at both destinations and remains usable by existing local and cloud delivery flows; controlled partial-publication and content-mismatch failures prevent promotion and deployment-reference advancement, and a retry completes for the same release without changing its content.
- **SC-012**: Representative authorized and denied Blob operations against both retained storage accounts produce protected audit evidence; an unauthorized reader is denied, sensitive inputs do not appear in exposed diagnostics, and configured retention/usage bounds and estimated cost are verified.

## Assumptions

- This is a learning environment with disposable test data, not a production service or an uptime commitment. Downtime during single-instance failures and maintenance is accepted.
- The existing local Kubernetes work remains available; cloud verification is separately invoked and does not make ordinary application tests depend on Azure access.
- The domain `codingfunlab.com` is already purchased at Porkbun. The owner will perform initial nameserver delegation when Azure provides the values and accept certificate subscriber terms.
- Subscription, tenant, repository permissions, current public operator address and exact cloud capacity are environment prerequisites to discover safely; they are not invented human decisions.
- West Europe is the initial evaluation region, subject to capacity and a verified estimate. The target is a planning constraint, not a guaranteed quote or automatic cloud spending cap.
- A working session is the owner-assisted recovery exercise; actual duration must be recorded. No numerical restoration SLA or production load target was agreed.
- Scope includes protected operator tools, external backups, certificate automation, release delivery and infrastructure workflows. Multi-region service, replicated database/broker high availability, messages-in-flight disaster recovery, service mesh and expensive perimeter services are deferred.
- The approved technology constraints in [decisions.md](decisions.md) are inputs to planning, not claims that an unverified cloud capability or particular version exists.
