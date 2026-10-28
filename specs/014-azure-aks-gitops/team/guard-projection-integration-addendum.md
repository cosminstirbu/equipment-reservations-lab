# Guard and projection integration boundary addendum

Status: proposed bounded integration clarification; independent preparation review
required before dependent source/grant changes. No actual Azure action, broad Reader
grant, caller qualification flag or saved-plan mutation is authorized by this document.

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