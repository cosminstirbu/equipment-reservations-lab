# Branch release implementation evidence

Date: 2026-10-22. Feature013, T055/T056; based on `623bfaf` plus retained
uncommitted diagnostics work. Author record only; independent review, current
verification, feature acceptance and external execution remain separate gates.

## Boundary and test design

Extended the existing public publication CLI matrix, retaining production entry,
guard, committed-deployment validation, build loop, release validation, index
verification and output. The existing narrowly scoped Docker executable-boundary
preloader emits the actual metadata and OCI multiarchitecture index JSON contract
and records attempted build/inspect effects. It is a provider double, not evidence
of actual GHCR publication. No owned application collaborator is substituted.

Each allowed matrix context verifies exact source SHA, all seven image digests,
all seven dual-platform pushes, revision labels and all seven index inspections.
Each denied context verifies nonzero result, publication prerequisite diagnostic,
zero Docker calls and empty release output. Matrix18 cases: main push/manual,
manual feature/nested branches, non-main push/nested push, push/manual tags,
manual pull-request ref, PR/workflow_call contexts on main/feature, unsupported
schedule on main, and empty/bare-branch-prefix refs for push/manual.

Parsed workflow contracts independently verify classifier predicate, main push
trigger, explicit main promotion guard, serialized global concurrency, least
permissions, pinned actions, checkout nonpersistence and required validation.
The existing real Bash changes-step fixture runs manual dispatch on a nested
feature ref with empty BEFORE in a directory without Git checkout; it verifies
`publish=true` without a Git diff. Existing path classification tests remain.

## Strict test-first chronology

Only scripts/deployment-ci.test.mjs and deployment-validation.test.mjs were edited
after independent prep approval. Before either production file changed:

`node --test --test-name-pattern='publication CLI permits manual|release classifier permits manual|workflow trust boundaries keep PR' scripts/deployment-ci.test.mjs scripts/deployment-validation.test.mjs`

Windows Node24.15: exit1; three tests, zero passed, three independent intended
failures: allowed workflow_dispatch on refs/heads/feature was rejected with the
old main-only publication prerequisite; classify.if was main-only instead of the
approved event/ref predicate; promote.if was missing instead of explicitly main.
The promotion assertion is in a separate test so classify failure cannot mask it.
Evidence was sent to coordinator, and production edits waited for explicit GO.

After GO, changed only release.yaml classifier/promotion condition and the
deployment-ci.mjs publication guard. Targeted command then exited0,3/3 passed;
the complete18-case public CLI matrix executed. Exact-file format/re-read and
scoped ESLint all exited0. No historical diagnostics exception was used.

Cached Linux Node24.15, no network, read-only repository mount, temporary /tmp:

`node --test scripts/deployment-ci.test.mjs scripts/deployment-validation.test.mjs scripts/promote-images.test.mjs`

Exited0:49 tests,49 passed,0 skipped. Includes actual Bash manual changes step.
This run preceded the subsequent temporary-diagnostics retirement and exact-case
promotion design follow-up, so it is not final evidence for those later revisions.

## User-directed retirement of temporary build diagnostics

The user separately requested removing the temporary diagnostic job/mode introduced
by623bfaf. Work was scoped to overlapping files, not git-reverting the whole commit.

Before removal, added independent regressions and ran:

`node --test --test-name-pattern='retired diagnostic build CLI|validation no longer exposes' scripts/deployment-ci.test.mjs scripts/deployment-validation.test.mjs`

Windows: exit1,2 failures for intended reasons. Old diagnose-build invoked Docker
and recorded `docker invoked`, rather than rejecting before providers; old Validate
workflow still contained image-build-diagnostics job rather than omitting it.
These results were reported before production removal.

Removed only that Validate job and CI builder diagnostic option/cache-only output/
diagnose-build CLI branch. Removed the diagnostic-only builder test. Preserved the
real both-stream build failure test by moving it to normal publication, and retained
cleanup success/primary-failure coverage through normal builds with faithful written
metadata JSON (production metadata parsing remains real). No useful shared output
handling or ordinary local/publish behavior was removed.

Targeted retirement plus retained release/stream/cleanup checks exited0,7/7 passed.
Scoped ESLint and exact-source formatting/re-reading passed. No live Docker build,
GHCR publication, promotion, workflow dispatch, commit or push was performed.

## Exact-case main promotion follow-up

Coordinator identified GitHub expression case-insensitive string comparison. After
independent preparation approval, tests were updated first, without production edits.
The existing CLI matrix adds manual Main/MAIN publication success and push Main/MAIN
rejection, giving22 total contexts (six allowed,16 denied). Real Bash manual cases
cover Main, exact main, MAIN, feature and nested feature; every case must publish,
while only exact lowercase main emits promote=true. Parsed workflow contracts
independently require classify output mapping and both promotion dependencies.

Before flag implementation, cached Linux real Bash command:

`node --test --test-name-pattern='manual branch release|workflow trust boundaries' scripts/deployment-validation.test.mjs`

Exited1:2 tests,0 passed,2 independent intended failures. Promotion still used the
old github.ref expression instead of the controlled output; actual Bash for Main
emitted only publish=true, missing required promote=false. Results were sent to
coordinator and implementation waited for explicit GO.

After GO, changed only release.yaml: case-sensitive Bash comparison sets the
controlled true/false promote output before manual early return; classify exposes
that output; promotion depends on both classify and publish and gates on the output.
CLI comparisons remain case-sensitive. Global serialized concurrency, permissions,
action pins, nonpersistent checkout credentials, mandatory validation, immutable
source SHA publication and no non-main promotion effects remain preserved.

The final combined affected Linux suite ran after retirement and exact-case flag
implementation: `node --test scripts/deployment-ci.test.mjs scripts/deployment-validation.test.mjs scripts/promote-images.test.mjs` exited0,50 tests,50 passed,0 skipped.
It executed the complete22-context CLI matrix and all five real Bash manual refs,
plus retirement, normal build progress/cleanup, committed-state and promotion
regressions. Its result is reported to coordinator for final snapshot-matched
recording. All owned source was formatted/re-read after edits;
scoped ESLint exited0. No historical test-first exception was used for this batch,
and no actual release/publication/promotion/Actions execution was performed.
