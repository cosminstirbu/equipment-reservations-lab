# Bounded T075 installation-classification batch

Status: proposed implementation design addendum for original quality/security preparation review. No self-approval, authoritative plan/contract/task update, application code, provider action or permission change. Implementation scope is approved proposal38A807 sections2–3 and current authoritative exact-path clarification. Approved release-data addendum2881E804A4724D8362742C14DB0118B2DBAE432950750E269BA3F9D2B357E05C remains authoritative and is implemented separately through T079; this narrow batch neither withdraws it nor describes its approval as pending. Preserve T069 workflow author ownership and existing task IDs/statuses.

## Current integration problem and retained behavior

`qualificationSourceDefinition` currently has only modules/assets and hashes the entire selected inventory. Required removal of the fixture resource reference changes the immutable definition; adding recovery-activation.json changes inventory and would introduce a self-reference cycle if hashed into its own proof. Current generated runtime maps are not explicitly classified. Preserve existing independently parsed transitive imports, regular-file/symlink/path checks, package/runtime/tool/workflow identity, actual Git HEAD/cleanliness and launch rechecks; do not replace them with prefixes or caller-supplied exclusions.

`renderRuntimeProjection` in scripts/azure-runtime.mjs399 is the real generator. `validateBootstrapRuntime` in scripts/azure-provisioning.mjs513 already verifies exact generated filename sets and bytes; retain it as a real collaborator. Generator outputHash binds canonical config/foundation/environment; generation/source metadata is not authority by itself.

## Complete fixed categories

The reviewed classification manifest remains immutable code input and must enumerate the complete inventory across the following categories. No path can be silently omitted or classified twice.

**Immutable execution/authority:** the current module/asset remainder after the exact installation/record classifications below AND the already-approved exact28 release-data classification implemented separately by T079. Generator, independent classifier/validators, imports, schema code, workflows/locks/tool pins, Roles/subjects/policies/admission/network definitions, SQL/client/monitor/proxy templates and recovery Application source stay immutable. In particular deploy/platform/azure/recovery-controls/qualification.json remains immutable even after its reference is removed; deploy/argocd/azure/recovery/application.json and kustomization.yaml remain immutable. Installing an already-hashed object is not permission to edit its source.

**Exact generated installation-state filenames:**

| Root | Literal filenames |
| --- | --- |
| deploy/environments/azure/runtime/ | kustomization.yaml; identities.json; projection.json |
| deploy/platform/azure/runtime/ | recovery-continuity-bindings.json; recovery-qualification-bindings.json; argocd-bootstrap-patches.json; argocd-bootstrap-resources.json; kustomization.yaml; identities.json; projection.json |
| deploy/platform/azure/recovery/runtime/ | kustomization.yaml; bindings.json; identities.json; projection.json |

These14 paths are not directory exclusions. Their complete bytes must equal independently generated maps from validated private authorized generation/output inputs; extra/missing/alternate-extension files fail. Before first runtime installation, canonical complete absence may be observed but cannot satisfy app/recovery readiness or challenge publication. Mixed/partial presence fails. A generator change introducing a filename requires an explicit reviewed immutable manifest/classifier change.

**Exact installation transition:** deploy/platform/azure/recovery-controls/kustomization.yaml permits ONLY removing its literal qualification.json resource reference. Parse/schema-check and compare complete canonical source/target structures/bytes; reject changes to other resources, patches, metadata or behavior. Both full source/target trees must independently render/schema-check. The immutable generator's existing normal/recovery outputs and six continuity/two qualification binding files remain completely checked; installer-only files stay excluded from all Kustomizations. Actual fixture UID cleanup, exact-commit platform Synced and installing already-hashed recovery objects remain T068/T073 operational prerequisites, not broad source-mutation exceptions.

**Canonical activation record:** only deploy/platform/azure/recovery-activation.json, absent or one regular canonical JSON record at that exact path. Schema/validator code is immutable; record bytes have a separate digest bound by create-only private challenge consumption, lease, reviewed Git revision, generation and source/target hashes. No self-hash. Reject unknown/mixed/v1 fields, import/execution/render inclusion, alternate location/extension, changed consumed payload or replay. Do not accept record presence as activation.

**Approved application-release data (T079):** preserve all28 literal paths, strict per-component patch/schema/counterpart rules, remote matching-digest OCI/GitHub provenance and unchanged loaded-code/authority closure from approved addendum2881E804. This includes the reviewed broker-bootstrap rabbitmq Deployment/definitions initContainer exception. The installation-state work must not reclassify these approved data paths as immutable authority, duplicate T079 implementation or permit unvalidated exclusions. Complete inventory spans immutable, installation, activation AND approved release-data categories; acceptance of their combined integration remains pending implementation/evidence.

## Public seams and sequencing

Keep existing public `qualificationSourceDefinition`/`validateQualificationLaunch` as the clean-Git/actual-byte and immutable definition boundary. A narrowly owned state-classification validator may be added as its real collaborator; exact filenames and transition rules are fixed repository policy, not caller arguments. Do not modify the workflow launcher while its current author batch owns it.

Prelaunch runs before trusted private infrastructure inputs are available. It may safely inventory/hash categorized installation/record candidates and bind their Git objects, but must NOT label those candidates authorized merely because they are excluded from the immutable hash. Before any qualification probe, challenge/proof write or activation mutation, the public publisher/producer/bootstrap path must load its existing validated config/foundation/environment projection and compare actual candidates with the real generator's complete source/target maps. A caller boolean, supplied hash map, record metadata or “generated” label cannot substitute for that comparison. Existing validateBootstrapRuntime remains in the production path.

Challenge publication computes and binds BOTH full source/target maps, generator identity/outputHash and only the allowed transition before actor proofs. Actor producers independently verify those bindings against reviewed-source Git objects, actual clean executed Git objects/working files and their authorized current projection. Only identical immutable closure plus one of the exact bound installation states can pass; proofs retain separate infrastructure anchor, reviewed source and actual executed code revision.

Initial consumption revalidates both proofs/current definitions/current cluster and states under the existing native Blob lease before create-only consumption. Activation v2 then binds that consumed canonical record and actual reviewed target commit/state; recurring operations require actual target state, unchanged immutable closure and fresh own-identity evidence. This addendum does not implement consumption, recurring proofs or grant activation; their T064–T066/T068/T073 dependencies remain explicit. No cross-resource transaction, timestamp Argo revocation or automatic resume of consumed failed activation is claimed.

## Smallest dependency-ordered implementation assignment

1. Add intended REDs for the exact independent classifier and real-generator/Git boundary. Own a narrow classifier module/test if useful; no framework or data-source abstraction is needed.
2. After workflow source release, update infra/azure/qualification-definition.json plus scripts/azure-qualification-launch.mjs/tests to integrate these exact categories while retaining complete import/inventory checking. New classifier code itself enters immutable closure and the reviewed module graph.
3. Integrate state/map binding into scripts/azure-qualification.mjs/tests and bootstrap's real projection validation. Initial challenge/proofs cannot bypass incomplete state validation.
4. Then migrate scripts/azure-provisioning.mjs validateActivationContext/tests and consumption/activation callers to v2. Do not combine this with unrelated recovery transports, vault grants or the separate approved T079 release-data implementation. Freeze/check/review each coherent batch; do not regenerate tasks.

## Meaningful RED and acceptance boundaries

Use temporary REAL Git repositories containing actual immutable modules/classification files and actual renderRuntimeProjection output from internally consistent fixture config/foundation/environment inputs. Keep generator, parsing, hashing, source selection and validation real. Solitary deterministic classifier cases are justified validation-algorithm evidence; public producer/bootstrap integration must additionally retain real internal collaborators, faithful private Blob/process boundaries and separate native/hosted contracts.

Required REDs: unchanged authority plus exact fixture-reference removal succeeds; arbitrary Kustomize field/reference/patch edit fails; each of14 output path/byte omissions/additions and a15th/new-extension output fails; changed outputHash/generation/subject fails; both source/target trees render and mismatched target fails. Immutable qualification/Role/SQL/proxy/Application template edits require requalification. Canonical absent activation versus valid consumed record is distinguished; record import, self-reference, wrong path/schema, payload mutation and replay fail. Test actual reviewed versus executed Git objects and unchanged app-source-only commit, not a caller passed unrelated flag. Public publication must refuse incomplete runtime maps BEFORE proof writes/probes.

Native Azure identity, lease/create-only/replay behavior, actual cluster Role/Binding drift and exact-commit/UID cleanup remain independent live acceptance; static/Git tests do not establish them. Private projected values/errors must not leak. Preserve existing budgets, cancellation, cleanup and no unsafe side-effect retry.

## Approved parallel classifications and remaining implementation acceptance

The approved narrow T075 classification can unblock the initial qualification-to-reviewed-activation transition without weakening authority integrity. Approved2881/T079 ALREADY permits routine valid promotion of its exact28 release-data paths with unchanged complete loaded-code/authority closure, without initial two-actor reapproval. That approval is not pending and is not overridden by this batch's limited implementation scope. Current source still needs the separate T079 classifier/provenance integration and qualification before complete routine-release compatibility can be claimed. Do not add unvalidated exclusions merely to make T075 pass, and do not reinstate the superseded conservative all-deployment-assets-immutable interpretation as policy.

Owner-approved CandidateA and reviewed hosted-phase/evidence addendum8D9A8D9D64E753949A25DC51D0B57A92F569AF7C2BB05ACC4BECFD395172EA1A/T078 also remain authoritative. Earlier proposed/blocked or recurring-human-token wording is superseded: initial guarded human family qualification precedes protected hosted apply's actual per-generation qualification before population/grants; unchanged-family recreation does not require a new human Azure-token step. Existing apply Contributor and separate human-writer guard-evidence/apply-writer guard-apply-evidence boundaries remain as approved. This T075 batch grants no vault authority and does not implement or waive those staged live gates.

No new policy/business decision is requested for T075, approved2881/T079 or approved CandidateA/8D9A/T078. Their unbuilt implementation and actual provider/provenance acceptance must be reported separately from existing approvals. Exact field/function naming is routine implementation detail; an unclassifiable asset remains blocking until resolved within the approved exact categories rather than silently excluded. Only this proposal artifact was written. Source checks, native/provider/cloud runs and independent preparation verdicts are not claimed.

## Q-T075-001 targeted repair evidence

Preserve prior addendum SHA256 CE72B82028EA6EE4EFA5C5D4939CFE48993BDC591D9AB63957279764C9643811 and original installation-classification-quality-round1.md as historical evidence. This repair reconciles current authoritative plan, operations contract and T078/T079 approvals; the14-path generator inventory, narrow transition, proof bindings and intended RED design are unchanged. Only this addendum was edited. No plan/contract/task/metadata/source changes, provider work or new permission decision occurred. Original reviewers assess closure; this note does not approve itself or reset preparation limits.
