# T028 central Azure manifest gate evidence

Coordinator-assigned scope: scripts/manifest-quality.mjs and focused tests, with a
separately authorized options.env repair in the promotion API. Other workers own
workflows, package commands, runtime fixture generation and pinned tool/schema cache.

## Applicable standards and design

Constitution, team protocol/implement skill and formatting/testing/tooling guides
remain applicable from the preceding batch. Feature plan/tasks were reread before
this batch. No requirement or checklist verdict is changed here.

The quality classifier adds explicit mode infrastructure with reason
azure-only-changes for an audited Azure-only diff, preserving existing full and
manifest provenance behavior. Real Git history/diffs and actual package metadata
remain collaborators in tests. Unknown or mixed application inputs fail closed to
full quality. Workflow owners consume the mode; source-only classification never
establishes deployment readiness.

The offline Azure gate uses the production runtime generator through the shared
explicit fixture helper and actual checksum-verified kubectl/kubeconform. It validates
authored source and a complete isolated synthetic projection without creating usable
source runtime defaults, cloud access or secrets. Missing real runtime is explicitly
pending/unconfigured; partial runtime or inconsistent image metadata fails. Complete
real runtime is checked separately from the synthetic fixture so fixture generation
cannot mask broken reviewed configuration.

Kubeconform0.8.0 and pinned local Kubernetes/CRD schemas were selected by the
coordinator. No missing-schema blanket exception or online schema fallback is allowed.
Unknown resource kinds fail. Structural policies complement schema checks for exact
public routes, immutable images, private data endpoints, workload identities, probes,
security/resource budgets, retained disks and bounded telemetry. These checks do not
prove server-side admission, actual cloud identity/networking, readiness or retention.

Tests call public CLI/functions with real parsers/filesystem/Kustomize/schema tools
and generated fixtures; controlled invalid authored resources establish negative
behavior. Pure diff/policy parsing cases justify deterministic solitary boundaries.
Tool output is privately captured and projected to safe phase/status/counts; errors
must not print arbitrary manifest bodies or credential-shaped marker fixtures.
Temporary roots have exact ownership and cleanup attempts preserve primary failures.

## Coordination

- GitOps owns stageAzureFixture(destination,{sourceRoot}) in
  scripts/azure-runtime-fixture.mjs and the generated runtime contract.
- Primary owns checksum-verified kubeconform/core schema acquisition and cache pins.
- GitOps owns vendored missing CRD schema inputs; existing Traefik/cert-manager
  definitions provide their selected version schemas.
- Operations owns pull-request workflow integration; root coordinates main workflow.
- No whole-repository lint/format commands in this batch; root centralizes final gates.

## Promotion API environment repair

`node --test --test-name-pattern='scopes Docker credentials' scripts/promote-images.test.mjs`
failed exit1 with child status31 before repair because options.env was ignored.
After forwarding the child-only environment through source/destination raw-index and
image-config reads, the same command passed. Caller process.env is unchanged.
`node --test --test-name-pattern='scopes Docker credentials|dual publication' scripts/promote-images.test.mjs`
passed four tests after repair. Promotion evidence hashes from the earlier batch are
superseded for the repaired module/test; final hashes follow this batch.

## RED/GREEN and checks

Checkpoint before coordinator temporarily reassigns the agent slot:

- `node --test --test-name-pattern='audited Azure-only|unknown infrastructure helpers' scripts/manifest-quality.test.mjs`: intended RED exit1, audited Azure-only diff incorrectly selected full/outside-allowlist; GREEN exit0 after classifier implementation, two tests pass.
- `node --test --test-name-pattern='audited Azure-only|unknown infrastructure helpers|an actual allowlisted|main compares' scripts/manifest-quality.test.mjs`: exit0, four tests pass, including existing local manifest/main ancestry behavior.
- `npx.cmd eslint scripts/manifest-quality.mjs scripts/manifest-quality.test.mjs scripts/promote-images.mjs scripts/promote-images.test.mjs --max-warnings 0`: exit0.
- `node --test --test-name-pattern='scopes Docker credentials|dual publication' scripts/promote-images.test.mjs`: exit0, four tests pass for the authorized environment-forwarding repair.
- Every source edit used exact-file npm.cmd formatter and reread.

Classifier output is now implemented: `{mode:'infrastructure',reason:'azure-only-changes',paths:[...sorted audited changed paths]}`. It accepts the Azure infrastructure/deploy subtrees, explicit operational script/test/workflow names and infra-only root package-script changes; dependencies/unknown helpers/application inputs remain full. Existing manifest/full semantics and trusted-full-quality ancestor discovery remain unchanged.

The central `manifest-quality.mjs azure` validation command is **not implemented**
at this checkpoint. Operations authored the PR lane against that forthcoming command;
end-to-end workflow checks remain pending until implementation. Primary owns pending
kubeconform0.8.0/core schema acquisition; GitOps supplied stageAzureFixture and is
coordinating remaining authoritative CRD schema inputs. No readiness/schema success
is claimed from classification tests.

Checkpoint SHA256:

| File | SHA256 |
| --- | --- |
| scripts/manifest-quality.mjs | E5F4ACBCCDC68E6A1F219CEE49881C41BCE8C4BF6F10BA94ED82AA7A977EFC7F |
| scripts/manifest-quality.test.mjs | B19A95868381A85D8A5EE6567AEE7BD45A7560B8F6C286D4B63FB7E679F38FA1 |
| scripts/promote-images.mjs | BDAA937ABB41BD83B631B98F536F4F24A9BF6F694A3EFED0654411040B98C387 |
| scripts/promote-images.test.mjs | CC009B7177E92C4922C0418EA897E5719918269E29A4CEDFAB90B3F8CB9ACD1E |

## Offline Azure gate checkpoint (2026-10-26)

The earlier classifier-only checkpoint above is superseded for the primary Azure
roots. `node scripts/manifest-quality.mjs azure` now uses checksum-verified kubectl
and kubeconform0.8.0, verified pinned Kubernetes1.35 schemas, verified pinned Argo/CSI
inputs and hash-pinned vendored Traefik/cert-manager CRDs. It derives custom schemas
in an owned temporary directory, uses only local schema locations, rejects missing
schemas/unknown kinds, and never downloads schemas or reads cloud state/secrets.
Actual source runtime/image completeness and publication envelopes are inspected
before synthetic fixture generation. Present runtime and images are each rendered
independently with synthetic counterparts for absent inputs, so a missing image set
cannot hide an invalid authored runtime. Fully absent inputs return explicitly
unconfigured/pending, never ready. The complete synthetic fixture currently renders
201 resources. Public metadata output excludes manifests, credentials and private
child output; temporary material is cleaned after success/failure.

Policy checks cover immutable images, workload security/resources/probes, no literal
Secret objects, least-privilege CSI secret mappings, retained Azure storage, restricted
public routing and operator allowlists, namespace network deny rules. A workload
without an explicit service account is allowed only with explicit token automount
false (web uses this); default service accounts remain rejected. Kubernetes schema
validation is not live admission, identity, network or readiness evidence.

Test design uses real temporary filesystem trees, the actual fixture generator,
actual pinned kubectl/kubeconform and real validators. Only cloud inputs are fake.
Negative cases mutate authored source to expose dependencies, allow privilege
escalation, remove probes, inject invalid fields/unknown kinds or remote render
references, and assert private markers do not escape. Source traversal rejects
symlinks and nonlocal/missing references except the exact generated runtime/image
paths, prior to invoking Kustomize. Temporary directory inventories verify cleanup
on schema failure. Pure publication validation moved into deployment-validation.mjs
and remains re-exported from promote-images.mjs, preserving existing callers and
breaking the runtime/fixture/promotion import cycle.

Commands and results:

- Initial new-gate tests: RED missing export; subsequent RED exposed fixture schema
  conversion of parser proxies (replaced with JSON serialization) and missing authored
  Dashboard startupProbe (GitOps repaired its Azure patch).
- `node --test --test-name-pattern='refuses remote' scripts/manifest-quality.test.mjs`:
  RED renderer was invoked instead of rejecting remote input before rendering;
  GREEN after offline source-reference inspection.
- `node --test scripts/manifest-quality.test.mjs scripts/component-workflows.test.mjs`:
  exit0,33 tests,30 pass,3 existing environment-gated local/native skips,0 failures.
- `node scripts/manifest-quality.mjs azure`: exit0; infrastructure/unconfigured,
  fixture true,201 resources,pending runtime and images.
- `node --test --test-name-pattern='Azure-only infrastructure' scripts/component-selection.test.mjs`:
  RED selected all7 images for the newly introduced fixture helper; GREEN1pass after
  adding its exact name to the audited non-image helper set.
- `node node_modules/eslint/bin/eslint.js scripts/manifest-quality.mjs scripts/manifest-quality.test.mjs scripts/deployment-validation.mjs scripts/promote-images.mjs scripts/promote-images.test.mjs scripts/component-workflows.test.mjs scripts/component-pipelines.mjs scripts/component-selection.test.mjs --max-warnings 0`:
  exit0 after removing unused import and spelling regex whitespace count explicitly.
- Exact-file format and reread followed every source edit. Whole-repository lint,
  formatter and hosted pipeline execution remain coordinator-owned.

Required remaining work: optional recovery root is NOT rendered by this checkpoint.
T028 remains incomplete until frozen recovery projection/fixture support and pinned
ValidatingAdmissionPolicy/Binding schemas are integrated and negatively tested.
Live server-side admission, Azure/GitHub identity/lease/publication, actual complete
runtime/image deployment and hosted workflow qualification remain pending.

Checkpoint SHA256 (supersedes previous hashes for these files):

| File | SHA256 |
| --- | --- |
| scripts/manifest-quality.mjs | 7346E11699D5AAF70970241A1950895D813BB254082C75D45CED29F39E027412 |
| scripts/manifest-quality.test.mjs | BB3A926DE52E93A0EFF40AFF2B52830B35A714102C4DAC2DCE0DD5E76B508D85 |
| scripts/deployment-validation.mjs | AD9493B7CD3036AAF29F1BEBC6546B1691E314695927F09F4FD56BAFA7AA3505 |
| scripts/promote-images.mjs | 3E449A24FB8AD9E0AB1108BDE5FEA9D3E8D6187CBE0895340EF6D6D263A1C451 |
| scripts/promote-images.test.mjs | CC009B7177E92C4922C0418EA897E5719918269E29A4CEDFAB90B3F8CB9ACD1E |
| scripts/component-workflows.test.mjs | 2D8CFE256F24634D5934EF8383E2A68DDC3A2F7B11050F8EFF9D380D74A721B8 |
| scripts/component-pipelines.mjs | 50E407642CE97926891D1A58026F6B7FA8772264176C91E8C9DEB58F354D234D |
| scripts/component-selection.test.mjs | E28748088242D3853363264CFB85978B6D0BBDC5683F71ED912D1A6DBC0FB7F6 |

Final checkpoint recheck after the source-reference scope repair:
`node --test scripts/manifest-quality.test.mjs` exit0,16tests14pass2existing
local-native skips0fail. Exact eight-file `npm.cmd run format-check -- ...` and
scoped ESLint command above both exit0. `git diff --check --` on the eight source
files plus this evidence exits0. No further source edits after these hashes.

## Independent recovery-root gate integration checkpoint

The previous recovery-root coverage limitation is superseded at this checkpoint:
`renderedAzure` independently renders deploy/platform/azure/recovery in addition to
ordinary app/platform/Argo roots. Fully activated synthetic fixtures include the third
recoveryFiles runtime (identities.json,bindings.json,projection.json,kustomization.yaml),
which remains excluded from the normal platform root. All three actual runtime trees
must be absent together or complete together and share the exact four-key projection
metadata. Unknown metadata keys and inconsistent generation/hash fail privately before
fixtures can mask them. Native schema inputs now include pinned Pod, VAP and Binding
schemas from the same Kubernetes1.35.0 revision (26 verified raw-cache files total).

Recovery Pod containers receive the same immutable-image/security/resource/credential
checks as Deployment/Job containers, and recovery SPCs use the generator's exact
recoveryWorkloadSecrets authority map. The two verification admission policies must
fail closed, have validations/match rules and conditions, and have Deny bindings scoped
to equipment-recovery. This structural check does not compile/evaluate CEL or prove
actual server enforcement; GitOps/live qualification owns those proofs.

Test-first evidence:

- `node --test --test-name-pattern='optional recovery' scripts/manifest-quality.test.mjs`:
  intended RED missing expected rejection because malformed authored recovery Pods
  were ignored; GREEN after independent render and pinned Pod schema integration.
- `node --test --test-name-pattern='recovery admission' scripts/manifest-quality.test.mjs`:
  intended RED accepted Ignore failurePolicy; GREEN after fail-closed/Deny checks.
- Recovery negative tests exercise actual pinned tools on malformed fields, unknown
  kinds and unsafe Pod privilege; deny remote input, inconsistent/unknown projection
  metadata, partial recovery runtime, private-value error leaks and leftover tempdirs.
- Full `node --test scripts/manifest-quality.test.mjs`: exit0,18tests16pass2existing
  local-native skips0fail; source-reference/metadata tightening followed with focused
  recovery recheck. Earlier test-fixture JSON.parse-on-YAML error was corrected to
  mutate the actual filename before this successful full run.
- Scoped two-file ESLint and format-check: exit0. Actual offline CLI currently returns
  infrastructure/unconfigured,fixture true,238resources,pending runtime and images.

Current code is ready for the final manifest-owner integration checkpoint; GitOps
reported remaining installer-only qualification projection/RBAC/wave edits in flight.
Those may change the exact platform output list and rendered resource count, so this
is not a final cross-agent source freeze. Actual recovery activation, CEL compilation/
denial, live identities/network/readiness and hosted CI remain pending. Required CI
must run manifest-quality.test.mjs explicitly (the azure-*.test.mjs glob excludes it).

Current source hashes (before pending manifest-owner integration):

| File | SHA256 |
| --- | --- |
| scripts/manifest-quality.mjs | 491DFCAF59977956424E7D8EAF3F50FD4ACA5A98B109FE9EAF1A26A1685D6011 |
| scripts/manifest-quality.test.mjs | 7D96F1040E9CD5EDF07A6FE1A76D4A9FCE674A6471BAFD4DA33F4D148A49D062 |

## Q-CI014-002 and final six-file runtime integration

Coordinator released the review freeze for this bounded repair. Mixed Azure paths
and exact local image/release/bootstrap metadata now select full with reason
mixed-azure-local-changes. Azure-only infrastructure and local-only manifest lanes
retain their semantics. Operations separately repaired Q-CI014-001: Azure gates run
cumulatively for full and infrastructure while application gates remain full-only.
The owned component workflow regression now requires that exact cumulative condition
for Azure steps and preserves full-only application marker/check assertions.

The new regression builds an actual Git diff, invokes the public selection CLI and
dispatches the real deployment-validation committed CLI for full mode. Malformed local
record JSON and a divergent immutable image patch must fail that dispatched gate.
Intended RED was Missing expected exception (release): infrastructure mode bypassed
local validation. After repair the same command passed for both faults:
`node --test --test-name-pattern='mixed Azure and malformed' scripts/manifest-quality.test.mjs`.
This checks real committed identity validation rather than only the classifier enum.

GitOps final platform runtime mapping now includes six files, adding installer-only
recovery-qualification-bindings.json; recovery retains its four files. The installer
List is explicitly parsed and its objects passed to native schema validation even
though no Kustomization deploys it. Source inspection rejects any ordinary Kustomize
reference to this installer-only file. A negative test corrupts an installer binding
schema and then adds an illicit Kustomization reference; both fail privately.

Focused verification:
`node --test --test-name-pattern='installer-only|mixed Azure and malformed|audited Azure-only|actual allowlisted' scripts/manifest-quality.test.mjs`
exit0,4pass. `node --test --test-name-pattern='required quality classifies' scripts/component-workflows.test.mjs`
was RED on new cumulative conditions then GREEN after its required-condition repair.
Scoped three-file ESLint exits0. Actual offline CLI after final manifest integration
returns infrastructure/unconfigured,fixture true,248 validated resources,pending actual
runtime/images. This total includes separately validated installer binding objects;
it does not assert those objects are deployed by ordinary Argo/Kustomize.

Source frozen for original verifier closure after final focused suite returns:

| File | SHA256 |
| --- | --- |
| scripts/manifest-quality.mjs | BFA46C9117FE364D9E30C3F9B3B7FB8F57734452087E732B0C820A6C3B6E748B |
| scripts/manifest-quality.test.mjs | 483FF717ECD525F30AE4E5658F06906132AACAE0C6B157676D83DD1275E12AB2 |
| scripts/component-workflows.test.mjs | 205C2A09F1A2005B3FB319FEB8886C919185F67E3623F2E3FB3D10D15CE2D6F7 |

No source edits after these hashes; no external publication/cloud changes. Whole-repo
checks and actual hosted/live Azure/admission/recovery qualification remain pending
under coordinator ownership. This author evidence does not close reviewer findings.

Final frozen-source combined recheck:
`node --test scripts/manifest-quality.test.mjs scripts/component-workflows.test.mjs`
exit0,37tests34pass3existing local/native skips0fail (65.7s). Three-file exact scoped
format-check and git diff--check exit0; hashes match the table immediately above.
Original verifier closure of Q-CI014-002 and combined CI001+CI002 behavior remains pending.
