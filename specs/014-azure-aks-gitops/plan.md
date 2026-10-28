# Implementation Plan: Azure AKS GitOps learning environment

**Branch**: `014-azure-aks-gitops` | **Date**: 2026-10-26 | **Spec**: [spec.md](spec.md)

Input: [approved decisions](decisions.md), baseline `d1c7238345136340ddbf3a9454807cefffc43c32`.
Preparation draft; independent design reviews/tasks remain pending.

Current delivery sequencing and owner checkpoints are recorded in
[milestones.md](milestones.md). Historical preparation reviews remain evidence for
their stated scope; current source integration and live acceptance are pending.

## Azure CI verification profile

Owner approved the source/manual lane split on 2026-10-28. PR and main source lanes
retain pinned Terraform formatting/validation/lint/security, mocked native Terraform
contracts, manifest checks and a fixed fast suite covering tooling and high-risk
helpers. Dependency installation precedes classification. The workflow definitions
own the exact commands; do not infer native-provider success from a source-only pass.

The dispatch-only Azure native provider qualification workflow owns the complete
Azure/Kubernetes provider suite on Linux, serialized by test file for runner capacity.
Deliberate concurrency inside tests is retained. Run affected qualification before
dependent deployment/milestone acceptance; record its exact revision and outcome.
This lane has no Azure identity or cloud provisioning. Its new dispatch definition
is not available until published on the default branch and remains unexecuted here.
Existing application/backend/frontend/local-feature-013 and publication checks stay
in place. No acceptance requirement or security exception is waived by rescheduling.

## Summary

Use two shared Linux AKS system nodes, Free control plane, Terraform Azure
infrastructure, Argo CD GitOps, scoped Key Vault Workload Identities, a single
public Standard Load Balancer, automated DNS-01 HTTPS, Entra operator login,
bounded historical telemetry and externally encrypted backups. Validate locally,
destroy workload infrastructure and recreate through approved GitHub Actions,
then explicitly restore. Feature 013 artifacts/local behavior remain unchanged.

## Technical Context

**Language/Version**: Terraform 1.17.0; Node.js 24.15.0 ESM operational tooling;
existing .NET10/C#14 and Angular remain the application stack.

**Primary dependencies**: AzureRM5.11.0, AzureAD3.10.0, TFLint0.65.0/AzureRM
rules0.33.0, Trivy0.76.1, kubectl1.35.8; existing immutable Argo CD3.5.5 and
Traefik images; cert-manager1.21.3; Collector Contrib0.163.2, Prometheus3.15.1,
Loki3.7.9, Tempo3.1.1, Grafana13.2.4. Exact stable releases verified through official
GitHub APIs. Record download checksums, image/policy digests and provider lockfiles
before dependent implementation. Select and commit actual supported AKS1.35 patch
from regional discovery before apply; unsupported patch fails preflight.

**Storage**: Standard SSD LRS Retain PVCs for PostgreSQL/RabbitMQ/Dashboard and
three historical backends; separate Entra-authenticated Blob state/recovery storage.

**Testing**: Existing Node public CLI/process suites, actual Terraform tool negative
fixtures/native tests, rendered Kubernetes configuration, six deployed acceptance
cases, live Azure/HTTPS/Entra/stop-start/recovery and hosted workflow qualification.

**Target platform**: West Europe AKS Standard deployment option/Free tier; Ubuntu
VMSS, Azure CNI Overlay/Cilium policies, Standard LB outbound and inbound,
Entra-authenticated public API restricted by source CIDRs.

**Project type**: Infrastructure and operational delivery; no new app service.

**Performance Goals**: One operator/low-volume learning, 40 running hours/month,
latest successful daily recovery point, restore in one measured working session.

**Constraints**: EUR120/month INCLUDING applicable taxes; required actual taxRate input,
never inferred from timezone; trusted HTTPS; no application secret values in
Terraform; every enabled scanner finding blocks absent human-approved exception;
finite resource/retention/output budgets; accepted single-instance downtime.

The additional human-approved SEC-D002 processing scope is recorded separately in
[the authoritative approval record](team/proposed-policy-exceptions.md#additional-approved-processing-scope--sec-d002).
It permits native metadata processing/intermediate buffering by Storage/Azure Monitor
before the workspace transform, without promising zero intermediate persistence or
a maximum provider buffering duration. It does not permit passwords/raw tokens/bodies,
plaintext backup content or application personal data. The durable allowlist and all
actual privacy/access/gap evidence remain mandatory.

## Constitution Check

Pre/post design: the owner approved exactly the eleven scoped resource findings in
[the exception record](team/proposed-policy-exceptions.md); those exact addresses,
rules, rationale and retained limitations govern, never global suppressions.
AVD-AZU-0057 was not accepted: actual protected Blob request auditing is required.
SEC-TF001 remains an implementation bug, never an accepted exception. Reuse base/helpers and keep
one resource owner. Test-first public CLI/process behavior and real provider contracts
implement Principles II-IV. Principle V selects three-signal historical storage here,
retains privacy filters and requires actual correlated workflow evidence. Principle VI
uses explicit budgets below, without blind mutation retries. Formatting, testing,
tooling, observability and resilience guides and cross-references apply. Aspire guide
applies if AppHost changes; none is planned. Cloud acceptance remains separate from
ordinary app tests. Missing account inputs fail preflight, never permit insecure
defaults. Independent reviews, tasks, convergence and human acceptance remain gates.

## Project Structure

```text
infra/azure/foundation/             # retained RG/state/DNS/recovery/federation
infra/azure/environment/            # workload Azure resources and scoped roles
infra/azure/tools.lock.json         # tools, checksum/platform/policy pins
infra/azure/{.tflint.hcl,trivy.yaml,examples/}
deploy/environments/azure/          # app Kustomize/digest patches/bootstrap Jobs
deploy/platform/azure/              # controllers, CSI, network/storage/telemetry
deploy/argocd/azure/                # restricted projects and bootstrap apps
scripts/azure-{quality,infrastructure,operations,recovery}.mjs
scripts/azure-*.test.mjs
.github/workflows/azure-{infrastructure,operations,destroy,recovery,images}.yaml
specs/014-azure-aks-gitops/{research.md,data-model.md,contracts/,quickstart.md,tasks.md,team/}
```

Names may consolidate without weakening contracts. New infrastructure path filters
must not rebuild app images. One component build produces the immutable multi-platform
artifact published to both GHCR and ACR. Promotion verifies both remote registry
digests and source provenance before proposing reviewed local/Azure overlay changes;
it never independently rebuilds an Azure variant. If one publication fails, report
partial publication and do not promote either overlay as a complete release. Retry
copies/reuses the already proven source digest into the missing registry and checks
manifest parity. Recreated ACR is repopulated from retained GHCR digests without a
source rebuild. This implements the owner's explicit dual-registry steering.

## Ownership and trust boundaries

| Scope | Single owner and constraints |
| --- | --- |
| Foundation | Separate Terraform root/state/RG: private deny-default Blob state with Entra data-plane auth, lease locking/versioning; entire codingfunlab.com DNS zone; independent recovery container and deny-default purge-protected recovery Key Vault/RSA key; federated GitHub identities; empty workload resource-group shell and scoped deployment grants. Never workload-destroy targets. |
| Workload | Terraform environment root: contents of the pre-created workload RG including AKS, VNet/subnet, public ingress/outbound IPs, ACR Basic, generation-named Standard vault with purge protection, scoped Workload Identities/role grants. No application secret-value resources or secret data reads. |
| Argo bootstrap | Infrastructure command installs verified pinned upstream Argo and initial Applications after cluster readiness; Terraform Azure state has no Kubernetes provider dependent on nonexistent/stopped API. Bootstrap remains sole installer of Argo itself; Argo owns all downstream workloads, avoiding adoption/dual ownership. |
| Platform GitOps | Restricted platform AppProject owns controllers/CRDs/namespaces, policies, storage, operator routes and telemetry. Critical resources use Prune=false/Delete=false; explicit controlled deletion only. |
| App GitOps | Namespace/kind-restricted project; separate Azure overlay reuses deploy/base and bootstrap Job identities/order. Existing PVC prune/delete protections retained. |
| Secret access | Private post-provision operation generates/populates values outside Terraform. Separate ServiceAccount/identity/SecretProviderClass per service/bootstrap role, only authorized vault objects; patch aggregate references into per-workload synced Kubernetes Secrets. CSI mounted secret rotation requires explicitly tested reload/restart behavior. |
| Operators | Direct Entra app-role assignments to the reviewed bootstrap human for Argo/Dashboard; operator group retained for scoped Azure/AKS RBAC. Tenant membership alone insufficient. Confidential app credentials generated privately outside TF into vault. Enrollment/removal/lockout recovery follows the [approved direct-assignment contract](contracts/operations.md#owner-approved-direct-operator-app-assignments). |
| Recovery | Envelope-encrypt each backup object with random AES-256-GCM key and unique 96-bit nonce through Node's standard crypto API. Wrap the data key with version-pinned RSA-OAEP-256 in retained recovery Key Vault; manifest stores wrapped key/key version, nonce/tag and ciphertext hash. Backup identity has read/wrap only on that key and staged Blob write; separate protected restore identity has read/unwrap plus selected backup read. No workflow or operator exports the RSA private key. |

### Installer authority and native RBAC qualification

The sole verified Argo/CSI/CRD/RBAC installer needs cluster-scoped Kubernetes authority.
Candidate design assigns ONLY the protected apply identity Azure Kubernetes Service
RBAC Cluster Admin at the exact AKS resource, through reviewed conditioned delegation.
This is full cluster power for that installer, not a narrow custom resource privilege;
no backup/restore/lifecycle/reaper/stop identity receives it. Authentication remains
Entra federated user credentials; local accounts/admin kubeconfig remain disabled.
This authority amendment requires targeted independent security approval before
activation, not retroactive attribution to the earlier recovery review.

Keep azure_rbac_enabled=true as a qualification candidate. Current Microsoft concepts
and authorization notes describe native RBAC/Entra subject support, but the concrete
native setup guide explicitly uses false; documentation alone does not prove exact
workflow-SP resourceNames behavior with true. Before any DB recovery authority or
workflow activation, installer creates harmless test RoleBindings and each actual
backup/restore principal authenticates separately to prove named pods/exec and exact
deployments/scale permissions, named-resource denials, unrelated resources/Argo/Secret
denials and no broad Azure grants. Use real requests plus SelfSubjectAccessReview,
not installer impersonation alone. Failure blocks dependent activation; no AKS Writer,
ClusterAdmin, token extraction or silently switched authorization fallback. A mode
change would be a new reviewed design. Source/schema tests may proceed while this
actual AKS check remains explicitly pending.

Actual qualification runs in protected GitHub jobs separately authenticated as the
backup and restore environment identities. A local human cannot mint their GitHub
environment-subject federated tokens, and installer impersonation is not substitute
evidence. Initial installation includes only credential-free isolated qualification
fixtures and qualification-only RoleBindings; production recovery bindings, recovery
SQL Job, real client CSI credentials and recovery Application are absent. The ordinary
application can become application-ready with recovery-qualification-pending, never
full-feature-ready. Initial protected qualification may run before complete rehearsal
without claiming the required later clean workflow recreation already passed.

The installer writes a private nonce challenge with expected principal IDs, exact AKS
resource ID/generation, current Kubernetes CA fingerprint, reviewed infrastructure and
probe-source revisions, role/template hashes and expiry. Each actual identity reads
that challenge, verifies its authenticated subject, executes real allowed/forbidden
named exec/scale and unrelated-resource requests and SelfSubjectAccessReview, and
writes its structured proof to its own retained private container. Proof fields are
version, mode=activation, environment, generation, clusterId, clusterCaHash, principalId, challengeHash,
sourceRevision, probeDefinitionHash, started/completed/expires UTC and safe per-request
verb/resource/name/HTTP status/expected outcome. No tokens, Secret data or raw provider
payloads are persisted. Validity is24hours maximum; changed cluster/generation/role/
source/input or replayed challenge invalidates it. Source revision identifies actual
reviewed probe code, not any unrelated later image promotion commit.

Foundation provisions separate private qualification-backup and qualification-restore
containers, each with its corresponding actor as the only recurring writer and apply
identity read-only. Challenge/projection container has apply/bootstrap writer and only
needed actor readers; actors cannot overwrite its challenge. Use Entra data-plane
authentication/firewall admission as elsewhere. Activation reads proofs directly from
these authorized containers, verifies both current identity/cluster/source/challenge
bindings, successful allow+deny evidence and expiry, then consumes challenge through
the common operation lease. No caller-supplied boolean, local marker, installer-produced
proof or expired Actions artifact can satisfy this gate. Proof trust comes from exact
writer RBAC plus reviewed producer workflow and observed requests, not a claimed
cryptographic signature by the installer. Human acceptance/review gates remain separate.

After valid proofs, generate a reviewed recovery-activation Git change. A third,
optional recovery Argo Application owns production RoleBindings, real fixed clients,
CSI and the separate SQL Job, and is introduced only after proof validation and normal
app/DB readiness. Platform retains namespaces/policies and unbound Role definitions;
its health does not depend on real database credentials or recovery SQL. Recovery is
not a dependency of initial application health. Protected bootstrap/operations check
proof-derived activation metadata and refuse activation if its initial proof expired,
or relevant source/generation changed without requalification; recurring operations
use their separate fresh identity probes below. Argo is not claimed to interpret
private Blob proofs or auto-revoke RBAC at a timestamp. This breaks the platform->app->DB
readiness cycle while preserving real credential gating. Reviewed activation does
not turn a failed or missing provider qualification into success.

### Recurring identity checks after initial activation

Qualification schema v2 is authoritative in full, adopting the independently reviewed
proposal SHA256 A9D5A72D9DBC8C029F729D322060C0649C02877864955269059955625299F1D8:
[exact contract](team/qualification-schema-v2-proposal.md),
[original quality closure](team/qualification-v2-quality-repair.md),
[security PASS](team/qualification-v2-security-round2.md). The proposal's historical
status wording does not replace these verdicts. All challenge/proof/consumption/
activation records require version2; reject v1/mixed schemas without reinterpretation.
infrastructureAnchorRevision is approved config.gitRevision; sourceRevision is the
reviewed publisher's actual clean probe commit; actualProbeCodeRevision is each actual
producer's clean HEAD=trusted hosted GITHUB_SHA. Allow app-only later HEAD only when
the entire independently discovered reviewed definition closure is byte-identical
across source/actual Git objects, committed manifest and working files.

The full contract includes transitively parsed static/re-export/literal-dynamic local
imports from actual publisher/producer dispatch, interpreted assets, roles/templates,
workflows/launch code, exact Node/dependency integrities/tool/action locks. Missing,
extra, symlink, traversal, computed-loader or changed closure/package inputs fail.
Trusted launch clears NODE_OPTIONS/NODE_PATH/custom loader/preload BEFORE npm/Node;
use npm ci --ignore-scripts, exact Node24.15.0 and runtime/execArgv/source rechecks.
Real marker-preload tests prove launch ordering; checks cannot undo prior preload.
All exact proposal field/closure/private-process/nonce/consumption/principal/CA/expiry
and intended-red/positive-app-only contracts govern initial and recurring producers.
Preparation PASS does not claim existing v1 source migrated or actual hosted success.

The apply-owned challenge and BOTH hosted identity proofs are a one-time activation
gate for the exact cluster/generation and reviewed authorization/probe definitions.
Their24hour expiry limits when activation may occur; an already validated activation
does not require a new apply approval or the other actor before every daily backup.
Relevant role/probe/generation change invalidates activation and requires reviewed
reactivation; ordinary image changes do not silently alter those hashes.

Every recurring backup runs under its actual trusted-main backup OIDC identity and
performs fresh inline actual-principal/named-resource allow+deny probes BEFORE dumping,
after acquiring the common operation lease. Manual protected restore similarly probes
its own actual restore identity before mutation. Each generates a fresh random nonce
bound to that operation lease, cluster/CA/generation, validated activation digest,
current reviewed role/probe hashes and actual principal. Write an immutable
mode=operation proof in the actor's own private proof container using create-only
semantics, including safe observed request outcomes and <=15minute start validity.
No fresh apply challenge, other actor identity or human approval is required for an
unattended backup. Restore retains its own explicit approval, not a new apply approval.

Protected commands execute probes themselves and validate their recorded current
activation/roles; they cannot accept a caller boolean, unrelated cached proof or
expired activation-test result. Recheck/probe before a later privileged phase if
start validity elapsed, binding to the same owned operation; cleanup remains mandatory
even after expiry/failure. Probes use no-op current-value scale and harmless fixed
client commands, never dump live data as a qualification test. Denials are actual
403 outcomes against unrelated names/spec/Secret/Argo writes, not fixture expectations.
Proof records are audit evidence of that operation, not permission grants or a claim
that Argo automatically revokes persistent RoleBindings.

Canonical workload identity namespaces are equipment-recovery for exactly
equipment-backup-client, equipment-restore-client and equipment-verification-server.
The recovery-database-bootstrap SPC reuses the existing database-bootstrap identity;
it is not a fourth new recovery identity. Production native Roles and same-name
RoleBindings are equipment-recovery-backup and equipment-recovery-restore in
equipment-recovery, plus equipment-recovery-backup-scale in equipment. Grant narrow
read-only get of those exact Role/RoleBinding names for the corresponding actor's
hash/subject verification; no role list/wildcard read or mutation. Initial harmless
equipment-qualification-writer fixture in equipment-recovery proves the native model,
not final production bindings. Fresh recurring real probes establish final exact
production namespace/name behavior after activation.
Backup positively probes its exact scale role; restore has no scale grant and must
observe scale WRITE denial, relying on reviewed maintenance desired state instead.
Restore may GET only the five named Deployments and their scale subresources to
verify replicas0: web,inventory,reservations,notifications,keycloak. No list or
patch/update is granted; probes distinguish allowed scale read from denied writes.
Both
positively exec only their own fixed client and deny exec into the other's client.

### Foundation and vault network access

Retained state/recovery Storage and recovery Key Vault have default-deny network
ACLs, no blanket trusted-service bypass and persistent operator CIDRs. The initial
human foundation bootstrap uses that allowed operator address for provider data-plane
key creation and state migration; foundation Terraform maintenance likewise uses the
persistent operator path after reconciling all temporary leases. The environment root
never manages retained resource ACL properties.

Before environment Terraform backend init, serialize firewall changes through the
retained `_azure-network-lease` TXT record-set's ARM metadata. Foundation creates the
record with harmless constant TXT value `reserved`; owner UUID/expiry live only in
management metadata. Exact ETag If-Match conditional acquisition/heartbeat/release
provides compare-and-swap; initial create uses If-None-Match '*'. All network admission
writers and reapers use this same short control-plane gate with exact record-scoped
custom DNS permissions. No unverified Storage/Key Vault If-Match support is assumed.
Hold/renew the gate through bounded ARM network updates and verification; check owner
before each write, fail closed on lost ownership or unknown asynchronous completion,
and require explicit recovery rather than stale full-resource writes. Expired-owner
takeover waits the documented in-flight request settling budget before reconciliation.

The gated narrow ARM prelude admits the current trusted runner /32 to retained
Storage. Record the owned admission and
maximum expiry in bounded non-secret operational resource tags before data access;
the expiry metadata remains discoverable by the reaper even when the data endpoint
is blocked. Merge and verify rules, preserving operator/other valid leases, with
bounded conflict retries under the control-plane gate; never replace the whole list
with the current runner or perform unsafe stale full-resource PUT.
After storage access works, acquire the common Blob operation lease before any
Terraform/workload mutation. This networking prelude is the only operation preceding
the Blob lease; it cannot access state or mutate workload without both RBAC and lease.
Local operators already on the persistent allowlist acquire that lease directly.
Foundation Terraform does not run in this runner admission window, so no plan removes
its own backend access. Cleanup removes only owned temporary rule/tag and verifies
the persistent baseline plus other valid leases. Concurrent admission/cleanup must be
contract-tested; inability to preserve/verify another lease fails without continuing.

Recovery/backup commands run on the external workflow/local operator through private
database forwards, and temporarily admit the runner to recovery Storage/Key Vault
as required. Their data roles remain separate from network-management roles; an ACL
admission alone grants no state, dump, secret or unwrap authority. No permanent future
AKS-subnet ACL is needed on retained recovery resources. Workload subnet enables
Microsoft.Storage and Microsoft.KeyVault service endpoints. Environment Terraform
owns workload-vault default-deny ACL and its actual subnet rule; CSI can read authorized
objects through that subnet. Any runner workload-vault /32 is admitted only after
environment apply for private population/bootstrap, and removed before the next
environment TF phase. No broad public data-plane exception is assumed.

Verify owned storage admission under the short DNS gate, then release DNS BEFORE
waiting for the Blob operation lease. After acquiring Blob, revalidate admission and
expiry before data-plane/workload operations. Renewal independently reacquires DNS;
never hold DNS while waiting for Blob, including recovery and cleanup paths. A Blob
holder may acquire DNS briefly to remove its owned rules before releasing Blob; an
admission waiter must therefore have released DNS first. Reaper similarly never waits
for Blob under DNS. Explicit interleaving tests must reproduce competing admission,
Blob-holder cleanup, renewal and reaping without lock inversion or stale ownership.

Canonical admission metadata: resource tag `equipment-admission-<UUID>` contains
compact JSON with exactly `cidr` (validated IPv4 /32) and `expires` (UTC ISO8601).
At most ten owned admission tags per resource; exceedance fails, never evicts another
owner. Preserve all unrelated tags and baseline/active rules. DNS record-set metadata
uses exactly `equipmentOwner` (UUID), `equipmentExpires` and `equipmentHeartbeat`
(UTC ISO8601), while public TXT remains constant `reserved`. Missing/malformed/unknown
ownership metadata fails safe reconciliation, never causes broad deletion.

Generalize the independent five-minute reaper to exact configured Storage/vault/AKS
resources and ARM-discoverable owned expiry tags, with separate exact-resource ARM
write roles and no generic request interface. It can clean expired network rules
without first reading blocked state Blob or obtaining vault secret/key data. The
same honest expiry-plus-next-run objective, outage caveat, failure summaries and next
operation baseline checks apply. Storage/vault management write permissions are broader
than a single firewall property; scope to exact retained resources, trusted main code
and fixed network-only command contracts, never subscription-wide Contributor.

The AzureRM Storage provider can retain computed account-key fields even when shared
key authentication is disabled. These provider-returned values cannot authenticate
data access while shared_access_key_enabled=false; protect all state as encrypted,
restricted private data. The no-application-secret requirement prohibits app passwords,
OIDC client secrets and plaintext backup material in Terraform, not a false promise
that a provider schema contains no computed Azure credential-shaped fields. Never
read/use/project computed keys or enable shared-key authentication as a workaround.

Foundation bootstrap starts with human identity/local restricted state, creates Blob
backend, then migrates with init -migrate-state. Verify remote authoritative state
before removing exact temporary local copies; failure preserves the only state.
Initial grants are human bootstrap, not workflow self-elevation. Deployment Contributor
is workload-RG scoped; role-assignment authority is constrained to approved roles.
The environment identity also receives conditioned Role Based Access Control
Administrator at the exact retained DNS zone, permitting only DNS Zone Contributor
grants to ServicePrincipal objects for the cert-manager identity. Test the condition;
no subscription-wide role-assignment authority or unrestricted zone role grant.

Bootstrap is explicitly staged: the human's initial tenant/application/federation
bootstrap may use required tenant administrative authority, but normal workflow
preflight checks only its existing rights and never demands repeated tenant admin.
The actual recoveryKeyVersion may be null only in an explicit foundation-bootstrap
configuration stage before the key exists; capture its real immutable version from
foundation outputs before environment/backup/restore commands, which reject null,
unversioned or sample key references. Foundation creates stable deployment/stop/reaper/
backup/restore principals. Environment Terraform owns exact-cluster/ACR and workload
resource grants to those existing principal IDs after the target resources exist,
using conditioned approved role/principal grants rather than requiring a privileged
second foundation apply after every environment generation.

The DNS network gate is an operational coordination object, not Terraform-managed
record content. Initial human bootstrap, after zone creation, creates the single
reserved record through verified If-None-Match '*' and validates its exact ID/type/
constant value. A second initial foundation binding stage then Terraform-manages
exact-record custom-role assignments to known operational principals once that scope
exists. This initial staged binding is recorded in foundation state; recurring
environment recreation reuses it and never repeats human tenant privilege. The
operational controller solely owns record metadata/heartbeat; no Terraform TXT-record
resource later rewrites it. Controlled foundation retirement is the only deletion
path for this retained gate. Bootstrap detects an existing wrong record and fails,
rather than adopting or overwriting unrelated DNS content.

Foundation alone grants the explicit configured human bootstrap operator Secrets
Officer at the retained workload RG, inherited by future workload vaults. Never derive
that principal from the ambient planner and never attempt a User grant through the
environment identity's ServicePrincipal-only delegation. Environment Terraform grants
only approved SP roles to known identities; it does not elevate human principals.
First human foundation bootstrap registers Entra operator applications, generates
their confidential credentials privately and retains them in exact named recovery-
vault secrets. Recurring environment apply has Secrets User read rights only on
those exact source secrets plus scoped write rights on the destination workload
vault, copying compatible values after recreation. It needs no recurring Graph
Application.ReadWrite.OwnedBy or tenant-admin authority. Initial and later OIDC
credential rotation are explicit human foundation maintenance, with source/destination
version checks and old credential retirement after successful operator login.
The two retained source objects are exactly argocd-oidc-client-secret and
dashboard-oidc-client-secret. Source-copy identity has secret-get at those object
scopes only, no whole-vault/list, recovery unwrap/key privilege or tenant app write.
Its independent bounded recovery-vault network admission grants no extra data rights.
Credential creation/rotation uses explicit expiry and private first-install bootstrap;
refresh destination copies and verify both operator logins before retiring old values.
Foundation output contract is operator_client_ids {argocd,dashboard},
operator_application_object_ids {argocd,dashboard} for human-only Graph addPassword,
and operator_secret_names with exactly the two canonical source names. Retained secret
attributes.exp must exceed now+30days before copying; human rotation uses reviewed
Graph credential expiry and writes the same expiry to retained secret attributes.
Recurring workflow paths never invoke Graph, even when the credential has expired;
they fail with safe human-rotation instructions.

### Durable private bootstrap handoff

Human foundation bootstrap publishes only the validated allowlisted foundation output
projection to private recovery Storage bootstrap container after migration. Recurring
apply identity reads that projection, never foundation state; environment state lives
in its separately authorized container. After apply, persist the validated derived
environment wrapper to bootstrap/environment/<environment>/<generation>.json, with
version, environment, generation, subscriptionId, tenantId, sourceRevision, outputsHash
and outputs. Foundation projection lives at bootstrap/foundation/<environment>.json
with equivalent revision/hash/schema metadata. The exact bootstrap container has
apply/bootstrap write and needed workflow actors read; no public blobs/shared keys.

Initial hosted bootstrap loads these durable objects using actual current Azure
identity and bounded network admission, validates schema/scope/source hashes against
actual environment outputs/resource identity, then checks the reviewed runtime Git
projection. It never needs a same-run local file, expired Actions artifact or access
to foundation state. Producers reject secret-valued or unknown fields; diagnostics
expose only approved hashes/status, not raw outputs. Other actors receive only their
required projection fields in memory. Stale/missing/foreign-generation objects block
bootstrap and request a fresh authorized export, never infer values or broaden reads.

Recovery RSA key has an explicit future UTC expiry from required foundation variable
recovery_key_expiration_date, validated before key creation (no scanner suppression).
Use a 365-day initial lifetime measured from the reviewed creation date; the operator
supplies the concrete timestamp, never a perpetual value or a moving apply-time clock.
Warn before expiry and rotate to a new version for new backups. Recovery manifests
pin each historical version; preserve enabled old versions and their decrypt/unwrap
authorization while any retained successful point references them. Before an old
version expires, either rewrap affected point data keys to the replacement version
and verify restoration, or explicitly extend that old version's future expiry through
reviewed foundation maintenance. Never delete/disable/allow expiration of the only
unwrap key for a retained point. Test expired/near-expiry keys block backup/destruction
and historical-point restoration after rotation; document owner renewal responsibility.

Routing reuses stable Traefik Ingress with same-namespace IPAllowList CRDs. One LB
serves agreed hosts on443, port80 redirect only. externalTrafficPolicy=Local preserves
client IP; trust no arbitrary forwarded headers. Public Keycloak paths allow only
realm login/static assets, never admin console. Argo/Dashboard require source /32
and Entra assignment. Internal data, RabbitMQ management, OTLP, historical backend,
Grafana and diagnostic APIs remain ClusterIP/deny-default network policies. Disable
gateway access logs and raw credential/query-bearing error logs. Gateway API migration
is unnecessary to meet approved requirements; retiring NGINX is not introduced.

cert-manager uses DNS-zone-scoped Workload Identity and DNS-01; staging first,
then trusted issuer after actual delegation/owner terms acceptance/contact. Preserve
ACME account/certificate recovery material outside workload teardown to avoid issuance
rate limits. No certificate-verification bypass.

### Reviewed runtime configuration in Git

Argo consumes fully committed, reviewed Kustomize configuration, never an untracked
locally rendered overlay or temporary Application parameter override. The infrastructure
adapter projects allowlisted non-secret Terraform outputs into concrete files under
deploy/environments/azure/runtime/ and deploy/platform/azure/runtime/, referenced by
their committed kustomizations. Values include actual Workload Identity client IDs,
tenant/vault/resource identifiers, DNS/public ingress address, operator route policy,
Entra application IDs and supported endpoints; secret values remain CSI/vault only.
The generator records source infrastructure revision, environment generation and
canonical input/output digest and rejects unknown or sensitive output fields.

After initial apply or changed resource identifiers, generate a reviewable runtime
configuration change. Do not bootstrap/sync until that exact reviewed commit is merged
and its projection still matches current Terraform outputs. Infrastructure apply may
report infrastructure-applied/configuration-review-pending, never environment-ready.
A protected bootstrap/reconcile operation then uses the merged immutable commit,
validates generation/output hash and runs the existing bootstrap/readiness contract.
Ordinary unchanged-ID applies reuse the committed projection after verification.
Full local/hosted creation acceptance requires both phases, not merely the apply exit.
Checked-in examples/placeholders cannot pass projection checks or reach deployment.

Runtime generator return contract becomes applicationFiles, platformFiles,
recoveryFiles, outputHash and generation. recoveryFiles is a third fixed allowlisted
relative-path mapping targeting deploy/platform/azure/recovery/runtime/, hashed in the
same canonical projection/generation; no image data or qualification claims are added
to the strict Terraform-derived cache wrapper. The optional recovery source remains
deploy/platform/azure/recovery/, excluded from platform root kustomization, so existing
classification paths remain stable. Separate platform control files contain only
credential-free fixed-name probe clients, unbound production Roles and qualification
RoleBindings; real SPC/client/SQL/production bindings belong only to optional source.

Initial bootstrap publishes the current authorized environment snapshot after actual
ordinary application readiness, enabling hosted probe jobs without a readiness/input
cycle. No recovery-ready claim accompanies that snapshot. Qualification uses exact
future client names but no live CSI/data credentials. After proof and reviewed
activation, installer deletes only the known fixture clients, verifies their absence,
then applies the optional recovery Application and waits for real clients/SQL readiness.
Activation metadata is a separate reviewed recovery-activation.json artifact containing
current generation, proof/challenge digests and approved probe/role hashes, not extra
unvalidated TF output-cache fields or a self-asserted qualified boolean. The protected
installer re-fetches and validates the actual private proofs before this transition.

Qualification binding ownership is installer-only: platformFiles includes the fixed
recovery-qualification-bindings.json projection, EXCLUDED from all Kustomization
resource lists, just like the installer CSI SPC. Protected initial bootstrap applies
only its exact two qualification RoleBindings; Argo never reconciles their contents.
The initial platform's static credential-free qualification Pod references use a
separate equipment-recovery-qualification ServiceAccount with no Workload Identity/CSI.
The reviewed activation commit FIRST removes those Pod references from platform
desired state. Wait for platform Synced at that exact commit before explicit deletion
of retained Prune=false/Delete=false probe Pods and installer-owned qualification
bindings. Verify ownership labels/recorded UIDs before deleting names that will later
belong to real clients. Only after absence checks may the optional recovery Application
be created. Never delete probes while platform still desires them or introduce a
second owner for a fixed name. Normal app bootstrap must not reapply initial probe
bindings after recovery activation. Generated binding file remains validated but inert.

## Pipelines and administrative access

Untrusted PRs run offline quality only, without Azure/OIDC privilege. Trusted
same-repository revisions can request protected plan using narrow read identity.
Fork plans stay pending until reviewed trusted revision import; never execute
attacker checkout under pull_request_target.

Plan stdout/stderr/binary/JSON/state are private. Safe review projection contains
resource action types/counts, immutable SHA, tool/policy/input hashes, plan digest,
state lineage/serial and expiry. Private saved plans, if transferred, use short-lived
RBAC Blob storage, never public repository Actions artifacts. Apply is bound to an
explicit reviewed revision and protected environment approval for that exact plan.
Verify input hashes, actual state lineage/serial and expiry before applying saved
plan; mismatch requires new plan/review, never silent replan-and-apply.

One environment concurrency group, cancel-in-progress false, plus TF state lock and
external Blob operation lease serializes apply/destroy/lifecycle/backup/restore across
local and workflow operations. Lease fields owner/run/revision/expiry/heartbeat support
explicit stale-lease recovery; GitHub concurrency alone cannot serialize local commands.

Terraform exclusively owns the persistent API authorized-IP baseline. Before any
Terraform plan/apply/destroy, under the global operation lease, reconcile expired
admissions and require the actual list equal that baseline; fail if unexplained
addresses remain. No temporary runner admission exists during Terraform execution,
and no ignore_changes suppression hides this property. Azure-only TF operations need
ARM connectivity, not Kubernetes API. Only after successful apply and before cluster
bootstrap/acceptance may the adapter admit the actual runner /32. Cluster checks then
run under the same operation lease, followed by exact owned admission removal and
baseline verification. Stop/start can similarly admit only for post-start checks;
destroy uses its validated Azure-only saved plan without admitting a runner.

Admission has a maximum 30-minute lease and heartbeat; no renewal beyond the owning
operation's declared budget without explicit new lease. Azure IP lists have no native
TTL: expiry alone does not revoke an entry. Finally cleanup removes the exact entry;
an independent trusted-main reaper workflow runs every five minutes, reads retained
lease records and restores baseline for expired/abandoned owners even after abrupt
runner loss. It uses a distinct OIDC identity scoped to this cluster's read/write API
configuration and lease container read/update, with no credentials/secret/apply/start/
stop role. Azure RBAC exposes managedClusters/write rather than property-only write;
this broader API-operation capability is explicitly constrained by exact cluster
scope, trusted workflow code and no generic arbitrary request interface. It is not
misrepresented as a native property-scoped Azure permission.

Best-effort revocation objective is lease expiry plus next five-minute reaper run and
two-minute propagation. GitHub/Azure outage can extend it; no guaranteed wall-clock TTL
is claimed. Reaper errors/stale heartbeat or last-run state produce failed workflow
status and safe stale-access summary; next operation refuses mutation until reconciled.
Document owner monitoring/notifications and authenticated ARM manual cleanup. Test
abrupt owner death, missed cleanup, failed reaper, simultaneous admission and preserved
unrelated operator ranges. Entra/RBAC remains mandatory even from an admitted address.
Cleanup failure fails the operation. Deployed diagnostics use private temporary forwards.

Public repository supports environment reviewers; none are currently configured.
Configure branch restrictions and owner approval; do not require a nonexistent second
reviewer/prevent self-review for this single-owner lab. Document governance limitation.
Manual stop/start, restore and destroy have separate dispatches. Destroy requires
exact environment-name confirmation, approval, drained messaging and fresh verified
backup and cannot address foundation state. Unattended safety stop uses a separate
trusted-main workflow/environment with no manual approval and a separate OIDC identity
whose custom role permits only AKS read/stop on the exact environment cluster. It
cannot start, apply, destroy, read secrets or change API access. Human-approved applies,
destroy and restore retain their separate protected approval environments. Safety stop
uses cron `0 23 * * *` with timezone Europe/Bucharest; override has mandatory bounded
expiry outside cluster. GitHub schedules can be late/disabled after inactivity: detect
stale last-run status, document manual fallback and never claim a hard spending cap.

## Capacity and cost

Two Standard_D4s_v5 nodes (4vCPU/16Gi each) share system/app workloads; no user pool
or autoscaling initially. Current Microsoft documentation requires >=2 system nodes
and >=4vCPU; B-series unsupported. Sharing and single-replica data services are declared
learning compromises. Steady stateless replica count1; exercise count2 with topology
spread/PDB for rolling/drain practice. Supported exact OS/AKS patch and quota verified
before apply, no silent expensive fallback.

Use two 64Gi managed OS disks, budgeting Premium SSD P6 LRS because the selected
AzureRM provider exposes Managed/Ephemeral and size, not a Standard SSD OS tier
selector, and AKS defaults premium-compatible managed OS disks to Premium SSD.
Set os_disk_type=Managed and os_disk_size_gb=64 explicitly; verify actual provisioned
tier/size against the BOM. Do not silently mutate AKS-owned VMSS disks outside its
API to force Standard SSD. Standard SSD remains selected for the six retained PVCs:
PostgreSQL8Gi,
RabbitMQ2Gi, Dashboard1Gi, Prometheus/Loki/Tempo8Gi each; each PVC bills at least
E4/32Gi. Grafana provisioned/internal/stateless. Historical requests/limits CPU-memory:
collector100m/500m,128/384Mi; Prometheus100m/500m,256/768Mi;
Loki100m/500m,256/768Mi; Tempo200m/1000m,512/1536Mi;
Grafana100m/500m,128/384Mi. These are hypotheses requiring live pressure measurements,
not vendor minimum claims; account for system/controllers/Argo and bootstrap peak.

[Regional evidence](research.md#cost-evidence) indicates approximately EUR97.94/month
including usage reserve, of which EUR16.19 is40h node compute. Exact BOM/current
prices plus actual tax must pass the fixed EUR120 billed-cost gate before paid provision; sizes/IO/egress can
invalidate estimate. No credits/reservations/spot assumptions. Stopped resources
retain disk/IP/LB/ACR/DNS/storage charges.
The billed estimate is preTaxTotal*(1+taxRate), with taxRate supplied explicitly as
a decimal in range0..1 and the cap fixed120, not caller-configurable. Unknown rate
blocks paid provisioning; zero is valid only if the owner confirms actual zero tax.
Audit additions and changed disks/nodes/services require refreshed BOM; above120
returns to the owner. Example21% would yield118.51, illustrating arithmetic only,
not claiming the owner's billing jurisdiction or applicable rate.

## Protected retained Blob auditing

Foundation Terraform owns one dedicated retained West Europe PerGB2018 Log Analytics
workspace, workspace transformation DCR/default association and resource-specific
Blob service diagnostic settings on BOTH state and recovery accounts. Enable
StorageRead/StorageWrite/StorageDelete categories on each blobServices/default ID,
destination resource-specific StorageBlobLogs, never unused Queue-only logging.
Send directly to Log Analytics, not firewall-protected Storage; bypass=None remains.
Create and attach the supported workspace transformation BEFORE enabling diagnostics,
and verify attachment/configuration before declaring audit readiness. No raw secondary
sink, untransformed table, export or diagnostic archive is enabled.

The pre-durable-ingestion KQL allowlist retains only TimeGenerated, _ResourceId,
AccountName, Category, OperationName, StatusCode, DurationMs, ServerLatencyMs,
AuthenticationType, RequesterObjectId, Protocol and TlsVersion. All other source
columns are omitted/null before table storage, including IP, UPN, source/destination
URI, ObjectKey, auth hash/details, request IDs, user agent/referrer/headers, bodies
and content hashes. RequesterObjectId is the approved identity correlation field;
never use it as a metric dimension. Tests must inspect actual stored rows for forbidden
fields rather than proving only a query-time projection. Azure processes source logs
transiently in its ingestion pipeline; no claim of source-side redaction is made.

Audit retention is30days (separate from three-day application telemetry), no archive,
protective workspace daily quota0.03GB, dedicated audit-only workspace and Entra/RBAC
read access limited to explicit operators. Query endpoint requires authentication;
no public dashboard or anonymous data access. Daily quotas can overshoot or halt
ingestion, so quota/error/missing-audit readiness signals must fail visibly and block
destructive rehearsal until investigated; no hard spending or gap-free cap guarantee.
Assume <=0.1GB/month actual low-volume data, conservatively reserve2.41EUR/month at
the daily quota envelope and0.50EUR processing/query allowance. Price actual applicable
ingestion/transformation and retention behavior before paid apply; no credit assumption.

Audit Terraform staging avoids a workspace/DCR reference cycle: initial human foundation
stage audit_transform_ready=false creates workspace and DCR referencing that workspace,
without diagnostics/default transform. A subsequent reviewed binding stage sets true
only after verifying the actual existing DCR provisioning/configuration; workspace
data_collection_rule_id uses the deterministic existing DCR resource ID constructed
from approved names/scope, not a Terraform dependency back-edge. Do not use an
unsupported DCR association to emulate the workspace default-DCR property.

Diagnostics are separately guarded by audit_diagnostics_ready=false until a bounded
qualification reads Azure and verifies workspace.defaultDataCollectionRuleResourceId,
actual DCR kind/stream/allowlist/destination and successful provisioning. Only then a
reviewed enable stage sets audit_diagnostics_ready=true. Terraform diagnostics depend
on that workspace update and qualification input; absent/mismatched/stale readiness
fails before enabling. Actual safe synthetic Blob read/write/delete and stored-row
privacy/access tests run next and gate full audit acceptance/sensitive operations.
Failure leaves readiness pending and never silently enables an untransformed sink.

## Historical telemetry

Collector fans out to Dashboard and Prometheus OTLP metrics/Loki native OTLP logs/
Tempo OTLP traces. Provision internal Grafana datasources and trace-log links, accessed
through authenticated operator port-forward (no fifth public host). Use72h retention,
finite stream/cardinality limits and bounded ingress; Prometheus time+size retention,
Loki/Tempo compactor retention explicitly configured. At8Gi hard capacity eviction can
shorten history; representative low-volume tests establish fit and document throughput
bounds. Configuration alone is not elapsed three-day evidence.

Initial low-volume tracing samples all workflows with bounded ingest; retain existing
privacy filters and bounded metric dimensions. No debug exporter/raw tokens. Internal
OTLP uses supported collector bearer authentication and TLS, per-client credentials;
Dashboard exporter keeps its private key. Configuration changes do not activate test-only
instrumentation. Real chosen-version provider contracts and actual application workflows
prove registration, correlation, safe failure and metric labels through supported APIs.

## Backup and recovery

### Read-only RabbitMQ drain evidence

Outbox zero does not prove broker drain. Require actual RabbitMQ management counters
for the canonical equipment vhost/reservation-notifications queue: valid running
queue plus messages_ready=0 and messages_unacknowledged=0, together with outbox zero,
under the bounded quiesce window. Missing queue, missing/invalid/stale counters,
authentication/transport failure or nonzero counts fails; do not infer zero or consume
messages to make a check pass. Real native provider tests must exercise nonzero ready
and unacked states as well as success.

Create dedicated equipment_backup_monitor user tagged monitoring with configure/read/
write patterns ^$ for that vhost. Official RabbitMQ monitoring-only access supports
statistics without resource mutation or message consumption. Provision the account
through an Azure-only reviewed definitions/user setup using existing administrative
bootstrap authority; do not change app broker bootstrap image/local behavior or give
backup the broker administrator. Human bootstrap privately supplies its password to
the protected backup configuration/environment, never a public/runtime projection,
TF value, CLI argument or broader Azure Key Vault reader grant.

Existing broker is a Deployment with changing Pod names, so do not invent rabbitmq-0
or grant port-forward to every Pod. Use a tiny fixed-name credential-free
equipment-broker-monitor proxy Pod in equipment-recovery, with existing pinned nginx
image/config, readonly/nonroot runtime,32Mi request/64Mi limit and no API/WI token.
Backup alone gets exact get and pods/portforward get/create for that Pod, no exec,
other-Pod forward or restore access. Proxy accepts only GET of the exact queue-stats
path (no query/alternate methods/routes), forwards authorization privately to verified
TLS Rabbit management and has no request/access/header logs. Network policy permits
only broker management TLS egress; no DB/broker messaging/Internet access. Azure-only
broker overlay enables internal management TLS/certificate trust; upstream verification
is mandatory, no Basic credential over unverified transport. External Node HTTP code
uses a private localhost Kubernetes forward; no HTTP binary added to PG clients.

The response stays private and only validated queue identity/state/ready/unacked counts
are projected; discard all other management metadata. Test GET counters and POST
messages/get, queue/user/policy mutations and unauthorized paths/methods denied against
actual pinned RabbitMQ and proxy. Include bad credentials, TLS failure, oversized/stale
response, concurrent cleanup failure and absence of marker credentials in errors/logs.
Close the exact owned forward in finally and fail on cleanup error. This adds no
managed service or durable store; its resource usage enters the measured node BOM.

### Supported operation authorization and quiescing

Recurring backup runs only within a reviewed Git-configured Argo deny-sync window
for the equipment Application, with manual override disabled, the actual window
active and sufficient time remaining for the declared operation/cleanup budgets.
Read AppProject/Application state and verify no sync already running before scaling;
window mismatch, conflicting revision or insufficient time fails before changes.
Use exact named deployments/scale, never Deployment-spec update: first web replicas0
blocks new browser writes, wait bounded in-flight requests, drain actual outbox/broker
within5minutes, then scale remaining inventory/reservations/notifications/Keycloak
writers0 and verify their Pods terminated. Any drain failure restores recorded replicas
and fails without creating a verified point. No Kubernetes/Argo authority is used to
disable reconciliation: the deny window prevents it for the bounded operation.

Record original replica counts and maintenance ownership outside the cluster before
changes. Finally restores only those exact scale subresources, even if the window
expired, then verifies normal Git desired state and application recovery. Reconciliation
may resume after expiry; detect this and abort backup/verification, retaining no success
marker. Independent startup/next-operation preflight detects abandoned maintenance and
repairs only against the approved normal Git revision, never an invented replica state.
External operation leases serialize lifecycle/image publication/backup/restore; operation
container is in recovery Storage. Quota, stop schedule or failure cannot hide incomplete
quiescence or cleanup.

Explicit restoration requires a reviewed maintenance Git commit which sets writers0,
omits reseeding Jobs and leaves Argo actively enforcing that maintenance state. Verify
exact approved SHA, Synced and zero active writers/seed Jobs before data mutation.
The recovery actor cannot edit Applications/AppProjects or arbitrary custom resources;
resuming normal desired state requires the reviewed normal-config Git change after
successful restore. No ClusterAdmin or Deployment-spec write is granted.

| Actor | Exact supported permissions/signature |
| --- | --- |
| Backup Azure identity | Existing cluster read/listClusterUserCredential only, required recovery-container staged write/operations lease, exact wrap-key and authorized backup secret reads; no listAdminCredential, tenant application write or unwrap role. |
| Restore Azure identity | Same user-credential cluster access, selected recovery read/lease, exact retained-key unwrap and authorized source/destination recovery secrets; no cluster admin or Graph application-write permission. |
| Kubernetes quiesce role | get/patch/update deployments/scale only for web,inventory,reservations,notifications,keycloak in equipment; read-only get of exact equipment Application/AppProject and workload readiness; no deployment main-resource write or Argo write. |
| PostgreSQL client execution | get plus pods/exec get/create only for fixed GitOps-owned equipment-backup-client or equipment-restore-client Pod respectively in equipment-recovery; pinned PostgreSQL client image, service-specific CSI credentials, private stdin/stdout, no local pg_dump/pg_restore prerequisite. Backup and restore do not share mounted live write credentials. |
| Isolated verification Job | Namespaced Jobs create/get/delete plus selected readiness reads, constrained by fail-closed ValidatingAdmissionPolicy/Binding to the exact pinned verification image, ServiceAccount, fixed safe command, resource/security/volume/network template and owned point-label naming. Deny extra containers, privileged/host paths/network, arbitrary SA/image/command/env/secret references; no cluster-scoped writes. Policy must exist and denial be proven before role activation. |

PostgreSQL dumps/restores execute through the pinned clients using authenticated
kubectl exec streams. The isolated verification Job has no live database write
credential and no permission to reach production DB/broker. Client/Job Roles are
namespaced native Kubernetes RBAC bindings to explicit Entra object IDs; verify
actual AKS authorization with allowed and forbidden operations, not broad built-in
AKS Writer/ClusterAdmin substitution. If pinned-template Job admission or exact Pod
execution cannot be proven, dependent backup/restore remains blocked pending design
review, never silently receives broader permissions.

### Database authority and isolated verification

Use fixed LOGIN equipment_backup with NOSUPERUSER/NOCREATEROLE/NOCREATEDB/
NOREPLICATION/NOBYPASSRLS, pg_read_all_data membership and CONNECT only to
inventory,reservations,notifications,keycloak. Preserve revoked PUBLIC access to
postgres/template databases and verify no access to unrelated/new databases; RLS
must never produce silently incomplete dumps. equipment_restore has the same negative
flags and SET TRUE/INHERIT FALSE memberships only in inventory_app,reservations_app,
notifications_app,keycloak_app, with CONNECT to those four databases. No pg_authid,
pg_dumpall, CREATEROLE, superuser or cluster-global role/password dump/restore.

Per database, pinned client runs pg_dump --format=plain --no-owner --no-privileges;
restore uses psql -X --set ON_ERROR_STOP=1 with a fixed allowlisted SET ROLE and
public-schema reset in an already bootstrap-created database. Roles/grants/extension
prerequisites come from reviewed canonical infrastructure bootstrap and compatible
encrypted credentials, never SQL role creation by the restore actor. Real pinned
PostgreSQL tests must prove public schema ownership, trusted btree_gist recreation,
Keycloak public schema, complete data and permission denials. Do not broaden authority
to hide an extension/RLS/ownership failure.

A separate Azure-only recovery bootstrap SQL Job uses the existing administrative
bootstrap identity to create those two logins/default grants/memberships after normal
DB creation; application DatabaseProvisioner behavior and local overlay stay unchanged.
Review fixed SQL and test against real pinned DB before adding its runtime stage.
Canonical new vault/CSI keys are backup-postgres-password, restore-postgres-password
and verification-postgres-password, coordinated through the primary secret inventory
and GitOps generator. Backup client never mounts restore/live-admin password.

The isolated verification Job is a pinned PostgreSQL SERVER on emptyDir with an
isolated Service, stable point/owner labels, activeDeadlineSeconds and bounded deletion.
It mounts only verification-postgres-password, never live DB credentials, and has no
production DB/broker egress. Fixed backup client streams the actual restore through
that Service using the same verification-only password; no exec into arbitrary Job
Pods or local PostgreSQL tool. Only backup client and verification server see that
credential. Existing reviewed VAP constrains exact server template/ServiceAccount/
secret/network/resource/command, and lifecycle cleanup must remove exact owned Job/
Service and report failure. Full restoration into live DB remains protected/manual.

Running-only schedule acquires global lease, quiesces writes, drains outbox/consumer
queues, takes consistent logical PostgreSQL dumps for app and Keycloak databases plus
roles/grants. Encrypt dumps and compatible credentials/client/ACME state before upload.
Unique staging prefix includes safe versioned manifest/schema/image/revision/hashes.
Actual restore to isolated validation DB and source-defined invariants must succeed
before publishing completion marker; hash/upload alone is insufficient. Validation
never mutates live DB or publishes messages. Keep seven successful daily complete
sets; partial failures never displace last good set. Backup does not start stopped AKS.

Destructive rehearsal requires verified point after recorded booking and completed
drain, and a tested retained recovery key/version with working protected unwrap access.
Generation suffix creates fresh workload vault without
purging protected old vault. Clean recreation passes first; explicit manual restore
checks compatibility/hashes, suspends writes and bootstrap/GitOps reseeding, restores
credentials then data and resumes deliberately. Verify original login/booking/message
processing, record elapsed session duration. Failed restore remains failed with recovery
instructions, no blind mutation retry. Messages-in-flight recovery deferred by drain.

## Operational budgets and output classification

| Operation | Budget, retry, repeat safety | Output |
| --- | --- | --- |
| fmt/lint/source scan | 5min/tool, no retry, absent tool/policy fails | Quiet public; bounded16KiB stdout/stderr tails on failure after safe projection |
| ARM/read preflight | 30s request, max3 transient retries jitter1-5s, max120s | Private response, allowlisted capabilities/prices/status |
| TF init/plan/apply/destroy | 10/15/60/60min; lock wait5min; no mutation retry | Private streams/plans/state; action/status projection only |
| DNS/cert/bootstrap readiness | total20min, request10s, condition polling | Phase/status only |
| Stop/start | 30/45min;15-30min settling; no blind retry | Actual provider state/elapsed |
| HTTP/deployed acceptance | existing bounded contracts, startup total20min | Private authenticated payload, safe assertions/status |
| Drain/backup/verify/restore | 5/30/30/60min; no mutation retry | Private dumps/streams; point ID/phase/result |
| Cleanup/leases/forwards | 2min, attempt every exact owned resource | Safe category/status, aggregate cleanup failures |

Finite operator commands omit circuit breakers and end on failure. Exporters use5s
timeouts, finite queues and exponential retry capped30s with visible drop signals.
Never log raw Error/cause, provider output, credentials, bodies, token URLs or keys.
Cleanup failure fails successful work; preserve simultaneous primary failure.

## Test design and verification

Public CLI tests retain real parsers, filesystem and child processes. Faithful Azure/
Terraform/HTTP boundary fixtures follow selected official schemas and replace only
external providers; these do not claim Azure success. Deterministic cost/policy parsers
justify solitary tests. Intended red cases: invalid format/config/lint/security; missing
scanner/policy; stale plan/revision/state; fork privilege; wrong confirmation; secret
error leakage; failed lease cleanup; expired override; missing drain/backup; incompatible
restore. Use actual tool negative fixtures without cloud credentials. Existing deployed
tests remain HTTP-only with private diagnostic forwards and configurable Entra frontend.

Evidence mapping: FR001-006/016/021 HTTPS/login/deployed/denial/CSI/pod replacement;
FR007-013 local apply, hosted approved OIDC/teardown/recreate, immutable release/drift/
protected deletion; FR014-015 lifecycle and seasonal override/schedule; FR017-019 actual
verified recovery; FR020 correlated history/privacy/metrics/retention pressure; FR022
refreshed cost BOM; FR023-024 explicit limitations/private failure evidence.

Handoff runs format-check/lint, focused/full tooling as affected, actual pinned Terraform
gates, manifest/schema rendering, workflow validation, live Azure/browser/hosted/recovery
evidence, independent reviews and convergence. Pending external checks remain pending.

## Complexity Tracking

No constitutional violation accepted. Separate historical backends and external recovery
foundation satisfy requirements that Dashboard persistence and workload disks cannot.

## Reviewed recovery observation/continuity refinement

The [operation contract](contracts/operations.md#reviewed-recovery-observation-and-continuity-contract)
now integrates proposal8151D7D755948C51FE65F0DE19C9B5C5AF36969BC32F9B063150B47B7543E6D0
following independent quality/security preparation PASS. Quiescence requires zero
matching writer Pod objects, including terminating/orphan/old-rollout Pods; namespace
Pod-list authority is explicit, privately projected and never misrepresented as
label-restricted RBAC. Exact Argo/Deployment/seed-Job reads and restore scale-write
denial support this check. Six identity continuity secrets and five exact ACME/TLS
Secrets form the complete encrypted credential inventory; no PostgreSQL administrator,
old owner passwords, recovery passwords or operator OIDC secrets enter it. Fresh owner
passwords remain in the recreated vault without new backup/restore read grants. Pinned
cert-manager account-key reconciliation must prove original account URI/checksum before
TLS recovery; no status-write fallback. Real provider tests remain pending.

Broker defect Q-BROKER014-001 uses only the fixed upstream totals query documented in
the contract, preserving external route/auth/TLS. Native collector-suspended regression
and original quality closure remain required. Failed consumed activation is replay-deny:
new challenge and both actor proofs, with only authorized harmless fixture reinstall
following reviewed rollback/source synchronization; no implicit resumable journal.

## Reviewed continuity binding ownership

The operation contract incorporates independently reviewed addendum
BEBA835182937453AE258E890764A1EB683CA08940DA64977CBA74D7B61D39B7.
Backup joins restore with GET only on the exact production/staging ClusterIssuers,
needed to capture actual account URI/key-checksum metadata. The protected installer
alone activates six exact cross-namespace/cluster bindings from generated
platformFiles['recovery-continuity-bindings.json'], excluded every Kustomization,
after reviewed proof-bound activation under lease. Platform owns unbound Roles;
optional recovery keeps existing namespace ownership. No recovery AppProject
destination/ClusterRoleBinding expansion occurs. Actual roles/bindings/subjects enter
the qualification closure and are checked for drift on every operation; native and
hosted authorization evidence remains required before use.

## Reviewed non-vault integration clarification

Only proposal38A807E857AB00C6CD501AEE44C586A0E9F939D359C77E1FC656AA9AA61EB919
sections2–3 are authoritative after independent preparation PASS. Exact own-named
Role/Binding GETs in four namespaces and ClusterRole/Binding GETs support truthful
actor drift checks. The operation contract separates immutable execution/authority
assets, fully hashed and narrowly validated installation transitions, and a separate
create-only canonical activation record whose schema/code remains immutable. The
record never hashes itself. Its exact source/target maps are bound before proofs;
removing only the reviewed fixture reference does not authorize arbitrary Kustomize
edits. All other existing deployment definition bytes remain immutable unless exact
generator classification is enumerated and independently verified. Runtime filenames
still require complete committed enumeration before acceptance, not directory-glob
exclusions. Vault CandidateA policy/write changes remain proposed and blocked pending
owner authority decision; no grant or exception follows from this non-vault integration.

## Owner-approved CandidateA and qualification ordering

The explicit [human decision](team/vault-admission-authority-decision.md) selects the
reviewed exact-vault network writer plus independently retained deny guards for both
workload and recovery vault families, accepting stated residual IP/subnet/tag and
availability authority. Previous pending CandidateA status is superseded by this decision;
actual qualification is still mandatory. No policy exemption or data-plane expansion.

Operations contract stages G0–G3 resolve bootstrap ordering: human foundation installs
guards with operational grants disabled; already-authorized human performs actual
parent-policy tests and publishes create-only private evidence; protected grant wrapper
verifies evidence/current guard state before exact assignments; actual hosted actors
then run their own RBAC/policy/data-denial and admission tests before any production use.
No candidate role is needed to establish the prior human policy proof. New actual vault
generations require actual-resource qualification, not only a disposable probe result.
Primary CLI/TF/network wrappers consume validated evidence references and actual hashes,
never caller passed booleans. Definition/assignment changes invalidate qualification.

## Reviewed hosted recreation and isolated evidence refinement

Independently approved vault phase addendum8D9A8D9D64E753949A25DC51D0B57A92F569AF7C2BB05ACC4BECFD395172EA1A
is integrated in the operations contract. Apply's existing workload-RG Contributor is
acknowledged; initial guarded human family qualification precedes hosted activation,
then actual protected apply qualifies each compliant new vault before secret population
and operational grants. No new human Azure-token step on each recreation. Retained
guard-evidence is human-writer/recurring-read-only; guard-apply-evidence is a distinct
apply-writer container. Shared operations-container writes confer neither authority.
Data transport uses conditional create, not claimed WORM. Qualification API tuple is
AzureRM5.11 provisioning2026-02-01 and operations2024-11-01 for both vault families;
actual denial provenance remains required. Earlier incompatible staging/location wording
is superseded by this refinement, without changing task history.

## Reviewed exact application release-data classification

The [operation contract](contracts/operations.md#reviewed-application-release-data-classification)
integrates approved addendum2881E804A4724D8362742C14DB0118B2DBAE432950750E269BA3F9D2B357E05C.
Only its 28 literal local/Azure image-patch and component-release paths are separately
validated release data. Exact seven-component target table includes broker-bootstrap's
rabbitmq Deployment/definitions initContainer exception. Fixed patch/schema/provenance
checks retain release integrity while routine valid promotion with unchanged code and
authority closure avoids initial two-actor reapproval. Complete loaded code, parsers,
Dockerfiles, static nginx and main Kustomizations remain immutable. Generated installation
state and canonical activation records retain their distinct reviewed checks; no glob
exclusion or self-referential definition hash. Acceptance evidence remains pending.

## Reviewed guard proof lifetime and probe ownership

Approved addendum3B7943398775A9DF47D92D7AD233CE9C5E56BC5330D8DAF2F95429EA0B4F34C0
is integrated in the operations contract: human-family null expiry only for unchanged
anchored tuple with current integrity checks; fresh<=24hour generation proof consumed
under lease; durable evidence usable only after actual completed activation, never
consumption existence alone. Fresh own-actor<=15minute operation proof remains required,
so unchanged daily backups require no daily approved apply/human token. Fixed initial
human probe creation/owned DELETE and actual soft-delete verification are helper-owned,
with no adoption/purge/random fallback. No IAM/WORM immutability is claimed. Actual
Azure actions/evidence remain later qualification gates; source fixtures do not pass them.

## Reviewed live release verification access

Approved proposalB82C66DF7312C07FEA3CAAFD3BBA7DFCDC8275BFD46595B431B16EC93A3F0768
is integrated in the operations contract: backup/restore receive only exact-current-ACR
AcrPull and needed repository token reads. This registry-wide pull authority is not
misrepresented as repository-scoped. Static release-file validation precedes config;
actual dual-registry OCI/GitHub provenance checks follow verified environment outputs.
Private package Actions access is actually tested; failure blocks without PAT/admin/
visibility fallback. Current registry authorization mode stays unchanged. Source and
hosted allow/deny/access evidence remain required before recovery acceptance.

## Reviewed integration sequence and ACME privacy

Approved integration B23C1E3121D3373A7CB98E7BD9FE0A6EF5D0D601B87FAC37C52903B2CC041E26
is authoritative in the operations contract. Creation plan is qualified-family/current-
guard gated with operational grants deferred; actual new-vault qualification precedes
a separately reviewed grant plan, whose unchanged saved bytes are applied only after
real apply-owned timestamp/lease/proof/plan receipt. Completed ordinary app activation
is independent of optional recovery. Current existing apply/destroy authority is stated
honestly; no fabricated precreation generation proof or silent replan/input mutation.

Publisher and actors share one strict sanitized generatorInput/hash projection with
exact four foundation and four environment fields; no foundation-state read or full-root
hash dependency. Exact cross-peer initial proof and actual consumption reads support
established recovery validation, historical validity at consumedAt plus fresh own probes.
Narrow ARM inspection reads require actual provider scope qualification and fail closed
without subscription Reader fallback. Literal generated maps and code closure stay bound.

Approved ACME privacy 59AF97F0F953104E33678BE6643DDE70345CA08367F850B1567C752B8A5197BA
omits optional email from both issuers and sanitized public projection; renewal/trust/
account reconciliation, not discontinued expiry email, remains evidence. No new service,
notification promise, role exception or actual acceptance follows from preparation PASS.

## Reviewed preparation batch7 handoff

Approved B8B2E68ED1C1D34538B3193A7E187D17E3DF84DF738A1618FCFB22F484F2ED7D
is integrated in the operations contract: complete source-bound vault_guard inspection
closure plus explicit exact necessary read scopes, fixed inert human-owned denial fixtures
with literal APIs/bodies, distinct active-object current authority audit, own-only recurring
recovery observer and exact optional recovery Application GET. Canary denial never substitutes
for active guard authorization proof; unsupported/ambiguous scope/provider behavior blocks.

Fixed human/apply producer-owned pointers enable durable discovery only after digest/schema/
actual current tuple and completed installed-target checks; no newest-record/list trust or
caller flag. New private version2 completion catalog binds protected pointId to source facts
collected by trusted actual backup producer independently of credential payload. This trusts
that producer, not an independent signer/WORM guarantee. Human fixture creation is a later
actual authorized action; source/native/provider gates and unchanged known test failures
remain pending, never overridden by preparation PASS. No source/cloud action in this handoff.

## Reviewed canary read-binding staging

Approved A7C8FE1F570A40180C0C21254D2B64FD73C3986786D80B4E502677884CF2700B
is integrated in the operations contract, preparation8/9. F0 creates baseline without
future canary-object bindings; human read-only preparation yields fixed source-bound
fixture request plan. Only later explicitly authorized human execution creates fixtures
and actual evidence. F2 separate immutable foundation finalization verifies typed evidence
and current GETs before exact canary read bindings; F3 final human family qualification
uses final inspection tuple before hosted operations. Null typed evidence means no
bindings, never a caller-ready flag. Retained unchanged setup survives workload recreation.
Exact scope/provider checks remain pending; no live fixture action is approved by review.

## Reviewed preparation9 authority and observation contracts

The operations contract integrates exactly approved delegation8C23435CF9DE19C1F7E70F9A51668CD85B224F4A1026633791A6A89888C54445,
UID FE36A01C67B106878883C524DE8A1A95D2F92BFCB7813E1DEAED6D707B5498C6 and writer inspection
EC5C2C188FCC7EB96B88F0B0AAD3DB3A7BF48199F519B0184E212695FC57087A. Existing delegation
is bound by strict source/actual-role/assignment/condition descriptors and a conservative
supported pure evaluator, preserving generic base ANY-ServicePrincipal semantics and
specific principal restrictions; no new grants or absence claims. Actual inherited audit
and narrow provider lookup remain gates. Recovery writer audit uses existing retained-RG
inspection inheritance at one exact container, no broader Reader or new grant.

Recurring recovery records actual current Application UID in fresh own proof and checks
same UID/current reviewed target before mutations; initial activation has no historical
UID. This is checkpoint observation, not a global Argo lock or zero-TOCTOU guarantee.
Trusted backup/human administration boundaries remain explicit, not signer/WORM claims.
Preparation PASS does not close code findings, waive budgets, approve real fixtures or
establish live Azure behavior. Coordinator holds dependent repairs pending process decision.
