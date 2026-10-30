# Workload conditioned-delegation descriptor and evaluator proposal

Status: PROPOSED narrow missing producer/cache contract for an existing batch7 validation
requirement. Potential preparation9/9 review; no source/grant/authoritative change or
actual Azure action. It neither weakens conditional delegation nor claims hosted write
authority absent. Existing batch7 safe-probe and actual provider gates remain required.

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
