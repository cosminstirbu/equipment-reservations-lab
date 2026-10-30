# Preparation batch7: concrete G3 and recurring evidence handoff

Status: PROPOSED, not an authority/spending/canary approval. Owner authorized three
additional process rounds only (preparation7 of9). No dependent source/grant change
before independent quality/security verdict and coordinator release. This complete
current draft supersedes the earlier CDD6 draft's unresolved names/API/cache suggestions.

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