# T069 qualification workflow launch integration

Date: 2026-10-26. Author-owned bounded implementation; independent review pending.

## Test design before implementation

Exercise the actual parsed qualification workflow run commands through real Bash with an ambient synthetic marker-writing Node preload. A temporary npm boundary executable starts real Node but performs no install/download/cloud work; it records only fixed invocation arguments. Actual private-input write/removal commands use synthetic values and a temporary RUNNER_TEMP. The actual prove launcher must reject this dirty local checkout before protected operational imports. Each command must prevent preload execution; the positive direct Node control must create the marker. YAML assertions separately bind checkout to github.sha and preserve protected actor identities/action pins. This is a narrow external process boundary, not hosted identity qualification.

Applicable standards: constitution II through IV and VI, engineering testing design/public process boundary, tooling private capture/finite execution/cleanup, per-edit formatting and required handoff checks. Each child has a 15s bound and bounded captured output; no cloud calls or credentials. Temporary resources are independently removed by test teardown. Existing definition/Git launch tests remain relevant. Workflow is already an enumerated manifest asset; changing its bytes changes the computed definition identity without changing path classification. T075 and actual clean hosted proof remain pending.

Initial source SHA256: workflow 15B1A4561442D1A4143249B61A83CB0EE19C68C5E2A4C3F4CE61EC204086A213; launch tests 3745BD50A7B0B7B1011F7FF7715029024872739C5545268B02AA525B96AC4ADE; workflow tests 5B8A4522DF7181DFB0AD0DB745B9CBDD1DD3D2EE2698AD2D9F1648C0BA32F7D6. Existing unrelated WIP preserved; broker scope frozen.

## Revision-matched outcomes and freeze

The first configured-command regression on the original workflow failed for the intended reason: all five commands terminated, direct Node positive control created its synthetic marker, and at least one configured command executed that ambient preload. Command: `node --test --test-name-pattern='configured qualification workflow' scripts/azure-qualification-launch.test.mjs`; exit1, 1/1 failed, 1.480s. No rollback or manufactured historical RED.

Minimal implementation: checkout uses immutable `${{ github.sha }}`; install and prove use existing pre-Node shell entry; tool preparation and private-input write/removal clear NODE_OPTIONS/NODE_PATH before Node/npm. Action pins, main restriction, protected actor environments, permissions, nonce source, concurrency and cleanup condition remain unchanged. Launcher modules/wrappers and definition inventory were not edited. Existing workflow expectation now names the actual shell producer boundary.

Final targeted command `node --test scripts/azure-qualification-launch.test.mjs scripts/azure-workflows.test.mjs`: exit0, 12/12 PASS, 0 failed/canceled/skipped, 11.963s. Actual command boundary observes exits [0,0,0,1,0], exact npm arguments ci/--ignore-scripts then run/infra:tools, no preload, and absence of both temporary private-input files. Local prove rejection is deliberate; it is not actual hosted proof. Existing real Git fixture tests pass on the changed workflow asset, covering clean HEAD binding, false SHA/dirty/loader refusal, app-only stability, transitive/package definition sensitivity.

Checks: exact-file format and reread completed after each source edit. Scoped ESLint zero warnings and Prettier check PASS. Whole `npm.cmd run format-check` exit0 PASS (workspace-loading warning retained). Whole `npm.cmd run lint` exit1: NuGet repository-signature retrieval denied by sandbox socket permissions (NU1301); not a source diagnostic or passing lint. Coordinator owns any subsequent elevated revalidation and verdict. Full npm check, actual hosted identity, cloud acceptance and T075 remain pending. No cloud calls, real credential inputs, dependency installation, broker changes or shared metadata writes occurred.

Final SHA256:

| Path | SHA256 |
| --- | --- |
| .github/workflows/azure-qualification.yaml | 4DF117FC8DEDB30354166E9F50828E2BD4DC339E35A9F7B312E85448FAC5340E |
| scripts/azure-qualification-launch.test.mjs | 669D792CC790370B9263A5442A5347D73F61C38CA02756A309A5A887919D17A3 |
| scripts/azure-workflows.test.mjs | 0CF3E6190383E042D5C2D936E23BE8095F748D6CDDAA03F3B066FDB7CA36CDB2 |
| infra/azure/qualification-definition.json (unchanged) | 48BDCE8DA520854D7D4063BF397A6539A5FDF19BA9789C60E329448AE6919A72 |
| scripts/azure-qualification-launch.sh (unchanged) | D5739E6BE3AEB34E445306FE8C717297FFF37529B3F705B1A6F75128835A4790 |
| scripts/azure-qualification-launch.mjs (unchanged) | 84E2525CE5011D4AF41C6507FE9057A35C75CE4B95B9A793F42D2BF202A2073B |

Author inspection: no activation/consumption contract or manifest classification changed. The asset-byte change requires future reviewed definition/qualification identity to reflect these bytes; no clean hosted proof is claimed. Independent quality/security review remains required. Source and this evidence are frozen at handoff.
