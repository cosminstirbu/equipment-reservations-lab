# Architecture preparation evidence

Research date: 2026-10-26. Baseline commit: `d1c7238345136340ddbf3a9454807cefffc43c32`.
This is research, not an approved plan or deployment evidence. No Azure resources
were provisioned and no external messages were sent.

## Applicable standards and verification

Read AGENTS, constitution 1.1.1, engineering index, formatting, testing, tooling,
observability, resilience, agent-team protocol and architect role. Implementation
must retain test-first behavior changes, public CLI/process contract tests, private
operational output handling, real provider qualification, and independent reviews.
Documentation requires link/consistency/readability inspection. Cloud runtime,
restore, hosted workflows, source-IP denial, Entra sign-in and DNS delegation need
separate live evidence; static tests cannot establish these outcomes.

## Existing assets and reuse boundaries

- `deploy/base` already supplies non-root workloads, seccomp, dropped capabilities,
  resource requests/limits, bootstrap ordering and persistence. PVC annotations
  `Prune=false,Delete=false` protect PostgreSQL, RabbitMQ and Dashboard claims.
- PostgreSQL is shared with a separate Keycloak database; Keycloak has production
  `start`, strict hostname and forwarded-header settings. Database/identity Jobs
  and broker init generation should be reused, preserving secret output handling.
- `deploy/environments/local` binds exact hostPath-backed local PV names, local CA,
  local hosts, and seven independently promoted image patches. A separate Azure
  overlay must reuse base without editing feature 013's local behavior.
- `deploy/platform/traefik.yaml` uses pinned Traefik, restricted namespace RBAC,
  TLS and NodePort. Azure needs LoadBalancer, actual ingress address, source-IP
  preservation and per-route operator allowlists. Existing provider configuration
  enables Ingress only, so Middleware CRDs or Gateway support are additional work.
- `deploy/argocd` already uses an immutable verified upstream installation and a
  namespace-limited AppProject. Platform resources require a separate restricted
  project, rather than broadening application permissions.
- CI publishes GHCR images and promotes local digest patches. Azure ACR publication
  must preserve current provenance/affected-component behavior and independently
  update Azure digest changes by reviewed PR; do not silently replace local release.
- Existing six deployed acceptance cases and persistence capture/verify are useful
  acceptance boundaries. Browser-token Dashboard assumptions and private diagnostic
  forwards need deliberate configuration support for Entra frontend authentication.

## Azure/account observations

Azure MCP read-only subscription enumeration succeeded: one enabled default
subscription. AKS enumeration succeeded with an empty cluster list. Identifiers
are deliberately omitted from committed research. No SKU capacity/quota, tenant
application-registration permissions or billing agreement has been established.

Local command discovery found Azure CLI, but Terraform, TFLint, Trivy, kubectl and
Helm were absent from PATH. Azure CLI cannot access the user's Azure profile under
the current sandbox, so CLI version/SKU queries are pending. MCP works independently.
The initial GitHub CLI repository visibility query was blocked by network sandbox
permissions. The coordinator's subsequent approved read-only query established
that this repository is public with default branch main, so public-repository
environment required reviewers are viable; actual configuration remains pending.

The Azure MCP pricing command explicitly requires user-specified SKU or confirmed
all-service pricing; no speculative SKU request was made. The cost model must
identify candidates and obtain actual regional retail rates, then distinguish
40 running hours from approximately 730 retained-resource hours. Include node OS
disks, PVC disks, public IPs, Load Balancer rules/data, outbound traffic, ACR Basic,
DNS zone/queries, state/backup Blob Storage, Key Vault operations and telemetry.
No verified estimate is claimed here.

## Current primary-source constraints

1. System node pools currently require at least two Linux nodes, at least four
   vCPUs/4 GB per node, and exclude B-series. Application sharing is possible but
   discouraged; record the learning-environment compromise explicitly. Candidate
   `Standard_D4s_v5` is a design candidate, not verified availability or price.
   [System pools](https://learn.microsoft.com/en-us/azure/aks/use-system-pools).
2. Managed Gateway API and app-routing Istio became GA in AKS release v20260428.
   Managed NGINX support ends November 2026. Compare managed Gateway API with reuse
   of pinned Traefik; do not introduce retiring NGINX.
   [AKS engineering announcement](https://blog.aks.azure.com/2026/03/18/app-routing-gateway-api),
   [current routing](https://learn.microsoft.com/en-us/azure/aks/app-routing-gateway-api).
3. API authorized-IP changes take up to two minutes. Include actual cluster egress
   when required. GitHub-hosted runners have changing egress; a bounded job-time
   /32 admission lease via ARM is a candidate, requiring failure cleanup,
   concurrency control and an explicit Terraform ownership boundary. Never allow
   all GitHub address space or `0.0.0.0/0` just to make bootstrap pass.
   [API access](https://learn.microsoft.com/en-us/azure/aks/api-server-authorized-ip-ranges).
4. AKS stop/start is VMSS-only, excludes node autoprovisioning, preserves state up
   to 12 months and requires a 15–30 minute stop/start interval. Restart capacity
   is not guaranteed. PDBs can slow drains. Reacquire kubeconfig after startup.
   [Lifecycle](https://learn.microsoft.com/en-us/azure/aks/start-stop-cluster).
5. GitHub Actions supports IANA timezones directly. The safety stop can use
   `cron: '0 23 * * *'` with `timezone: Europe/Bucharest`; delayed/skipped schedule
   execution remains an operational limitation, not a hard spending guarantee.
   [Workflow syntax](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#onschedule).
6. Key Vault soft deletion reserves the name, and purge protection prevents early
   purge. Rehearsal cannot promise immediate same-name fresh vault recreation.
   Use explicit generation names and restore an independently protected secret
   bundle, or deliberately recover/import the original vault with different
   acceptance claims. Restoring a vault does not restore its RBAC assignments.
   [Vault recovery](https://learn.microsoft.com/en-us/azure/key-vault/general/key-vault-recovery).
7. Repeated clean certificate issuance can exhaust five exact-identifier-set
   certificates per seven days. Use ACME staging for repeated rehearsal, preserve
   ACME account/certificate material appropriately and separately qualify trusted
   production HTTPS. Do not bypass certificate verification.
   [Issuer limits](https://letsencrypt.org/docs/rate-limits/).
8. Dashboard Resume already persists SQLite across restarts, but count limits are
   neither time retention nor disk quotas. It is not a durable production backend.
   Three-day historical telemetry requires a separate bounded backend selection.
   [Dashboard persistence](https://aspire.dev/dashboard/data-persistence/).
9. Traefik IPAllowList defaults to socket remote IP. Prevent source spoofing and
   preserve real client IP through Azure LB; test denied source behavior at the
   public route. Do not trust arbitrary forwarded headers.
   [IP allowlist](https://doc.traefik.io/traefik/v2.11/middlewares/http/ipallowlist/).

## Proposed ownership and recovery seams

- Retained Terraform foundation: state backend/locking, federated deployment
  identity, DNS delegation zone, independent encrypted recovery storage and
  recovery decryption authority. Distinct state and RG from workload environment.
- Workload Terraform: AKS, VNet/subnet, ACR, Key Vault, identities, access roles,
  managed disk/storage configuration and public address. Argo bootstrap must use
  a distinct cluster-ready phase; no Kubernetes provider initialisation against a
  nonexistent or stopped API during infrastructure-only plans/destroy.
- Argo owns platform and application manifests after bootstrap. Terraform must not
  later reconcile the same installation objects. Prefer an explicit one-time
  bootstrap script invoked by the reviewed infrastructure operation rather than
  duplicate long-lived ownership.
- Secret population is outside Terraform state. Recover previous database/client
  credentials before restoring data; a retained encrypted bundle includes Keycloak
  credentials, users and ACME material where required. Its encryption root must
  survive workload Key Vault deletion. Restrict backup writer versus recovery
  reader permissions; do not put secret JSON into GitHub artifacts or plan output.
- Backup consistency requires quiescing writes, draining broker deliveries/outbox,
  backing up all application and identity databases, a versioned manifest with
  hashes and explicit source revision, and a verified restore. A successful Blob
  upload alone is not backup acceptance.
- Seven recovery points means complete successful backup sets, not seven files or
  seven calendar days. Do not prune the last good set after partial failure.

## Remaining implementation prerequisites

Actual region/SKU quota and price checks; exact provider/tool/chart/image pins;
GitHub approval capability; Entra registration/consent and operator identity;
operator public CIDRs; ACME contact; DNS delegation; restore-key protection;
telemetry backend and measured capacity. These are preflight gates with safe
configuration inputs, not permission to use insecure placeholders or claim passes.
