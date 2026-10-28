# Recovery integration gaps: proposed bounded resolution

Status: proposal only. No authoritative change or dependent source repair authorized.
The coordinator must resolve process-budget exhaustion before any confirmed blocking
design repair. Independent preparation reviews and any required human authority
acceptance precede implementation. Existing preparation PASS does not cover this delta.

## 1. Workload-vault network admission

Evidence: foundation/network-access.tf grants vault read/write only at the retained
recovery vault. Operations confirms its only implemented admission transport is ARM
vault read/write plus DNS gate/expiry reconciliation. Six exact secret DataActions do
not admit a blocked hosted runner. Therefore current backup/restore cannot access the
workload continuity inventory, and reaper cannot remove workload admissions.

Microsoft.KeyVault/vaults/write is whole-vault management authority, not ACL-property
permission. Crucially it can change enableRbacAuthorization/accessPolicies; adding this
action to backup/restore without an independently enforced guard could defeat the six
secret scopes. Client-side checks or trusted workflow code are not authorization bounds.
Do not silently add that action or claim no privilege expansion.

Candidate A (requires security and owner authority decision): environment assigns a
custom network role at ONLY its current exact workload-vault resource to backup,
restore and reaper: vaults/read, vaults/write, tags/read, tags/write; no delete/purge,
roleAssignments/write or data actions. Before any assignment, retained foundation
policy enforced by a distinct administrator must deny attempts to disable RBAC,
introduce any accessPolicies, disable purge protection, change bypass=None or change
network defaultAction=Deny. Recurring actors cannot alter/exempt that policy. Policy
must prove actual denied ARM mutations with these very principals, and defaultdeny
admission itself retains actual broader IP-management/availability authority. It is
not an ACL-only custom role. Exact-vault binding must be recreated automatically with
the existing conditioned environment delegation, not a subscription grant. Reaper
uses actual resource IDs from verified projection, no vault enumeration. A reviewed
policy alias/API compatibility test is a prerequisite, not an assumed supported pin.

Candidate B avoids granting hosted actors workload vault ARM write: implement an
in-cluster private continuity relay with exact source/destination data identities and
AKS subnet endpoint access, plus narrowly constrained invocation. This is new unbuilt
transport and additional identity/admission work, not an existing supported fallback.
It needs its own exact exec/API/template authorization design and review; do not improvise
shell commands or broaden existing PostgreSQL clients. Neither candidate is activated
by this proposal. Root must choose and obtain required decisions before dependent work.

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
