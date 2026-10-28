# SEC-CACHE001 implementation repair10

Scope: exact network-role semantic validation only, preserving all inspection-role,
binding, actor and cache constraints. The coordinator released this repair after the
owner approved three additional implementation rounds (9 to12), process only.

Test design: extend the existing public `validateVaultGuardOutput` schema case with
actual producer-shaped positive network descriptors. The test-only projection fixture
uses the four literal actions in `foundation/network-access.tf` and the canonical
`{actions,dataActions:[]}` SHA256 emitted by `foundation/vault-guard.tf`. This is a
deterministic validator boundary with real schema/hash collaborators, no provider double
or live authorization claim. Both role descriptors must reject added/deleted actions,
delete authority, duplicates, malformed arrays/values, extra semantics and changed hash
before handoff. Existing public handoff and activation tests retain their real paths.

No grant, Terraform policy, checklist, task status or reviewer verdict is changed.
Independent closure remains owned by the original security reviewer.

## Repair and evidence

Intended RED: `node --test --test-name-pattern='guard output schema' scripts/azure-infrastructure.test.mjs`
failed at the actual producer-shaped positive descriptor because the former validator
rejected the two Microsoft.Resources tag actions. No production fix preceded that red.

The validator now requires the exact source-produced ordered four-action semantic array:
KV vault read/write and Resources tags read/write. It recomputes SHA256 over canonical
`{actions,dataActions:[]}` (keys already in canonical lexical order) and compares the
descriptor hash. Arbitrary KeyVault-prefixed authority and merely hex-shaped hashes no
longer satisfy this boundary. Both network roles use the same reviewed semantics.

The existing public schema test checks both descriptors and rejects eight changed
semantic cases even when their hashes are recomputed, plus three invalid hash cases.
All five inspection-role schemas and exact120/126 binding/cache constraints remain.
The test fixture now emits those real semantics; stale single-read/fake-hash literals
were removed from the three consumer test seeds rather than left as misleading inputs.

Checks on the frozen owned source, Windows Node24.15.0:

- `node --test scripts/azure-terraform.test.mjs scripts/azure-generator-input.test.mjs scripts/azure-guard-activation.test.mjs scripts/azure-handoff.test.mjs scripts/azure-infrastructure.test.mjs scripts/azure-installation-state.test.mjs scripts/azure-provisioning.test.mjs scripts/azure-qualification-data.test.mjs`
  passed52/52, zero skips, exit0,9.72seconds after final seed cleanup.
- `npx.cmd eslint scripts/azure-infrastructure.mjs scripts/azure-infrastructure.test.mjs scripts/azure-guard-test-fixture.mjs scripts/azure-handoff.test.mjs scripts/azure-guard-activation.test.mjs --max-warnings 0`
  passed exit0.
- `node --test scripts/azure-qualification-launch.test.mjs` passed6/6, zero skips,
  exit0,63.86seconds, retaining actual temporary Git and pinned local schema checks.
  It did not create provider clusters.
- Exact-file formatting passed after each source edit. Explicit Git Bash prerequisite
  returned the014 feature and available artifacts. No extension hooks are registered.
  Required whole-repository checks remain coordinator-owned, not executed in this scope.

Frozen changed files:

| File | SHA256 |
|---|---|
| scripts/azure-infrastructure.mjs | CA3848618B3D3EB486D4AC33E41C2DC334188A3C63C3DF10C0DA48DAE973A587 |
| scripts/azure-infrastructure.test.mjs | E7FA0A0864B824DB0E25E99AF950C80F6844188246F24AD722F5F64BA890FA0A |
| scripts/azure-guard-test-fixture.mjs | A2C3FCB4E603125B3FA46D58BA61576BCAD428B814BB85299C955729B8EBF9C8 |
| scripts/azure-handoff.test.mjs | ED3E0EAEC0F814F48E4BA7EB1C56CF613B80A99B1E03E1092EF193300FCFF267 |
| scripts/azure-guard-activation.test.mjs | 28096F9997812A39A96DC44DBA81E878CB898948D9A60B28C84BE4350FDCADD9 |

The test-only helper remains an explicit immutable closure asset; no literal inventory
classification or producer auto-update changed. Its changed bytes and infrastructure
module bytes intentionally invalidate prior closure hashes and affected old reviews.
Existing G3, same-lease positive composition, native execution and live acceptance gaps
remain pending. No cloud action, spending, provider fixture, external publication or
security-risk acceptance was performed. SEC-CACHE001 closure is requested, not asserted.
