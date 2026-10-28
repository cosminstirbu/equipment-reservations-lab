# Operational data model

No application schema change is planned.

| Entity | Fields and invariants |
| --- | --- |
| Environment | Exact confirmation name, private subscription/tenant config, region, generation, persistent operator CIDRs, four hosts, desired immutable SHA, lifecycle state. Generation distinguishes protected vault names. |
| Foundation | Separate RG/state/backend key, DNS zone, external recovery container, purge-protected recovery vault/versioned RSA key, empty workload RG shell/grants. Workload destroy cannot target it. |
| Deployment revision | Git SHA, input/tool/policy hashes, state lineage/serial, private plan hash, normalized change digest, approval and expiry. Any mismatch invalidates apply. |
| Runtime projection | Committed reviewed non-secret Kustomize inputs derived from allowlisted Terraform outputs, source infrastructure revision, generation and canonical output hash. Actual outputs must match before bootstrap; placeholders/untracked overlays never deploy. |
| Published component | One source-proven immutable multi-platform artifact with GHCR and ACR references and verified matching remote digest. Partial publication cannot advance reviewed promotion. |
| Operation lease | Environment, owner/run ID, operation, revision, issued/expires/heartbeat, exact admitted runner CIDR. Admission maximum 30 minutes; independent five-minute reaper plus finally, best-effort rather than native Azure TTL. No admission during TF; unexplained baseline drift blocks. |
| Network prelude gate | Exact operationally owned TXT record with constant reserved payload; ARM metadata equipmentOwner UUID, equipmentExpires/equipmentHeartbeat UTC ISO8601 and actual ETag. Initial human create then exact-role binding, no TF record-content owner. Verify admission then release DNS before waiting Blob; revalidate afterward. Separate short renewal; uncertain writes fail closed. |
| Network admission | Tag equipment-admission-UUID with JSON containing only cidr IPv4 /32 and expires UTC ISO8601, maximum ten per resource; unrelated tags/baseline/active rules preserved. |
| Recovery point | Unique ID, UTC creation, source revision/images/schema, database inventory, encrypted hashes, drain marker, isolated verification, completion marker. Retention counts complete successes only. |
| Secret bundle | Exact six application identity values and five named ACME/public-TLS Kubernetes objects, source/version/attributes/account compatibility metadata; [exact inventory and exclusions](contracts/operations.md#reviewed-recovery-observation-and-continuity-contract). No broker credentials, PostgreSQL admin/old owner/global roles, recovery logins or operator OIDC values. AES-256-GCM before persistence, unique random data key/96-bit nonce, wrapped key/version and ciphertext integrity metadata; separate wrap/unwrap authority, no exported retained RSA key. |
| Operator | Entra object/group/app-role assignment, CIDRs, emergency responsibility. Tenant membership alone never grants access. |
| Safety override | Environment, actor, reason, issued/expires UTC. Expiry mandatory; expired/unbounded rejected; stored outside cluster. |
| Security exception | Exact rule/finding/resource/path scope, rationale, owner, human approver/date. No blanket suppression. |
| Recovery key version | Immutable version ID and explicit future recovery_key_expiration_date; initial365-day lifetime from reviewed creation date. Referenced old versions retain valid unwrap via verified rewrap or reviewed expiry extension; no key deletion/disablement while retained points depend on it. |
| Budget | Fixed120EUR/month including taxes; required actual taxRate decimal0..1. Billed=preTax*(1+taxRate), unknown blocks paid provisioning. Audit cost included, no credit assumption. |
| Protected Blob audit | Dedicated retained workspace/table/DCR and both Blob diagnostic sources, safe persisted columns only,30day audit retention/no archive,.03GB/day protective quota with visible gap failures; not application telemetry's three-day store. |
| Maintenance record | Approved normal/maintenance Git SHAs, exact original writer replica counts, active deny-sync window and expiry, operation owner/phase. Independent record survives actor failure; no Argo write permission, exact scale-only recovery and fail-closed incomplete cleanup. |
| Qualification definition v2 | Actual clean source/HEAD, complete transitive loaded-code/authority closure, parser/dependency/runtime pins and exact classification manifest; version1/mixed records rejected. [Definition/transition contract](contracts/operations.md#reviewed-non-vault-integration-clarification) and [release-data constraints](contracts/operations.md#reviewed-application-release-data-classification) govern separately validated data. |
| Installation transition | Complete individually hashed source/target generated maps, immutable generator/output hash, reviewed exact fixture-reference removal and owned cleanup/already-hashed installation; unexpected paths/fields/authority changes block. Neither runtime directory nor generated status implies exemption. |
| Activation record | Separate canonical non-executable record binding actual both-actor proofs, consumed challenge, generation, source/target maps and lease; schema/validator stays in immutable definition. No self-hash, imported executable payload, caller boolean or consumed-challenge replay. |
| Human guard-family evidence | Exact human bootstrap producer; private retained guard-evidence container, recurring consumers read-only. Actual policy/API/assignment/security tuple proof, current guard integrity checks and trusted conditional-create transport; no WORM claim or operations-prefix authority. |
| Apply guard-generation evidence | Actual protected apply producer in separate guard-apply-evidence container, required actual new-vault resource/generation/API/role/guard/source proof before population/grants. Cannot masquerade as human-family proof; actor-owned operational qualification remains separate. |
| Guard staging | Retained both-vault enforced guards and initial human family qualification precede hosted activation. Existing apply Contributor creates compliant new generations under guards and automatically qualifies them before operational use; no new human token each recreation. Exact staged grants and actual actor denials remain required; [current stage contract](contracts/operations.md#reviewed-hosted-recreation-and-evidence-authority-refinement). |

Lifecycle: absent -> provisioning -> running -> stopping -> stopped -> starting ->
running. Failed transitions remain failed/unknown until provider truth established.
Destroy requires verified backup/drain and leaves foundation. Restore is explicit
maintenance separate from clean creation; pause writers/reseeding until complete.
Every competing mutation acquires the common external operation lease.

Current integration refinements are defined in the
[operation contract](contracts/operations.md#reviewed-guard-and-projection-integration-boundaries):
initial creation is separate from postcreation grant-plan receipt; ordinary completed
application activation is separate from optional recovery activation. Canonical
public generatorInput contains exact four foundation/four environment fields and
sanitized config, versioned hash/output maps; no hidden root-state hash dependency.
Peer initial proofs/consumption are read-only private evidence, validated at historical
consumption and against current installed target plus fresh own-actor proof. Actual
ARM scope behavior remains a provider gate. Optional ACME email is omitted from the
public projection under the [privacy contract](contracts/operations.md#reviewed-acme-contact-privacy);
no secret/contact inventory or acceptance is broadened.
The [batch7 evidence contract](contracts/operations.md#reviewed-batch7-recurring-guard-and-recovery-evidence)
defines strict source-bound inspection-role/binding descriptors and literal fixed
human/apply current pointers. A pointer is trusted producer transport whose referenced
records/current actual activation must validate, not proof by existence/list freshness.
Inert canary denied requests and actual active-object authority inspection establish
different facts; neither is silently substituted. Recurring recovery observes own
identity/authority and exact recovery Application, without peer/global resource reads.
Completion catalog version2 binds protected selected pointId to actual backup producer's
sourceIdentity/sourceSecrets and encrypted-object hashes independently of credential
payload. That producer remains trusted and can write its container; no independent
signature/WORM assertion. Actual human fixture and Azure qualification remain pending.
[Canary binding staging](contracts/operations.md#reviewed-canary-read-binding-bootstrap-staging)
uses typed actual human fixture-set evidence (IDs/API/semantic hashes/source/producer/
creation-plan digest), separate from human policy-family and actor evidence. Null means
no future-object read bindings; F2 validates current actual fixture GET before exact
binding plan, F3 qualifies final tuple. Read-only prepare is not live authorization;
no caller-ready boolean, fixture adoption/import or provider-scope success is inferred.
Preparation9 refinements bind [existing workload delegation](contracts/operations.md#reviewed-workload-delegation-descriptor)
through source/actual role, assignment and raw/semantic condition hashes with restricted
pure evaluation. The [current recovery Application UID](contracts/operations.md#reviewed-recurring-recovery-application-uid)
is fresh own-operation evidence, never fabricated historical identity; checkpoint rechecks
are not an atomic global lock. [Recovery writer inspection](contracts/operations.md#reviewed-retained-recovery-writer-inspection)
uses one exact source-derived container and existing inherited inspection authority,
blocking unexpected actual writer/role changes. Backup producer and explicit human
administration remain trusted; conditional create is neither signature nor WORM.
Actual provider and unresolved implementation checks remain pending.