# Qualification workflow launch review

**Verdict: scoped PASS. No blocking finding within the assigned launch integration.**

The workflow checks out immutable `${{ github.sha }}` with persisted credentials disabled. Main-only execution, protected actor environments, separate backup/restore identities, pinned actions, minimal permissions and serial actor qualification remain intact.

Install and prove commands enter through the existing shell wrapper, which clears `NODE_OPTIONS` and `NODE_PATH` before starting Node/npm. Tool preparation and private-input write/removal commands likewise clear those variables first. Private configuration remains environment-supplied, written with restrictive permissions and removed through an `always()` step; values are not interpolated into executable source.

The new regression exercises the **actual parsed workflow commands** through real Bash. Its direct Node positive control proves the synthetic preload executes without protection. The configured commands then demonstrate loader exclusion, expected npm arguments, bounded termination and private-file removal. The synthetic mismatched `GITHUB_SHA` prevents prove from reaching operational imports even if checkout cleanliness changes. This is meaningful launch-boundary coverage, not hosted identity proof.

Existing Git-fixture tests retain clean revision binding, dirty/false-revision refusal and transitive definition sensitivity. The changed workflow bytes correctly affect future qualification-definition identity.

## Verified revision and checks

| Artifact | SHA256 |
|---|---|
| `.github/workflows/azure-qualification.yaml` | `4DF117FC8DEDB30354166E9F50828E2BD4DC339E35A9F7B312E85448FAC5340E` |
| `scripts/azure-qualification-launch.test.mjs` | `669D792CC790370B9263A5442A5347D73F61C38CA02756A309A5A887919D17A3` |
| `scripts/azure-workflows.test.mjs` | `0CF3E6190383E042D5C2D936E23BE8095F748D6CDDAA03F3B066FDB7CA36CDB2` |
| `team/qualification-workflow-launch-evidence.md` | `8284044B3D3185B1D818A1EFF2F80F0819507BD937E82577FA3B4CF1462CF2C2` |

Inspected evidence records genuine configured-command RED followed by **12/12 PASS**, exit 0, 11.963s; scoped ESLint/Prettier and whole format-check passed. Final whole lint remains coordinator-owned and pending at this review handoff; its earlier sandbox failure is preserved.

No files changed or tests executed by this reviewer. This verdict does not complete T069, T075, hosted identity qualification, cloud acceptance or the feature.
