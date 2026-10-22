# Manifest quality workflow implementation

Owner C, T075, 2026-10-22. Baseline `9f5e592` plus frozen manifest-quality
preparation. This is author evidence, not independent approval or feature acceptance.
Only `validate.yaml`, `component-workflows.test.mjs` and this record were edited.

Applied constitution, team protocol, speckit-implement/TDD, testing design and
formatting/tooling/privacy standards. Tests retain the real YAML parser and execute
actual workflow Bash with external executable fixtures; helper classification and
real pinned render/policy belong to owners A/B and coordinator integration evidence.

Before workflow changes, the classifier contract failed on
`quality classifier must exist after checkout` using
`node --test --test-name-pattern='required quality classifies|manifest quality shell' scripts/component-workflows.test.mjs`.
The shell contract ran separately in offline Linux and failed on
`manifest validation shell must exist` (one failure, zero skips). These intended
behavioral reds preceded production changes; no historical exception was used.

The unchanged required job ID now has explicit name `quality`, readonly contents
and Actions permission, immutable full-history checkout and a builtin-only early
classifier. Root npm tooling is common; frontend/.NET setup and every previous full
check run only in full mode. The successful fixed full-quality marker follows all
full checks. Manifest mode installs only checksum-pinned kubectl 1.35.8 using bounded
download, then invokes the static helper with explicit scope file and executable.
No runtime, cluster, application test/build or image command enters that lane.
Downstream component dependencies and disabled-deployment exception are preserved.
The always-required summary prints quality mode/reason even when component summary
fails; missing outputs report unavailable without replacing the failure.

Verification:

- Offline readonly Linux Node 24.15 container:
  `node --test scripts/component-workflows.test.mjs`: exit 0, 12 passed,
  zero failed/skipped. Supplementary final shell assertions execute preserved full
  commands through executable fixtures, prove marker ordering and propagate static
  exit 19; targeted final shell run also passes.
- `npx.cmd eslint scripts/component-workflows.test.mjs`: exit 0.
- Edited sources formatted immediately and reread; exact-source Prettier check
  recorded at handoff. Coordinator runs aggregate format/lint/tooling checks.
- Official actionlint 1.7.12 retains its known unsupported concurrency.queue
  limitation. Temporary copies removing only seven queue lines pass with the
  existing constant-false disabled deployment diagnostic ignored; source policies
  remain unchanged. Temp copy:
  `C:/Users/stirb/AppData/Local/Temp/manifest-actionlint-ffe46d174b7b4ffb8cc54993c83f31c0`.

No hosted workflow, publication, commit, push or remote write was executed.
Real helper/Kustomize validation, aggregate checks and independent reviews remain
coordinator-owned. The shell fixture check does not claim actual application tests
or hosted Actions execution.
