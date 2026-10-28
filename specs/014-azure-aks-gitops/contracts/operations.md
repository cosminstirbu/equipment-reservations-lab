# Operational interfaces

Target repository commands, shared locally and in workflows:

| Command | Contract |
| --- | --- |
| `npm run infra:format` | Canonical fmt modifies owned Terraform only. |
| `npm run infra:check` | fmt-check, backend-free validate each root, TFLint Azure rules and immutable-policy Trivy source scan; no cloud credentials; fail closed. |
| `npm run infra:preflight -- --config PATH` | Private config, identities, regional versions/quota, current cost BOM; safe metadata only, no provisioning. |
| `npm run infra:plan -- --config PATH --revision SHA` | Locked private saved plan and resolved-plan scan; safe revision/state/input-bound review digest. |
| `npm run infra:apply -- --config PATH --revision SHA --review PATH` | Reject stale approval; exact saved plan and private secret populate. If concrete runtime IDs changed, report configuration-review-pending, not environment-ready, until reviewed generated Git configuration is merged. |
| `npm run infra:bootstrap -- --config PATH --revision SHA` | Protected post-merge phase loads durable private foundation/environment projections, verifies actual generation/output hash and reviewed runtime Git, then installs ordinary Argo/app. Reports application-ready/recovery-qualification-pending until actual hosted per-identity proofs and reviewed recovery activation; no full-feature readiness claim. |
| `npm run azure:stop` / `azure:start` | Global lease, actual provider outcome, trusted certificates/secrets/login/persistence/messaging/deployed checks on start. |
| `npm run azure:backup` | Never starts stopped cluster; drain/quiesce, encrypted point, actual isolated verify, successful marker and seven-point retention. |
| `npm run azure:restore -- --point ID --confirm ENV` | Explicit approved manual restore, compatibility/decrypt/hash/writer suspension, original user-booking verification. |
| `npm run infra:destroy -- --confirm ENV` | Exact confirmation, approved workload-only plan, fresh verified backup/drain; foundation untargetable. |

Private config includes environment/generation, subscription/tenant, operator group
and CIDRs, four domain hosts, region/SKU/nodes/supported patch, ACME contact/terms,
backend/recovery vault/key version and desired SHA. Also required: actual taxRate
decimal0..1; billed estimate preTaxTotal*(1+taxRate)
must be <=fixed120EUR, never a configurable raised cap or guessed jurisdiction.
Unknown tax blocks paid provisioning. Secrets/decrypted data keys
use restricted temporary inputs/memory, never CLI args/Git; RSA private key stays
in retained vault. Missing/invalid values
fail before mutation. Public example identifiers cannot pass actual preflight.
Only explicit foundation-bootstrap stage permits recoveryKeyVersion=null while
creating the key; all environment/backup/restore stages require the actual version.
Tenant administrative rights apply to initial human bootstrap only, not recurring
workflow deployment preflight. Initial DNS gate creation uses If-None-Match '*',
followed by exact-record role binding after scope existence; environment generations
reuse the gate and existing foundation principals, and own their post-create cluster/
ACR grants without a new privileged foundation apply.

Workflows: offline PR checks; protected trusted plan/apply; separate approved confirmed
destroy; manual start/stop and timezone nightly stop; running-only backup/manual restore;
OIDC ACR builds and reviewed digest PR. Nightly stop uses trusted-main unattended
environment/stop-only identity; a separate trusted-main five-minute reaper identity
cleans expired admissions. Neither requires human approval; apply/destroy/restore do.
Terraform requires baseline IP policy; runner admission occurs only afterward for
Kubernetes checks and is removed before subsequent TF. Retained backend Storage
admission is a distinct earlier boundary: actual DNS record-set ETag control-plane
gate serializes narrow /32 Storage rule/tag writes before Blob lease/init; environment
Terraform never owns those retained ACLs. Workload vault /32 is post-apply only;
recovery endpoint admission is limited to explicit backup/restore. Independent ARM
reaper reads owned expiry tags without blocked Blob/vault data access. All gated
writers preserve baseline/active entries; no assumed Storage/KV If-Match or native TTL.
Foundation maintenance uses persistent operator CIDR with no runner leases.
Admission tag schema is `equipment-admission-<UUID>` -> compact JSON containing only
`cidr` (IPv4 /32) and `expires` (UTC ISO8601), maximum ten per resource; preserve
unrelated tags. DNS metadata keys are equipmentOwner UUID, equipmentExpires and
equipmentHeartbeat UTC ISO8601, with constant public TXT reserved. Verify admission
and release DNS before waiting for Blob; revalidate after Blob acquisition. Renewal
uses a separate short DNS acquisition, never DNS-held Blob waits.
Foundation requires explicit future recovery_key_expiration_date (initial lifetime
365 days from reviewed creation date); versioned points retain usable unwrap keys
through verified rewrap or reviewed expiry extension before old-key expiry.
contents:read default;
id-token:write only for explicit trusted Azure jobs. No privileged untrusted checkout.
All mutations share
concurrency plus external lease. Plan/state/dumps/tokens never public artifacts,
step outputs or logs. Safe outputs: SHA, phase, elapsed, status and approved digests.

Publication/promotion builds a component once, publishes the same immutable artifact
to GHCR and ACR, verifies both remote manifest/source digests before proposing reviewed
overlay changes, and never reports a partial registry publication as complete. Missing
ACR after recreation is repopulated from the proven GHCR digest without rebuild.

The common operation lease lives in the recovery account's operations container;
images/stop admit recovery only, environment TF admits its explicit state+recovery
backends. Private derived outputs wrapper is version/environment/generation/
subscriptionId/tenantId/sourceRevision/outputsHash/outputs; infrastructure sourceRevision
need not equal later application main SHA. Reviewed runtime projection excludes image
references/hash, which promotion owns separately; first image change includes all seven.
Installer solely owns its CSI SecretProviderClass as well as Argo installation.

Backup quiescing signatures: get/patch/update equipment deployments/scale for exactly
web,inventory,reservations,notifications,keycloak; read exact equipment Argo Application/
AppProject; exec only fixed equipment-backup-client Pod. Must verify active reviewed
deny-sync window/no active sync, block new web writes, drain<=5min, stop other writers
and finally restore recorded counts even on expiry, failing interrupted verification.
Restore requires reviewed maintenance SHA with writers0/seed Jobs omitted, exec only
equipment-restore-client, and subsequent reviewed normal Git change to resume. Neither
actor writes Argo or Deployment spec. Pinned isolated verification Job create/delete
is allowed only with already-active fail-closed exact-template admission policy; no
live DB write credentials/network on that Job. Actual AKS RBAC denial evidence required.
No local PostgreSQL CLI dependency; stream pinned in-cluster clients privately.

Human-only initial foundation grant supplies the explicit configured bootstrap operator
Secrets Officer at workload RG; environment delegation remains SP-only. Retained exact
OIDC secrets are copied to recreated workload vault using source-secret read/destination
write roles, with no recurring Graph Application.ReadWrite.OwnedBy. Rotation remains
explicit human foundation maintenance; never grant the ambient planner secret access.
Retained source names are exactly argocd-oidc-client-secret and
dashboard-oidc-client-secret; copy principal gets only these two secret-object reads,
no vault list/whole-vault secret role, no unwrap/key or Graph writes. Human bootstrap
and rotation set explicit credential expiry and verify refreshed destination login.
Foundation outputs operator_client_ids and operator_application_object_ids, each
{argocd,dashboard}, plus operator_secret_names; application object IDs are used only
by human Graph addPassword. Retained attributes.exp must be >now+30days, matching
reviewed Graph expiry. Recurring workflow never calls Graph and fails to human rotation.

Installer-only candidate: protected apply identity has Azure Kubernetes Service RBAC
Cluster Admin at exact AKS scope for verified Argo/CSI/CRD/RBAC installation, no admin
kubeconfig/local account. Other workflow actors never inherit it. Independent targeted
security approval precedes activation. With azure_rbac_enabled=true, actual backup/
restore SP native exec/scale resourceNames allow/deny requests are a mandatory provider
qualification gate; documented ambiguity is not treated as permission evidence. Fail
without broad Writer/ClusterAdmin or unreviewed auth-mode fallback.
Qualification MUST use protected hosted jobs actually logged in as backup and restore
OIDC subjects, not local human token minting/installer impersonation. Initial benign
fixtures have no live credentials; production recovery RoleBindings/CSI/SQL Job absent.
Actor proofs go to private qualification-backup/qualification-restore containers with
exact actor writer/apply reader. Apply-owned challenge binds both principals, exact
cluster/generation/CA fingerprint, reviewed probe-source/role hashes, nonce and expiry.
Structured proofs contain actual safe request outcomes and completion/expiry, max24h;
activation validates both directly from Blob and consumes challenge under common lease.
No self-asserted boolean/local marker/installer proof/expired artifact is accepted.
Reviewed activation introduces optional recovery Application only after ordinary app
and DB readiness, avoiding platform health dependency on recovery credentials.
renderRuntimeProjection returns {applicationFiles,platformFiles,recoveryFiles,outputHash,
generation}; third fixed map targets deploy/platform/azure/recovery/runtime/ and shares
canonical projection hash/generation, no images. Optional recovery source stays
deploy/platform/azure/recovery/, excluded platform root. Strict TF-derived cache wrapper
does not gain qualification fields. Publish its valid actual-output snapshot after
ordinary app readiness, before hosted probe jobs. Probe clients use future exact names
without live CSI; after verified proof/reviewed separate recovery-activation.json, the
installer removes only those fixtures, verifies absence and introduces optional app.
Initial proof expiry gates protected initial activation, not a fictional Argo
controller revocation timer or a repeated daily apply approval.
Clarification: initial both-actor/apply-challenge proof expiry gates INITIAL activation
only. Recurring operations validate the established activation's unchanged role/probe/
cluster/generation bindings and run fresh actual-identity inline probes under their
own operation lease, without fresh apply/other-actor/human approval for scheduled backup.
Restore still requires its own protected manual approval. Own actor immutable Blob
mode=operation proof binds fresh nonce/lease/principal/activation hash/current roles/
cluster CA and actual safe allow+403 deny results, <=15minute phase-start validity.
Commands perform probes, never accept caller flags/cached results. Long operations
reprobe before later privileged phases when needed; cleanup always attempts recovery.
Persistent RBAC is not automatically revoked by proof expiry.

Canonical recovery WI subjects are equipment-recovery ServiceAccounts
equipment-backup-client,equipment-restore-client,equipment-verification-server only;
recovery-database-bootstrap SPC aliases existing database-bootstrap identity. Roles/
same-name RoleBindings: equipment-recovery-backup and equipment-recovery-restore in
equipment-recovery, equipment-recovery-backup-scale in equipment. Corresponding actor
may get only its exact Role/RoleBinding for subject/hash validation, no wildcard/list
or mutation. Harmless scale fixture in recovery namespace proves initial model only;
recurring no-op real production scale/exec probes verify final bindings.
Backup has exact scale allow; restore may GET only the five named Deployment and
scale resources for writers0, must deny scale patch/update and relies on reviewed
maintenance Git. Both exec only their own fixed client and deny the other client.
Initial proof mode=activation is distinct from recurring mode=operation.
Qualification records now require version2 under the COMPLETE reviewed
[v2 contract](../team/qualification-schema-v2-proposal.md), SHA256
A9D5A72D9DBC8C029F729D322060C0649C02877864955269059955625299F1D8.
Reject v1/mixed schemas. Distinguish infrastructureAnchorRevision, reviewed
sourceRevision and actual clean hosted-HEAD actualProbeCodeRevision. Independently
parse/verify full transitive module+asset/dependency/runtime/tool/workflow closure
against committed manifest, Git objects and actual files; unchanged full closure
alone permits app-only HEAD movement. Clear loader/preload inputs at launch BEFORE
npm/Node, exact runtime/npm ci --ignore-scripts and source/process rechecks. No caller
code SHA, guessed dependency subset or retroactive preload-protection claim.

platformFiles['recovery-qualification-bindings.json'] is installer-only and excluded
from Kustomization; initial bootstrap applies exact two probe bindings, activation
deletes them. Static qualification Pods use no-WI/CSI equipment-recovery-qualification
SA. Reviewed activation removes their platform references BEFORE platform Synced at
that commit and owned UID-checked Pod deletion; real recovery App starts only afterward.
No Argo self-heal dual owner or reapplying initial bindings on normal postactivation
bootstrap. Retained probe Pod annotations Prune=false/Delete=false require exact
installer cleanup, not broad pruning.

Drain is actual outbox0 AND native Rabbit queue running/ready0/unacked0. Dedicated
equipment_backup_monitor monitoring-tag user has ^$ configure/read/write and no
message/admin rights; protected private backup config supplies password, no KV read
broadening. Broker Deployment is not a stable rabbitmq-0. Backup only may get and
pods/portforward get/create exact equipment-broker-monitor Pod in equipment-recovery;
fixed credential-free nginx proxy allows only GET exact equipment vhost/
reservation-notifications stats, verified upstream management TLS, no log/other path/
query/method or production DB egress. External Node uses private localhost forward,
never PG-client HTTP tooling/broker admin. Bad/missing/nonzero/stale counters fail;
messages/get/mutation denial, secret safety and forward cleanup need native tests.

Bootstrap handoff uses recovery Storage bootstrap/foundation/<environment>.json and
bootstrap/environment/<environment>/<generation>.json with validated allowlisted
version/environment/generation/subscription/tenant/sourceRevision/outputsHash/outputs.
Foundation human publishes first; apply reads without foundation-state rights and
writes current environment export. Bootstrap container readers are exact needed actors,
writer is apply/bootstrap only. Initial hosted bootstrap revalidates against actual
resources/authorized environment outputs; stale/missing objects fail, never use manual
same-run caches or expired Actions artifacts. No secret values in these projections.

DB signatures: equipment_backup read-all-data/CONNECT only four application+Keycloak
DBs, equipment_restore SET TRUE/INHERIT FALSE in exactly their four *_app owners;
both NOSUPERUSER/NOCREATEROLE/NOCREATEDB/NOREPLICATION/NOBYPASSRLS. Per-DB plain
pg_dump --no-owner --no-privileges; psql -X ON_ERROR_STOP, fixed owner SET ROLE and
public-schema reset. No pg_dumpall/pg_authid/global role restore; reviewed separate
cloud-only recovery SQL bootstrap supplies roles/default grants. Canonical CSI keys:
backup-postgres-password,restore-postgres-password,verification-postgres-password.
Isolated Job is PostgreSQL server+emptyDir/Service with verification-only secret,
no production egress; fixed client streams restore over DB protocol, never arbitrary
Job exec. Real pinned schema/extension/RLS/denial tests required before activation.

Audit contract: state+recovery Blob Read/Write/Delete -> dedicated retained workspace,
workspace transformation attached before ingestion. Durable allowlist is TimeGenerated,
_ResourceId,AccountName,Category,OperationName,StatusCode,DurationMs,ServerLatencyMs,
AuthenticationType,RequesterObjectId,Protocol,TlsVersion. No IP/UPN/URI/ObjectKey,
authhash/details, headers/bodies/contenthashes or raw secondary sink.30day audit
retention/no archive,.03GB daily protective quota and explicit operator RBAC; actual
stored-row privacy/audit gap checks required. bypass=None and no Queue-only fix.
Audit staging: audit_transform_ready=false creates workspace+DCR; reviewed true binding
uses deterministic existing DCR ID after actual provisioning checks. Separate
audit_diagnostics_ready remains false until workspace default-DCR/configuration
qualification, then enables diagnostics; next safe Blob/stored-row probes gate full
acceptance. Source native processing is limited to approved SEC-D002 scope; provider
intermediate buffering has no promised maximum or zero-persistence guarantee.

Public443: app/realm login; Argo/Dashboard require Entra assignment plus source allowlist.
Port80 redirect only. Internal OTLP/history/admin endpoints never public. Diagnostic
API checks use private temporary forwards, certificate verification always enabled.

## Reviewed recovery observation and continuity contract

This targeted contract integrates the independently quality/security-reviewed proposal at SHA256 8151D7D755948C51FE65F0DE19C9B5C5AF36969BC32F9B063150B47B7543E6D0. It supersedes less-specific earlier recovery inventory/observation descriptions; live evidence remains required.

## 1. Enforceable quiescence observation

Scale.spec.replicas=0 does not establish that writer processes stopped. Deployment
terminatingReplicas is optional and not acceptance evidence on its own. The reviewed additional permission is pods/list ONLY in namespace equipment for backup and restore.
Standard Kubernetes RBAC cannot restrict that list by labels or force metadata-only
responses: the authority permits Pod objects in that namespace. This scope is stated
honestly for review; no Secrets, Pod exec/get across the namespace, other namespace,
watch or write permission is included.

The implementation requests metadata-only where the supported transport permits it;
otherwise full response is captured privately, bounded and immediately projected to
metadata. No Pod spec/env/args are logged or retained. Poll with list only, no watch.
Read the exact five Deployments and compare their current selectors to the fixed
reviewed writer labels for web,inventory,reservations,notifications,keycloak before
changing replicas. Any selector mismatch fails. Count ANY Pod matching those fixed
writer labels, including deletionTimestamp/terminating, unrecognized owner, orphan,
old rollout and unexpected phase. Quiescence requires zero matching Pod objects,
not zero Ready Pods. Owner references may identify ReplicaSets rather than Deployments;
never compare their UID directly to a Deployment UID to filter a writer out. Unknown
ownership remains blocking, so no extra ReplicaSet-read authority is required.

Bounded polling expires as failure, restores exact recorded replica counts and
preserves cleanup evidence. Test a terminating Pod with replicas0, an orphan/old
ReplicaSet owner, unexpected matching Pod, selector mismatch, list denial/error,
cleanup failure and actual zero. Neither missing optional status nor an error becomes0.

## 2. Exact read-only control-plane observations

All grants below are read-only unless an existing scale-write grant is named:

| Actor | Namespace/resource | Exact names / verbs |
| --- | --- | --- |
| Backup and restore | argocd: argoproj.io applications, appprojects | equipment-azure; get only |
| Backup and restore | equipment: deployments | web,inventory,reservations,notifications,keycloak; get only |
| Backup | equipment: deployments/scale | same five; existing get/patch/update |
| Restore | equipment: deployments/scale | same five; get only; patch/update denied |
| Backup and restore | equipment: pods | list only for truthful process-termination observation above |
| Restore | equipment: batch jobs | database-bootstrap,identity-bootstrap; get only |

Restore treats Job404 as absent, Complete=True as stopped and active>0 or incomplete/
failed-with-retry state as blocking. Authorization errors are not absence. Names must
match the reviewed actual rendered manifests; a future suffix/name change requires
updated reviewed exact grants, never wildcard Job read. No Argo object writes, broad
resource reads, admin credentials or ClusterAdmin are introduced. Actual Entra/native
RBAC permission probes remain required before using these observations.

## 3. Database credential continuity without PostgreSQL administrator recovery

Canonical per-DB pg_dump --no-owner --no-privileges does not contain cluster roles or
passwords. Clean recreation already creates four owner roles/databases and current
workload-vault passwords. KEEP those NEW owner passwords: inventory-db,reservations-db,
notifications-db,keycloak-db. The restore actor uses its current freshly bootstrapped
equipment_restore login and fixed SET ROLE owner memberships to restore schema/data
inside existing DBs. It never resets a role password or imports old globals.

The decrypted bundle MUST NOT contain postgres-admin, any old four DB-owner passwords,
backup-postgres-password,restore-postgres-password,verification-postgres-password,
pg_authid/password hashes/global-role dumps or any credential enabling PostgreSQL
superuser/CREATEROLE. Reject extra credential keys before mutation; no broad capture
of workloadSecrets or all vault objects. Real pinned PostgreSQL tests prove that new
passwords continue to authenticate after schema/data restore and old passwords do not,
with no global role/attribute/membership drift and no superuser access.

## 4. Exact encrypted continuity inventory

Encrypted credential bundle schema contains version/environment/source-generation,
the exact six application identity secrets below, the five exact Kubernetes ACME/TLS
objects below, and compatibility metadata. It contains no unlisted secret values.

| Workload vault object | Reason after Keycloak DB restoration | Backup / restore action |
| --- | --- | --- |
| identity-admin | Restored Keycloak administrator password hash must match its app-admin credential | Read exact value/attributes; set same value/compatible enabled/notBefore/expiry at exact destination object |
| reservations-client | Restored confidential application client's DB secret must match reservations config | Same exact-object continuity |
| alice | Existing seeded employee login/test credential | Same |
| bob | Existing seeded employee login/test credential | Same |
| manager | Existing approver login/test credential | Same |
| staff | Existing staff login/test credential | Same |

Backup receives a custom secret get/value+metadata role at only these six source
secret-object scopes. Restore receives set/update+metadata at only these six
destination object scopes, no vault-wide list/get/purge/delete or unrelated secret
authority. Values travel only in private responses, encrypted bundle and exact secret
write requests, never args/logs/state/public configuration. Preserve only enabled,
notBefore,expires and contentType attributes where defined; reject disabled/invalid/
expired continuity inputs rather than silently rewriting policy or selecting a newer
unrelated source version. Source vault/tenant/generation and per-object version/hash
metadata bind compatibility. PUT writes a new destination version, not the old URI.

Explicit exclusions: broker admin/publisher/consumer/salts, monitoring credentials,
all telemetry/Grafana credentials, Entra Argo/Dashboard client secrets, internal CA/
internal TLS keys and all PostgreSQL/recovery login passwords. Those are regenerated
or copied through their separately approved retained-source mechanisms. Drained
messaging needs no old broker credentials. Operator Entra secrets never enter a bundle
decryptable by the application-data restore identity.

| Kubernetes namespace/name | Captured data | Restore authority |
| --- | --- | --- |
| cert-manager/letsencrypt-production-account | tls.key, expected ACME directory, original account URI/key checksum | Backup get; restore get/patch/update existing exact Secret only |
| cert-manager/letsencrypt-staging-account | same | Same |
| equipment/equipment-tls | tls.crt,tls.key,optional ca.crt | Same |
| equipment/dashboard-public-tls | same | Same |
| argocd/argocd-public-tls | same | Same |

No Secret list/create/delete, other namespace Secret read, service-account token,
SPC, internal CA key or unrelated fields are granted. Existing objects must be present
after clean recreation; missing objects fail, not broaden create privileges. Preserve
only exact type/data, validate certificate/key pairing, allowed SANs and issuer before
mutation. Do not replay source UID/ownerReferences/annotations. Use resourceVersion-
guarded updates and bounded retry against actual cert-manager changes. Backups fail
if required inventory is missing; never silently call a partial bundle verified.

## 5. ACME account/status reconciliation, backed by pinned controller source

Clean recreation may have created NEW ACME account/URI. Restoring only an old key and
waiting for an existing Ready=True is insufficient. Restore exact account Secret keys
first. The restore actor has get only on the two exact ClusterIssuers
letsencrypt-production/letsencrypt-staging, no Issuer spec/status write or controller
scale permission. Wait for cert-manager itself to reconcile BOTH restored private-key
checksum and original expected account URI, plus current Ready condition. Validate
directory host and account association against encrypted metadata; do not trust any
arbitrary URI from the bundle. Then restore exact public TLS Secrets, let certificate
reconciliation renew expired/near-expiry certificates normally and verify actual served
trusted chains/SANs before success. No certificate-verification bypass or retaining
NEW account state as an undocumented substitute.

Pinned [cert-manager v1.21.3 setup.go](https://github.com/cert-manager/cert-manager/blob/v1.21.3/pkg/issuer/acme/setup.go)
was inspected read-only: changed private key fails the cached registration checksum
condition; the controller builds a fresh ACME client with that key and without cached
URI, Register/GetReg resolves the matching account, then controller writes URI and
LastPrivateKeyHash. This supports a concrete key-update reconciliation path without
granting the recovery actor status-write authority. Source inspection is NOT a passed
provider test. Before activation, run an actual pinned controller/Pebble contract:
old registered account/key -> new account and cached URI -> restore old Secret ->
observe original URI/new observed resource version/correct checksum, and exercise
wrong key/directory, no reconciliation and stale Ready timeout as intended failures.
If this cannot be proved, ACME recovery remains blocked for targeted design repair;
there is no broad Issuer/ClusterAdmin fallback or invented success.

## 6. Restore ordering and evidence

1. Validate reviewed maintenance state, current proof/roles, no active seed Jobs,
   exact selectors/scale0 and zero matching writer Pods including terminating.
2. Validate/decrypt only exact inventory; verify fresh DB-owner credentials and
   recovery login/roles are present without recording their values in the bundle.
3. Set exact six identity-continuity secrets while writers remain absent; restore
   four DB schema/data using NEW current owner-role credentials/memberships.
4. Restore ACME keys and observe controller account-URI/checksum reconciliation;
   restore exact TLS Secrets and verify actual trusted endpoints/normal renewal.
5. Verify original app user login and reservations-client compatibility after reviewed
   normal-config resume, including actual renewed secret CSI/reload behavior; no seed
   Job rerun that overwrites restored identities. Retain rollback/cleanup evidence.

Preparation review must separately assess the explicit namespace Pod-list authority,
six exact vault-secret scopes, five exact Kubernetes Secret scopes and two issuer GETs.
No new human policy exception is inferred. The underlying live PostgreSQL/cert-manager/
Azure/RBAC evidence remains pending after a design PASS.

Fresh DB-owner authentication evidence is produced by the existing trusted bootstrap/provider test authority. Backup/restore receive no read grants to inventory-db, reservations-db, notifications-db or keycloak-db passwords; restore uses only its own current equipment_restore login and reviewed SET ROLE memberships.

## Broker freshness defect repair Q-BROKER014-001

The external proxy contract remains exact raw GET /api/queues/equipment/reservation-notifications, with no caller query or mutation. Nginx injects only fixed upstream ?disable_stats=true&enable_queue_totals=true. Pinned RabbitMQ4.3.6 queue_with_totals reads synchronous classic queue process info rather than stale management collector data. Monitoring permissions, route and verified TLS remain unchanged. Native regression must suspend queue_coarse_metrics collection after cached zero, confirm AMQP publish leaves ordinary cached stats zero while direct totals reports one, then prove unacked and final zero. Request-time/resampled history timestamps are not freshness proof. This design repair does not close Q-BROKER014-001 until original reviewer validates implementation/native evidence.

## Consumed activation failure

Consumption is create-only and replay-deny. Failure after consumption requires a NEW apply-owned challenge and both fresh hosted actor proofs; existing consumption is never success or a resumable journal. The protected installer may reinstall only the already-authorized harmless qualification fixtures and exact two installer-owned qualification bindings, after checking current ownership/generation and that real recovery clients/bindings are inactive. Restore the reviewed initial qualification source references through Git and wait exact-commit platform Synced before reprobe. Never overwrite real clients with fixtures or broaden cleanup rights; an ambiguous/partially active state fails to explicit reviewed rollback before requalification.


## Reviewed continuity binding ownership

Integrated after independent quality/security preparation PASS of addendum BEBA835182937453AE258E890764A1EB683CA08940DA64977CBA74D7B61D39B7; see ../team/continuity-binding-security.md and ../team/continuity-binding-quality.md. This clarifies the issuer observation and binding ownership above; actual authorization/source checks remain required.

## Exact issuer observation

The reviewed continuity inventory requires backup to capture the actual original ACME
account URI and private-key checksum. The prior contract explicitly authorized issuer
GET only for restore. Backup receives GET on exactly the ClusterIssuer objects
letsencrypt-production and letsencrypt-staging, matching restore's existing scope.
No list/watch, other issuer read, spec/status write or controller mutation is granted.
Both actors must obtain metadata from actual current issuer status; cached annotations
or caller-supplied values do not establish the account association.

## Sole installer ownership

The runtime generator adds platformFiles['recovery-continuity-bindings.json'], excluded
from every Kustomization. The protected installer alone validates and applies its exact
bindings after both actor proofs, reviewed activation and the operation lease. Neither
initial app bootstrap nor pending qualification installs these production grants.
Platform owns the corresponding unbound Roles/ClusterRoles. The optional recovery
Application retains its existing equipment/equipment-recovery resources; its AppProject
receives no extra namespace destinations or ClusterRoleBinding whitelist authority.

For each actor backup and restore, the generated file contains exactly:

| Object | Namespace | Name | References / scope |
| --- | --- | --- | --- |
| RoleBinding | cert-manager | equipment-recovery-ACTOR-continuity | Same-named Role; exact two ACME account Secrets, actor-specific approved verbs |
| RoleBinding | argocd | equipment-recovery-ACTOR-continuity | Same-named Role; exact argocd-public-tls Secret and applications/appprojects equipment-azure, actor-specific approved verbs |
| ClusterRoleBinding | cluster | equipment-recovery-ACTOR-issuers | Same-named ClusterRole; get only the two named ClusterIssuers |

ACTOR is replaced literally by backup or restore, never a free input. Subjects are
only the reviewed actual corresponding Entra workflow principal object IDs; no group,
service-account substitution or ambient installer subject. Namespace Role scopes retain
the approved backup Secret GET versus restore existing-Secret GET/PATCH/UPDATE verbs.
The equipment TLS/read/scale/Pod-list/seed-Job grants retain their already reviewed
namespace ownership and exact inventory; this addendum introduces none of those anew.

Generator/installer validators reject extra/missing objects, names, namespaces,
roleRefs, subjects or verbs. Activation and each operation verify actual binding/role
hashes and principal/cluster/generation against the qualification closure; drift blocks
before secret access. Fixture qualification stays separate and credential-free. Actual
native allow/deny tests and hosted AKS identity qualification remain mandatory; source
or preparation PASS is not runtime authorization evidence. No ClusterAdmin, issuer
mutation, broad Secret read or AppProject authority is added to backup/restore.


## Reviewed non-vault integration clarification

Integrated ONLY sections2–3 of independently reviewed proposal38A807E857AB00C6CD501AEE44C586A0E9F939D359C77E1FC656AA9AA61EB919 after quality/security preparation PASS. The vault-write/policy CandidateA remains proposed and BLOCKED pending owner authority decision; this integration grants no vault management authority. Existing contradictory immutable-all-deploy interpretation is superseded only by the exact classification/transition mechanism below, not broad exclusions.

## 2. Truthful own-authority drift observations

Operations confirms production drift adapter is unbuilt. For actor X=backup or restore,
add GET only (no list/watch/write) for these exact own objects, independently tested:

| Namespace | Role GET and RoleBinding GET name |
| --- | --- |
| equipment-recovery | equipment-recovery-X |
| equipment | equipment-recovery-X-scale |
| cert-manager | equipment-recovery-X-continuity |
| argocd | equipment-recovery-X-continuity |

At cluster scope add GET only on ClusterRole AND ClusterRoleBinding named
equipment-recovery-X-issuers. The issuer ClusterRole remains limited to exact two
ClusterIssuer GET plus these exact own-named RBAC GETs; no other actor's RBAC read.
Namespace Roles include only their own named Role/Binding GETs. Installer validates
both actors; each operation validates its own actual objects/subjects/roleRefs against
the current activation closure before secret reads. Names are literals from reviewed
rendered inventory, not caller parameters. Negative tests deny other actor, extra
names, list/watch/write and wrong namespaces. Missing/forbidden is failure, never
unchanged. Reading authority definitions does not permit modifying them, but these
additional reads require explicit review; they were absent from issuer-only text.

## 3. Definition closure versus installation transition

Evidence: current platform recovery-controls Kustomization references qualification.json;
reviewed activation must remove it. Hashing every deploy byte as immutable executable
closure makes that required transition invalidate proofs. An activation record must not
include its own hash transitively. Do not fix this with broad deploy/** exclusions.

Propose three independently bound domains:

1. Executable/interpretation closure: transitive actual JS/module entrypoints, workflows,
   locks/runtime/tool pins, all recovery SQL/policies/templates/proxy assets, all literal
   source files the validators/generators read, and a fixed reviewed installation-state
   validator. Unknown/dynamic loads and unexpected deployment paths fail closed. All
   files remain in the enumerated repository manifest; classifications are exact paths,
   not directory globs. Any executable or authority-definition change requalifies.
2. Installation state: exact reviewed qualification source and target projections,
   generated runtime files and optional recovery Application. Challenge records their
   individually hashed complete source/target maps, generator version/outputHash and
   the allowed transition. Validator permits only: removing the literal qualification.json
   resource reference in deploy/platform/azure/recovery-controls/kustomization.yaml;
   removing credential-free retained qualification fixtures/installer-owned two bindings;
   installing the already-hashed optional recovery Application, exact six continuity
   bindings and already-hashed recovery runtime projection. Every other field/path,
   permission/subject/image/template change fails. Both full trees are independently
   rendered/schema-checked; proofs bind BOTH hashes before activation. Actual source
   transition and platform exact-commit Synced/UID cleanup remain required. Generated
   state is not exempt from integrity checks merely because not executable closure.
3. Activation record: a distinct canonical schema/path, never imported, rendered or
   executed. Its schema/validator code IS in executable closure; record bytes are bound
   by private create-only challenge consumption and the operation lease, reviewed Git
   revision, source/target state hashes, actual both-principal proofs and generation.
   No self-hash field. Unknown fields/paths, record outside its exact expected location,
   alternate executable extension/import, changed payload after consumption, or replay
   fails. Recurring operations verify consumed canonical record digest and actual
   target state plus unchanged executable closure; no caller boolean.

Implementation must first enumerate the exact paths from the current actual dependency
parser and rendered generator outputs. If an asset cannot be classified unambiguously,
it stays executable/immutable and blocks activation; do not guess exclusions. Intended
red cases: required fixture-reference removal with unchanged authority succeeds; arbitrary
Kustomize edits, new path, template/policy change, activation self-reference/import,
unknown generated output and target mismatch fail. Preparation review must assess this
mechanism before replacing the conservative current closure. Actual native/hosted proof
requirements remain unchanged.


### Concrete current path classification and unresolved enumeration

All current qualification-definition.json modules/assets remain immutable definition inputs except the following exact state classifications: deploy/platform/azure/recovery-controls/kustomization.yaml permits ONLY removal of its literal qualification.json resource reference; deploy/platform/azure/recovery-activation.json is the canonical non-executable activation record. The fixture definition deploy/platform/azure/recovery-controls/qualification.json stays immutable even when its reference is removed. deploy/argocd/azure/recovery/application.json and kustomization.yaml, all recovery-controls roles/admission/network definitions, all deploy/platform/azure/recovery/ SQL/client/network/monitor assets and their templates stay immutable executable/authority inputs. Installing their already-hashed output is a state operation, not permission to edit their source.

Generated outputs are installation-state bytes only when their exact file map is independently produced by the immutable scripts/azure-runtime.mjs generator and compared with private authorized generation/outputHash. Three known roots are deploy/environments/azure/runtime/, deploy/platform/azure/runtime/ and deploy/platform/azure/recovery/runtime/. These roots are NOT glob exclusions. Unresolved before implementation acceptance: enumerate every literal filename returned in applicationFiles/platformFiles/recoveryFiles, including installer-only recovery-qualification-bindings.json/recovery-continuity-bindings.json, in the committed classification manifest and independent validator; no generated runtime directories currently exist in this working snapshot. Unknown files under those roots fail closed, and JSON projection metadata is never executable. The parser/validator must reject activation-record imports and unexpected generated resources, rather than simply omitting these paths from closure. Parent source/target maps bind actual clean Git objects before proofs and activation; pending exact enumeration is not approval to guess paths.


## Owner-approved guarded vault admission

Owner decision [vault-admission-authority-decision.md](../team/vault-admission-authority-decision.md) explicitly approves CandidateA of independently reviewed proposal38A807E857AB00C6CD501AEE44C586A0E9F939D359C77E1FC656AA9AA61EB919 with safeguards and residual network/availability authority. This supersedes earlier CandidateA proposed/blocked status ONLY after the actual staged checks below. No data-plane scope expansion or scanner exception follows. The following research/repair details are adopted as implementation constraints; their historical no-writes statements describe research, not an infrastructure test result.

## Read-only refinement: retained ARM Policy guardrail option

Research2026-10-26; no resource writes or policy implementation. This refines CandidateA
for independent review, not an authority exception or an activated permission. Unlike
the previously declined AKS Azure Policy add-on, this uses Resource Manager policy on
Microsoft.KeyVault/vaults, no Kubernetes agent/Gatekeeper or new workload service.
[Azure Policy product pricing](https://azure.microsoft.com/en-us/products/azure-policy/)
states no additional charge to Azure subscribers. No paid relay/managed service is
needed for this option; ordinary existing audit/operation usage remains budgeted.

### Verified primary evidence

- [Key Vault permission-model warning](https://learn.microsoft.com/en-us/azure/key-vault/general/assign-access-policy): vaults/write can self-grant data access in legacy policy mode.
- [Key Vault access-control defaults](https://learn.microsoft.com/en-us/azure/key-vault/general/access-control-default): vaults/write can change enableRbacAuthorization; a separate RBAC guide states an unrestricted roleAssignments/write prerequisite. The discrepancy requires qualification, not an assumed bypass.
- [Official built-in RBAC policy](https://github.com/Azure/azure-policy/blob/master/built-in-policies/policyDefinitions/Key%20Vault/Should_Use_RBAC.json), version1.0.1, supports Deny and checks absent/false enableRbacAuthorization. It EXCLUDES createMode=recover; copying that exclusion would leave an unqualified path, so the proposed strict custom guard has no recover exemption.
- [Deny semantics](https://learn.microsoft.com/en-us/azure/governance/policy/concepts/effect-deny): ARM create/update is blocked before resource provider,403; existing noncompliance alone is not remediation/enforcement evidence.
- [Assignment semantics](https://learn.microsoft.com/en-us/azure/governance/policy/concepts/assignment-structure): require enforcementMode=Default, no exemptions/notScopes/resourceSelectors/overrides reducing coverage. DoNotEnforce is not acceptable.
- [Alias semantics](https://learn.microsoft.com/en-us/azure/governance/policy/concepts/definition-structure-alias): aliases map API-version paths. [Effect ordering](https://learn.microsoft.com/en-us/azure/governance/policy/concepts/effect-basics) notes tag-only PATCH evaluates tag policies only; it cannot itself mutate authorization fields, but tag-only success is not a guardrail qualification test.

Azure MCP policy_assignment_list read succeeded: current subscription has default
Security Center audit initiative plus inherited MFA write/delete assignments; no
feature Key Vault deny guardrail exists. Those audit/MFA assignments are not substitutes.
No subscription/tenant identifiers are needed in this public research note.

Read-only live `az provider show --namespace Microsoft.KeyVault --expand resourceTypes/aliases`
confirmed the following aliases/default paths. Provider metadata lists historical
API-specific paths and defaults; a listed alias alone does not prove the pinned
API's actual PUT/PATCH/recovery enforcement. Keep exact spelling in generated policy.

| Alias | Default property path / required invariant |
| --- | --- |
| Microsoft.KeyVault/vaults/enableRbacAuthorization | properties.enableRbacAuthorization=true explicitly |
| Microsoft.Keyvault/vaults/accessPolicies[*] | properties.accessPolicies[*], field count=0 |
| Microsoft.Keyvault/vaults/tenantId | properties.tenantId=reviewed tenant |
| Microsoft.KeyVault/vaults/enablePurgeProtection | properties.enablePurgeProtection=true |
| Microsoft.KeyVault/vaults/enableSoftDelete | properties.enableSoftDelete=true |
| Microsoft.KeyVault/vaults/enabledForDeployment | properties.enabledForDeployment=false |
| Microsoft.KeyVault/vaults/enabledForDiskEncryption | properties.enabledForDiskEncryption=false |
| Microsoft.KeyVault/vaults/enabledForTemplateDeployment | properties.enabledForTemplateDeployment=false |
| Microsoft.KeyVault/vaults/networkAcls.defaultAction | properties.networkAcls.defaultAction=Deny |
| Microsoft.Keyvault/vaults/networkAcls.bypass | properties.networkAcls.bypass=None |
| Microsoft.KeyVault/vaults/publicNetworkAccess | properties.publicNetworkAccess=Enabled for reviewed hosted-runner model |

### Concrete authority and lifecycle boundary

Foundation human bootstrap owns a custom mode=All deny definition and enforcing
assignment at the retained workload RG BEFORE environment vault creation. Condition
matches Microsoft.KeyVault/vaults and denies ANY violated invariant above. Explicit
false legacy deployment flags avoid adding alternate trusted-service paths; absent
critical values fail closed rather than accepting API defaults. A companion condition
for type Microsoft.KeyVault/vaults/accessPolicies denies that legacy child-resource
operation entirely; the exact operational custom role does not grant
Microsoft.KeyVault/vaults/accessPolicies/write in any case. No recover-mode exception.
No remediation identity/DeployIfNotExists/add-on is needed for Deny.

The environment root can create its compliant vault but has no policy definition,
assignment, exemption, enrollment or management-group rights. Backup/restore/reaper
receive ONLY the exact current workload-vault read/write/tag actions listed in
CandidateA, not parent RG Contributor and no roleAssignments/write or accessPolicies
child action. The foundation policy definition/assignment survive workload deletion;
new vault generations inherit enforcement before grants. Human foundation updates are
reviewed separately. Policy read-only integrity inspection may be granted at exact
definition/assignment objects if needed; no policy writes for recurring identities.

Policy constrains the security-sensitive fields; RBAC continues to enforce only six
secret objects. Thus, if actual enforcement tests pass and policy authority is truly
separate, whole-vault write cannot switch into legacy access-policy authorization to
read PostgreSQL admin/operator secrets. This is a reasoned supported control design,
not a claim of already proven exploit resistance or an ACL-only ARM action.

Remaining whole-vault authority includes availability/network IP/subnet management and
tag mutation. A malicious permitted actor could widen IP rules while keeping default
Deny, remove an endpoint or overwrite admission tags; exact data RBAC still applies.
Do not describe this as property-scoped privilege or guaranteed lease expiry. Existing
DNS serialization/reaper fail-closed rules continue; honest residual network/availability
authority must be assessed by the reviewers/owner, not accepted by an agent.

### Mandatory qualification before any secret use

Do not grant recurring operational vault-write until the human/foundation authority
has established actual assignment and negative tests (temporary exact candidate-role
qualification principal may test without any secret data roles). Apply the corrected repair4 matrix below: candidate-authorized parent writes need policy-specific denial; candidate-unauthorized child writes need RBAC denial; toggle coverage separately distinguishes additional RBAC prerequisites. Test tenant/legacy flags/network/purge/soft-delete/recovery/API cases without inventing denied-action policy coverage. Prove
policy modification/exemption and role-assignment attempts denied by actual identities.
Prove the normal full compliant read-preserve-PATCH/PUT admission and cleanup succeeds
without changing unrelated properties, and secret GET outside exact six remains403
even after allowed network admission. Binding/grant ordering must never create an
unguarded operational interval. If propagation/alias/API behavior cannot prove this,
activation remains blocked; no fixed sleep or compliance dashboard pass substitutes.

No Azure writes were authorized or executed for this research; those actual tests,
policy-role binding model validation, API pin coverage and residual authority review
remain unresolved. Read-only facts support a no-extra-service guarded option worthy
of review; they do not settle the process-budget extension or authorize repair.

## Preparation repair4: probe authorization and both-vault scope

This section corrects the qualification matrix above and supersedes any implication
that candidate actors can call the legacy accessPolicies child operation, or that
vaults/write alone is a proven permission-model escalation on the selected API.

### Separate RBAC and policy denial evidence

The operational candidate role has parent vaults/read and vaults/write plus exact
vault tags rights. It has NO Microsoft.KeyVault/vaults/accessPolicies/write. Therefore:

- Candidate legacy child add/remove/replace calls must be denied by RBAC. Record the
  actual authorization-denial response/action and unchanged resource; do NOT require
  RequestDisallowedByPolicy or count an AuthorizationFailed response as policy proof.
- Candidate-authorized parent PUT/PATCH with populated accessPolicies, bypass/default
  network changes and other allowed-action property mutations must prove actual
  RequestDisallowedByPolicy from the exact intended assignment when the request reaches
  policy. Unauthorized actions need not and may not reach policy evaluation.
- Permission-model toggle negative may encounter the documented additional unrestricted
  roleAssignments/write requirement. Record actual response; if denied earlier by RBAC,
  it establishes candidate inability on that tested path, not deny-policy coverage.
  Demonstrate the deny assignment's toggle condition separately through a narrowly
  supervised human bootstrap test with already-held parent/toggle authority on an
  isolated disposable qualification vault governed by the same policy. This is not a
  grant of that authority to backup/restore/reaper. No separate new qualifier role or
  child accessPolicies/write grant is needed. If no safe authorized parent-policy
  qualification can be performed, mark that policy case unproven and block acceptance.
- The proposed child-type deny is defense in depth. With no candidate child write,
  its policy-specific enforcement is not required as candidate privilege evidence.
  Do not add a new qualifier privilege merely to manufacture a policy-denial response.

### Official permission-model prerequisite discrepancy

The [RBAC guide](https://learn.microsoft.com/en-us/azure/key-vault/general/rbac-guide)
states changing the model requires unrestricted roleAssignments/write; conditional
Data Access Administrator is insufficient. The newer [access-control defaults guide](https://learn.microsoft.com/en-us/azure/key-vault/general/access-control-default)
states vaults/write is required and describes roleAssignments/write as an additional
portal requirement. These are primary-source statements with differing scope; source
inspection does not settle selected API/server enforcement. Legacy access-policy
self-grant warnings apply to legacy-mode vaults and do not themselves prove a writer
can switch a currently RBAC vault. Treat model switching by vaults/write-only as a
potential escalation to defend and test, not a demonstrated exploit or proven block.
No unrestricted role-assignment privilege is proposed for recurring identities.

### Retained recovery vault must be included

Current source evidence: foundation/storage.tf enables RBAC on the recovery vault;
foundation/network-access.tf assigns the same parent vaults/write custom role at that
exact vault to backup,restore,reaper AND apply. Thus the authorization-toggle question
already affects the retained recovery key/source-OIDC vault, not just the new workload
vault. Guarding only workload would leave this existing authority boundary unqualified.

The proposed retained foundation guard covers BOTH exact vault families: assignment
at retained foundation RG filtered to the exact recovery-vault name, and at retained
workload RG for the workload vault type. Same critical invariants and no recover
exemption; no broad effect on unrelated services. Recovery guard must be established
and qualified before continuing any hosted recovery-vault network writer activity,
including apply's two retained OIDC source-secret copies. Human foundation bootstrap
remains explicit authority; recurring actors receive no guard modifications/exemptions.
Recovery vault data grants remain exact recovery-key wrap/unwrap and exact approved
source-secret reads; do not generalize workload six-secret permissions to this vault.

Foundation dependency ordering must create/assign the guard before network-writer role
assignments, or hold those assignments disabled pending actual qualification. Existing
source assignments are not proof of live deployed resources (no provisioning claimed).
The actual tests repeat for both vault configurations and selected APIs, including
retained key/source-secret out-of-scope denial and normal network admission/cleanup.
No current grant is silently approved, revoked or changed by this proposal.


### Executable guard qualification and grant stages

Stage G0 (human foundation): create retained mode=All enforcing guards at both retained
RG scopes before any operational network-writer assignments. Existing recovery writer
assignments are absent/disabled in initial configuration until G2; source presence is
not deployed evidence. Create private operations/proof storage through already approved
human authority and baseline operator admission, not an unqualified recurring writer.
No ordinary apply/backup/restore/reaper vault write or secret operation starts in G0.

Stage G1 (human policy qualification): already-authorized human bootstrap performs
parent PUT/PATCH negative cases on exact recovery vault and a compliant workload
qualification vault under the actual retained workload RG guard. Use the reviewed
selected API pins, harmless incompatible settings rejected before mutation, verify
unchanged GET afterward and compliant admission/cleanup. Do not give the human's
existing Owner/toggle authority to recurring actors. Child-operation policy proof is
not manufactured: candidate child requests are RBAC-denied later. A failed or uncertain
negative mutation blocks and requires explicit human recovery, never routine grant.

The human-only qualification publisher writes create-only private record
vault-guard/policy/<qualificationId>.json in retained recovery operations storage.
Record schema binds version, environment/tenant/subscription, actual human principal,
source revision/definition closure hash, both actual assignment IDs/definition hashes/
parameters/enforcementMode/scopes/exemptions, tested vault IDs and family, exact APIs,
UTC timestamp/expiry<=24hours and per-case request/action/provenance/activity correlation/
unchanged-before-after hashes/outcome. Record contains no secret payload/token. The
publisher obtains actual ARM identity/responses; it cannot accept a passed caller boolean
or fabricated case list. Only explicit human bootstrap publisher writes policy evidence;
recurring actors are read-only for this prefix. Final record digest is projected privately
with foundation output metadata, not a source-controlled secret or TFstate secret value.

Stage G2 (protected grant): foundation human/authorized protected grant wrapper loads
actual private G1 record, re-reads current guard definitions/assignments/exemptions and
vault properties, validates generation/expiry/source hashes and exact complete test
matrix, then enables exact resource-scoped assignments. Terraform staging inputs are
computed from this verified record/digest by the wrapper, not user booleans as evidence.
Changed/expired guard evidence blocks grant. Definition/assignment resources are not
owned by environment root. Workload operational assignments reference its actual new
vault only after compliant environment creation; recovery assignments reference its
retained exact vault. No broader RG assignment or permissions to alter guards appear.

Stage G3 (actual actor qualification before use): each actual hosted actor obtains its
own identity and proves parent-policy denials or documented earlier RBAC toggle denial,
child/action RBAC denials, no policy/exemption/role-assignment write, compliant admission/
cleanup and out-of-scope data GET/unwrap denial under the exact granted role/API. No
secret copy, backup, restore or unattended reaping writes occur until its own record
passes. Actor evidence is private create-only in its approved qualification storage;
reaper has a separate exact evidence prefix/write scope only if explicitly generated
and reviewed, otherwise protected human publisher captures its actual hosted result.
Do not infer proof from human impersonation or an installer subject. Wrong actor,
assignment hash, API, role closure or missing case blocks. Actual guard integrity and
current role/subject hashes are checked before each recurring network admission;
changed guard/role/source requires requalification, not an old passed record.

Contract seam: Terraform owns guard definitions/assignments and staged exact grants;
primary guard CLI owns real ARM qualification/evidence validation and private projection;
operations network wrapper requires the verified current guard/actor evidence handle
before calling its existing DNS-gated vault admission/reaper transport. A handle is a
validated private record reference/digest, never a caller boolean. API response provenance
and resource-state checks are independently tested. No local privileged tokens are
passed to hosted actors. G1 must repeat for each actual workload vault generation before
operational grants; an isolated prior probe establishes the policy family only, not the
new actual resource. Human supervised selected-API checks on actual new vault complete
that family record without relying on ungranted workflow authority. Missing actual Azure
evidence remains pending and blocks activation even when source tests pass.

## Reviewed hosted recreation and evidence authority refinement

Integrates exact independently quality/security-approved addendum8D9A8D9D64E753949A25DC51D0B57A92F569AF7C2BB05ACC4BECFD395172EA1A. Its concrete phase/evidence rules supersede conflicting earlier G0–G3 wording (especially inherited apply Contributor absence, recurring human-token requirement and human evidence in the shared operations container). No additional authority beyond explicit owner CandidateA decision.

## Corrected initial and recurring phases

1. Initial human foundation stage installs retained both-vault deny guards and performs
   the already-approved supervised policy-family qualification, including an actual
   compliant qualification vault in workload RG and the actual retained recovery vault.
   The qualification proves actual policy-specific parent rejection with the human's
   already-held authority. Only then enable protected hosted infrastructure use and
   staged recurring network grants. This is a one-time initial qualification of an
   unchanged guard/API/security-definition generation, repeated after relevant changes.
2. Protected hosted apply may use its EXISTING workload-RG Contributor to create a new
   COMPLIANT workload vault under those actual enforcing guards. It may only perform
   infrastructure creation/read and actual guard qualification in this phase. It has
   real ARM vault write authority; a claimed absence or caller boolean is not a boundary.
   Guard definitions/assignments/exemptions remain outside its authority. The existing
   workload-RG Contributor also includes vault delete; no assertion that apply lacks
   delete is made. This permission is distinct from backup/restore/reaper exact network
   roles and does not expand their scope.
3. The same actual hosted apply identity qualifies the new actual vault before any
   application-secret population, OIDC source copy, operational runner admission or
   backup/restore/reaper activation: verify current policy hash/scope/enforcement and
   retained human policy-family proof; actual parent writes it is authorized to request
   must obtain expected policy-specific denial and unchanged resource. Child and toggle
   requests record real RBAC-versus-policy provenance; no broad role-assignment grant
   is added to make a forbidden toggle reach policy. The initial human proof establishes
   that unchanged policy's toggle condition; actual apply proof establishes new-vault
   coverage using reachable authorized parent cases. Record exact current resource ID,
   tenant/generation/API/principal/role/guard/source hashes in immutable private evidence.
4. Only a complete validated actual-generation proof permits the protected workflow
   to populate secrets or admit operational network identities. Terraform exact network
   assignments remain staged until that proof, except apply's existing inherited
   Contributor. Its phase restriction is protected-workflow enforcement plus policy
   guardrail, NOT removal of existing RBAC authority. Backup/restore/reaper remain
   ungranted until validated stage; each actual actor's subsequent own-role negative/
   cleanup/data-isolation tests still precede production use.

## Workflow, evidence and recovery constraints

Initial app/vault creation and post-creation qualification are automated phases in the
same approved infrastructure workflow, not a local administrator or impersonated human
step. The protected grant wrapper loads create-only retained evidence and re-reads actual
guards/resources; it rejects missing/expired/wrong-generation/changed-policy proof, not
accepts a passed boolean. The definition/API policy-family hash must match the supervised
initial human proof. A new guard/API definition requiring unproved behavior blocks for
human requalification; ordinary compliant vault recreation does not.

Before initial human family proof, no hosted Contributor activation/use is allowed for
workload infrastructure. After initial proof, Contributor persists through teardown so
workflow-only recreation works. During partial failure, do not populate secrets, grant
new network actors or use an unqualified vault; protected workflow may inspect/delete
its own incomplete infrastructure under existing approved teardown authority. Retained
guards/evidence survive; no exemption or legacy-mode fallback. The recovery vault remains
qualified under its separate retained identity; ordinary workload recreation does not
invalidate unchanged actual recovery-vault evidence. Guard/API/role changes do.

Tests must prove initial bootstrap has no hosted-use cycle; successful hosted teardown/
recreation creates a new vault and publishes actual-generation proof before secret
population; failed/missing/forged qualification stops before population and grants;
policy/role drift invalidates evidence; no human Azure token is requested in recurring
workflow. Negative tests distinguish authorization-denied from policy-denied requests.
Actual Azure qualification remains pending and cannot be replaced by source mocks.

This clarifies the earlier G0 statement to mean no unqualified hosted USE, rather than
an inaccurate promise that inherited Contributor vault-write permission is absent after
initial activation. Review must assess this honest existing authority/phase distinction;
no reviewer or owner approval is inferred by this proposal.

## Separate retained evidence authority

The existing operations container is NOT human-only: eight operational actors have
Blob Data Contributor there. Do not store trusted human G1 guard proof there or claim
prefix naming creates Azure RBAC isolation. Replace that proposed location with a
separate retained private container named guard-evidence in recovery storage, owned
by foundation and covered by the existing protected audit/encryption/firewall baseline.
Its human writer is only the explicit configured bootstrap operator object ID, granted
at exact container scope; no ambient operator, recurring Contributor or operations
container role inherits data writes to it. Verify actual inherited grants before use.

The G1 human publisher writes policy/<qualificationId>.json create-only; exact schema
and current actual identity/policy/API proof requirements remain. This is trusted human
transport plus conditional create, not Azure immutable storage/WORM or an inability
for that authorized human writer to replace/delete data. Do not make IAM-immutability
claims. Restrict recurring consumers to Storage Blob Data Reader at exact guard-evidence
container scope: plan,apply,destroy,backup,restore,reaper only as required by their actual
guard/preflight consumers; no lifecycle/stop/images read without a demonstrated need.
No recurring container Data Contributor or account-level Blob data write authority.
Existing operations lease writes remain in operations; separate actor-owned G3 proof
containers keep their existing explicit writer authority and cannot write human G1 data.

The apply-generated per-vault G2/G3 proof is NOT a human G1 record and cannot be accepted
as one: store it in a distinct retained guard-apply-evidence container. Foundation grants apply only Storage Blob Data Contributor at this exact container, and plan,destroy,backup,restore,reaper only Blob Data Reader where their actual consumer requires it. No other writer, account-wide data grant or operations-container authority is inherited. Record schema binds actual apply principal and purpose=workload-generation; it cannot satisfy purpose=human-policy-family. Never use guard-evidence as apply writer fallback. Every consumer validates record purpose/producer identity/generation and
current actual hashes rather than trusting path labels. Human-family record can be
read through narrowly admitted recovery storage without recovery-vault data access.

Qualification includes negative actual Blob PUT/DELETE/overwrite attempts by each
recurring reader at guard-evidence, positive reader GET, exact human publisher identity,
wrong-container/source-purpose denial and successful operations lease behavior unchanged.
If broader inherited storage data roles undermine this boundary, fix/review that grant
before enabling hosted use; no prefix-only promise or caller-provided trusted marker.

### Verified source API tuple

Actual qualification covers BOTH vault families with AzureRM5.11 provisioning API2026-02-01 and operational API2024-11-01. Coordinator/provider source inspection verified the former; scripts/azure-operations.mjs fixes the latter. Sources: https://github.com/hashicorp/terraform-provider-azurerm/blob/v5.11.0/internal/services/keyvault/client/client.go and https://learn.microsoft.com/en-us/rest/api/keyvault/keyvault/vaults/update?view=rest-keyvault-keyvault-2024-11-01 . Source verification is not live policy-denial evidence; selected APIs remain bound in actual records.


## Reviewed application release-data classification

Integrates exact independently quality/security-approved addendum2881E804A4724D8362742C14DB0118B2DBAE432950750E269BA3F9D2B357E05C after Q-D014-006 closure. These28 literal release-data paths supersede the earlier conservative all-deployment-assets-immutable interpretation only as constrained below. No broad path exclusion or code/authority closure weakening is authorized. Source implementation and actual provenance evidence remain required.

## Exact data-path inventory

Only the following 28 literal paths may be classified as application-release data.
Unknown files, additional components or alternate extensions fail closed, never match
a glob. Missing Azure files are allowed only before first complete seven-component
promotion; recovery/app readiness requires the complete validated Azure set.

- deploy/environments/local/images/web.yaml
- deploy/environments/local/images/inventory.yaml
- deploy/environments/local/images/reservations.yaml
- deploy/environments/local/images/notifications.yaml
- deploy/environments/local/images/database-bootstrap.yaml
- deploy/environments/local/images/identity-bootstrap.yaml
- deploy/environments/local/images/broker-bootstrap.yaml
- deploy/environments/local/releases/web.json
- deploy/environments/local/releases/inventory.json
- deploy/environments/local/releases/reservations.json
- deploy/environments/local/releases/notifications.json
- deploy/environments/local/releases/database-bootstrap.json
- deploy/environments/local/releases/identity-bootstrap.json
- deploy/environments/local/releases/broker-bootstrap.json
- deploy/environments/azure/images/web.yaml
- deploy/environments/azure/images/inventory.yaml
- deploy/environments/azure/images/reservations.yaml
- deploy/environments/azure/images/notifications.yaml
- deploy/environments/azure/images/database-bootstrap.yaml
- deploy/environments/azure/images/identity-bootstrap.yaml
- deploy/environments/azure/images/broker-bootstrap.yaml
- deploy/environments/azure/releases/web.json
- deploy/environments/azure/releases/inventory.json
- deploy/environments/azure/releases/reservations.json
- deploy/environments/azure/releases/notifications.json
- deploy/environments/azure/releases/database-bootstrap.json
- deploy/environments/azure/releases/identity-bootstrap.json
- deploy/environments/azure/releases/broker-bootstrap.json

## Fixed interpretation and provenance

The immutable independent classifier must enumerate these exact paths and reject extra
fields, duplicate keys, YAML anchors/tags/multiple documents or ambiguous parses. Each
images file is only the canonical imagePatch(component,image@digest) output. Inspection
of scripts/component-images.mjs targets and ALL seven actual local canonical patches
establishes this exact table (same target shapes apply to Azure publication):

| Component | apiVersion / kind | metadata.name | Sole spec.template.spec list / sole item name |
| --- | --- | --- | --- |
| web | apps/v1 Deployment | web | containers / web |
| inventory | apps/v1 Deployment | inventory | containers / inventory |
| reservations | apps/v1 Deployment | reservations | containers / reservations |
| notifications | apps/v1 Deployment | notifications | containers / notifications |
| database-bootstrap | batch/v1 Job | database-bootstrap | containers / database-bootstrap |
| identity-bootstrap | batch/v1 Job | identity-bootstrap | containers / identity-bootstrap |
| broker-bootstrap | apps/v1 Deployment | rabbitmq | initContainers / definitions |

Each exact list contains one item with only name and image. Broker-bootstrap is the
SOLE initContainers exception: only Deployment rabbitmq's definitions.image may change;
it is not a Job and not a broker-bootstrap named container. Reject containers instead,
any other initContainer, extra item, adjacent field, metadata name/path or API/kind.
For the other six, initContainers is forbidden. All patches forbid command/env/args/
volumes/serviceAccountName, labels, namespace, annotations, resource policy and any
other subtree or key. Root allows only apiVersion,kind,metadata,spec; metadata only name;
spec only template; template only spec; pod spec only the exact table list key.
Compare normalized structure AND canonical generated patch bytes with the immutable
reviewed imagePatch implementation; a semantically broader patch is not release data.

Local release JSON exact keys: schemaVersion,component,image,digest,repository,
runAttempt,runId,sourceRef,sourceRevision,workflow. schemaVersion=1; component exact
filename; repository exact reviewed numeric ID/name; sourceRef=refs/heads/main;
sourceRevision forty lowercase hexadecimal Git SHA; runId/runAttempt positive safe
integers; workflow literal .github/workflows/validate.yaml. image is exact reviewed
GHCR repository for component, digest sha256 plus64hex, never tag-only or caller registry.
Local image patch must equal image@digest from its corresponding release record.

Azure release JSON exact wrapper keys schemaVersion,source,image,digest with
schemaVersion=1. source is the fully validated local release record above; image is
exact configured reviewed ACR loginServer/repository/component mapping (actual
publishDualRegistry convention), digest EXACTLY source.digest. Azure image patch must
match this wrapper. No independently rebuilt digest or altered repository identity.
Actual OCI index/config digest and org.opencontainers.image.revision/source labels are
verified against registry responses and trusted GitHub run/repository/workflow main
provenance using immutable existing promotion/publication validators. Private transient
verification response handling remains required; record claims alone are insufficient.
Reject foreign source, wrong registry/component/image-key, missing counterpart, unknown
fields, moving tags, digest mismatch and non-reviewed main promotion ancestry. Routine
updates may change only valid digest/provenance values in this fixed data schema.

Every ordinary promotion retains its reviewed Git commit, exact selected release-data
hash map and actual Argo deployed revision/digests. Recovery compatibility checks bind
actual selected release/schema version separately from the initial identity/role probe
closure. A changed application digest alone need not repeat both hosted actor identity
qualification; changes to the immutable classifier, imagePatch parser, release validator,
loaded module closure, authorization, admission, SQL, proxy or recovery execution asset
DO require applicable requalification. This separation is not a data-integrity bypass.

## Immutable remainder and required tests

All loaded JS code/re-exports/imports and scripts/promote-images.mjs, component-images
and release/provenance parser dependencies remain in complete immutable closure even
if loaded only for initialization. Dockerfiles, deploy/images/nginx.conf, workflow/
lock/runtime/tool pins, main Kustomizations and all authority/SQL/proxy templates remain
immutable. deploy/environments/local/release.json (aggregate legacy path) is NOT one
of these 28 exceptions; any needed future classification requires explicit review.
Generated runtime installation maps and recovery-activation.json retain their separate
already-reviewed exact classifications; this addendum creates no other exclusions.

Before implementation acceptance, intended-red tests independently mutate each fixed
patch shape/role-like field, registry/provenance field, unknown 29th path, new component,
duplicate key and executable import, and prove failure. A valid routine seven-component
app promotion with unchanged full code/authority closure succeeds without fresh initial
both-actor approval. Actual current release maps/provenance still validate at operation
start; no stale record or caller bool substitutes. Manifest enumeration remains complete
across immutable, installation, activation and exact28 release-data categories.

Preparation repair5 Q-D014-006: corrected broker target after direct inspection of all
seven actual canonical patch files and targets in scripts/component-images.mjs. Tests
must include valid broker definitions initContainer image-only promotion, wrong Job/
metadata/container paths and every adjacent-field negative; no other exception inferred.


## Reviewed guard evidence lifetime and probe ownership

Integrates independently quality/security-approved addendum3B7943398775A9DF47D92D7AD233CE9C5E56BC5330D8DAF2F95429EA0B4F34C0. It supersedes earlier human G1 rolling24hour wording: mode-specific expiry and completed activation checks below are mandatory. No expiry check is generally removed, and no caller marker substitutes. Durable operation requires BOTH validated consumption AND independently validated actual completed activation/unchanged installed target state; consumption object existence alone is never success. Conditional-create trusted transport is not IAM immutability/WORM.

## Exact evidence modes and consumption

Human family record schema has mode=human-policy-family, producer=actual configured
bootstrap human object ID, issuedAt actual UTC, expiresAt=null. Null is valid ONLY for
this mode. It binds environment/tenant/subscription, exact both-family assignment/
definition/parameter/scope/enforcement/exemption hashes, source/security-definition
closure, actual human principal, and BOTH selected APIs2026-02-01 and2024-11-01 with
complete actual response-provenance cases. It lives only in the human-writer retained
guard-evidence container. It is not a caller boolean or perpetual authorization for
changed policy: every use re-reads current actual guard/API/role/security-definition
state and compares the anchored tuple. Revocation, tuple change, missing record,
failed actual checks or unexpected exemption invalidates it and blocks operation.
Ordinary app-only release data remains separately validated under the approved model.

Workload generation record has mode=workload-generation, producer=actual protected
hosted apply principal, issuedAt/expiresAt UTC, lifetime<=24hours and exact new resource
ID/generation/current family-record digest/API/role/guard/source hashes. Only apply
writes guard-apply-evidence; this mode cannot satisfy human-policy-family. Protected
activation/grant consumes the valid fresh record by creating a separate canonical
consumption record in the apply-writer guard-apply-evidence container (consumed/<qualificationId>.json), under the existing common lease: mode=guard-generation-consumption,
qualificationDigest, actual generation/vault ID, guard/family/role hashes, reviewed
source/activation revision and actual consuming principal/time. The stored consumption
has no self-hash and is create-only; conflicting existing consumption/replay fails.
No passed/consumed boolean is accepted from caller configuration. Failed consumed
activation remains fail-closed: a new automated fresh generation qualification and
new consumption identity are required, never treating an existing record as success.

After successful grant/activation, the immutable consumed evidence is durable for its
UNCHANGED actual vault generation and tuple. The source qualification's24hour window
limits when it may be consumed; it does NOT retroactively expire a completed activation
or require daily approved apply. Recurring operations verify the canonical consumption
and original record digests, actual vault ID/generation, current family/guard/role/source
closure, and run fresh actual OWN-actor G3 negative/admission/cleanup/data-isolation
checks under their operation lease. Fresh mode=actor-operation proof binds actual actor,
nonce/lease/current consumed-generation digest and actual tuple, expiresAt<=15minutes
for phase-start validity, with cleanup always required even after expiry. Wrong producer,
mode/null expiry, missing consumption, changed tuple or stale own proof fails closed.
Changed vault/guard/API/role/security-definition requires applicable requalification;
unchanged daily backup needs neither fresh apply nor fresh human credentials. Existing
v2 actor qualification authority and prefix/container isolation remain unchanged.

## Fixed initial human workload probe

The guard helper owns creation, qualification and cleanup of one fixed deterministic
compliant workload probe vault under the retained workload RG during INITIAL human G1.
Name/resource ID derive only from reviewed environment configuration and fixed probe
suffix; no caller arbitrary resource target, no live production vault reuse. Before
creation, verify exact absence (including soft-deleted-name collision), reviewed RG,
actual enforced policy tuple and actual human principal. Refuse to adopt/delete an
existing unowned vault. Create only the fixed compliant properties under both pinned
API qualifications, with no secrets/keys/OIDC values and no operational network grants.
Retain actual create response/UID-equivalent ARM resource identity and owned-operation
evidence; qualify only that exact vault and actual retained recovery vault.

In finally, helper DELETEs ONLY its exact newly created owned disposable workload probe,
then polls actual active GET absence AND the provider's matching soft-deleted vault
record/location/resource identity. Never purge, disable purge protection, delete the
workload RG or touch retained recovery vault. Delete/collision/soft-delete uncertainty
is a failed cleanup and blocks initial qualification publication, not a success marker.
Purge protection/soft-delete retention mean repeated initial probe runs may encounter
a retained name; block with explicit human cleanup/review rather than generate random
names, silently recover it, or request purge authority. A subsequent reviewed naming
change is explicit configuration, not wildcard adoption. Private failure evidence is
bounded and excludes secret/token material.

Human's existing approved foundation authority executes initial probe actions only at
later authorized actual provisioning. Source implementation/native HTTP fixtures now
must prove exact create/delete ownership, no-adoption/no-purge, collision, API tuple,
finally cleanup and actual soft-delete checks. These fixtures and preparation PASS do
not establish live Azure guard enforcement or authorize paid provisioning by themselves.


## Reviewed live release provenance reader authority

Integrates exact independently quality/security-approved proposalB82C66DF7312C07FEA3CAAFD3BBA7DFCDC8275BFD46595B431B16EC93A3F0768. This authorizes the specified read-only implementation scope; actual allow/deny/access qualification remains mandatory. No registry-mode/admin/PAT/visibility change or unlisted scope follows.

Select direct actual registry/provenance reads, avoiding a new publisher-trust service.
Environment root assigns AcrPull role7f951dda-4ed3-4680-a7ca-43fe172d538d to exact existing
backup and restore workflow principals at ONLY the actual current environment ACR
resource ID. Kubelet AcrPull is not their authority. AcrPull permits pull/get across
that registry (not repository-only); application code requests only exact seven reviewed
repository/digest pairs. Do not claim Azure RBAC enforces per-repository scope in this
non-ABAC model. No push/delete/import/admin-user/listCredentials/task/config/role-write
rights, no subscription/RG grant. Preserve current registry authorization mode; if ABAC
mode is adopted later, reject unsupported AcrPull assumptions and redesign explicitly.

Protected backup/restore jobs declare only needed repository GITHUB_TOKEN reads:
contents:read, actions:read, packages:read, plus already-approved id-token:write for
Azure OIDC. No package write/admin/delete, PAT, new client secret or cross-repository
credential. Token is short-lived and private, sent only to fixed trusted GitHub/GHCR
origins over verified TLS; sanitized isolated registry-auth environment and temporary
credential directory cleaned in finally. No token args/logs/persistent Docker login.
The producer workflow/run/repository/main SHA/attempt are independently verified with
actual GitHub API responses; foreign repository/run/ref and insufficient access fail.

Static validation of all28 literal data files may occur before authorized config load.
Actual ACR/GHCR OCI index/config digest+source/revision-label and GitHub run provenance
checks happen afterward, with registry ID/loginServer from verified environment output.
Record claims or kubelet success never substitute. Actual same artifact digest in both
registries remains required. Public GHCR may use anonymous pull; private packages must
have actual linked repository Actions read access. packages:read alone is not proof of
that linkage: verify actual token GET before readiness. If package permissions do not
permit the repository, block and report exact package access prerequisite rather than
requesting a broad PAT or changing visibility silently.

Native tests cover exact-role/principal/scope and permission blocks, private error and
auth cleanup, foreign host/registry/run/digest, denied package access, same-digest positive,
static-before-config and live-after-config ordering. Actual hosted identities must GET
the expected manifests/configs and fail push/delete/admin operations before recovery
acceptance. Azure registry transaction/network usage is covered by existing usage reserve;
no extra paid managed service is introduced. No actual access or pricing quote inferred.

Primary sources: [AcrPull exact action](https://learn.microsoft.com/en-us/azure/role-based-access-control/built-in-roles/containers#acrpull),
[GitHub package access/Actions linkage](https://docs.github.com/en/packages/learn-github-packages/about-permissions-for-github-packages),
[workflow permission controls](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#permissions).
Official package docs distinguish anonymous public GHCR access and private granular
package Actions access. Source research establishes possible permissions, not actual
current package visibility or successful workflow access.


## Reviewed guard and projection integration boundaries

Integrates independently quality/security-approved proposal B23C1E3121D3373A7CB98E7BD9FE0A6EF5D0D601B87FAC37C52903B2CC041E26, including original reviewer closure of Q-D014-007. Its explicit creation-versus-grant sequence supersedes less-specific earlier saved-plan/receipt wording. Actual provider scope qualification remains pending as stated; no broad read fallback or additional authority is inferred.

## Ordinary application activation is independent of recovery

Guard-generation activation means successful ordinary application bootstrap/readiness,
not optional recovery Application activation. Protected apply publishes a separate
create-only activation/<generation>/<qualificationId>.json in guard-apply-evidence,
mode=guard-application-activation, binding consumed receipt digest, exact actual vault
ID/generation, family/guard/role/source hashes, reviewed runtime outputHash/map hashes,
actual platform/application Argo source revisions+Synced/Healthy and required ordinary
HTTPS/application readiness evidence. Producer is actual apply principal. The private
publisher calls real installed-target validators; it does not accept passed booleans
or local fixtures as live results. Consumers verify actual current installed target
and immutable records. Missing/partial ordinary activation remains pending even if
consumed receipt exists. Optional recovery challenge/proofs/Application follow later;
ordinary readiness can report app-ready/recovery-pending without creating this cycle.

## Saved-plan inputs and consumption receipt

Plan identity is read-only and cannot consume. The post-creation grant/activation reviewed Terraform generation
input has consumption_sha256=null; fresh complete actual generation qualification is
bound in the private approved plan bundle, including saved plan byte hash, state lineage/
serial, exact input hashes, generation/vault/qualification/family/guard/source hashes.
Apply revalidates this same reviewed bundle, proof freshness and current actual guards,
then acquires the common operation lease and creates the real timestamped consumption
receipt BEFORE applying the unchanged saved plan. Receipt includes actual apply OID,
issuedAt, lease owner/nonce, exact saved-plan SHA256 and the complete qualification/input
binding; create-only receipt lives in guard-apply-evidence/consumed/<qualificationId>.json.
Write a private apply-owned plan-binding record linking receipt digest and approved
bundle digest. Terraform variables and saved-plan bytes remain unchanged; null is not
itself authority. Only the protected apply wrapper verifies a fresh actual receipt
and this binding immediately before invoking terraform apply <savedplan>. No replan,
new variable file, predicted receipt timestamp/hash or plan-principal consumption.

After actual ordinary application activation, later reviewed plans may project its
validated durable consumption_sha256 rather than null. They must verify canonical
receipt AND completed ordinary activation/current target, not treat nonnull as proof.
Expired unconsumed proof requires new actual automated qualification and newly reviewed
plan as applicable; failed consumed apply requires new qualification/consumption identity
and normal review, not replay success. Receipt freshness, state/guard drift or lost
lease blocks before apply. Source/native tests prove exact ordering and immutable bytes;
actual execution evidence remains required. Direct privileged human Terraform bypass is
not represented as a protected workflow proof path.

## Nonsecret actor projection inputs

The strict allowlist includes foundation dns_zone_resource_group_name and
operator_client_ids {argocd,dashboard}; environment workload_client_ids with the exact
reviewed WI map, workload_key_vault_name plus URI, ingress_public_ip and
ingress_public_ip_resource_group_name. These are already read by the actual immutable
scripts/azure-runtime.mjs generator, not raw private config additions. Match UUIDs,
resource-ID/name/URI tenant/subscription/RG ownership, IPv4 and DNS/ACR/AKS outputs against
both authorized Terraform root projections and actual resource truth before generation.
No foundation-state read, secret values, unknown fields or unreviewed caller identity.
Infrastructure and app revision domains remain explicit; outputHash binds complete
allowlisted input maps and the exact14 generated files previously enumerated by GitOps.
Additional missing fields require actual generator-read evidence and explicit reviewed
allowlist update, never copying all outputs/config. This adds no data-plane credentials.

## Guard authority inspection without broad subscription Reader

Official [Permissions ListForResource](https://learn.microsoft.com/en-us/rest/api/authorization/permissions/list-for-resource?view=rest-authorization-2022-04-01)
returns caller actions/notActions/dataActions/notDataActions (and possible nextLink) at
exact resource, API2022-04-01. It does not return other principals' inherited assignments,
conditions or complete role-definition hashes. Therefore it can verify conservative
own effective authority and support actual negative probes; it CANNOT replace the
approved evidence-container writer isolation audit or role-definition hash checks.
Do not claim wildcard permission aggregation proves absent other writers/conditions.

Use custom READ-ONLY inspection actions rather than subscription Reader:
Microsoft.Authorization/permissions/read at exact two vaults and two guard-evidence
containers; Microsoft.Authorization/roleAssignments/read at exact guard containers
and actual workload RG needed for its apply Contributor binding; and
Microsoft.Authorization/roleDefinitions/read queried at those SAME applicable resource/
RG scopes for only referenced reviewed GUIDs. No assignment/definition writes or other
resource reads follow. [RoleAssignments ListForScope](https://learn.microsoft.com/en-us/rest/api/authorization/role-assignments/list-for-scope?view=rest-authorization-2022-04-01)
defines atScope() as assignments at OR ABOVE the requested scope, so this resource-scoped
query must inspect inherited entries too. [RoleDefinitions Get](https://learn.microsoft.com/en-us/rest/api/authorization/role-definitions/get?view=rest-authorization-2022-04-01)
accepts scope+GUID; lookup scope must remain the inspected resource/RG rather than
blindly following returned subscription-extension role IDs. Canonical returned GUID,
assignableScopes and content hashes must match trusted human/source anchors.

Important unresolved provider qualification: actual Azure must confirm built-in and
referenced custom definitions resolve with those narrow lookup/grant scopes and that
atScope() returns the complete inherited writer set. Documentation does not establish
this identity's successful authorization. Until actual/native contract proves it, fail
closed; do NOT widen to subscription roleDefinitions/read/Reader/list or accept incomplete
403/paged results. A truly needed broader read is a separately reviewed authority change,
not a helper fallback. Reject ambiguous condition, unresolved role/group writer, unknown
assignment or unsafe effective permission rather than assume safe. Human bootstrap
uses its existing read authority for initial evidence; recurring identity grants contain
only the reviewed minimal read scopes and actual operation-specific data authority.

Tests cover complete pagination only within fixed trusted ARM origin/scope (or bounded
explicit failure), actual identities, foreign scope/link, group/condition ambiguity,
writer insertion, definition drift, effective permission wildcard/NotAction cases,
403/no-role-resolution and no broad fallback. Own actual deny probes remain required.
No provider scope behavior is marked passed by this source proposal.

## Recurring recovery proof reads and actor-safe generator tuple

Established validator must independently read both initial actor proofs and actual
recovery consumption. Select exact additional Blob reads, not a new summary service:
backup reads restore's initial activation proof and restore reads backup's, in the
existing qualification-restore/qualification-backup container respectively. Grant only
Storage Blob Data Reader with ABAC read action excluding Blob.List and exact environment/
generation activation path shape activation/ENV/GEN/NONCE/ACTOR.json; the peer ACTOR is
literal from reviewed role generation, not caller input. No other actor operational
proof prefixes, other environments, writes/delete/list or container Contributor.

Both actors also receive GET-only/no-list access to apply-owned recovery consumption
in qualification-challenges at canonical consumption/ENV/GEN/NONCE.json, in addition to
existing activation metadata reads. Installer/apply alone writes consumption; these
new read grants do not imply trust in Git JSON alone. Validator binds actual private
challenge/peerproof/consumption digests, actual current installed recovery activation,
principal/cluster/role/source/generation and fresh own inline operation proof. Canonical
consumption path must be aligned by producer+validator tests before source activation;
unknown paths/prefixes fail. No peer-write authority or caller success summary follows.

Private environment projection includes a typed projection_inputs object built by the
trusted apply publisher from BOTH authorized root outputs. Foundation subobject has
ONLY dns_zone_resource_group_name,operator_client_ids {argocd,dashboard},
operator_group_object_id,github_principal_ids with exact reviewed actor keys. Environment
subobject has ONLY workload_client_ids with exact reviewed WI keys,workload_key_vault_name,
ingress_public_ip,ingress_public_ip_resource_group_name. Existing verified environment
outputs supply other already-allowlisted DNS/AKS/ACR/vault generation fields; actual
nonsecret deployment config comes from the reviewed sanitized generator configuration,
never the complete private operator file. Publisher verifies ownership/root lineage and
actual API identity/resource values. Full wrapper version/generation/sourceRevision/
outputsHash and complete canonical projection_inputs enter private outputHash and exact
runtime-map validation. Actors read this environment snapshot through their existing
conditional environment path, no foundation-state or foundation-projection grant.
Unknown/missing fields, differing duplicate values, mismatched generation/tenant/principal
or outputHash fail. No credential/email/private arbitrary config is added to projection.

Confirmed owner interfaces: recovery consumption path is consumption/ENV/GEN/NONCE.json,
not consumed/ (guard-generation consumption remains its separate previously reviewed
path). Established recovery validation checks historical both-actor proof validity AT
actual trusted consumedAt, then actual current target/roles/clusterCA and fresh own proof;
initial proof wall-clock expiry does not demand recurring both-actor approval.

Confirmed generator hash defect: current renderer hashes entire passed foundation and
environment objects, so a minimal actor tuple cannot reproduce full publisher-root hash.
Replace that hash input with ONE strict canonical public generatorInput wrapper:
{config: sanitized exact reviewed generator config, foundation: exact four fields
listed above, environment: exact four fields listed above}. Any tenant used is the
validated config.tenantId, not an extra hidden root field. Publisher and actor must
construct identical canonical wrapper with the same key normalization and exact schema;
renderer rejects extra root fields for its hashing interface instead of hashing state/
role outputs it does not use. Hash is SHA256 of the same canonical wrapper; version the
runtime projection/hash schema and regenerate reviewed14files, invalidating old mismatched
hashes rather than accepting both. Private full root snapshots may exist for their own
authorized infrastructure purposes but are never actor hash dependencies. Tests require
publisher/actor equality, hidden unused-root changes not changing generator hash,
used-field changes changing hash and foreign/missing/extra wrapper fields rejection.
Source code/parser/generator remains immutable closure, so this implementation change
requires applicable fresh reviewed source qualification, no compatibility boolean.
## Preparation repair6 Q-D014-007: creation versus grant plan

The receipt-before-saved-plan paragraph applies ONLY to the POSTCREATION operational
grant/activation plan, not the initial resource-creation plan. Exact sequence:

1. Initial human-family qualification/current retained guard integrity gates hosted
   protected infrastructure use. Initial creation saved plan creates only compliant
   workload infrastructure with operational network grants deferred/disabled. It
   cannot require a record for the not-yet-existing actual workload vault, and no
   workload-generation receipt is fabricated or consumed for that creation plan.
2. Apply executes that approved unchanged creation plan under existing protected
   infrastructure authority/current guard/lease checks. Before secret population,
   actual hosted apply tests the new actual vault and publishes fresh generation proof.
3. A separately reviewed postcreation grant/activation saved plan binds that actual
   proof and exact current state, retaining consumption_sha256=null on first grant.
   Plan actor remains read-only. Apply then creates the real receipt/private binding
   for THIS exact grant-plan hash/proof under lease and applies THIS unchanged saved
   plan; no mutating its variables, replacement plan or predicted consumption hash.
4. Actual ordinary app/bootstrap readiness completes its separate activation record.
   Only afterward may later plans use durable consumed evidence with actual completed
   activation validation. Optional recovery activation remains independent and later.

This is the already-approved staged creation->actual qualification->grant model, not
an additional human Azure credential step. Source tests must simulate both distinct
saved plans, assert generation proof is absent/not required before creation and actual
before grant, and ensure no operational grant/population crosses the unqualified gap.
If initial plan unexpectedly enables operational grants, reject its reviewed change
set before apply. No caller phase string alone authorizes a plan; validators inspect
actual normalized plan actions, exact staged TF inputs/current guard and evidence.

Existing destroy Contributor and conditioned apply/destroy role-delegation grants are
acknowledged actual retained RBAC authority. They are not all absent before a rolling
vault proof and are not changed by this addendum. Initial human family/current guards
and protected workflow approval/use gates govern hosted apply/destroy use; the deny
guards remain outside their policy/exemption administration. Actual new-vault proof
gates population and operational network-role enablement, not a false assertion that
all existing hosted vault-write/delegation permission vanishes. Reviewed destroy may
clean incomplete owned infrastructure under its existing scope and guard constraints;
no new delegation, unrestricted role assignment or unguarded secret operation follows.
## Reviewed ACME contact privacy

Integrates independently quality/security-approved proposal 59AF97F0F953104E33678BE6643DDE70345CA08367F850B1567C752B8A5197BA. Both public issuers omit optional email; private contact is not a committed generator input. Exact account-key recovery and issuance evidence remain required.

Pinned cert-manager1.21.3 [ACMEIssuer API source](https://github.com/cert-manager/cert-manager/blob/v1.21.3/pkg/apis/acme/v1/types_issuer.go)
and the vendored CRD in deploy/platform/azure/certificates/controller/cert-manager.yaml
explicitly make email optional. The recommendation text mentions expiration messages,
but [Let's Encrypt ended that service](https://letsencrypt.org/2025/01/22/ending-expiration-emails.html)
on June4,2025; its [current notice](https://letsencrypt.org/docs/expiration-emails/)
confirms shutdown. Thus examples containing email do not make it a schema requirement.

Select omission of spec.acme.email for BOTH generated staging and production
ClusterIssuers. Remove acmeEmail from the public/sanitized generator input tuple and
generated projection; private operator configuration may retain it solely for backward
input compatibility but it is never serialized into committed manifests/output snapshots
or failure messages. Do not substitute a fake/personal/placeholder address. Enforce
reviewed ACME directory allowlist, actual terms agreement/account-key proof and DNS01
solver unchanged; account URI/key checksum recovery remains required, not email matching.
Remove any acceptance assumption that Let's Encrypt will email expiry alerts; existing
renewal/certificate readiness/served-trust monitoring remains the actual evidence.

Source/native tests prove generated no-email issuers validate against the pinned CRD,
no contact appears in projection/errors, both issuer account recovery remains compatible
and exact TLS/secret inventories unchanged. Actual staging issuance/renewal/account
reconciliation is still required before live acceptance. This adds no service/cost or
notification replacement and changes no user identity or authorization policy.


## Reviewed batch7 recurring guard and recovery evidence

Integrates independently quality/security-approved proposal B8B2E68ED1C1D34538B3193A7E187D17E3DF84DF738A1618FCFB22F484F2ED7D. Preparation round7/9 history is preserved. Proposal status/process-hold wording is historical; the concrete bounds below are authoritative, while actual source/native/provider/fixture qualification remains mandatory. No actual human fixture provisioning or cloud grant is performed by this integration. Canary denial does not prove active-object denial; both distinct checks remain required.

## 1. Exact descriptor and read closure

Actor private cache adds ONLY complete strict vault_guard; no duplicate role/container
root fields. Extend its source-produced schema with inspection_roles exact keys
permissions,authority,policy_definition,policy_assignment,policy_exemptions. Each value:
{id,actions,notActions,dataActions,notDataActions,assignableScopes,sha256}; arrays sorted,
three negative/data arrays empty; sha256 covers complete semantic object including scopes.
Actions are respectively permissions/read; roleAssignments/read+roleDefinitions/read;
policyDefinitions/read; policyAssignments/read; policyExemptions/read, all under
Microsoft.Authorization. Add inspection_bindings literal tuples {roleKey,principalId,
assignmentId,scope,queryScopes}. Terraform outputs actual resources from two authorized
roots; publisher checks source/actual IDs/hashes and exact six actor principal IDs.
Network descriptors remain the existing separate two-network-role map.

Approved current scope inventory remains exact vaults/guard containers for permissions,
guard containers+workloadRG for authority, exact guard definition/two assignments for
policy reads, twoRGs for exemption reads. NEW proposed read scopes necessary for complete
G3 truth are explicit: permissions/read and authority(roleAssignments/roleDefinitions
read) at exact active guard definition, each exact active guard assignment, and the two
retained RGs. These are metadata inspection only, no Reader or subscription assignment;
not inferred from current grants. They allow exact-object effective-action/condition and
inherited assignment inspection for the actual guard targets, rather than assuming a
canary proves their authorization. Actual scope support is unproved:403, unknown inherited
group/condition, unresolved GUID, incomplete enumeration/pagination or changed definition
blocks. Never follow returned role IDs into a broader subscription read fallback.

## 2. Safe actual negative probes, precise proof boundary

No request mutates an active guard definition/assignment/exemption. Human creates fixed
inert fixtures with configuration-derived literal names (environment is reviewed DNS
label, not caller target). Definition ID: subscription/providers/Microsoft.Authorization/
policyDefinitions/equipment-g3-ENV-canary. API2023-04-01; canonical properties:
{policyType:Custom,mode:All,displayName:equipment-g3-ENV-canary,parameters:{},policyRule:
{if:{field:type,equals:EquipmentQualification.Never/resources},then:{effect:audit}}}.
No real Azure resource provider uses that predicate; no deny/modify/deploy/identity.
Assignment at retained workloadRG: policyAssignments/equipment-g3-ENV-canary,
API2023-04-01, properties {policyDefinitionId:EXACT_CANARY_DEFINITION_ID,
enforcementMode:Default,parameters:{},notScopes:[]}. Exemption at that workloadRG:
policyExemptions/equipment-g3-ENV-canary, API2022-07-01-preview, properties
{policyAssignmentId:EXACT_CANARY_ASSIGNMENT_ID,exemptionCategory:Waiver,
displayName:equipment-g3-ENV-canary}; it cannot refer to an active guard.
Fixtures are human-owned/source-hashed; actual GET before/after must match canonical
semantic content, excluding server-managed metadata. NEW exact read bindings for canary
definition and assignment are proposed; existing workloadRG exemption read covers its
exemption. No additional permissions/read at canaries is required for the negative PUT.

Each G3 actor sends the exact no-op existing canonical properties PUT to each canary
endpoint. Expected AuthorizationFailed403; unexpected2xx/412/other result fails G3.
GET before/after confirms unchanged semantic contents; unexpected metadata changes are
reported truthfully. These actual requests prove denial ONLY at these canary object
scopes. They DO NOT prove denial at active guard scopes. Active-scope protection is a
separate mandatory current effective-permission+complete inherited-assignment/definition
inspection with actual candidate principal and conditional delegation interpretation;
if that boundary cannot be established conservatively, G3 remains blocked. No agent
accepts a reduced proof standard. Review must explicitly approve this composite boundary.

Role-write negative fixture: human-created custom role GUID uuidv5(fixed reviewed
namespaceUUID, ENV+'/g3-read-canary') whose only action is policyAssignments/read; assignableScopes is the retained workload RG, and assignment scope is ONLY its exact canary policy-assignment object (already held via explicit read binding), no data actions.
Source publishes its exact GUID/semantic hash and existing assignable scope. For each
actor, role-assignment ID is uuidv5(same namespace,ENV+'/'+ACTOR+'/g3-deny'); PUT at exact
canary policy-assignment object scope, API2022-04-01, body {properties:{roleDefinitionId:EXACT_CANARY_ROLE,
principalId:EXACT_ACTOR_OID,principalType:ServicePrincipal}}. Expected403. Any accepted
assignment is failure; it adds only the already-held exact read, not Owner/data rights.
Human audits/cleans unexpected accepted fixture assignment. Final namespaceUUID is fixed
6c80e97f-370c-5ca3-89bd-a0623f831280 in reviewed source, no runtime random IDs.

Existing apply/destroy conditioned delegation is not globally denied. Exact allowed
role/principal/scope tuples remain valid; the canary role GUID is outside that allowlist.
Inspect actual delegation condition/role hash at workloadRG; unsupported condition logic
fails. Backup/restore/reaper/plan have no delegation admin. Initial human fixture setup
is later authorized provisioning only, not an action implied by process approval.
No purge/delete/active-guard write or high-privilege target is tested optimistically.

## 3. Recurring recovery own-authority observation

Add GET only on argocd Application equipment-azure-recovery to BOTH existing actor
continuity Roles in argocd. Existing equipment-azure GET remains. No recovery AppProject
read is added, no cross-actor Role/Binding, ValidatingAdmissionPolicy/binding inspection,
list/watch/write or arbitrary Argo access. Actual optional recovery Application source/
Synced+Healthy/revision/UID are validated against consumed reviewed activation plus
actual own-role/cluster state. A missing/foreign/unhealthy App blocks, not Git-only proof.
Native/hosted tests deny another Application and all mutation/list verbs.

## 4. Durable guard discovery with exact producer pointers

Actual existing rights: explicit human writes guard-evidence; apply writes
guard-apply-evidence; exact six consumers have declared read scopes. Builtin Blob Data
Reader here CAN list; do not confuse bootstrap/challenge no-list conditions with these
containers. Listing/newest timestamp is never trusted discovery.

Add fixed relative locators INSIDE vault_guard: current_family_reference='current/ENV.json'
and current_activation_reference='current/ENV/GEN.json'. No absolute URI override, foreign
container or duplicate root cache fields. Human pointer lives in guard-evidence and is
written ONLY by actual human producer after complete valid immutable policy/QID record.
Apply activation pointer lives in guard-apply-evidence and is written ONLY after actual
completed ordinary app activation, not merely qualification/consumption. Before activation,
existing explicit private CLI handles continue creation/grant flow; active stage cannot
infer a pointer that is not published.

Pointer exact schema {version:1,mode,environment,generation,producerPrincipalId,
familyHandle,generationHandle,consumptionHandle,bindingHandle,activationHandle,tupleHash}.
Human mode=family has generation=null and only familyHandle populated; other handles null.
Apply mode=ordinary-activation has exact current GEN and all five handles populated using their existing exact public shapes from the immutable records. Bind current guard/API/role/source/
vault/receipt/plan maps by validating ALL referenced schemas/digests and actual current
installed target before returning handles. Pointer itself is transport, not passed=true.

Initial creation uses If-None-Match:*; update uses actual ETag If-Match. Human obtains a
Blob lease on its exact pointer (human data role already permits this) before update;
apply uses common operation lease plus pointer ETag. Preserve actual producer checks;
wrong lease/ETag/uncertain write fails with owned cleanup. Pointers are mutable trusted
producer transport, NOT IAM immutability/WORM. Concurrent rollback/older-generation or
tuple substitutions fail. Exact target GEN path prevents stale global latest selection.
Records remain random immutable IDs with real prefix policy/generation/consumed/
plan-bindings/activation; no expired Actions artifact/manual patch/token dependency.

## 5. Trusted selected-point source origin

Protected restore input is pointId plus reviewed maintenanceRevision, not caller source
vault/versions and not expected context copied from decrypted credentials. Backup actual
producer reads source vault identity/tenant/generation and six source secret version/
valueHash facts through approved exact reads, verifies them before encryption and writes
an independently authenticated completion/catalog record only after isolated verification.
Version2 completion marker schema extends existing point marker with producerPrincipalId,
sourceIdentity {vaultUri,vaultId,tenantId,generation}, exact six sourceSecrets {name,
version,valueHash}, compatibility, keyId, encrypted metadata-object SHA256 and canonical
object-name/digest map. No credential values. Marker path is 'points/'+pointId+'/complete.json'
in existing private recovery container; backup is trusted sole declared operational writer,
restore remains reader. Actual storage producer/role isolation and source calls are tested;
conditional create is not WORM or a signature. Unexpected inherited writers block trust.

Restore selector authenticates Blob through actual restore OIDC and fixed verified
recovery account/container, reads ONLY the protected input pointId marker, verifies
complete+verified schema/producer/generation/key/object digest invariants and private
Blob ETag/version response, then freezes canonical selected context before bundle decode.
Metadata encryption authentication/point ID/object AAD and exact encrypted metadata hash
must also match. The independently selected marker sourceIdentity/sourceSecrets is passed
as mandatory expected context to engine; encrypted metadata and credential payload must
both match before ANY write. Never self-anchor expected context from bundle or choose a
newer point on failure. Existing backup trust includes producing valid backups; this adds
no restore write/secret authority. Private selection evidence binds point/marker digest/
ETag/key/source maps, maintenanceRevision and actual approving protected workflow/run.

Catalog marker contains sensitive compatibility hashes but no values, remains private
with bounded failure output; it is not public Git config or Terraform state. Existing
seven-point retention removes only complete successful expired points, including marker,
under backup authority. Restore denied marker mutation, forged source tenant/vault/secret
version/hash, ciphertext substitution and wrong selected point must prove zero writes.

## Ownership and gates

Terraform: exact five-role descriptor/bindings and proposed fixture/read resources;
promotion: safe G3 templates, actual inspection/evidence and fixed pointer validation;
primary: strict vault_guard cache+locator/CLI publication and canonical guard activation;
operations: exact own Argo read consumption, selected-point marker/selector and actual G3
execution. GitOps owns only exact Argo Role rule. All share source-bound literal IDs/body
schemas, no hidden actor projection expansion. Native tests precede implementation;
actual provider API/scope/condition semantics remain gates, not proven source facts.
No fixture/grant/product exception is approved by this draft or process extension.

### Owner-confirmed exact runtime interfaces and observation split

Existing helper record handles are preserved: family purpose=human-policy-family at
policy/<qid>.json; generation purpose=workload-generation at generation/<qid>.json;
consumption purpose=guard-generation-consumption at consumed/<qid>.json; binding
purpose=guard-plan-binding at plan-bindings/<qid>.json, each {purpose,reference,digest}.
Existing publishGuardApplicationActivation returns {reference,digest} at
activation/<gen>/<qid>.json; pointer activationHandle retains that two-key shape, not
an invented caller purpose. Validate actual record mode/schema inside every handle.
Pointer code uses existing public helper options/APIs; never replaces their validation.
Publisher writes apply pointer only AFTER publishGuardApplicationActivation has real
readiness/Argo/provenance evidence. Validator calls validateEstablishedGuardActivation
and requires its exact existing result binding generation/vaultId/qualificationDigest/
consumptionDigest/revision/installedTargetHash. No source map or success bool in pointer
can replace that actual provider observation.

Recurring recovery validation must be a distinct actor branch, not call installer-
oriented global validator. Installer initial activation inspects BOTH actors/global
admission objects; recurring actor reads only its own10 authority objects, actual
SelfSubjectReview identity, exact own live client and the newly approved-if-reviewed
recovery Application GET. Peer initial proof is cryptographically/private-digest bound
through actual consumed activation record, NOT fresh peer-role read or fresh other-actor
approval. Current own fixed-template dry-run/actual negative probes establish its
operation behavior; no global VAP/binding read or cross-actor RBAC grant is introduced.
If current code cannot validate required own behavior without global reads, operation
blocks for targeted fix, never silently invokes privileged installer observer.

Actual point object map is points/<pointId>/{inventory,reservations,notifications,
keycloak,credentials,metadata,complete}.json. metadata and credentials are separate
AES-GCM envelopes. Existing actual complete marker version1 has no source context;
new version2 catalog schema above is required for trusted selector and old version1
markers cannot be treated as complete selected-source context. Backup trusted producer
collects source facts independently before bundle encoding; restore uses independently
read marker from protected pointId, never bundle-claimed source. Actual backup can
IAM-overwrite/delete this container; conditional create is transport, not independent
cryptographic signer/WORM. Threat boundary explicitly trusts the approved actual backup
producer and protected restore point selection; it does not protect against a malicious
backup producer fabricating both marker and bundle. Review must accept or reject that
existing trusted-backup boundary explicitly; no agent claims external independent signer.

## Reviewed canary read-binding bootstrap staging

Integrates independently quality/security-approved proposal A7C8FE1F570A40180C0C21254D2B64FD73C3986786D80B4E502677884CF2700B; reports ../team/batch7-canary-staging-quality.md and ../team/batch7-canary-staging-security.md. Preparation8/9 PASS approves this source design, NOT actual human fixture creation. Historical proposed/status language below does not itself authorize live actions. Existing batch7 IDs/scopes/probe bounds are unchanged; this section clarifies only staging and evidence.

## Problem and invariant

Exact canary-object read role assignments cannot be installed before the referenced
human-owned canary policy objects exist. Initial foundation cannot depend on successful
G3, which itself needs those read bindings. A caller g3_canary_fixtures_ready=true flag
would not prove existence/ownership/body and is not proposed as evidence. Do not fix
this with a broad parent read grant, random substitute resource or automatic adoption.
Only already-reviewed exact source-scoped fixture read bindings are staged here.

## Concrete initial sequence

F0: existing explicit human foundation bootstrap creates retained RGs, actual active
guards, evidence containers and other baseline infrastructure. Canary object-scoped
read assignments are ABSENT. Source-bound expected canary IDs/bodies/API/role hashes
remain outputs, with a structured fixture_binding_stage=pending marker that is status
only, not qualification. G3 cannot succeed and hosted operational use stays pending;
no dependency on canary existence prevents F0. Active-guard reads unrelated to canaries
may be provisioned as already reviewed. Do not weaken guard policy enforcement.

F1: provide a human-only reviewed fixture preparation command/interface, separate from
ordinary apply/backup/restore/reaper. Proposed CLI is
infra:guard-fixtures --stage prepare --config PRIVATE --foundation-outputs PRIVATE
--revision REVIEWED_SHA --output PRIVATE_PLAN. It is read-only: emits the exact fixed
source-bound creation requests/target IDs/bodies/API versions from approved batch7,
actual current principal/RG/guard checks, preexistence/collision results and a canonical
plan digest. It never runs a mutation. It refuses arbitrary target/body overrides and
unexpected existing resources. No human approval is recorded by creating this plan.

Only after explicit human authorization for this actual fixture action, a separate
human-invoked execution path consumes that exact reviewed plan digest, revalidates
actual configured bootstrap-human identity/current source/guard/RGs and performs the
already-described inert fixture creation. No workflow principal or unattended job
receives that human token or fixture administration. The command interface may be
infra:guard-fixtures --stage create --plan PRIVATE_PLAN; an additional caller boolean
is neither authorization evidence nor resource qualification. Record actual user
approval in coordinator artifacts before actual mutation as repository protocol requires.

Creation sequence: inert custom policy definition; inert workloadRG assignment; exact
canary exemption referencing ONLY that inert assignment; harmless read-only role with
retained workloadRG assignable scope. All IDs/bodies/API pins are those in approved
batch7. Existing object adoption is refused unless a previous exact owned operation
record and current source/body/identity match, under explicit reviewed retry. No active
guard update/delete/exemption, broader grants, high-privilege role or random fallback.
These fixtures are retained for later G3, not disposable probe-vault cleanup objects.
Human teardown, if ever needed, is a separate reviewed maintenance action.

After actual GET confirms every exact created object's semantic hash/identity/scope,
the human publisher writes conditional-create fixture evidence at
fixtures/<fixtureSetDigest>.json in human-writer guard-evidence. Schema:
{version:1,mode:g3-canary-fixture-set,environment,subscriptionId,tenantId,
producerPrincipalId,sourceRevision,sourceClosureHash,fixtureSetDigest,createdAt,
objects:[{id,apiVersion,semanticSha256,observedETag}],creationPlanDigest}.
fixtureSetDigest is canonical hash of the literal expected object tuples, not a boolean.
No credential values. Current exact GET validation is mandatory, not merely receipt
existence. This is trusted human transport with conditional create, not WORM/signature.

F2: second explicit human foundation-finalization plan loads that actual immutable
fixture evidence handle, re-GETs every object under existing human authority and compares
source/expected/current IDs/body hashes, then enables ONLY the previously reviewed exact
canary read bindings. Proposed Terraform input g3_canary_fixture_evidence is null in F0,
otherwise a strict typed verified projection {version,environment,fixtureSetDigest,
evidenceSha256,sourceRevision,objectIds,objectSemanticHashes}; null means no bindings.
It is NOT an arbitrary ready flag. The protected/human wrapper derives it after actual
validation; Terraform validates exact source-derived IDs/hash set and never accepts
new objects/scopes from the input. Saved-plan bytes/inputs stay immutable through apply.
The finalization plan must contain only expected exact binding/stage-output changes;
no active guard/policy or fixture ownership transfer. Actual role-assignment resolution
and intended reader GET checks remain provider gates. Unsupported object scope blocks
without parent/subscription grant fallback.

F3: complete final human policy-family qualification and publication AFTER this final
inspection-role/binding descriptor generation, so its source/authority tuple includes
the retained final bindings. Then existing protected hosted creation->actual generation
qualification->grant->ordinary activation proceeds. No daily human step is introduced:
fixtures, read bindings and human evidence survive workload-root destroy/recreate because
the workload RG shell/foundation remain retained. Operational G3 uses the already-reviewed
actual canary denied writes; this staging proposal adds no new denied-probe authority.
If fixture/body/role/source tuple later changes or a fixture disappears, block G3 and
require explicit reviewed human requalification/finalization, never recreate silently.

## Ownership and interface boundaries

Terraform owns baseline guard/role definitions and the exact conditional read-binding
resources; it does NOT own/import human canary objects through a hidden second provider
or create them while evaluating a variable. Promotion helper owns read-only preparation,
human execution request templates and fixture evidence actual validation. Primary owns
CLI/protected plan handoff and vault_guard source-bound expected fixture IDs plus current
binding status/evidence digest. Actor cache remains ONLY complete vault_guard; no raw
human plan/token or duplicated foundation outputs. Operations only reads the final
qualified descriptor and runs G3; it cannot bootstrap missing fixtures/read grants.

Exact canary definition/assignment GETs and inherited authority checks are still the
approved batch7 live feasibility gates. Granting a role at an extension-object scope
is not claimed supported merely because a plan/test fixture accepts the string.
Current projection status pending/finalized is derived from verified evidence/binding
set and never substitutes for actual API checks. F0/F2 and final qualification need
separate approved immutable plans; no replan or saved input mutation behind approval.

## Required evidence before release

Native tests: F0 succeeds without fixture resources and emits zero canary read grants;
missing/null/forged/caller-ready input cannot enable bindings; prepare is read-only;
unauthorized execution blocked; actual-plan digest drift/collision/foreign body rejected;
F2 validates exact human evidence+current GET before producing exact-only grants;
source hash/set mismatch, partial setup/uncertain write or unsupported scope blocks;
final tuple emitted only after binding checks. Retried partial creation never adopts
unowned objects or mutates guards. Hosted recreation needs no new human token when
unchanged fixtures/foundation remain. Actual future human approval, creation, provider
GET/role-binding qualification and G3 positive/negative evidence remain pending.

No authoritative artifact or source file is amended by this proposal. Independent
review may require a preparation8/9 decision; no agent approves its own design or
substitutes process approval for the human's later actual fixture action.


## Reviewed workload delegation descriptor

Integrates independently quality/security-approved proposal 8C23435CF9DE19C1F7E70F9A51668CD85B224F4A1026633791A6A89888C54445 in preparation9/9; reports ../team/preparation-batch9-quality.md and ../team/preparation-batch9-security.md. This source contract does not approve actual cloud/fixture actions or imply implementation/native/provider acceptance. Historical proposal language below preserves the scoped bounds; unresolved code findings remain blocking.

## Source facts and exact boundary

Read current infra/azure/foundation/delegation.tf: delegated_workload has exactly apply
and destroy assignments at retained workload RG, principalType ServicePrincipal,
conditionVersion2.0, Role Based Access Control Administrator. Its condition separately
restricts roleAssignments/write using @Request and delete using @Resource. Generic
base role list permits ANY ServicePrincipal; specific continuity/network/inspection/
cluster-installer clauses constrain exact principal GUID sets. Do not silently replace
ANY ServicePrincipal with only repository principals or call these grants globally denied.
Existing DNS-zone delegation is a different non-ancestor scope for workload guard audit;
it is not included or reinterpreted by this contract. A validator reaching another
scope must block rather than extrapolate the workload descriptor.

## Strict nested output and cache shape

Add ONLY vault_guard.workload_delegation, version1. No new actor cache root field,
foundation-state access, arbitrary raw config or permission. Exact object keys:
{version,scope,roleDefinition,assignments,allowedRules,semanticSha256}.

scope is actual retained workload RG resource ID, same as guard.scope_ids.workload.
roleDefinition is actual existing RBAC Administrator definition {id,name,roleType,
actions,notActions,dataActions,notDataActions,assignableScopes,sha256}; action/scope arrays
sorted, hash covers exact complete semantic tuple, no displayName-only trust. Actual
provider definition is fetched through the already-reviewed narrow scope+GUID path;
if not resolvable, fail with no subscription Reader fallback.

assignments has EXACT apply and destroy keys, each {id,scope,principalId,principalType,
roleDefinitionId,conditionVersion,condition,conditionSha256,semanticSha256}. condition
is the actual Terraform-rendered literal UTF8 condition string; conditionSha256 hashes
its exact bytes, not caller normalized text. Assignment semantic hash covers canonical
{id,scope,principalId,principalType,roleDefinitionId,conditionVersion,conditionSha256}.
Principal IDs are actual corresponding stable foundation workflow principals, type
ServicePrincipal; scope/role references must match descriptor. Do not include a human,
group, foreign assignment or unbounded extra key. Expected descriptor comes from actual
Terraform resource attributes, not duplicated handcrafted permission text.

allowedRules is the independently rebuilt normalized semantic allowlist, generated from
the SAME concrete reviewed Terraform source locals/resources as the actual condition:

- Base rule: role GUIDs exactly delegated_workload_role_ids, principalType ServicePrincipal,
  principalIds=null meaning ANY ServicePrincipal. It includes delegated built-ins except
  cluster_installer plus stop/admission/lifecycle custom roles, exactly as source.
- Per continuity actor: exactly its current continuity custom role GUID paired with
  its one existing actor principal GUID, ServicePrincipal.
- Workload network rule: exactly current workload_vault_network custom role GUID paired
  with backup,restore,reaper principal GUIDs, ServicePrincipal.
- Inspection permissions rule: exactly current guard_inspection.permissions role GUID
  paired with the exact six guard inspection actors, ServicePrincipal.
- Installer rule: exactly cluster_installer built-in GUID paired with apply principal
  GUID only, ServicePrincipal.

Each normalized rule {roleDefinitionIds,principalIds,principalType}; arrays sorted,
unique GUIDs, no wildcard IDs, no group/User alternative. Full semanticSha256 hashes
canonical {version,scope,roleDefinitionSha256,assignmentsSemanticHashes,allowedRules}.
Provider IDs are full source-bound IDs; condition uses their actual GUID components.
No extra grant is inferred from any rule, and no existing allowed tuple is removed.

Publisher reconstructs expected semantics from reviewed clean source/actual authorized
foundation outputs and checks actual role/assignments/conditions through current
already-approved workloadRG authority inspection before private output publication.
The complete nested object is included in source-bound vault_guard hash/projection.
Unknown/missing descriptor/condition or source mismatch blocks helper; do not retain
an old permissive compatibility fallback. Tuple changes require existing requalification.

## Pure supported evaluator and equivalence checks

Do not eval JavaScript, use substring matching, take caller allowedRules as truth or
infer denied permissions from a regex. Tokenize and parse ONLY this current grammar:
parentheses, !, AND, OR; ActionMatches{'literal action'}; @Request/@Resource attributes
for Microsoft.Authorization/roleAssignments:RoleDefinitionId,PrincipalId,PrincipalType;
ForAnyOfAnyValues:GuidEquals with nonempty GUID sets; and
ForAnyOfAnyValues:StringEqualsIgnoreCase with sole literal ServicePrincipal.
Case-insensitive action/GUID comparisons follow those operator semantics. Unknown
operator/attribute/function/string escape/comment/token, missing input, duplicate key,
resource/request crossover, malformed GUID, ambiguous precedence or trailing tokens
is INVALID, never allowed/denied. Parentheses/NOT precedence are explicit AST operations.
Do not support a general Azure ABAC language or guess future syntax.

Independently render the expected current condition AST from source-derived allowedRules:
(!ActionMatches(write) OR (requestAllowRules AND requestPrincipalTypeSP)) AND
(!ActionMatches(delete) OR (resourceAllowRules AND resourcePrincipalTypeSP)).
Parse actual condition and prove structural semantic equivalence to this exact supported
AST with normalized commutative set/rule ordering, not sampling a few successful tuples.
Both apply/destroy actual condition ASTs must match. Raw byte hashes and assignment
semantics also match the trusted source descriptor; whitespace normalization for parsing
does not discard byte-integrity checks.

Pure evaluation receives {action,targetScope,requestedRoleDefinitionId,requestedPrincipalId,
requestedPrincipalType} for create/update, or complete ACTUAL existing target assignment
resource attributes for delete. Scope must equal/descend from descriptor scope under
case-insensitive ARM segment comparison, no string-prefix sibling match. For write,
use @Request fields only; for delete @Resource fields only. Unknown delete target or
role/principal/type is invalid, not inferred from create request. Return an explicit
valid+allowed decision only after full equivalence/closure verification; this does not
substitute for actual Azure authorization and condition enforcement.

## Actual effective/inherited audit and safe G3 interpretation

Use approved actual workloadRG roleAssignments?$filter=atScope() API2022-04-01 to inspect
assignments at OR ABOVE scope, and exact inspected active-object endpoints already
reviewed in batch7. Complete paging only within fixed ARM origin/scope or explicit
bounded failure. Verify IDs/principal/role/scopes/conditions against trusted descriptors;
unknown inherited groups, unresolved relevant assignments/conditions or broader authority
are conservative failure. Do not assume direct assignments exhaust effective privileges.
Own effective-permission responses omit conditional tuple details and cannot replace
this complete actual assignment/role inspection. Deny assignments or unsupported scope
behavior must not be treated as absent; actual request probes remain required.

This evaluator recognizes only the two existing expected workload conditional assignments.
Other relevant conditional/inherited admin grants are not accepted by similarity. Existing
Contributor exclusions and other role semantics remain independently validated; union of
allowed grants is not replaced by treating NotActions as universal deny. Actual G3 canary
role GUID is outside all current allowlist rules, so its safe same-capability role-write
probe is expected403 even for apply/destroy. Unexpected acceptance fails; do not test an
Owner/Contributor escalation or mutate active policy objects. Canary denial remains only
its scope's fact, combined with distinct active-object audit per reviewed batch7 boundary.

## Ownership and required evidence

Terraform owner outputs actual role/assignment tuple plus allowedRules from its source
locals without altering grants/condition. Primary only adds this strict nested descriptor
to existing complete vault_guard publication/cache/hash, no broad roots. Guard helper
owner implements pure parser/equivalence/evaluator and actual inspection binding;
operations consumes only validated own-actor decisions/records. No actor writes a new
permission, fixture or policy through this interface. Existing public helper APIs remain;
missing descriptor blocks rather than accepting caller success flags.

Native tests: every exact current allowed base/specific tuple; base ANY ServicePrincipal
truth; continuity cross-principal, User/Group, installer nonapply and unknown role denies;
request/delete resource distinction; each AST operator/NOT/AND/OR mutation; changed raw
condition/hash/scope/principal/role; unknown inherited group/extra condition; wildcard/
trailing-token attacks; permission union/NotActions correctness and actual403 versus
unexpected200. Test publisher-helper independent reconstruction, not shared caller maps
only. Actual scope+GUID resolution, complete inherited audit and actual Azure conditioned
allow/deny behavior remain pending live evidence; no source test claims them passed.


## Reviewed recurring recovery Application UID

Integrates independently quality/security-approved proposal FE36A01C67B106878883C524DE8A1A95D2F92BFCB7813E1DEAED6D707B5498C6 in preparation9/9; reports ../team/preparation-batch9-quality.md and ../team/preparation-batch9-security.md. This source contract does not approve actual cloud/fixture actions or imply implementation/native/provider acceptance. Historical proposal language below preserves the scoped bounds; unresolved code findings remain blocking.

## Stored-source truth

Actual createRecoveryActivationRecord in scripts/azure-recovery-activation.mjs returns
version2 record with environment/generation/tenant/subscription/clusterCA/sourceRevision,
challenge/proof hashes, definitions/manifest and installationState. It contains NO
historical Application UID. The same source installs equipment-azure-recovery only
AFTER consumed activation and checks absence before creation. Therefore immutable
activation/consumption cannot truthfully bind a UID that did not yet exist. Do not
invent originalApplicationUid or backfill immutable consumed evidence from a caller.
Source definition deploy/argocd/azure/recovery/application.json remains immutable,
including exact namespace/name/project/repo/path/destination/sync policy. Current
reviewed revision is independently validated clean Git/GitHub provenance and approved
closure/installation state, not an arbitrary application.status.sync.revision value.

## Exact recurring observation

Under the current actual actor's common operation lease, GET ONLY
/apis/argoproj.io/v1alpha1/namespaces/argocd/applications/equipment-azure-recovery.
Require exact metadata namespace/name, nonempty provider UID, no deletionTimestamp,
full source/spec matching immutable reviewed Application (with only explicitly reviewed
renderer substitutions), status Synced+Healthy at actual current trusted reviewed
revision, and no active sync/operation. Validate current source/authority/installation
closure against the actual private consumed activation; valid later app-only revision
uses the already-approved unchanged-closure path, not false equality to historical SHA.
Missing/unknown/status error/spec mismatch is failure. No list/watch, other Application,
peer RBAC or global admission-object read is introduced.

Fresh own mode=operation proof records applicationObservation {namespace:'argocd',
name:'equipment-azure-recovery',uid:ACTUAL_UID,resourceVersion:ACTUAL_RESOURCE_VERSION,
specHash:CANONICAL_REVIEWED_SPEC_HASH,revision:ACTUAL_VALIDATED_REVISION} plus the existing
actor/principal/lease/nonce/generation/consumed-activation/role/source/cluster bindings.
UID is observed actual process evidence, not caller input or historical assertion.
Only the actual actor's existing private operation-proof producer writes it. Existing
freshness/expiry/cleanup requirements remain; no longer proof lifetime is added.

Before first mutation and each destructive phase boundary, repeat exact GET under the
same still-owned lease, require SAME UID as the fresh own proof and revalidate spec,
revision and healthy/sync/operation/deletion checks. ResourceVersion may legitimately
advance; never require it equal across status updates, but every observed record must
be actual and satisfy the same UID/spec/current-target criteria. Deletion/recreation
with identical name/spec and a different UID fails before the next write; no automatic
adoption or new success proof in the same operation. Restart with fresh normal validation
and proof only after owned cleanup and a new operation lease. Errors never mean absence.

This is checkpoint observation, not a Kubernetes atomic lock preventing a privileged
external delete immediately after GET. The external operation lease serializes our own
mutations; it does not lock Argo/API globally. Do not claim historical identity continuity
or impossible zero-TOCTOU guarantees. Existing source/permission control boundaries and
actual target validation continue; cleanup still runs even when UID/lease/proof changes.

## Required evidence

Native tests: current valid UID/spec/revision positive; empty UID, deletion timestamp,
foreign source/project/destination, wrong revision, nonhealthy/sync operation failure;
UID change after initial probe and before mutation yields zero protected writes; UID
change between later destructive phases blocks next phase and runs owned cleanup;
resourceVersion-only advance with same valid UID is acceptable. Prove immutable initial
activation has no fabricated UID and private fresh own proof binds actual returned value.
Actual hosted source/status/UID observations and authorization remain pending provider
acceptance; source fixture success does not establish them. No new grant or exception.


## Reviewed retained recovery writer inspection

Integrates independently quality/security-approved proposal EC5C2C188FCC7EB96B88F0B0AAD3DB3A7BF48199F519B0184E212695FC57087A in preparation9/9; reports ../team/preparation-batch9-quality.md and ../team/preparation-batch9-security.md. This source contract does not approve actual cloud/fixture actions or imply implementation/native/provider acceptance. Historical proposal language below preserves the scoped bounds; unresolved code findings remain blocking.

## Source-confirmed existing authority and minimal change

Current foundation/guard-inspection.tf guard_active_targets merges scope_ids.recovery
(the retained foundation RG) and workload RG with guard policy targets. Its authority
and permissions bindings apply to six guard consumers at that recovery RG. The recovery
storage account and recovery container descend from that retained RG. Therefore current
approved source assignments ALREADY inherit Microsoft.Authorization/roleAssignments/read,
roleDefinitions/read and permissions/read to the exact recovery container; a new role
assignment is not proposed. Confirm actual deployed assignment/role/scopes at runtime;
source inheritance is not an actual successful Azure authorization test. If current
source/deployed descriptor differs, fail and report rather than add a broader grant.

The existing role backup_storage grants actual backup principal Blob Data Contributor
at the exact recovery container; restore_storage grants actual restore principal Blob
Data Reader there. Shared operations container grants are a different scope and confer
no recovery-container data write. Conditional-create complete markers are not WORM.

## Exact nested descriptor and queries

Add vault_guard.recovery_writer_audit strict nonsecret object:
{version:1,storageAccountId,containerId,containerName,queryScope,
inspectionRoleKeys:['authority','permissions'],inspectionBindingIds,
backupWriter:{principalId,principalType:'ServicePrincipal',assignmentId,roleDefinitionId,
roleSemanticSha256},restoreReader:{principalId,principalType:'ServicePrincipal',assignmentId,
roleDefinitionId,roleSemanticSha256},trustedHumanPrincipalId,semanticSha256}.
All IDs/role semantics are derived from actual retained Terraform resources/explicit
bootstrap operator, never caller expected-writer list. queryScope==containerId and
containerName equals existing recovery_container_name. inspectionBindingIds reference
ALREADY EXISTING recovery-RG authority/permissions assignments for the actual consumer,
not a new role or account-level data grant. Full canonical semantic hash enters existing
source-bound vault_guard cache; no duplicate root/private config/state access.

Fixed authenticated ARM query paths at API2022-04-01:
- containerId/providers/Microsoft.Authorization/roleAssignments?$filter=atScope()
- containerId/providers/Microsoft.Authorization/permissions
- containerId/providers/Microsoft.Authorization/roleDefinitions/<REFERENCED_GUID>

Allow only this source-derived literal queryScope in helper audit allowlist, not arbitrary
container URI. atScope returns assignments at OR ABOVE scope; complete inherited writer
audit must include storage account/RG/subscription ancestors. Pagination stays same trusted
ARM origin and exact semantic query scope, bounded; ambiguous/incomplete pages fail.
Resolve relevant actual role definitions through same narrow query scope+GUID, compare
actual GUID/type/permissions/hash to expected source records for known roles. Unsupported
narrow GUID resolution or403 fails with no subscription Reader fallback. Do not restrict
inspection only to expected direct assignment IDs and accidentally ignore inherited grants.

## Writer and administrator trust boundary

Audit union of actual DataActions/NotDataActions and supported conditions for each relevant
assignment: determine capability to write/add/delete/overwrite points/POINT/complete.json,
metadata or credential objects, not just role display names. Any unexpected data-writer
principal, group with unknown membership, unsupported condition, unresolved role, principal
identity mismatch or wider mutation capability than reviewed producer set blocks before
catalog selection/publication. Reader/list capability alone is not marker mutation.
NotDataActions subtract within its role; they do not override another grant's allowance.

Trusted operational producer is ONLY actual backup workflow principal with current exact
container Contributor and its actual source-collection code. Restore has no marker write.
Explicit configured bootstrap human is the separately trusted administrative boundary:
if a direct data-writer assignment to that exact human is encountered, record and bind it
as human administrative access, not as an automated backup producer. No arbitrary tenant
administrator/group/human is silently allowed as data writer. Unexpected human/group data
writers require explicit review or removal, not a caller allowlist flag.

Azure control-plane Owner/admin may be able to alter IAM without current DataActions;
this design trusts the explicit environment human administration boundary and does not
claim protection against a malicious administrator granting itself new data permissions.
A control-plane role is not incorrectly classified as an existing Blob data write, but
current actual relevant data-role change invalidates next audit. Source evidence cannot
establish an adversarial administrator is absent. Neither backup nor that human boundary
is an independent signer or cryptographic catalog authority. Actual trusted backup can
forge/overwrite both marker and payload; the established trust model is stated honestly.

## Publication/selection interface and evidence

Expose pure verifyRecoveryWriterAuthority({guard,actualPrincipal,request,signal}) inside
the existing authenticated helper boundary; actual transport identity is obtained via
current OIDC/ARM context, not caller principal assertion. It returns exact
{containerId,observedAssignmentHash,observedRoleHash,producerPrincipalId,observedAt}
only after the complete current actual audit above. Returned result is bound privately
to current operation nonce/lease/pointId and catalog marker digest; no public bool or
caller-precomputed audit map. Re-audit under lease immediately before backup completion
publication and before restore freezes selected context/first protected write; a changed
writer/role set fails and triggers owned cleanup. External IAM remains checkpoint-observed,
not atomically locked by the Blob operation lease.

Protected pointId selector still validates actual authenticated complete-marker/source/
metadata/object bindings before bundle decode/write; writer audit is an additional current
trust gate, not a substitute for content authentication. Restore cannot change expected
source to make a mismatch pass. Existing retention uses backup's reviewed delete authority
for expired complete verified points; that capability remains trusted and is audited,
not falsely forbidden. No human current writer audit artifact or latest-list shortcut.

Native tests: source recoveryRG ancestry/no new bindings, exact literal container query,
expected backupwriter/restorereader, extra inherited account/subscription writer, explicit
human metadata versus producer distinction, unknown group/condition, role drift/union
NotActions semantics, pagination/foreign nextLink/403/unsupported narrow lookup, exact
marker path mutation rights, and zero restore writes on failed audit. Actual hosted GET
and full inherited response qualification remain pending; fixtures do not prove Azure
supports the narrow endpoint/role resolution. Owners: TF nested descriptor only; guard
helper query/audit; primary strict existing vault_guard publication/cache; operations
actual prepublication/preselection call and private point/lease binding.

