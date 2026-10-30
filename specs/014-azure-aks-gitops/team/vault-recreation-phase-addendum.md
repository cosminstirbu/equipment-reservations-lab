# Guarded hosted recreation phase clarification

Status: proposed bounded clarification, independent quality/security preparation
review required before authoritative staging edits. Existing apply Contributor at the
retained workload RG already permits vaults/write; this proposal does not add it or
pretend it can be absent while apply creates the next workload vault. No new human
Azure credential step is introduced on every hosted recreation.

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
