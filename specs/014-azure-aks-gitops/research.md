# Research decisions

Date2026-10-26; supporting [repository/account research](team/architecture-research.md).

| Decision | Rationale | Alternatives |
| --- | --- | --- |
| Two Terraform roots | Retained foundation separate from workload destruction | Terraspace unnecessary for one environment |
| Two shared D4s_v5 Linux nodes | Current system minimum,32Gi RAM total | B-series unsupported, separate pool costs more |
| Reuse pinned Traefik Ingress | TLS reuse, per-route IP middleware, one LB | Managed Gateway API GA but migration unnecessary; retiring NGINX rejected |
| Bootstrap sole installer for Argo | No TF/Kubernetes provider startup dependency or dual reconciliation | Argo adoption adds ownership migration complexity |
| AES-256-GCM with retained vault RSA-OAEP-256 wrap key and generation workload vault | Standard Node crypto, separate wrap/unwrap authority, no private-key export | Operator-held age key adds manual custody/tool; same-name fresh vault blocked by soft delete |
| Collector/Prometheus/Loki/Tempo/internal Grafana | Supported three-signal72h history | Dashboard has count limits not time retention; managed monitoring deferred |
| Hosted runner narrow temporary /32 | Avoid paid runner/global allowlist | Static runner introduces expense/maintenance |
| Immutable Trivy policies | Same local/CI decisions | Latest-policy downloads nondeterministic |
| Build once, publish matching immutable artifacts to GHCR and ACR | Explicit owner steering; one source provenance, parity before Git promotion | Independent registry builds could diverge and duplicate work |
| Reviewed concrete runtime Kustomize inputs in Git | Argo can reconcile actual infrastructure identifiers after creation/recreation | Untracked render/temporary Application overrides are not reproducible Git source of truth |
| Default-deny retained data endpoints plus scoped temporary runner /32 leases | Backend/vault access works without blanket public firewall exemption; independent ARM reaper can inspect expiry tags even when data path is blocked | Entra-only open data endpoints would require specific scanner exception; none is approved |

Provider schema constraint: AzureRM Storage may retain computed account keys even
with shared-key data authentication disabled. State remains private/encrypted and keys
are never read/projected/used. This does not introduce application secret values into
Terraform and does not authorize shared-key authentication. Workload CSI uses its
actual service-endpoint subnet rule; external backup workflows use temporary retained
storage/recovery-vault admissions, avoiding a retained future-subnet dependency.

Network-prelude concurrency uses actual documented
[Azure DNS record-set ETags](https://learn.microsoft.com/en-us/rest/api/dns/record-sets/create-or-update?view=rest-dns-2018-05-01)
with If-Match compare-and-swap and If-None-Match '*' initial create, not assumed
Storage/vault firewall conditional-update support. A constant reserved TXT payload
exposes no lease content publicly; ownership/expiry remains management metadata.
The single record-level gate serializes admission/reaper updates before Blob lease
access, avoiding the blocked-backend chicken-and-egg condition without new services.

Official GitHub releases/latest queried on research date: Terraform1.17.0,
TFLint0.65.0, AzureRM rules0.33.0, Trivy0.76.1, AzureRM provider5.11.0,
AzureAD3.10.0, cert-manager1.21.3, Collector0.163.2, Prometheus3.15.1,
Loki3.7.9, Tempo3.1.1, Grafana13.2.4. Commit checksum/image/policy locks before use.
Sources: [Terraform](https://github.com/hashicorp/terraform/releases),
[TFLint](https://github.com/terraform-linters/tflint/releases),
[rules](https://github.com/terraform-linters/tflint-ruleset-azurerm/releases),
[Trivy](https://github.com/aquasecurity/trivy/releases),
[AzureRM](https://github.com/hashicorp/terraform-provider-azurerm/releases),
[AzureAD](https://github.com/hashicorp/terraform-provider-azuread/releases),
[cert-manager](https://github.com/cert-manager/cert-manager/releases),
[Collector](https://github.com/open-telemetry/opentelemetry-collector-releases/releases),
[Prometheus](https://github.com/prometheus/prometheus/releases),
[Loki](https://github.com/grafana/loki/releases),
[Tempo](https://github.com/grafana/tempo/releases),
[Grafana](https://github.com/grafana/grafana/releases).

## Cost evidence

Read-only official [Azure Retail Prices API](https://learn.microsoft.com/en-us/rest/api/cost-management/retail-prices/azure-retail-prices)
queried2026-10-26, EUR Consumption West Europe; global LB/DNS meters. D4s_v5
non-Windows regular SKU selected; no Spot/Low Priority/reservations/credits.

| Item | Retrieved rate | Assumption | EUR/month |
| --- | --- | --- | ---: |
| D4s_v5 Linux compute | .2024/hour/node | 2x40h | 16.19 |
| Standard LB included rule bundle | .022/hour | 730h retained | 16.06 |
| Standard static IPv4 | .0044/hour/IP | 2x730h | 6.42 |
| ACR Basic | .1466/day | 30.42days | 4.46 |
| P6 LRS Premium SSD OS disk | 9.8796/month | 2x64Gi Managed | 19.76 |
| E4 LRS SSD PVC | 2.1119/month | 6x32Gi billed minimum | 12.67 |
| Conservative SSD mount-meter reserve | P6 .5377, E4 .2974/month | 2P6+6E4 | 2.86 |
| Public DNS zone first tier | .44/month | 1zone | .44 |
| Hot LRS Blob first tier | .0172/GB/month | 10Gi | .17 |
| Variable usage/temporary verification reserve | below | traffic, IO, DNS/vault/blob ops | 16.00 |
| Protected Blob audit ingestion allowance | Analytics2.6311/GB | .03GB/day protective quota x30.42days, conservative | 2.41 |
| Audit processing/query allowance | actual rules/usage rechecked | reserve | .50 |
| **Indicative pre-tax total** | | **40h running** | **97.94** |

Variable retrieved rates: Key Vault Standard .0264/10K operations, including allowance
for retained recovery vault/software RSA wrap key; no premium HSM. Standard LB data
.0044/GB; selected E4/E6 SSD operations .0018/10K; Blob Hot Read .0038/10K,
Write .0475/10K. Disk mount inclusion is conservative pending actual disk meter
applicability. Retained baseline approximately62.84, compute16.19, usage reserve16.
Taxes/domain renewal and usage above assumptions excluded. Stopped LB charged
conservatively all month. All verification/bootstrap runtime counts toward40h.

This is an estimate, not a quote/cap: refresh rates and actual BOM/quota before paid
apply; preTaxTotal*(1+required actual taxRate) above120 returns to owner. Extra disks/nodes
invalidate this calculation. Node OS64Gi sizing must pass actual image/storage pressure.

Managed OS correction verified 2026-10-26: selected
[AzureRM5.11.0 source](https://github.com/hashicorp/terraform-provider-azurerm/blob/v5.11.0/website/docs/r/kubernetes_cluster.html.markdown)
exposes os_disk_type Managed/Ephemeral and os_disk_size_gb, with no managed OS
storage_account_type selector. Microsoft documents
[Premium SSD fallback](https://learn.microsoft.com/en-us/azure/aks/best-practices-performance-scale)
when ephemeral is not used and the VM supports premium disks. Public Retail API
West Europe P6 LRS Disk returned EUR9.8796/month, P6 mount EUR.5377/month.
Replacing the earlier two E6 assumptions adds EUR11.3114; no provider option is
invented to preserve the old estimate. Explicit64Gi avoids the larger default128Gi
managed disk but still needs actual capacity validation. Paid provisioning remains
blocked until refreshed actual BOM including actual tax passes120 and support is confirmed.

Owner superseded EUR100 with fixed EUR120 INCLUDING taxes. taxRate is a required
explicit decimal0..1, never guessed from timezone; unknown blocks paid apply. The
97.94 pretax estimate would be118.51 at an illustrative21%, not an assumed rate.
Audit Analytics ingestion West Europe queried2026-10-26: EUR2.6311/GB; Analytics
retention meter EUR.1144/GB-month beyond included retention. Dedicated audit workspace
uses30day retention/no archive and protective daily quota.03GB (not a hard cap).
Actual low-volume assumption.1GB/month; conservative2.41 ingestion reserve plus.50
processing/query reserve added without promotional/free-ingestion assumptions.

Official [StorageBlobLogs schema](https://learn.microsoft.com/en-us/azure/azure-monitor/reference/tables/storagebloblogs)
explicitly supports workspace transformations. Standard
[ingestion transformations](https://learn.microsoft.com/en-us/azure/azure-monitor/data-collection/data-collection-transformations)
run before destination storage; use a safe-column allowlist before durable ingestion,
not query-time masking. [Diagnostic settings](https://learn.microsoft.com/en-us/azure/azure-monitor/data-collection/diagnostic-settings)
support direct Log Analytics and avoid the trusted-service bypass required by a
firewall-protected Storage sink. Actual transformed-row privacy and configuration
ordering need live evidence; a schema declaration is not proof.

## Bounded authorization/database qualification

Current [AKS authorization concepts](https://learn.microsoft.com/en-us/azure/aks/concepts-cluster-authorization)
describes both authorization models on one cluster. The
[Entra authorization guide](https://learn.microsoft.com/en-us/azure/aks/entra-id-authorization)
notes users/groups/service principals can be native RBAC subjects, while the concrete
[native setup guide](https://learn.microsoft.com/en-us/azure/aks/kubernetes-rbac-entra-id)
requires azure_rbac_enabled=false. Therefore retain true only as an explicit provider
qualification candidate: actual separate workflow SPs must prove exact native
resourceNames exec/scale and denial behavior before DB/recovery activation. No live
cluster exists yet, so no compatibility pass is claimed. Installer-only exact-cluster
Azure RBAC Cluster Admin is a separate targeted security-review amendment, not a
recovery actor grant. No preview ABAC or broad Writer fallback is selected.

[Kubernetes RBAC](https://kubernetes.io/docs/reference/access-authn-authz/rbac/)
supports resourceNames for named objects/subresources; create of top-level Jobs
requires separate exact-template admission controls because names cannot constrain
arbitrary create requests. Test the actual exec HTTP verbs with pinned kubectl.
[PostgreSQL role membership](https://www.postgresql.org/docs/current/role-membership.html)
supports separate SET/INHERIT options, enabling fixed four-owner restoration without
CREATEROLE. [pg_dump](https://www.postgresql.org/docs/current/app-pgdump.html)
backs up a database, not global roles; per-DB no-owner/no-privileges dumps and canonical
reviewed roles avoid pg_dumpall/global administrative read. Native read-all-data,
schema reset/extension/RLS and denied privileges still require real pinned DB tests.

Source inspection: DatabaseProvisioner currently creates four *_app owners and
revokes their memberships. Recovery SQL must grant owner roles TO equipment_restore,
not grant additional memberships TO app owners, and run as a separate cloud-only
administrative bootstrap stage without changing application behavior/local contracts.

The owner-approved SEC-D002 native processing scope and intermediate-buffering
limitations are authoritative in
[the approval record](team/proposed-policy-exceptions.md#additional-approved-processing-scope--sec-d002).
Workspace/DCR cyclic references are avoided by explicit create, bind, qualify and
enable stages; no unverified association-resource workaround or privacy bypass.

Qualification sequencing: GitHub environment-subject federated identities can only
be exercised by actual matching hosted identity jobs; local operator authentication
does not prove their native RBAC behavior. Credential-free fixtures precede production
recovery, with exact writer-scoped private Blob proofs bound to a nonce, identity,
cluster CA/generation and reviewed probe source. Separate optional recovery Application
avoids a platform-health dependency on SQL/client secrets before the normal app/DB
exists. Durable allowlisted private projections, not foundation-state access or
ephemeral artifact files, supply the first hosted bootstrap. These are implementation
contracts awaiting real hosted/provider evidence, not claims of successful qualification.

Recurring authorization differs from activation: both hosted actors and apply-owned
nonce qualify first activation once. Afterward each actual operation identity runs
fresh inline probes under its own lease and records an immutable actor-owned operation
proof, without needing the other identity or a fresh apply approval each day. Initial
proof expiry does not invalidate an already reviewed unchanged activation or pretend
to revoke RBAC. Relevant authorization/source/generation changes require reactivation;
the recurring probe still validates actual production RoleBinding and resource-name
semantics, not merely the earlier harmless model fixture.

[RabbitMQ monitoring-only access](https://www.rabbitmq.com/docs/management#monitoring-only-read-only-access)
documents monitoring tag with empty configure/read/write resource patterns, exposing
statistics without consuming/publishing or topology changes. Existing repo broker
is a Deployment, so an exact rabbitmq-0 Pod grant would be unsupported. A fixed-name
restricted read-only internal proxy preserves exact port-forward scope across broker
replacement, with verified TLS and no credentialed logs, without changing its controller
or requiring broker-admin credentials. Actual pinned Rabbit and proxy contracts remain
required; statistics and outbox agreement, not a fabricated zero, prove drain.

## Primary constraints

- [System pools](https://learn.microsoft.com/en-us/azure/aks/use-system-pools):
  two nodes/four vCPU current restrictions, B-series excluded, sharing discouraged.
- [Gateway API](https://learn.microsoft.com/en-us/azure/aks/app-routing-gateway-api):
  GA alternative, managed implementation limitations, NGINX support ends November2026.
- [API ranges](https://learn.microsoft.com/en-us/azure/aks/api-server-authorized-ip-ranges):
  up to2min propagation and cluster egress requirement.
- [Stop/start](https://learn.microsoft.com/en-us/azure/aks/start-stop-cluster):
  VMSS only,12month state,15-30min interval and restart capacity risk.
- [GitHub schedule](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#onschedule):
  IANA timezones available, no hard schedule delivery guarantee.
- [Vault recovery](https://learn.microsoft.com/en-us/azure/key-vault/general/key-vault-recovery):
  protected deleted names cannot be reused/purged immediately, RBAC not recovered.
- [Dashboard persistence](https://aspire.dev/dashboard/data-persistence/):
  count limits not time retention/disk quota or production historical storage.
- [Issuer limits](https://letsencrypt.org/docs/rate-limits/):
  repeat fresh issuance limited; staging/ACME preservation needed.
- [Collector auth](https://github.com/open-telemetry/opentelemetry-collector-contrib/tree/main/extension/bearertokenauthextension):
  supported bearer configuration; actual pinned TLS/receiver contract qualification.

## Environment prerequisites

Qualification v2 adopts the entire independently PASSed proposal at
SHA256 A9D5A72D9DBC8C029F729D322060C0649C02877864955269059955625299F1D8;
see [exact contract](team/qualification-schema-v2-proposal.md). Distinct anchor,
reviewed probe and actual executed HEAD plus complete independently parsed closure
resolve app-only commit movement without excusing changed transitive dependencies,
interpreted assets/packages or launchers. Version1 is rejected, not relabeled.
Source migration and actual hosted/private-process evidence remain separate gates.

Actual AKS patch/SKU quota, tenant registration/grant rights, operator group/CIDR,
ACME contact/terms, Porkbun delegation and protected recovery key are validated
preflight inputs, not guessed decisions. MCP found enabled default subscription/no
clusters. Coordinator established public GitHub repository/main/no environments yet.
Local Azure profile access initially sandbox blocked; no paid provisioning performed.

## Reviewed recovery observation and credential refinement

Integrated independently reviewed proposal8151D7D755948C51FE65F0DE19C9B5C5AF36969BC32F9B063150B47B7543E6D0
into the operation contract. Its pinned cert-manager1.21.3 setup.go inspection supports
key-checksum invalidation and Register/GetReg account recovery without recovery-actor
status writes; actual controller/Pebble proof remains required. Fresh DB-owner passwords
survive no-owner/no-privileges schema/data restore; trusted provider tests, not new
owner-password read grants, establish authentication continuity. Pod-list permission is
namespace-wide even when requests prefer metadata and fixed selectors.

Q-BROKER014-001 repair uses RabbitMQ4.3.6 fixed upstream
?disable_stats=true&enable_queue_totals=true -> queue_with_totals -> synchronous classic
queue info. Ordinary collector counters and resampled/request-time history timestamps
cannot prove current drain. External proxy remains query-free; collector-suspended
native proof and original reviewer closure are pending, not inferred from this record.
