# Approved decisions: Azure AKS GitOps learning environment

Date: 2026-10-26. Source: explicit owner answers in this conversation. This record preserves constraints for planning; it does not approve a design, waive policy, claim checks passed, or authorize an unreviewed exception.

## Baseline and standards

- Specification baseline: `d1c7238345136340ddbf3a9454807cefffc43c32`, initially clean working tree on `main`.
- Scope: new feature `specs/014-azure-aks-gitops`; preserve feature 013 artifacts and local Kubernetes behavior.
- Required reading completed for requirements work: AGENTS.md, constitution 1.1.1, engineering index, formatting/static analysis, testing, tooling, observability, resilience, Aspire, feature-team protocol and requirements analyst role.
- Verification evidence for these documentation changes: local link resolution, requirement/scenario mapping, decision completeness and contradiction inspection, plus repository required format/lint checks at coordinated handoff. No application tests or implementation were changed by the analyst.
- No `.specify/extensions.yml` exists: specify/clarify pre/post hooks do not run and no hook creates a branch.
- Template resolution uses the repository Spec Kit resolver, which selected the committed spec template.

## Accepted interview decisions

| Decision | Human-approved scope |
| --- | --- |
| Q1 | Production-style learning environment; downtime acceptable during maintenance and dependency failures. Secure delivery, monitoring, backups and recovery first; defer dependency HA. |
| Q2 | Historical initial target EUR 100/month assuming roughly 40 running hours/month; superseded by the owner's later EUR 120/month INCLUDING applicable taxes decision below. Include stopped retained charges and exclude credits; revise architecture with owner if over target. |
| Q3 | Plain Terraform initially; defer Terraspace until a concrete multi-environment need. |
| Q4 | Terraform owns Azure infrastructure; cluster workload delivery is separate; Aspire owns local development. Q8 refines workload ownership to Argo CD. Explicitly overrides the earlier Aspire-native Azure infrastructure suggestion. |
| Q5 | Disposable test data; latest successful daily backup target; restore within one working session. |
| Q6 | Explicit operator stop/start with safety-stop assistance; persisted bookings survive restart without reseeding. |
| Q7 | Public application and Keycloak login only initially; Q9 adds protected browser access to operational tools. Databases, broker and management endpoints remain restricted. |
| Q8 | Terraform bootstraps Argo CD and initial Git application; Argo CD owns cluster workloads with no overlapping Terraform ownership. Kustomize for app manifests; selected pinned third-party Helm charts optional. Helm renders configuration, not a separate release owner. |
| Q9 | Protected HTTPS browser access to Argo CD and Aspire Dashboard with operator authentication and initial public-IP restrictions; telemetry ingestion internal. |
| Q10 | Entra ID operator login for both tools, independent of application Keycloak; documented emergency Argo CD access. |
| Q11 | Standalone Aspire Dashboard for live troubleshooting; durable telemetry separately selected. No promise of local AppHost resource/console-log parity. |
| Q12 | Evaluate West Europe first, subject to verified cost and capacity. |
| Q13 | GitHub Actions pull-request validation/plans; applies require a manually approved GitHub environment, apply the reviewed revision, use GitHub OIDC and serialize shared state operations. |
| Q14 | Separate retained bootstrap resource group/state for Azure Blob remote Terraform state and GitHub federated deployment identity. Tear down workload AKS, Key Vault, networking and workload backup storage during rehearsal. |
| Q15 | Separate manually triggered destroy with environment approval and explicit environment-name confirmation; no branch-deletion destruction. Stop/start is separate. |
| Q16 | Demonstrate clean workflow recreation first, then separate manual restore recovering a recorded booking and associated user identity. Preserve compatible credentials/client secrets or a designed recovery process. Drain messaging before backup; messages-in-flight recovery deferred. A recovery copy survives outside teardown boundary. |
| Q17 | Infrastructure pipeline bootstraps GitOps; CI builds immutable images and proposes digest changes in Git; Argo CD deploys reviewed merged configuration. Routine releases independent of Terraform. |
| Q18 | Manual GitHub stop/start plus configurable nightly safety stop; start runs readiness and deployed application checks; documented bounded longer-session override. |
| Q19 | Terraform fmt, validate, TFLint with AzureRM rules and Trivy. Shared repository local/CI commands. Pin tools, plugins, providers/modules, action SHAs and policy inputs; commit provider lockfiles. Local formatter writes; CI checks only. Source checks plus resolved-plan scanning in infrastructure pipeline; plans stay private. |
| Q20 | Every enabled security finding blocks until fixed or a specific documented exception is explicitly approved by the owner. Scanner execution failures also fail. No blanket suppression. |
| Q21 | Dedicated domain DNS delegation to Azure DNS. Initial deferral was superseded by purchase of codingfunlab.com and Q30. |
| Q22 | Azure Container Registry Basic; AKS pull through managed identity; CI push through federation; include retained charge. |
| Q23 | Keep app, infrastructure and GitOps in this repository with separate directories and path-filtered workflows. CI proposes digest updates through pull requests. |
| Q24 | Automatic Argo CD sync of merged desired state and drift correction, with explicit persistent-data and critical-platform deletion protection. |
| Q25 | Bounded in-cluster historical telemetry, initial three-day target, survives pod restart and stop/start; need not survive full teardown. Select backend, sampling, memory/storage budgets in planning. |
| Q26 | Daily 23:00 Europe/Bucharest safety stop, daylight-saving aware, with explicit time-limited override; manual start. |
| Q27 | Seven successful daily recovery points while running; no backup-only startup; fresh verified backup required before destructive rehearsal; failed backup visible and blocks rehearsal. |
| Q28-Q29 | Temporary hostname/certificate and later migration proposals were not accepted and are superseded by actual domain purchase. Do not implement them. |
| Q30 | Terraform manages entire codingfunlab.com Azure DNS zone, retained with bootstrap through workload teardown. Owner performs Porkbun nameserver change after zone creation. |
| Q31 | cert-manager with Let's Encrypt and Azure DNS DNS-01 validation through Workload Identity; permissions scoped to the zone. Automate issue/renewal; certificate verification remains enabled. Owner accepts subscriber terms. |
| Q32 | app.codingfunlab.com, identity.codingfunlab.com, argocd.codingfunlab.com, dashboard.codingfunlab.com. Last two require operator authentication and IP restrictions. |

## Additional approved constraints and planning boundaries

- Subsequent owner budget clarification: EUR 120/month INCLUDING applicable taxes, assuming 40 running hours/month. This supersedes Q2's initial EUR 100 target. The owner subsequently supplied the actual tax rate of 21%; refresh the actual inventory/prices and calculate the tax-inclusive total before paid provisioning rather than inferring tax from timezone. The earlier approximately EUR 95 net estimate remains historical research, not a tax-inclusive quote. Protected audit logging must fit within EUR 120 including taxes. FR-022 and SC-001 carry the unchanged cost gate.
- Subsequent owner security decisions: the human owner approved the original eleven exact scoped findings, the two exact AVD-AZU-0057 Queue-rule false positives and the exact workload-vault lifecycle warning recorded in [the scoped exception approval record](team/proposed-policy-exceptions.md), fourteen scanner/linter scopes in total. That record is authoritative for exact rules, resources, approval responses, rationales and retained limitations; this discovery entry does not duplicate or broaden those approvals or mark implementation passing. All other enabled findings remain blocking under Q20. SEC-TF001 is an implementation privilege bug requiring a code fix and regression, never a waived exception.
- The owner separately approved extending the implementation repair budget from three to six rounds. Four rounds are completed; SEC-TF003 is closed for the source assessed by its original reviewer, as recorded in [the coordinator's execution record](team/coordinator-notes.md). This process/status update does not approve further exceptions or establish live acceptance, final reviews, convergence or human feature acceptance.
- Separate owner decision: add protected Blob audit logging to both retained state and recovery storage, with privacy controls, bounded retention/usage and cost included in the tax-inclusive EUR 120 target. This maps to FR-026, US4-A8 and SC-012. The later exact Queue-rule false-positive approvals supersede the initial absence of an AVD-AZU-0057 exception; they do not accept an audit gap or permit unused Queue logging to substitute for Blob auditing. Actual Blob auditing and its privacy/access/gap qualification remain mandatory under the authoritative scoped approval record.
- The owner also approved SEC-D002's exact native Azure audit-processing scope, separately recorded in [the scoped processing approval](team/proposed-policy-exceptions.md) and assessed in [the independent audit review](team/audit-recovery-delta-security.md). This is a discovery link to that bounded approval, not a general telemetry-privacy relaxation or additional permission to log credentials, bodies or application personal data.
- Subsequent owner scope addition: update the existing promotion script/flow to publish the same release to both GHCR and ACR. The owner's `CHCR` spelling was interpreted by the coordinator as the existing GitHub Container Registry (GHCR), and communicated as such. Preserve local GHCR delivery while adding ACR cloud delivery; do not create divergent rebuilds for the two destinations. Verify immutable content at both destinations and fail without advancing release/deployment references if publication or verification fails or content differs. A retry may reuse verified publication of the same source release. No cross-registry atomic transaction, deletion of already published artifacts, or automatic rollback/cleanup semantics were requested or approved. This extends Q17/Q22/Q23 and maps to FR-025, US4-A6/US4-A7 and SC-011.
- Learning AKS is intentional; Container Apps, App Service and single-VM alternatives are not this feature's target.
- Minimize managed dependencies: retain PostgreSQL, RabbitMQ and Keycloak in Kubernetes, initially single instance, with persistent storage. Keep existing three .NET services, Angular frontend and bootstrap processes. Plan explicit Standard SSD disk/storage choices and safe bootstrap Jobs.
- Initial candidate AKS Free control-plane tier, shared public load balancer/gateway and cost-conscious node pools must be verified against current Azure requirements and availability. Earlier conversational claims about minimum node counts are not verified requirements. Choose sizes and supported networking/gateway products during research/planning.
- Practice non-root/runtime privilege constraints where supported, resource requests/limits, health probes, network isolation, least-privilege cloud/cluster RBAC, Entra cluster access and public API access restrictions.
- When practising rolling releases/node drain, use stateless replica spreading and appropriate disruption budgets without misrepresenting single-instance dependencies as highly available. Exact steady-state replica counts await sizing/cost planning.
- Defer managed PostgreSQL, Service Bus, Application Gateway/WAF, Azure Firewall, service mesh, multi-region and replicated database/broker clusters unless the owner approves a scope/cost change. Private API/endpoints are deferred networking exercises.
- Avoid Terraform-held application secret values where possible because sensitive marking does not remove values from state. Scope Key Vault/CSI/Workload Identity integration and secret refresh behavior during planning.
- Keep telemetry correlated and private under the constitution; the standalone Dashboard is not the historical-monitoring strategy.
- Azure MCP is available and the owner specifically asked the team to use it for appropriate discovery/capability work. Use read-only discovery before requesting facts the account can supply.
- User authorized local deployment validation followed by teardown and GitHub workflow recreation. Planning must still meet cost and safety gates; do not treat that authorization as exception acceptance, approval of unknown spend, permission to send external messages or permission to bypass environment protection.
- DNS zone, state storage, federation identity and a small external recovery location survive workload teardown and remain billable; enumerate exact retained resources before rehearsal.

## Clarification assessment

No additional business decision is currently required to draft the plan. No new clarification questions were asked; approved prior answers are integrated rather than asked again.

| Category | Status | Evidence / next step |
| --- | --- | --- |
| Functional scope and behavior | Clear | Spec stories 1-5 and scoped exclusions. |
| Domain and data model | Clear | Environment, recovery point, identities, revision and retained foundation. |
| Interaction and UX flow | Clear | Trusted browser URLs, independent operator login, manual apply/destroy/restore. |
| Non-functional quality | Clear | Cost target, accepted downtime, recovery/retention, security and privacy constraints. |
| Integration and external dependencies | Deferred | Versions, Azure capability, gateway and telemetry backend belong to planning/research. |
| Edge cases and failure handling | Clear | Explicit readiness, stale plan, backup, restore, race, privacy and security failures. |
| Constraints and tradeoffs | Clear | Interview table and additional constraints. |
| Terminology and consistency | Clear | Resource ownership clarified; domain supersedes temporary hostnames. |
| Completion signals | Clear | Measurable outcomes, story criteria and repository team gates. |
| Miscellaneous/placeholders | Clear | No unresolved requirements placeholders. |

Deferred planning investigations do not authorize assumptions about actual subscription capabilities, GitHub environment-review availability, DNS delegation, operator address, or spending. Report evidence and escalate a genuine blocker to the owner through the coordinator.

## Requirement-to-acceptance mapping

Each functional requirement cites acceptance IDs inline in spec.md. Additional success criteria cover cost (FR-022 / SC-001) and declared limitations (FR-023 / SC-002, SC-008). SC-010 covers repository completion governance, not analyst self-approval. This is requirements-quality traceability, not implementation evidence.

## M2 local procedure approval: 2026-10-29

Owner approved the scoped one-off human execution/proof sequence and reviewed
feature-branch artifact pushes. The authoritative boundary is the
[M2 operation contract](contracts/operations.md#m2-one-off-local-human-execution-2026-10-29).
This retains later hosted identity qualification and recovery gates.
