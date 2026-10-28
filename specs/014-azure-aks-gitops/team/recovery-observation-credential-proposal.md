# Recovery observation and credential continuity proposal

Status: proposed technical delta, pending independent quality/security preparation
verdicts. No new permission or implementation result is approved by this document.
The already-reviewed qualification-v2 integration is separate and remains authoritative.

## 1. Enforceable quiescence observation

Scale.spec.replicas=0 does not establish that writer processes stopped. Deployment
terminatingReplicas is optional and not acceptance evidence on its own. The proposed
additional permission is pods/list ONLY in namespace equipment for backup and restore.
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
