# Retained recovery writer-inspection query contract

Status: PROPOSED narrow missing query/descriptor contract for T087, potential joint
preparation9/9 review. No new grant, source/authoritative amendment, cloud action,
spending or exception. Actual provider authorization/completeness remains unproved.

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
