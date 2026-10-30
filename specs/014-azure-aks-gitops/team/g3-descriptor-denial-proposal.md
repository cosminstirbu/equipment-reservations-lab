# Concrete G3 descriptor and safe denial proposal

Status: proposed only; preparation budget6/6 is exhausted. No dependent repair starts
without coordinator-confirmed owner process extension and independent preparation review.
No source, authoritative schema or grant is changed here. Existing requirement for actual
G3 checks is retained; missing request descriptors are not fabricated as passed cases.

## Complete source-bound nonsecret descriptor

Extend vault_guard strict schema with inspection_roles map EXACT keys permissions,
authority,policy_definition,policy_assignment,policy_exemptions. Each entry contains
role_definition_id, sorted actions, empty dataActions/notActions/notDataActions,
assignable_scopes and canonical SHA256 of this complete semantic object. Terraform
produces IDs/hashes from actual resources, never caller policy maps. Expected actions:

| Key | Exact actions |
| --- | --- |
| permissions | Microsoft.Authorization/permissions/read |
| authority | Microsoft.Authorization/roleAssignments/read; Microsoft.Authorization/roleDefinitions/read |
| policy_definition | Microsoft.Authorization/policyDefinitions/read |
| policy_assignment | Microsoft.Authorization/policyAssignments/read |
| policy_exemptions | Microsoft.Authorization/policyExemptions/read |

Add inspection_bindings array of exact role key/principal object ID/assignment scope/
assignment resource ID/query scopes. Scope inventory stays the current approved one:
permissions at actual two vaults and guard-evidence/guard-apply-evidence containers;
authority at both evidence containers and retained workload RG; policy_definition at
exact custom definition; policy_assignment at exact two guard assignments;
policy_exemptions at exact two retained RGs. Actual environment root supplies new exact
workload-vault permissions assignment. Six actors only plan/apply/destroy/backup/restore/
reaper. No permissions/read on policy objects/RGs is silently added. Existing two network
semantic descriptors remain unchanged; the five new inspection descriptors are not
mislabelled vault-network rights.

Canonical output publisher verifies descriptor from actual two authorized root outputs,
IDs/scopes/tenant/generation and reviewed definitions before strict private actor cache.
Cache carries complete nonsecret vault_guard plus exact evidence container names and
needed operation role IDs; no credentials, raw private config or foundation-state access.
Unknown/missing/extra role keys/actions/scopes fail. Current exact-object API resolution
and inherited assignment audit gates remain;403 or unsupported lookup fails without
subscription Reader fallback. Config renderer remains existing approved exact8-field
sanitized schema, with environment in outer projection identity (not a ninth config key).

## Authority truth and safe denied-request strategy

Current plan/backup/restore/reaper must lack guard/policy/exemption and role-assignment
administration. Existing apply/destroy have conditioned delegation, so a global
roleAssignments/write deny is FALSE: test exact permitted approved delegation separately,
and a specific disallowed target outside its allowed role/principal tuple. No unconditional
role-write assertion or unrestricted Owner-shaped mutation is attempted. The full trusted
role/delegation definitions and actual scope/condition hashes enter the descriptor closure.

Do NOT PUT/PATCH/DELETE active retained guard definition, active assignment, exemption
against either active guard, or high-privilege role assignment merely to hope for403.
Effective-permissions API on the already authorized exact vault/container scopes is
supplementary own-authority evidence, not proof of policy-object access nor other-writer
isolation. No broader permissions/read grant is inferred to make those probes convenient.

Concrete safe candidate for independent review: initial human creates a fixed supervised
policy-qualification CANARY distinct from active guards. Its definition uses effect=Audit
with an impossible resource-type predicate, no modify/deploy/deny effect or managed
identity. Human assigns it only at the retained workload RG and creates a fixed exemption
that refers ONLY to that inert canary assignment. No active guard IDs are accepted in any
canary body. Canary resources have no authority over real guard behavior. Actual IDs,
canonical immutable bodies and current hashes are published by human in guard descriptor
under a distinct denial_canary section. No arbitrary supplied URI/body or ID suffix match.

G3 actual forbidden writes are idempotent exact-body PUTs of these existing inert canary
definition/assignment/exemption objects, using the pinned supported policy APIs, actual
actor and verified current body. Expected result is authorization403, unchanged GET hash.
Unexpected2xx is FAILURE (authority broader than intended), but body remains the same inert
policy and does not disable production guard protection. No delete probes against active
or canary protection. If no-op write still causes Azure metadata changes, capture truth;
do not call resource unchanged at system metadata level. Semantic body remains unchanged.
A changed/missing canary or unknown provider behavior fails BEFORE request and blocks G3.

For forbidden conditional delegation, use a human-created harmless canary role whose sole
action is the exact guard policy-definition read the actor already legitimately has;
no data actions, writable objects or additional access. A fixed role-assignment ID and
exact actor principal at exact canary definition scope are outside approved apply/destroy
delegation role-ID allowlist. Actual PUT with that harmless role must403 for every actor.
Unexpected success is FAILURE; it cannot confer capabilities beyond that actor's already
held exact-object read. Human owns cleanup and audits any unexpected created assignment;
recurring actors gain no delete/role-admin authority. This canary-role creation is a NEW
proposed qualification fixture, not an approved existing resource. It must be reviewed
before any actual human Azure action. No Owner/Contributor target or arbitrary recipient.

Alternative if reviewers reject canary overhead: leave actual denied policy/role cases
explicitly unimplemented/blocked and request a precise revised proof boundary from owner;
do not replace the requirement with effective-permissions-only or claim generic403 proves
an uncalled operation. This proposal authorizes neither alternative by itself.

## Ownership, tests and remaining exact bindings

Terraform owner produces strict inspection role/binding descriptor and, only after review,
fixed inert canary IDs/bodies/roles. Promotion helper owns request templates, current hash/
identity verification, actual result provenance and family/generation/G3 evidence schema.
Primary owns allowlisted actor cache/projection/CLI handoff; operations owns fresh actual
actor execution under lease and completed activation checks. Shared wrapper rejects
caller booleans and unsupported policy APIs. No dependent source work before release.

Before implementation, exact canary policy-definition/assignment/exemption API versions,
canonical names/resource IDs and role semantic hash must be frozen from official schemas
and current provider pins; these remain explicit unresolved technical prerequisites, not
guessed in code. Native tests reject active guard ID/body substitution, unknown fields,
wrong principal/scope/role, missingcanary, unintended effects, unexpected200/412, stale
hash, unsupportedGET and broader permission fallback. Actual hosted tests remain pending;
source fixture success never establishes real RBAC or Policy enforcement.

Canary prerequisite authority is explicit: the proposed fixture additionally needs exact
policyDefinitions/read at its canary definition and policyAssignments/read at its canary
assignment for actual before/after semantic GET checks; existing RG exemption read covers
the canary exemption. These two exact READ scopes are new proposed fixture bindings,
NOT inferred from current active-guard read grants. The harmless canary role uses only
canary-definition read already held after those explicit fixture reads. No broader list
or subscription assignment is proposed. Without reviewed exact fixture read bindings,
helper must not execute the before/after probe or fabricate unchanged-state evidence.
