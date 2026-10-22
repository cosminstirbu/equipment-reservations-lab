# Manifest quality verification

Scope: T071–T077 amendment to feature 013, baseline
`9f5e592ab89faa299740ae693a6de3af8fcac942`. Scoped implementation, checks and
independent reviews pass; workflow qualification remains pending. This record does not accept the feature or waive T070,
T052, T053, or earlier pending obligations. No remote workflow or publication
was requested for this batch.

## Generator regression (T071)

Test design: exercise the public synchronous `promotionFiles` generator with the
actual checked-in overlay, real job inputs, all seven successive component updates,
and the retained legacy release format. Use the repository's actual Prettier
configuration to check every generated YAML/JSON file. GitHub and registry calls
are outside this pure generation boundary; no production collaborator is replaced.

Before changing production generation, the new regression failed because Prettier
rejected the generated local kustomization (`false !== true`). The repair emits
block YAML for the allowed image fields and normalizes the splice newline. The
regression then passed, including successive updates whose YAML AST value consumes
the previous trailing newline. The public API remains synchronous.

After exact-file formatting and rereading, Linux Node 24.15.0 ran
`node --test scripts/promote-images.test.mjs scripts/deployment-validation.test.mjs`
against the read-only workspace in the existing Podman VM: exit 0, 52 passed,
zero failures/skips. This is the generator/policy baseline before the new static
policy changes; final integrated results must supersede it below.

## Provider prerequisite

Downloaded the official kubectl v1.35.8 Windows amd64 executable to a task-specific
temporary directory and verified its published SHA-256:
`f675d70224b42b84e0442e8d7644efbe440e4451a4b02bdc5d95823a96316ba8`.
Client reports v1.35.8 and Kustomize v5.7.1. No PATH or runtime configuration
was changed. Final real-render evidence is recorded under snapshot 02 below.

## Integrated checks and reviews

Frozen source: `manifest-quality-snapshot-01.json` records SHA-256 of all nine
changed source/configuration/test files against the baseline above.

- `npm.cmd run format-check`: exit 0, repository formatting passed. Dotnet reported
  workspace-loading warnings without a formatting failure.
- `npm.cmd run lint`: initial sandboxed attempt failed NuGet access (NU1301/socket
  denied); repeated with network access, exit 0, solution build zero warnings/errors
  and remaining ESLint/style checks passed. No diagnostics were suppressed.
- Windows Node 24.15.0, explicit `MANIFEST_KUBECTL` set to the verified executable:
  `node --test scripts/manifest-quality.test.mjs scripts/deployment-validation.test.mjs scripts/promote-images.test.mjs scripts/deployment-ci.test.mjs`:
  exit 1, 119 passed, two failed, one skipped. Both new actual-provider tests passed.
  Existing POSIX mode assertion differs on Windows (438 versus 384), and the host
  cannot create the existing test's symlink (EPERM); these are not passing checks.
- Disposable Linux Node 24.15.0 container on the existing Podman VM, read-only source
  mount, Git/OpenSSL/Python installed only in that container:
  `node --test scripts/manifest-quality.test.mjs scripts/deployment-validation.test.mjs scripts/promote-images.test.mjs scripts/deployment-ci.test.mjs scripts/component-workflows.test.mjs scripts/component-selection.test.mjs`:
  exit 0, 160 passed, zero failures, two provider-contract skips because that Linux
  invocation did not configure kubectl. POSIX permissions, symlinks and real Bash
  contracts passed there; the two explicit Windows provider successes supply separate
  actual-render evidence.
- After lint finished, Windows `npm.cmd run test:tooling` with the explicit pinned
  `MANIFEST_KUBECTL`: exit 0, 89 passed, zero failures, two Windows-only skips
  (Bash workflow execution and POSIX signal semantics). The Linux focused suite
  above executes the Bash contract; POSIX signal behavior is covered separately
  before final handoff. Both new provider contracts ran and passed in this invocation.

Snapshot 01 quality review passed (`manifest-quality-quality-01.md`). Security review
requested changes (`manifest-quality-security-01.md`): MQ-S001 identified unsupported
nested CronJob workloads escaping static image/resource traversal. The completed
repair is recorded below; snapshot 01 is historical rather than final approval.

## Repaired snapshot 02

`manifest-quality-snapshot-02.json` preserves the unchanged seven source hashes and
records the repaired validator/tests. MQ-S001 has seven observed intended-red cases
before the static-only unsupported-kind rejection; see the policy implementation
record. The original security reviewer reproduced rejection and closed MQ-S001;
independent scoped quality and security both pass (`manifest-quality-quality-02.md`,
`manifest-quality-security-02.md`).

Fresh checks on this snapshot:

- `npm.cmd run format-check`: exit 0.
- `npm.cmd run lint` with NuGet access: exit 0, build zero warnings/errors and
  ESLint/style verification passed. This ran after tooling fixtures had completed.
- Windows, explicit verified `MANIFEST_KUBECTL`:
  `node --test scripts/manifest-quality.test.mjs`: exit 0, 9 passed, zero failures/skips.
  Includes real initial/all-seven successive promotion/complete Kustomize renders,
  broken-generator rejection and the actual scoped-format/render CLI.
- Offline disposable Linux Node 24.15.0 container, read-only source and no network:
  `node --test scripts/deployment-validation.test.mjs scripts/promote-images.test.mjs scripts/process.test.mjs`:
  exit 0, 103 passed, zero failures/skips. Covers repaired nested-kind rejection,
  generator formatting, real symlink/POSIX permissions and process signal semantics.

All affected changed-source checks pass. Full-source workflow semantic qualification
remains unavailable: actionlint 1.7.12 does not understand retained `queue: max`;
the limited temporary stripped-copy check in the workflow implementation record is
not counted as full validation. No application source changed, so a new complete
application-suite run is not required for this tooling amendment. Earlier full-feature
T070/T052/T053 qualification and acceptance remain pending. The completed
[convergence assessment](manifest-quality-convergence.md) preserves those obligations
and appends T078 for current workflow qualification without claiming completion.
