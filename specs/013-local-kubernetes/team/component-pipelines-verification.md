# Component pipeline verification

Date: 2026-10-22. Final reviewed source: [snapshot 02](component-pipelines-snapshot-02.json). Historical initial checks refer to snapshot 01; task/checklist/state edits after snapshot 02 are completion metadata, not production changes.

## Current passing checks

| Command/check | Environment | Result |
| --- | --- | --- |
| `npm.cmd run format-check` | Windows, pinned repository toolchain, source 02 | Exit 0; all matched source formatted |
| `npm.cmd run lint` | Windows with NuGet access, source 02 | Exit 0; ESLint/style checks pass; solution build zero warnings/errors |
| `npm.cmd run test:tooling` | Windows, source 02 | Exit 0; 79 passed, one documented POSIX-signal applicability skip, zero failures |
| `node --test scripts/component-selection.test.mjs scripts/component-workflows.test.mjs scripts/deployment-ci.test.mjs scripts/deployment-validation.test.mjs scripts/promote-images.test.mjs scripts/local-kubernetes.test.mjs` | Disposable Linux arm64 Node 24.15 container, source 02; real Git, Python 3 and OpenSSL | Exit 0; 147 passed, zero skipped; 47.48 seconds |
| Changed Markdown local-file links and `git diff --check` | Windows, current documentation | Exit 0; line-ending notices only |
| Independent source reviews | Snapshot 02 | Scoped quality/security pass; CP-Q002/CP-Q003/CP-S002 closed by original reviewers |

The Linux command ran through `podman run --rm --pull=never`, mounting the checkout read-only at `/workspace`, with temporary `/tmp`, using cached image `sha256:401f10ae1c59171eb76a1d1f8ae62bdaad111a078c31fa7626acc4dc439cc288`. `apt-get update && apt-get install -y git openssl python3` supplied prerequisites inside that disposable container only. No VM settings, application image publication or host tool installation occurred. Both stdout and stderr remained visible.

Owners' final focused evidence: selection 28/28; state/promotion/lifecycle 84/84 on Linux; workflow/build 35/35 on Linux. The combined 147-test run is the current integration result. Implementation records preserve intended failing tests before each behavior/fix and the narrow GitHub/Docker provider boundaries. New suites are registered in `package.json` tooling checks.

## Unavailable and unsuccessful checks

- Initial snapshot-01 Linux aggregate lacked Git: selection fixtures failed `spawnSync git ENOENT`. A promotion CLI subprocess also exceeded its ten-second test-process budget during that run while other heavy checks ran. This was a failed check, not a pass. The corrected source-02 aggregate includes prerequisites and passes that guard at its unchanged timeout (2.17 seconds); no production timeout was weakened.
- `npm.cmd run check` on snapshot 01 with `DOCKER_HOST=npipe://./pipe/podman-machine-default` exited 1. Formatting/build and tooling passed (75 passed, one POSIX applicability skip before the four repair regressions); frontend build and all 64 tests passed. Backend total 564: 548 failed, two succeeded, 14 documented Windows applicability skips because Testcontainers could not reach the container API. Podman CLI over SSH works, but a direct named-pipe connection probe timed out. This supplies no backend pass. No application source/test changed in this amendment; the final tooling suite was separately rerun after repairs.
- `npm.cmd run test:deployment -- scripts/deployment-ci-contract.test.mjs` exited 1 before provider mutation: pinned `kubectl` unavailable (spawn failure). Pinned kind/provider qualification remains under T052/T070.
- Official actionlint 1.7.12 archive SHA-256 `6e7241b51e6817ea6a047693d8e6fed13b31819c9a0dd6c5a726e1592d22f6e9` was verified against official release checksums and executed. It rejects the documented `queue: max` property. Original-source validation is therefore unavailable. Temporary copies removing only seven unsupported queue lines, with the pre-existing constant-false deployment-job diagnostic ignored, passed the remaining semantic checks. This is a limited check, not full workflow validation. Source retains all seven queue settings, tested through parsed workflow contracts and supported by current official GitHub documentation. See the workflow implementation record.

## Author assessment and remaining gates

Inspected current source/interfaces and review evidence against approved selection, independent failure, immutable source/run/intent, no-op/stale promotion, partial-state readiness, branch/fork permission, output/privacy, bounded operational calls and cleanup requirements. Current operation classifications retain safe build streaming, captured machine output and private authenticated response/error handling. No application code, engineering policy or historical exception was changed. The prior test-first exception does not cover this amendment; reviewers assessed recorded reds for the new work.

Preparation and source-review reports remain verbatim with reviewer-owned verdicts. T068/T070 remain pending for complete verification; T052/T053 and earlier runtime/live-release/human gates are preserved. No real workflow dispatch, GHCR publication, promotion PR creation, merge, commit or push was performed. Read-only GitHub probes confirmed actual job `run_attempt` fields and official validator/action identities; local fixtures do not replace hosted execution evidence. Feature acceptance remains explicitly absent.
