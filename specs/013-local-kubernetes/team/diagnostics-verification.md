# Script diagnostics verification

Feature: 013-local-kubernetes. Batch baseline: `623bfaf`. Date: 2026-10-21.

This is a live coordinator record. Final source freeze, aggregate checks, independent
implementation reviews and convergence are pending. No feature acceptance is inferred.

## Available environments

- Host: Windows arm64, Node 24.15.0, .NET SDK 10.0.301.
- Existing rootful Podman VM is running; no VM start or configuration change performed.
  Its Docker-compatible host endpoint is `npipe://./pipe/podman-machine-default`.
- Existing cached Linux arm64 Node 24.15.0 image:
  `sha256:401f10ae1c59171eb76a1d1f8ae62bdaad111a078c31fa7626acc4dc439cc288`,
  repository digest `sha256:4e6b70dd6cbfc88c8157ba19aa3d9f9cce6ba4703576d55459e45efcbc9c5f5d`.
  Tests can bind the checkout read-only at `/workspace`, use temporary `/tmp`,
  disable networking and avoid installing tools in the VM.

## Implementation checkpoint

Executed after the coder announced a stable helper checkpoint:

```powershell
podman run --rm --pull=never --network=none --read-only --tmpfs /tmp:rw `
  --mount type=bind,source=/mnt/c/Repos/equipment-reservations-lab,target=/workspace,readonly `
  --workdir /workspace `
  sha256:401f10ae1c59171eb76a1d1f8ae62bdaad111a078c31fa7626acc4dc439cc288 `
  node --test scripts/process.test.mjs
```

Exit 0; 7 passed, 0 failed, 0 skipped; includes real POSIX signal termination,
both-stream progress before child exit, bounded separate failure tails, private
marker containment, spawn/timeout/output-limit categories, and cleanup combinations.
This checkpoint is not a final revision-matched gate; rerun after source freeze.

## Pending gates

Final focused process/CLI suites, changed real-provider suites, format-check, lint,
application check, deployment checks, author inspection, independent quality/security
verdicts and convergence remain pending. Historical local/release/human acceptance
tasks remain pending independently of this batch.

## Frozen snapshot diagnostics-01

Fingerprints: [diagnostics-snapshot-01.json](diagnostics-snapshot-01.json).

- `dotnet restore EquipmentReservation.slnx --locked-mode`: exit 0, pinned restore
  succeeded with network access, before aggregate checks.
- `npm.cmd run format-check`: exit 0. Workspace-loading warning was emitted;
  all matched source passed formatting.
- `npm.cmd run lint`: exit 0. ESLint, solution warning-as-error build (0 warnings,
  0 errors), and suggestion-level style verification passed.
- Linux Node 24.15.0 script suite: exit 1, 119 total, 116 passed, 3 failed,
  0 skipped. Used the cached Node container, read-only checkout and ephemeral
  OpenSSL installation inside that container only. Test files: process,
  deployment-provider-diagnostics, deployment-ci, local-kubernetes,
  deployment-smoke, deployment-diagnostics, promote-images,
  deployment-validation, openapi-lint, and Web auth-config.
  Failures: prerequisite CLI fixture did not provide Podman before kind on Linux;
  an injected host-prerequisite error lacked a fixed safe category; an old test
  required the generic phrase `timed out` for an untyped injected process failure.
  Real POSIX signal and lifecycle private modes passed. These are not platform
  skips or passing evidence; round 1 repairs require rerun.
- `npm.cmd run test:deployment -- scripts/deployment-dashboard.test.mjs scripts/deployment-broker-retention.test.mjs scripts/deployment-routing.test.mjs`:
  exit 0. Real pinned Dashboard OTLP/API contract passed (1 test, 8.1 seconds);
  real broker durable-queue replacement passed (1 test, 24.1 seconds); real frontend
  routing contract passed (1 test, 39.5 seconds). Existing rootful Podman runtime,
  isolated owned fixtures; cleanup completed. Changed routing classification in
  round 1 will require its own rerun. These contracts do not establish full kind
  deployment, macOS host trust/VM restart, or release acceptance.

Independent frozen-01 reviews requested changes: diagnostic chaining, routing
classification and remaining cleanup paths. DQ-P001 separately records a historical
test-first sequencing gap. Source has been unfrozen for the bounded repair batch;
old aggregate results must not be presented as final-revision passes.

## Frozen snapshots diagnostics-02 and diagnostics-03

Production repair fingerprints: [diagnostics-snapshot-02.json](diagnostics-snapshot-02.json).
Final fixture fingerprints: [diagnostics-snapshot-03.json](diagnostics-snapshot-03.json).
Only `scripts/local-kubernetes.test.mjs` changed between them; all production,
provider and tooling-suite inputs remained identical. Metadata reports may change
after the source freeze without changing these source inputs.

- Frozen-02 `npm.cmd run format-check` and `npm.cmd run lint`: both exit 0,
  solution build 0 warnings/0 errors, style gate passed.
- Frozen-02 Linux affected suites: 96/97 passed, one parent smoke fixture failure.
  Diagnosis showed copied Node `kubectl` rejected the leading `--kubeconfig`
  before preload, so its earlier red did not reach the intended bug path. This
  is explicitly part of DQ-P001, not reconstructed intended-red evidence.
- Frozen-03 Linux affected suites: **97/97 passed, 0 failed, 0 skipped**, exit 0,
  15.1 seconds. Real POSIX signal, private modes, actual CLI/provider fixtures,
  parent smoke both-stream/HTTP phase propagation, combined cleanup failures and
  private marker exclusion passed. Command uses the cached Node/OpenSSL disposable
  container pattern above and seven modules: process, deployment-ci,
  local-kubernetes, deployment-smoke, deployment-diagnostics, promote-images,
  deployment-provider-diagnostics. The real shell provider fixture correction
  was independently quality/security reviewed; production hashes are unchanged.
- Required `npm.cmd run test:deployment`: exit 1 after real broker retention
  passed (22.6 seconds). CI fixture contract then failed before provider setup
  because pinned `kubectl` is absent on PATH (safe spawn category, no exit status).
  Full CI contract/config/ingress/database/deployed verification remains pending;
  this is an unavailable prerequisite, not a passed or skipped gate.
- Full `npm.cmd run check` is running on Windows with
  `DOCKER_HOST=npipe://./pipe/podman-machine-default`. Tooling: 41 passed,
  0 failed, 1 POSIX-only process-signal skip (covered on Linux above). Frontend
  build passed and all 64 frontend tests passed; existing jsdom canvas notices
  were nonfatal. Final backend results and final fixture-format/lint revalidation
  remain to be recorded.

Source review closes DQ-C001, DQ-C002 and DQ-C003. Security passes reviewed source
privacy/cleanup; quality remains changes_requested for DQ-P001 and pending checks.

## Aggregate results and applicability

Full `npm.cmd run check` completed with exit 0:

- Tooling: 41 passed, 0 failed, 1 POSIX-signal applicability skip on Windows;
  actual signal behavior passed in the Linux 97/97 run.
- Frontend: build passed, 64 tests passed, 0 failed. Existing jsdom canvas notices
  were emitted without changing the result.
- Backend: all nine test modules passed; 564 total, 550 succeeded, 14 skipped,
  0 failed; backend duration 4m08.242s. The skipped BrokerExecutableTests are
  the owner-approved Windows applicability boundary in
  [testing.md](../../../docs/engineering/testing.md#platform-specific-broker-contracts).
  This host run does not establish those Unix private-file contracts.

The final POSIX provider fixture changed only local-kubernetes.test.mjs, which is
not part of the application/tooling suite above. Production and actual application
test inputs remained unchanged during the check. Full `npm.cmd run format-check`
and `npm.cmd run lint` were rerun after that fixture edit and both exited 0;
warning-as-error solution build again reported 0 warnings/0 errors.

Repaired actual routing `npm.cmd run test:deployment -- scripts/deployment-routing.test.mjs`
exited 0, 1/1 passed, 35.6 seconds. Both streams of public resource operations and
exact owned-resource cleanup were visible. Dashboard/broker source hashes are
unchanged from their successful real-provider runs above.

Author review found two private-parser guards needed explicit current malformed
payload regressions, independently of their already recorded test-first chronology
gap. Tests-only additions in smoke and release-validation modules are being added;
production hashes remain frozen. Their final results and targeted re-review will
be recorded before handoff. No backend rerun is required for these tests-only files
outside the application/tooling suite; final source formatting/lint will be current.

## Final snapshot diagnostics-04 handoff

Final fingerprints: [diagnostics-snapshot-04.json](diagnostics-snapshot-04.json).
Only smoke/validation test files differ from snapshot03; production hashes are
unchanged. Linux full smoke/validation modules passed **23/23**, exit 0, no skips,
including actual malformed private HTTP JSON and default OCI provider JSON/stderr
exclusion. Real process execution, fetch/Response.json and production JSON parsing
remain in those tests. Original quality/security reviewers passed these test designs
and retained production source closures in diagnostics-quality-04.md and
diagnostics-security-04.md. The tests establish current negative coverage; they do
not establish the missing historical red sequence.

After the last test edits, final `npm.cmd run format-check` and `npm.cmd run lint`
both exited 0. ESLint, solution build (0 warnings/0 errors) and suggestion-level
style verification passed. `git diff --check` passed. Author inspected per-operation
classifications, both-stream behavior, machine-output parsing, private input/error
containment, cleanup precedence/all-attempts, preserved timeouts/ownership/publication
guards, readability and Markdown link consistency. Tests alone are not treated as
proof that arbitrary provider output is safe. No backend/application production or
application-test input changed after its passing aggregate check.

Convergence appended T051–T053, retaining historical tasks and evidence. Its
assessment is [diagnostics-convergence.md](diagnostics-convergence.md). This task
append and final team metadata are post-check documentation-only changes, not new
source/test revisions. Diagnostics code findings are closed; security passes scoped
source; quality remains changes_requested for DQ-P001 and required outstanding
deployment evidence. DQ-P001 has a concrete unapproved
[exception request](diagnostics-exception-request.md); no exception or feature
acceptance is recorded. Full kind prerequisites and original release/local/runtime/
human gates remain pending. No commit, push, workflow dispatch, publication,
trust installation or VM configuration/start action occurred in this batch.

## Scoped exception decision — 2026-10-22

The owner explicitly approved the scoped test-first exception. EX-013-003 records
the six contracts, rationale, owner, date and exclusions. The original quality
reviewer validated closure in diagnostics-exception-review.md. DQ-P001 is closed
by exception and T051 is complete as metadata only; no history was reconstructed.
Remaining Kubernetes/provider, release/local runtime and human acceptance gates
are unchanged. The new branch-release amendment is outside this exception.
