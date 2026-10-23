# Image selection tooling-scope repair

Owner requested correction after PR #25 rebuilt all seven images for Argo deployment
and test tooling. This is a targeted FR-022/SC-011 correction in the current feature,
not a relaxation of required quality or unknown-input fallback.

## Decisions and verification contract

Treat the audited non-image scripts argocd-installation.mjs, local-kubernetes.mjs,
quality.mjs and component-pipelines.mjs as non-image inputs. They fetch/deploy,
validate/format/test or select/record components; none invokes image construction.
Scripts ending .test.mjs are test inputs. Exact scripts/process.mjs,
deployment-ci.mjs, other build/publication helpers and workflow changes remain
conservative image inputs, as do unknown script paths. Docker contexts exclude
root scripts and root package metadata; actual image build orchestration remains
selected even though it is outside image contexts.

For root package.json, prove the baseline and candidate differ only in the existing
quality script keys format, format-check, lint, check, check:openapi, test:tooling or
test:deployment. Compare all remaining parsed metadata exactly; preserve conservative
selection for dependency/lockfile/module/install-hook/unknown-script changes, missing
or malformed metadata. src/Web package/lock files still select Web normally. Proof is
per component publication baseline, not only the latest main commit.

Selection-code changes are audited non-image changes so this repair itself does not
force images through the previous broad fallback. Full quality still runs, including
the selector's real-Git and public CLI regressions. Workflow/manual selection,
unknown-input/graph/history behavior and publication baseline discovery are unchanged.
Main retains unpublished earlier source changes; absent valid baseline still builds.

## Test design record

Extend scripts/component-selection.test.mjs through public selectComponents and its
existing CLI. Retain real Git repositories, merge-base/history and project-graph
inspection plus parsing; no internal collaborator mocks or live GitHub calls. Test
no selection for audited tooling/quality-only metadata on PR and current main,
retained selection for earlier unpublished source, manual all, and conservative
unknown/build/dependency/install-hook/invalid metadata. Observe selected component
sets and reasons. Existing faithful Actions HTTP tests retain their separate evidence
contract. New behavior starts with intended-red assertions before production edits.

Applicable standards: constitution; engineering formatting, testing and tooling,
including existing captured Git process bounds and privacy. Existing process helpers
and HTTP/resilience policies are unchanged. Required handoff: focused component
selection/workflow/manifest-quality suites, format-check and lint, and replay the
actual Argo PR diff for PR/main with representative baselines. Full application
quality is not bypassed. No live publication or cluster operation is required.

Initial actual-PR reproduction at e47b4b9 versus8fc6a8f selected all seven with reason
source. Local command used selectComponents on those exact Git revisions; this
matches the hosted Select components job for run39938101249.

## Verification evidence

Both new positive cases failed first against the original selector: audited tooling
and root quality-script-only changes each selected all seven images. After the
repair, both passed. Real-Git adverse cases also passed for dependencies, hooks,
unknown metadata, malformed packages, missing/deleted/renamed package inputs,
manual selection and earlier unpublished per-component source changes.

The exact original PR revisions e47b4b9 versus 8fc6a8f now select [] for both
pull_request and push with representative current component baselines.

Required format-check and focused ESLint passed. Full test:tooling passed:
127 tests, 125 passed, two platform-specific skips, zero failures. Full lint
passed with zero build warnings and errors. No application-source change requires
an additional full application test run; hosted full quality remains required.

Independent quality review: PASS, no findings. Independent security review: PASS,
findings []. Both reviewed the frozen source and real-Git regression evidence;
their verdicts preserve the separate broader feature and human acceptance gates.

Reviewed SHA-256 values:

- scripts/component-pipelines.mjs: aaa5b7b7972188960f13d9d9ab1447208e2e8130f9f40c2ff749e22b0ea6cc2b
- scripts/component-selection.test.mjs: ed8f22604c54580d2422c230c590c6f144ab3cbd50d1432914f00b6a8e89db31
