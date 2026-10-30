# Batch7 canary read-binding staging proposal

Status: PROPOSED narrow bootstrap dependency clarification, not source implementation,
actual fixture authorization or preparation approval. Owner's process extension only
permits review rounds (next potential preparation8/9); it does not approve live fixture
creation, permissions, spending or an exception. This file alone is owned by this task.

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
