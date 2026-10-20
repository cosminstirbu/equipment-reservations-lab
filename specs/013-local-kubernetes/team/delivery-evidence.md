# Delivery implementation evidence

Scope: T026–T030, baseline `4dd685c`, feature
`specs/012-local-kubernetes`, preparation `prep-design-012-03`.
This is author evidence, not independent approval or task completion.

## Standards and design record

Read AGENTS.md, constitution, protocol/coder role, engineering index, formatting,
testing, resilience and observability guides, plan, research, data model, runtime
contract, quickstart and tasks. `SPECIFY_FEATURE_DIRECTORY=specs/012-local-kubernetes
.specify/scripts/bash/check-prerequisites.sh --json --require-tasks --include-tasks`
resolved the intended feature. Both checklist files have no unchecked items. No
`.specify/extensions.yml` exists, so no implementation hooks apply.

Public tooling functions and CLI are the test boundary. Real validation, YAML
parsing, image classification and promotion-file generation remain in tests.
Deterministic validation/classification algorithms justify isolated tests because
those transformations are the behavior. Temporary build metadata plus a process
boundary double replace Docker's external command responsibility; the double
models `--metadata-file`'s `containerimage.digest` contract, not application internals.
GitHub gateway double models observed remote branch, commit, non-force ref update
and pull-request effects. Actual GitHub provider contract, race behavior against
GitHub, image build metadata/index proof and disposable cluster deployment remain
pending external execution. These doubles alone do not establish provider fidelity.
Workflow YAML tests establish static trust/pinning policy only, not successful runs.

No production retry is applied to GitHub writes; request timeout is 15 seconds,
errors are observable by HTTP status without response body/token logging. Ref writes
are non-force and based on the observed parent. Existing non-bot/human-changed
promotion branches are refused. Concurrent heads fail rather than being overwritten.
One stable branch and existing open PR are reused. Release provenance records exact
source SHA alongside seven GHCR image indexes; no initial digest is invented.

## Test-first and focused checks

- `node --test scripts/deployment-validation.test.mjs` initially failed
  `ERR_MODULE_NOT_FOUND` for the absent implementation; after implementation four
  behavior cases passed. Workflow case then failed ENOENT for absent workflows.
- `node --test scripts/promote-images.test.mjs` initially failed
  `ERR_MODULE_NOT_FOUND`; after implementation all three cases passed.
- `node --test scripts/deployment-ci.test.mjs` initially failed
  `ERR_MODULE_NOT_FOUND`; after implementation both cases passed.
- Latest combined command `node --test scripts/deployment-validation.test.mjs
  scripts/promote-images.test.mjs scripts/deployment-ci.test.mjs`: exit 0, 10 tests.
- Exact-file `npm run format -- FILE` after every JavaScript edit, then re-read.
  YAML is outside current quality script discovery, so exact local pinned Prettier
  was additionally invoked for `.github/workflows/{validate,release}.yaml`.
- Exact-scope ESLint command for all six owned JavaScript files with
  `--max-warnings 0`: exit 0.
- Full `npm run format-check`, `npm run lint`, `npm run check` deferred to coordinator
  freeze while concurrent coders write. Real workflows, GitHub writes/publication
  and settings changes were not invoked.

## Current behavior and integration gaps

Delivery owns six scripts and the two workflows only; it has not changed package
scripts, quality discovery, local overlay, task checkboxes or quickstart.
Coordinator must integrate all three test files in root `test:tooling`, extend YAML
format discovery if required, and retain frozen full-check evidence.

`deployment-ci.mjs publish` builds seven pinned production Dockerfiles with both
Linux architectures, `--push`, source labels and real Buildx metadata; validates
indexes after publication and emits one release JSON job output. It is guarded to
main push context. Publication is still separately authorized and unexecuted.
BrokerBootstrap's new real executable must exist before that seventh build works.

PR workflow is read-only with persisted checkout credentials disabled. It uses no
publish credential, no `pull_request_target`, and no package write. Main publish
job alone has package write; separate promotion job has contents/PR write.
All actions use researched exact SHAs. Main path classification excludes docs,
local deployment definitions and promoted digests, preventing publication loops.

The CI helper currently refuses invocation before any cluster/image mutation:
`CI deployment fixture integration pending`. Its public cluster adapter names
only equipment-ci/context kind-equipment-ci, loads local test images and uses
server-side schema dry-run before apply. Deployment coder must supply the real
fixture (generated temporary overlay, CA and private Secrets, actual bootstrap
ordering); no committed second environment and no production setup override.
Then wire CLI to build local images, create fixture, record private kubeconfig
for `deployment-smoke.mjs --ci`, and supply checksum-verified kind installation.
The eventual smoke must use actual deployed dependencies and production services.
T028 remains pending until this integration and runtime verification exist.

## T030 proposed quickstart addition for architect integration

Before the first release, the repository owner must separately authorize the
publication and promotion run. Enable Actions only under the repository's policy;
confirm the selected runner can pull base images and push GHCR packages. The
publication job requests packages:write through its job-scoped GITHUB_TOKEN.
Confirm each package's repository linkage and visibility/read access permit the
local Podman cluster to pull the committed immutable index; do not commit package
credentials or assume a newly published package is public.

The owner must allow GitHub Actions to create pull requests in repository Actions
settings if using GITHUB_TOKEN promotion. Contents:write and pull-requests:write
are scoped to the promotion job. Branch protection, organization rules or settings
may reject its proposal; stop and report the exact restriction instead of adding
an elevated personal token. A human reviews and merges the single
`automation/local-image-promotion` PR. If a human edits that branch, automation
stops and requires review rather than overwriting their changes.

The committed release must include the actual source revision and actual indexes
for inventory, reservations, notifications, web, database-bootstrap,
identity-bootstrap and broker-bootstrap, each containing Linux amd64 and arm64.
Setup intentionally rejects an absent first release. Only after separately
approved publication, reviewed promotion and merge should the local environment
pull and reconcile those images. A deployment-only promotion must not trigger
another publication. Editing workflows does not authorize publication, PR creation,
merging, repository settings changes or a real GitOps deployment.

## Follow-up author verification

Latest focused run now has 11 passing tests after a GitHub HTTP adapter contract
case (non-force PATCH, timeout signal and existing-PR reuse). Official
[GitHub reference API](https://docs.github.com/en/rest/git/refs?apiVersion=2022-11-28#update-a-reference),
[commit API](https://docs.github.com/en/rest/git/commits?apiVersion=2022-11-28#create-a-commit)
and [pull request API](https://docs.github.com/en/rest/pulls/pulls?apiVersion=2022-11-28#list-pull-requests)
were checked on 2026-10-20; the fixture matches documented request fields and
response effects. Real authenticated provider execution is still pending.

Added a failing narrow-diff regression proving the original whole-document
serialization lost unrelated comments. Promotion now replaces only the YAML
`images` value region, retaining other source text/comments; the regression passes.
PR deployment job additionally runs the production nginx HTTP suite with
`CONTAINER_RUNTIME=docker` before ephemeral cluster work. Images coder supplied
that runtime selector; no duplicate proxy test implementation was added here.

## T038 quality integration (additional coordinator assignment)

Ownership expanded only to scripts/quality.mjs, scripts/quality.test.mjs and root
package.json. Added `.yaml`/`.yml` to public source discovery; exact vendored
`deploy/argocd/install.yaml` is excluded because upstream checksum verification
requires original bytes. Authored sibling overlays and workflow definitions remain
format/check targets. Vendor hash remains
`90dc9094bf4c5964afd9c0e35d735e1c2fcbbda4f8e36799c092d9864ed65f50`.

Test design extends existing public `sourcePath` boundary. Real filesystem
fixtures for both authored extensions and existing authored/vendor paths retain
real discovery; there is no external double. Deterministic file classification
justifies this focused test; it asserts observable inclusion/exclusion and retains
existing generated/outside-root/symlink protections. New test first failed because
authored YAML returned null, then passed after implementation. Focused discovery
and existing path-safety tests: 2/2 passed. Exact-scope ESLint: exit 0.

Added separately invoked `npm run test:deployment` using deployment test file glob,
promoter tests and lifecycle tests. The glob includes deployment-smoke.test.mjs
when supplied, without hard-coding an absent file. Kubernetes/nginx-required
routing remains outside normal `test:tooling`/`npm run check`; normal tooling is
unchanged. This supersedes the earlier integration-request paragraph above.
No application/AppHost test boundary changed. Full freeze checks remain coordinator
responsibility after all workers stop writing.

`npm run test:tooling` after T038 integration: exit 0, 20 tests passed including
existing hook formatting/Allman tests and the new YAML discovery case. No normal
application or Kubernetes runtime tests were added to that suite.

Linux CI tool checksum assets read directly from official versioned upstream
locations (no host installation):
- kind v0.33.0 linux/amd64 SHA256
  `aee6151561422756b764a4ae28e7f44cda5af5a9eead3cc9985112b1de8d8e0d`,
  https://github.com/kubernetes-sigs/kind/releases/download/v0.33.0/kind-linux-amd64.sha256sum
- kubectl v1.35.8 linux/amd64 SHA256
  `874d5e72dbb819f43cff16bcd1e4f8bac5b7f2361fe1e55049b0a6c676fb0cbf`,
  https://dl.k8s.io/release/v1.35.8/bin/linux/amd64/kubectl.sha256

Added hosted-only checksum-verifying installation using private runner temporary
path and bounded read requests (15-second maximum, no retries). Static workflow
case first failed for absent tool installation, then passed. Actual hosted run
remains pending. No macOS tool, trust, DNS or VM installation/change was made.

## Current delivery status — supersedes earlier fixture/scope notes

Approved targeted Job-identity adaptation is implemented. Promotion's complete
allowlist is now four files: local release, root images, and only the scalar
nameSuffix values of the exact database/identity Job wrappers. Canonical release
JSON rejects duplicate/unknown fields, invalid/nonfinite values, preserves arrays
and sorts keys by Unicode codepoints (including supplementary characters). Hashing
uses the four exact public inputs and U64BE byte lengths. A separately calculated
Python hashlib/struct vector yields `-7ded14e44a9cb2fd`; the JS public derivation
matches it. Independent `deployment-validation.mjs jobs [ROOT]` recomputes freshness.
`promote-images.mjs refresh [ROOT]` changes only those two wrapper suffixes; it never
publishes, changes images or creates a PR. It validates all inputs/proposal before
temporary writes and rechecks public inputs before per-file atomic renames. Tests
cover stale/unknown wrapper fields, symlinks, unrelated-source preservation and
whole-proposal rejection before remote mutation. Real local wrappers remain
`-unreleased` because no genuine first release exists.

Author review identified that REST GET followed by non-force PATCH provides a
fast-forward safety check but cannot strictly compare the old value atomically.
Changed to documented [GraphQL updateRefs](https://docs.github.com/en/graphql/reference/git#updaterefs)
with beforeOid, afterOid and force:false (zero beforeOid for absent branch). One
server mutation atomically asserts the observed head. Transport regression first
failed against REST implementation then passed against the exact GraphQL payload.
No GitHub mutation was executed; authenticated provider verification stays pending.
REST version 2022-11-28 remains supported through March10,2028 according to the
[official version table](https://docs.github.com/en/rest/about-the-rest-api/api-versions).

The CI CLI now implements actual ephemeral fixture orchestration, superseding the
earlier intentional refusal. It builds local images; creates only equipment-ci
with copied canonical80/443 mappings; generates a temporary CA/leaf; reuses the
production credential bundle/private-resource builder; creates private state;
applies namespace/platform/physical-node storage adaptation; reloads CoreDNS;
adds canonical names only on the disposable hosted runner; renders actual local
manifests; transforms only declared application images to exact locally built
revision tags; applies ordered sync waves with server dry-run and bounded
Deployment/Job waits; and writes private smoke state. The CA key stays outside
pods. CLI invocation outside GitHub Actions stops before these actions.
The workflow starts loopback-only diagnostic forwarding for separately invoked
smoke and sets NODE_EXTRA_CA_CERTS before Node starts. No permanent CI environment,
production local image override, registry publish credential in PR, AppHost test,
or host/macOS setting change was introduced.

Structural validation defaults to immutable digests. Only the CI caller can supply
an exact list of equipment-ci/known-name:40hex tags plus that committed revision;
arbitrary names/registries/tags are rejected and storage/resource/Secret policy
remains enforced. Default-reject/CI-exact-allow/bounds/unknown-image tests pass.
Actual pinned kubectl offline rendering and CI transformation checked 14 platform
and25 application resources, exit0; these are structural fixtures, not claims that
images were built or a deployment succeeded.

[Docker Buildx metadata](https://docs.docker.com/reference/cli/docker/buildx/build/#metadata-file)
contract was checked against official docs. A real OpenSSL plus real kubectl-render
fixture check verifies generated TLS chain, private file modes, absence of CA key
from provisioned resources, exact disposable mutation scope, and two derived Job
names. Docker/kind/Kubernetes/host mutations remain faithful process-boundary
doubles in this test; actual disposable-cluster proof is still pending.

Root `test:tooling` additionally includes the source coder's two pure frontend
configuration tests. Rerun produced22 tests:21 passed, existing C# Allman formatter
hook failed during parallel workspace changes with dotnet MSBuild workspace-load
exit1 after61s. New frontend2/2, YAML discovery and other tests passed. Do not reuse
the earlier20/20 result as current full-suite approval; coordinator freeze rerun is
required. Focused delivery tests and exact ESLint pass; full repository checks
remain pending freeze.

## T030 precision: public package prerequisite

Promotion deliberately receives no package credential and production containerd
has no registry credential override. GHCR packages therefore must allow anonymous
pulls before promotion index verification and local setup can succeed. A first
GITHUB_TOKEN publication may create private packages. After separately authorized
publication, the owner must explicitly set appropriate public package visibility
and repository linkage, then rerun the failed promotion job. No elevated token,
automatic visibility/settings change, implicit publication or fabricated digest
is introduced. Record the real first-publication/package/promotion evidence only
when those external actions are authorized and executed.

## Final scoped handoff snapshot

Coordinator-approved separate provider fixture test now lives in
`scripts/deployment-ci-contract.test.mjs`, executed by the deployment job only after
checksum-verified tools install. It explicitly requires kubectl1.35.8 (PATH or
EQUIPMENT_KUBECTL); system kubectl1.37.1 is not substituted. The unit CI test file
retains no kubectl prerequisite. `test:deployment` discovers both via the glob.

Latest exact scoped command:
`EQUIPMENT_KUBECTL=/private/tmp/equipment-k8s-tools/kubectl node --test
scripts/deployment-ci-contract.test.mjs scripts/deployment-ci.test.mjs
scripts/promote-images.test.mjs scripts/deployment-validation.test.mjs`:
exit0,20/20 passed. Exact ESLint with --max-warnings0 for all owned scripts and
Prettier check for scripts/package/workflows also exit0. No actual cluster was
created, no host/DNS/trust setting changed, no image was published, and no GitHub
write was invoked by these checks. OpenSSL temporary files were deleted afterward.

Changed scope: scripts/deployment-validation{,.test}.mjs,
scripts/promote-images{,.test}.mjs, scripts/deployment-ci{,.test}.mjs,
scripts/deployment-ci-contract.test.mjs, .github/workflows/{validate,release}.yaml,
scripts/quality{,.test}.mjs, package.json and this evidence. No task/checklist verdict,
quickstart or actual deployment manifest was changed by delivery.

Remaining evidence: coordinator's revision-frozen full format/lint/check and normal
tooling rerun; actual hosted workflow execution; real buildx multiarchitecture image
indexes; authorized package visibility/publication/PR/promotion; actual deployed
smoke and local human trust/browser/VM-restart acceptance. None is implied by the
focused structural/provider-boundary results above.

## Narrow integration repair: loopback TLS and current CI source

Read the root-approved plan/runtime loopback-TLS correction. Real generated-certificate
regression first failed because X509Certificate.checkIP('127.0.0.1') returned
undefined. Added IP:127.0.0.1 alongside both DNS SANs to the ephemeral leaf. Actual
OpenSSL chain verification and Node X509 checkIP now pass; wrong127.0.0.2 remains
rejected. The updated shared private builder's fourth resource is asserted as
argocd/argocd-server-tls, type kubernetes.io/tls, with the same private leaf/key.
Assertions compare private material without dumping it. CI still does not install
Argo; provisioning its unused dedicated Secret preserves the shared builder contract.
No host trust or certificate store changes, fake certificate-validation mock or TLS
bypass was introduced.

Re-ran the contract against the current raw Job templates containing Sync hooks and
HookSucceeded,BeforeHookCreation. Tests recompute exact suffixes from those current
bytes; raw CI orchestration still waits actual Job Complete despite inert Argo hook
annotations. No initial release/wrapper digest was fabricated or changed.

Author review also caught a CI regression after the first genuine local promotion:
rendered images would be GHCR digests, no longer logical names, and the helper could
have tested an older published image. Added a failing regression showing the old
GHCR digest was retained. CI now reads exact known-name image aliases from committed
local Kustomization and maps those references to the newly built source revision.
Unknown/ambiguous names/references are rejected; pinned third-party images remain
pinned. Regression passes. This remains only in the isolated CI fixture, with no
production image override.

Latest focused four-file test command with EQUIPMENT_KUBECTL selecting checksum-
verified1.35.8: exit0,21/21 passed. Exact changed-scope ESLint/Prettier also pass.
Delivery scope is frozen again; real hosted CI and Argo/browser TLS runtime remain
pending integrated/external evidence.

## Implementation repair round1 — SEC-IMPL-002 and Q-I005

Historical initial classify/promotion/build RED history is unchanged: the original
three implementations followed missing-module failures, not behavior-level assertion
failures. Coordinator's EX-012-001 is scoped only to that historical gap; no later
regression RED is presented as retroactive evidence. This repair contains new
behavioral RED/GREEN evidence and does not change reviewer verdicts or task state.

### SEC-IMPL-002: exact-parent generation and preservation

Before repair, `node --test scripts/promote-images.test.mjs` exposed three concrete
failures: advancing main did not reject before writing, an existing promotion parent
with an unrelated human field was overwritten from checkout, and the generated
proposal retained stale-checkout security settings instead of the verified parent.

Promotion now requires release.sourceRevision and checked-out HEAD to match observed
remote main. It resolves every transformed file and public hash input through the
exact parent Git commit -> exact tree -> exact blob object. Commit/tree identifiers,
blob metadata and Git blob content hashes must agree; source UTF-8, regular file
modes and complete trees are checked. Symlinks, absent required files and incomplete
or ambiguous input are refused. No transformed source bytes come from checkout.
The new immutable-transport cases first failed for resolving the tree directly
without a verified parent-commit lookup and accepting changed bytes under an old
blob ID; both pass after the identity checks.

For an existing promotion, all public hash inputs and non-image/non-suffix source
text must match the verified main snapshot, otherwise automation refuses before
mutation. The complete branch comparison is also checked: every commit must be a
recognized bot promotion; all cumulative changes must stay within the four allowed
files and wrapper changes must contain only suffix edits. Earlier human commits,
unrelated cumulative files or main advancement cause manual-review refusal. The
additional history regression first returned managed:true for an earlier human
commit, then passed. Pagination bounds fail closed (more than100 commits or a
300-file capped response is not treated as complete). These conservative refusals
preserve human work; automation does not rebase, reset or overwrite it.

After constructing and validating the four-file proposal, automation rechecks
main/head before creating a commit on that exact parent. Existing atomic GraphQL
beforeOid/afterOid/force:false CAS remains. Source revisions, action pinning and
job-scoped permissions remain unchanged. Authenticated GitHub writes were not run.

Provider-boundary contracts checked against official
[commit comparison](https://docs.github.com/en/rest/commits/commits#compare-two-commits),
[Git trees](https://docs.github.com/en/rest/git/trees#get-a-tree), and
[Git blobs](https://docs.github.com/en/rest/git/blobs#get-a-blob) documentation.
Transport fixtures retain real generation, canonicalization, blob identity checks,
validation and CAS request construction. Actual authenticated provider proof remains
an external gate, not something these HTTP fixtures establish.

### Q-I005: validate committed state before regeneration

Added the public committed-state validator with a minimal read/mode interface before
implementing checks, so the new tests exercised assertions rather than missing
imports. The focused command with test-name pattern `committed real release|initial
committed` failed with missing expected stale/unreleased exceptions. Implemented
strict initial state (absent release, empty image aliases, exact -unreleased wrappers)
and released state (strict genuine-record schema, exact seven aliases, independently
recomputed current Job suffixes). Both states require valid public builtin
ConfigMapGenerator inputs and Job templates; local generator uses merge. Raw hash
paths/bytes remain exactly the approved design despite Q-I002's representation change.
Malformed release JSON, invalid public generator, stale initial suffix and missing
inputs fail. A config-only change with stale committed suffixes fails, and the exact
configuration-only refresh restores a pass. No digest was fabricated in repository
artifacts; synthetic releases exist only inside isolated test fixtures.

`node scripts/deployment-validation.mjs committed` is explicit in PR quality and
PR deployment jobs and in main classification. CI helper validates before image
build, cluster creation, credential generation or image/Job-name transforms. A
separate regression first observed three external process calls on invalid input;
it now observes zero calls and no generated credential directory. Workflow wiring
first failed its missing committed-validation assertion, then passed. The actual
working tree reports `Committed deployment state: unreleased`; this is not a claim
that first publication or deployment prerequisites are satisfied.

### Bounded actual deployment-test runner

Package `test:deployment` now invokes the public quality CLI runner, discovering all
`deployment-*.test.mjs`, promoter and lifecycle modules with no default skipping.
Files run serially because new RabbitMQ retention/live kind/native nginx provider
lanes share the existing measured VM resource budget. This is specific to deployment
provider files; normal backend/application parallel scheduling is unchanged.
Each file runs in a separate actual Node process with a hard900000ms parent deadline,
SIGTERM then a5-second SIGKILL fallback. Selected files are supported via `-- FILE...`.
DEPLOYMENT_TEST_TIMEOUT_MS can only reduce that bound (1..900000).

A real child-process regression first let a synchronous800ms fixture exit0 despite
a100ms budget; it now fails on deadline with the named file. Another first ran only
the first selected file; it now records first-start/end then second-start/end.
No AppHost, Kubernetes or container runtime is required by these normal tooling
runner tests. Native `--test-timeout=100` was separately observed allowing a blocked
2000ms fixture to pass, so it is not used as a substitute for a parent file deadline.

Workflow actual provider regressions now run through this serial runner after
checksum-pinned tools and before the application kind cluster: broker retention,
configuration rollout, real-controller ingress and native reverse proxy. Their
actual execution evidence belongs to the assigned provider owners/coordinator;
delivery did not rerun those heavy lanes during parallel repairs. Deployment job
budget is60minutes; no publish credential was introduced into PR execution.

### Final scoped verification and documentation handoff

Exact command:
`EQUIPMENT_KUBECTL=/private/tmp/equipment-k8s-tools/kubectl npm run test:deployment --
scripts/deployment-ci-contract.test.mjs scripts/deployment-ci.test.mjs
scripts/promote-images.test.mjs scripts/deployment-validation.test.mjs`:
exit0,30/30 (1+6+12+11), actual serial runner, no default skips.
`node --test --test-name-pattern='deployment runner' scripts/quality.test.mjs`:
exit0,2/2. Exact owned-scope ESLint --max-warnings0 and Prettier checks: exit0.
Global format/lint/check and full provider runs remain coordinator-owned at freeze.
No publication, PR creation, GitHub mutation or host settings change was executed.

Proposed quickstart update sent to architect (reserved documentation not edited):
run committed-source validation before CI transforms; use the separate serial
`npm run test:deployment`, with optional selected files, pinned kubectl1.35.8 via
PATH/EQUIPMENT_KUBECTL and CONTAINER_RUNTIME=podman|docker. Explain the fixed file
budget, existing-VM resource reason and explicit unreleased/publication distinction.
Delivery code/package/workflow scope is frozen for the next independent review.
