# Manifest-only change quality design

Date: 2026-10-22. Inspected baseline: `9f5e592ab89faa299740ae693a6de3af8fcac942`.
Current requirements: FR-011, AC-3.8/AC-3.9 and SC-013; retain FR-012 publication
behavior and all earlier pending feature gates. Preparation quality and security
reviews passed for T072; see [quality](manifest-quality-preparation-quality.md) and
[security](manifest-quality-preparation-security.md). Scoped implementation and
[quality](manifest-quality-quality-02.md)/[security](manifest-quality-security-02.md)
reviews now pass. [Convergence](manifest-quality-convergence.md) retains workflow
qualification and full-feature acceptance as pending.

## Scope and conservative selection

Retain the parent workflow's required `quality` job ID/name and downstream needs.
Within that job, add a readonly classifier before expensive setup. Proven pull_request
comparisons and proven exact-main push comparisons may choose manifest quality. Manual
dispatch retains full quality. Branch names, PR labels and promotion markers alone
never establish eligibility.

The exact eligible path set is:

- `deploy/environments/local/kustomization.yaml`
- `deploy/environments/local/jobs/database/kustomization.yaml`
- `deploy/environments/local/jobs/identity/kustomization.yaml`
- `deploy/environments/local/releases/NAME.json`, with NAME one of the seven fixed
  application/bootstrap component names.

These are the current generated local promotion outputs covered by static validation.
All other paths, including other deployment manifests, source/tests, scripts, workflow,
Docker/ignore/build inputs, dependency/tool configuration and unknown metadata, select
full quality. Expanding the allowlist requires actual validation coverage and review;
this is not a blanket policy waiver for every YAML file. Empty/ambiguous comparisons
also use full quality. Added/deleted allowed records remain eligible, but committed
consistency must validate the resulting state; eligibility is never validation success.

For PRs, use the real base SHA and immutable checked-out event SHA. Fetch enough Git history
for merge-base, then inspect `git diff --name-status -z` from merge-base to the selected
source. Parse NUL records and both rename/copy endpoints; allow only supported statuses.
Missing history, invalid SHA/ref, Git failure, unsupported status, malformed paths or
any outside endpoint chooses full quality. No whitespace/newline splitting, shell eval
or branch-name interpolation. Renaming an allowed file from a script remains full.
Read filesystem symlink/type state where needed and reject unsafe generated paths in
validation. Do not alter component impact/publication baselines or original rerun intent.

For main pushes, do not use event.before alone. Discover the latest trusted successful
full-quality source whose SHA is an ancestor of the selected source, then inspect the
entire diff from that source. Verify repository ID/name, exact main branch, push event,
validate.yaml workflow identity, successful quality job and a fixed successful
`Full application quality completed` step. That marker executes only after all full
lane checks succeed. Do not infer full mode from job success alone: a successful static
lane does not advance this baseline. A failed overall workflow may still contain a
successful full-quality job; component failures do not invalidate that quality proof.
Bound Actions discovery to 10 pages of 100 records and 60 seconds, with 15-second
per-request deadlines and existing bounded read retries. Missing/incompatible marker,
unknown job evidence, API failure/expiration, history uncertainty or no ancestor proof
chooses full quality. No new receipt/archive subsystem is needed for this baseline.

This prevents a failed source-quality push followed by a manifest merge from bypassing
application checks before outstanding components publish. The diff still contains the
unchecked source change, so mode remains full. Successful manifest-only pushes never
erase that obligation. Main component selection/publication itself remains unchanged;
it runs only after the applicable required quality job succeeds. Manual always full.

The no-application/no-image-build promise applies to the lightweight quality gate,
not to independent downstream main publication backlog. A manifest-only PR selects
no component builds. A main manifest change adds no image impact, but a component
with already full-quality-validated yet unpublished inputs may still build/publish
downstream according to FR-013/FR-022. Unvalidated source always forces full quality.

Implement the classifier/static seam in a small `scripts/manifest-quality.mjs` and
`scripts/manifest-quality.test.mjs`, consuming current component state validation.
Public classifier returns `{mode,paths,reason}` with mode manifest/full and fixed safe
reason; CLI emits controlled Actions outputs and a fixed mode summary. Git is real;
only transport/tool boundaries are replaceable. Source changes to this helper themselves
select full quality. Keep wrapper diagnostics off machine stdout where JSON is consumed.

Freeze public helper seams before dependent workflow edits:
`selectQuality({root,event,sourceRevision,baseRevision,fullQualityBaseline})` returns
the mode/paths/reason object; `discoverFullQualityBaseline({repository,sourceRevision,
gateway,root})` returns verified ancestor evidence or null; `validateStaticDeployment`
accepts root and explicit pinned kubectl executable. New main lookup uses read-only
Actions authority only; PR classification needs no token or credentialed lookup.

Approved additive state interface: `readComponentState` retains records/missing/status
and also returns `jobSuffixes: {database, identity}`. Each suffix is derived from the
actual validated public configuration, Job template and corresponding component
record/wrapper, or -unreleased for an absent component. The frozen validator seam is
`validateStaticManifests(text, state)`: it consumes this validated context to check
exact rendered Job identities, without rereading unrelated files or attempting to
derive configuration-sensitive hashes from component records alone. This is a narrow
context addition, not a new image allowance or change to static/runtime policy.

## Applicable quality branches

The unchanged full branch installs the .NET SDK/frontend dependencies and runs current
format/lint/full application checks and current tooling regressions. The manifest branch
installs root Node tooling only; no .NET/frontend restore/build, application test, container
runtime, cluster, image build or publication operation is invoked. Both branches must fail
the same required quality job on validation failure. Required final summary reports which
quality mode ran; an empty component selection must not hide a failed quality/static gate.

Manifest branch checks are:

1. Scoped `npm run format-check -- <existing changed eligible files...>` through the
   repository helper. Pass exact paths as process arguments, never shell-expanded text.
   Deleted files have no formatting target but remain part of classification/state checks.
   The helper already supports YAML/JSON paths without loading Roslyn.
2. `node scripts/deployment-validation.mjs committed` for strict component schema and
   repository/source/run provenance shape, overlay-reference equality, generator config
   and available bootstrap suffix consistency. This validates committed data, not live
   GitHub producer success or GHCR contents; no new credentialed network check is added.
3. Real pinned `kubectl kustomize deploy/environments/local` with finite process timeout
   and output bound, followed by the existing structural/security manifest policy using
   a narrow partial-state extension. This catches actual builtin generator/Kustomize
   failures instead of merely asserting source YAML fields.

Reuse kubectl 1.35.8 and its already-reviewed Linux amd64 SHA256
`874d5e72dbb819f43cff16bcd1e4f8bac5b7f2361fe1e55049b0a6c676fb0cbf`.
Install only kubectl into runner temporary tooling using the existing bounded download
and checksum pattern; no kind, kubeconfig, API server, trust installation or runtime.
Use a 60-second render deadline, 16MiB captured public manifest bound and existing
bounded failure rendering. The quality job's existing 30-minute maximum remains.
Public manifests contain secret references only; raw private resources are never rendered.

Partial state must remain verifiable without fabricated digests. Read/validate complete
component metadata first. A static-only policy option may accept bare image NAME exactly
when that known component is absent from validated records; all present component images
must exactly equal their record's image@digest and all third-party images retain immutable
digest requirements. Reject unknown bare aliases, tagged substitutes, unexpected images,
Secret resources, missing resource bounds, unsafe storage/deletion settings and malformed
resource identity exactly as existing policy requires. The complete runtime/setup validator
keeps rejecting missing components. Never route this exception through generic CI image
overrides or make the ordinary runtime `manifests` command silently accept partial state.

The missing-component allowance is slot-specific, not global image-name permission.
In namespace equipment require each expected unique workload/container slot: Deployment
inventory/reservations/notifications/web with same-named regular container; database
and identity bootstrap Jobs with their validated current suffix (or -unreleased) and
same-named regular container; and Deployment rabbitmq initContainer definitions for
broker-bootstrap. Verify all seven expected slots exist exactly once. Only that slot
may retain its component alias when its record is absent. When present, its rendered
image must equal the record even if a root-overlay patch overrides the image after
Kustomize transformation. Reject moved/duplicate/missing slots and bare aliases in
any unrelated container; never mutate rendered YAML or substitute fake digests to pass.

These checks establish current required manifest shape/policy, component metadata schema
and actual Kustomize semantics. They do not claim complete Kubernetes OpenAPI validation,
provider admission, application behavior, compatibility, runtime readiness or publication
success. No kubeconform/schema-download dependency is needed for this explicitly bounded
gate. Other manifest areas stay full quality until coverage is deliberately expanded.

## Generator correction and test design

Coordinator owns the generator repair in scripts/promote-images.mjs and its existing test.
Generated PR files must match repository formatting at creation, including image entry
format and bootstrap/record formatting. Capture intended formatter-regression failure
before correcting generation; preserve component field allowlists/provenance/CAS behavior.
This correction is separate from skipping unrelated application checks on eligible PRs.

Classifier tests use temporary real Git repositories and public CLI, retaining merge-base,
NUL diff/status parsing and state checks. Cover allowed promotion paths, nested branch
labels without trust, mixed source/scripts/workflows/build inputs, unknown manifest paths,
rename from an outside endpoint, deletion, empty comparison, missing history and malformed
metadata. Control actual external Git failure at its process boundary where necessary;
do not mock an internal classifier return to prove fail-closed behavior.
Main regressions cover successful full-quality ancestor plus manifest diff selecting
static, earlier failed/unvalidated source plus later manifest merge staying full,
successful static jobs not advancing the baseline, successful quality inside a failed
component workflow, wrong repository/ref/event/workflow/job/marker or nonancestor proof,
pagination/budget exhaustion and missing API evidence falling back to full. Manual
dispatch remains full even when its files match the allowlist. Narrow Actions HTTP
fixtures follow the existing official workflow-run/job step schemas; real Git proves
ancestry/diff behavior. No new remote test run is authorized.

Static tests retain real state/schema/parser/policy collaborators. Use the pinned kubectl
against actual local fixtures for valid initial/partial/complete rendering and a broken
generator case; record provider/tool contract evidence. Supplement with narrow process
fixtures for deterministic timeout/missing executable/failure reporting. Assert missing
known aliases are permitted only for absent records in static context, mismatched/unknown
aliases still fail, and runtime completeness checks still fail. Tests must observe the
public command's result and diagnostics, not private call counts/source snapshots.

Workflow contract/real shell tests establish both branch conditions, required quality ID,
downstream graph and summary mode, root-only install/static commands and absence of app
test/build/runtime/image operations in the manifest lane. Source/mixed changes still run
the unchanged full lane. Keep existing full required tests and semantic workflow checking;
manifest-only quality does not waive implementation verification of the helper/workflow.
Capture intended red before each changed behavior; prior exception scope does not apply.

## Ownership, verification and process

Architect owns this design and feature plan/tasks/quickstart/runtime prose. Coordinator
owns generator+regression repair and assigns explicit disjoint ownership of helper/test,
deployment validator extension/tests and workflow/tests before code. Never format or
rewrite another worker's active files. Shared validator/workflow changes serialize with
their owners. No new service/infrastructure, publication, remote workflow run, commit or
push is authorized. Full feature acceptance stays pending.

Preparation gates precede dependent code. Run focused real-Git/static/Kustomize/workflow
and formatter regressions, format-check/lint and applicable full implementation checks;
record source/environment/exits/unavailable prerequisites. Missing pinned kubectl is a
pending validation prerequisite, not a passing static gate. Inspect privacy/path trust,
partial-state boundaries and generated formatting manually. Final quality/security and
convergence remain independently owned. Constitution/testing/tooling/formatting guides
apply; narrower verification for proven metadata-only changes adds no policy exception.
