# Manual branch release design

Date: 2026-10-22. Feature: 013-local-kubernetes. Requirement mapping:
FR-012, AC-3.4 and SC-010; preserve FR-011/FR-013 and AC-3.1–AC-3.3.
Preparation verdicts remain pending. No external execution is authorized here.

## Behavior and trust boundaries

Keep the existing `workflow_dispatch` and main-only push trigger. Broaden classify
eligibility to exactly `(push and refs/heads/main) or (workflow_dispatch and a
nonempty refs/heads/ branch)`. A branch name containing `/` is valid. Tag, pull
request, reusable-workflow, empty-ref and unsupported-event contexts are rejected.
Use the same event/ref predicate at the publication CLI boundary before validation
or Docker; neither a manual event alone nor a main ref alone is sufficient.
GitHub workflow expressions use trusted context values, never interpolated shell
source from branch names. Environment values consumed by shell remain quoted.

Manual dispatch deliberately publishes without a push diff, including documentation
or deployment-only branch changes. Automatic main push retains current application
change classification and no recursive publication for deployment-only changes.
Committed-deployment validation, full required application checks, multiarchitecture
builds and index verification remain in the selected branch workflow. The selected
branch supplies application code and workflow code: dispatch is an authorized
maintainer operation against reviewed repository branch content, not untrusted PR
execution. No fork/PR trigger, arbitrary repository input, or alternate token is added.

Publish retains `contents:read`/`packages:write`; promotion retains only its existing
`contents:write`/`pull-requests:write`. Keep action SHA pins and checkout credential
nonpersistence. Preserve global `local-application-release` concurrency with
`cancel-in-progress: false`, so manual branch and main runs serialize. Do not switch
to per-branch concurrency, which could race registry/promotion behavior.

Use the selected run's exact `GITHUB_SHA` in source-revision tags/provenance, not
branch-derived tags. Preserve immutable multiarchitecture OCI index digests and
validated output. A non-main manual run publishes images only: add an explicit
`refs/heads/main` guard to promotion, independent of publish success. Main push or
main dispatch may follow existing promotion logic. Feature branch publication never
updates deployment references or opens a promotion PR, and does not establish a
reviewed release or satisfy T031 adoption/drift acceptance. An authorized future
main release supplies the normal reviewed promotion path.

Exact-main enforcement must account for [GitHub expression comparison semantics](https://docs.github.com/en/actions/reference/workflows-and-actions/expressions#operators):
string comparison ignores case. Thus a workflow `github.ref == 'refs/heads/main'`
guard alone also matches a distinct branch named `Main`. Compute a controlled
`promote=true|false` output in the real changes-step Bash using case-sensitive
`[[ "$GITHUB_REF" == 'refs/heads/main' ]]`, before the manual early return. Keep
the existing publish output. Expose classify.outputs.promote; promotion depends on
both classify and publish and gates on that controlled flag. This is a technical
enforcement clarification of the existing exact-main requirement, not a policy change.

## Test design

Extend the existing publication CLI event/ref matrix in
`scripts/deployment-ci.test.mjs`; keep its public Node entrypoint and production
guard/validation/build/index/output collaborators. The Docker boundary shim follows
the existing documented metadata/index JSON contract and records observable build
effects. It does not prove real GHCR publication. Before implementation, capture a
failure for allowed manual feature and nested feature branches; after implementation
assert exact source SHA and all seven dual-platform pushes/index verifications.

Retain main push/manual success; assert push feature, PR, workflow_call, tag ref,
empty ref and branch-prefix-only ref fail with zero Docker calls and no release
output. Include unsupported-event/main-ref and manual pull-request ref combinations
so each guard condition is independently exercised. This extends the existing suite
rather than creating a separate policy-only helper or duplicated tests.

Add manual `refs/heads/Main` as publication success with promotion false, exact
lowercase main as promotion true, and push `refs/heads/Main` as CLI rejection before
Docker. Execute the real Bash changes step with both case-distinct branch refs and
assert separate publish/promote outputs; inspect promotion's controlled-output gate
and both dependencies. Preserve automatic branch trigger restrictions.

Extend parsed workflow contract assertions in
`scripts/deployment-validation.test.mjs`: classify event/ref eligibility, push main
trigger, manual trigger, promote main guard, global serialized concurrency, least
permissions, pinned actions, credential handling and unchanged required validation.
Execute the existing real Bash changes step for manual dispatch with empty BEFORE
and no Git checkout; it must emit `publish=true` without running Git diff. Keep
automatic application/deployment classification regressions. YAML assertions alone
do not prove CLI rejection; CLI subprocess tests alone do not prove job permissions.

No new dependency/library, production process abstraction or infrastructure is
needed. Follow formatting/testing/tooling guides and existing diagnostics policies.
Run affected Node suites through available Git Bash where needed, format-check,
lint and applicable required checks; record exact snapshot/environment/exit status
and unavailable prerequisites. No live branch publication is required by this
implementation batch; future real registry evidence requires separate authorization.

## Artifact scope and process

Targeted speckit-plan/tasks follow-up preserves T001–T053 and existing unchecked
gates. Setup-plan/tasks succeeded with explicit feature directory/no-persist using
Git Bash; no extension hooks exist. Existing business model/runtime contracts remain
unchanged. The quickstart now documents intended dispatch/promotion behavior;
dependent implementation and independent review remain explicit tasks. Historical
diagnostics exceptions/blockers remain untouched and do not waive this batch's
test-first requirements. Coordinator owns bounded run-state and final convergence.

## Temporary diagnostics retirement — owner follow-up 2026-10-22

The owner requested reverting the earlier commit that introduced a dedicated
diagnostic job. Retire `623bfaf`'s `image-build-diagnostics` job in
`.github/workflows/validate.yaml`, its diagnostic-only `buildImages` option and
`diagnose-build` CLI route/tests. Use targeted edits because those files now contain
uncommitted output-handling and branch-release improvements. Preserve normal build,
publish, metadata, both-stream diagnostics and cleanup contracts. Do not revert the
whole file or remove useful general error evidence.

Extend existing workflow and public CLI tests first: prove the temporary job is
absent and the retired CLI command fails without invoking Docker. Remove obsolete
diagnostic-mode expectations only after replacement regressions fail for the intended
reason. Test any retained cleanup path through normal build metadata failure/success
instead of keeping a diagnostic-only caller for test convenience. The builder option
is internal implementation plumbing; remove it rather than adding compatibility code.
Run the affected workflow/CLI suites and standard checks on the combined snapshot;
the final reviewers must include retirement in scope. T059 is an implementation
cleanup trace, not a new product acceptance criterion or authorization to run Actions.
