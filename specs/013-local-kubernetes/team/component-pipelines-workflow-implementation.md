# Component workflow implementation evidence

Date: 2026-10-22. Owner C, T065/T066, baseline `424a670` plus frozen
component preparation and approved immutable-selection amendment. This record is
author evidence, not independent approval or human acceptance.

## Scope and design

Changed `validate.yaml`, removed duplicate `release.yaml`, added seven fixed
component wrappers and `component-build.yaml`, changed `deployment-ci.mjs` and its
tests, and added `component-workflows.test.mjs`. Other owners' files were preserved.
Applied the constitution, team protocol, testing design record, formatting,
tooling/privacy/resilience requirements, speckit-implement and TDD skills.

Tests exercise public CLI processes with only the external Docker executable seam
substituted, actual Bash extracted from the committed reusable workflow, and YAML
graph/permission contracts. No Docker publication or GitHub mutation occurs.
Static tests are appropriate for the fourteen explicit call permission boundaries,
fixed producer names, dependencies, immutable selection ordering, and seven queue
policies; CLI tests establish observable execution and failure behavior separately.

The quality-first parent has seven readonly PR calls and seven trusted wrapper
calls. Each wrapper owns its build and queued promotion independently. All source
checkouts use the event SHA. Selection is written before immutable intent capture;
later attempts consume the original selection through owner A's CLI. The always
summary reports every selected missing, skipped, canceled or failed component and
keeps unrelated successes visible. Existing disabled deployment work remains under
its existing exception; this change does not waive it.

Publication produces owner B's exact single-component record plus validated Linux
amd64/arm64 index proof. Raw OCI index validation precedes projection to media type,
platform and digest only. Arbitrary provider annotations are excluded and serialized
public results are limited to 64KiB before writing. PR builds use dual-architecture
cache-only output without login, push or release artifacts. Legacy ephemeral CI
local image loading remains covered.

## Intended red and green sequence

All following reds preceded the corresponding implementation. No setup/import
failure is counted and no historical policy exception is used.

- `node --test scripts/component-workflows.test.mjs`: initial graph/core/summary
  tests failed on zero versus fourteen calls, absent seven wrappers, absent always
  summary, and the old CLI usage response instead of healthy or failed summaries.
  The failed-quality summary case also failed with empty stdout before its fix.
- `node --test --test-name-pattern='publication CLI permits manual' scripts/deployment-ci.test.mjs`:
  new single-component CLI failed with old usage/status 1 instead of permitted
  publication. The complete matrix now covers allowed manual heads and exact-main
  automatic pushes, and denial before provider invocation for other contexts.
- Explicit component selection expected web only but received all seven builds;
  PR component CLI received old usage. Builder selection/cache-only mode and the
  component CLI were then implemented; all seven PR components are exercised.
- Duplicate-release contract observed `release.yaml` present before deletion.
- Immutable-selection tests observed select-after-intent ordering and undefined
  producer name instead of `Select components`, before correcting both.
- Artifact tests observed arbitrary `PRIVATE` provider metadata and oversized
  serialized proof, and an oversized record returned success instead of safe
  failure. Projection and the 64KiB check followed these two behavioral reds.

Targeted greens followed each slice. The final real-Bash test additionally executes
the actual common-core build step for PR and manual publication; its provider seam
confirms one selected build, dual platforms, push only for publication, and artifact
creation only for publication. No production change was needed after adding this
integration verification.

## Final checks

- Offline Linux Node 24.15 cached container, readonly repository mount:
  `node --test scripts/deployment-ci.test.mjs scripts/component-workflows.test.mjs`:
  exit 0, **35 passed, zero failed/skipped**, 49.4 seconds. This includes real Bash
  and Unix private-file permission assertions. Container image:
  `sha256:401f10ae1c59171eb76a1d1f8ae62bdaad111a078c31fa7626acc4dc439cc288`.
- `npx.cmd eslint scripts/deployment-ci.mjs scripts/deployment-ci.test.mjs scripts/component-workflows.test.mjs`:
  exit 0. Initial `npx` PowerShell launcher was blocked by host execution policy;
  using the installed `.cmd` launcher required no policy change.
- Exact edited sources were formatted and reread after edits. Coordinator owns
  aggregate repository format/lint/check verification.
- Official actionlint 1.7.12 rejects the required `concurrency.queue` property.
  Original workflows therefore do **not** have a full actionlint pass. Final temp
  copies removing only the seven unsupported `queue: max` lines passed actionlint
  with the existing disabled deployment constant-false diagnostic ignored. Source
  queue policies remain intact and asserted for all seven wrappers. Temp location:
  `C:/Users/stirb/AppData/Local/Temp/component-actionlint-final-22622d1a2bbf463f8ae78812958b05fa`.
- New upload action pin verified against official tag with
  `git ls-remote https://github.com/actions/upload-artifact.git refs/tags/v7.0.2`:
  `cf430e030ddbb5b0abf93d22962f4752f3646cd9`. Official action metadata uses Node 24;
  its default archive preserves the fixed artifact member expected by owner A.

No commit, push, workflow dispatch, registry publication or remote write was run.
Independent review, aggregate checks and real GitHub workflow execution remain
coordinator-owned; local evidence does not claim hosted workflow acceptance.
