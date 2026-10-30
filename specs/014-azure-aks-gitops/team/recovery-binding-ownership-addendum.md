# Recovery binding ownership addendum

Status: proposed targeted clarification; independent quality/security preparation
confirmation required before authoritative integration or actual grants. No owner
policy exception or new grant is inferred.

## Exact issuer observation

The reviewed continuity inventory requires backup to capture the actual original ACME
account URI and private-key checksum. The prior contract explicitly authorized issuer
GET only for restore. Propose adding backup GET on exactly the ClusterIssuer objects
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
