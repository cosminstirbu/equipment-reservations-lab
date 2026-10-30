## Qualification workflow launch — PASS (scoped)

No new security findings in the reviewed integration.

The workflow now checks out immutable `github.sha` with persisted credentials disabled. Install/prove use the existing pre-Node shell launcher; direct npm/Node commands clear `NODE_OPTIONS` and `NODE_PATH` before execution. The real preload regression includes a positive injection control and exercises the configured workflow commands.

Private JSON inputs remain environment-fed, written under restrictive permissions and removed by an always-run step. Protected actor environments, separate identities, main-only dispatch, pinned actions, minimal permissions and secret-sourced nonce remain intact. Launcher and definition inventory are unchanged.

Recorded intended RED and **12/12 GREEN** support the local launch boundary. The prove command deliberately rejects the dirty local checkout; it does not establish successful hosted proof dispatch or Azure identity qualification.

Verified hashes:

- Workflow: `4DF117FC8DEDB30354166E9F50828E2BD4DC339E35A9F7B312E85448FAC5340E`
- Launch tests: `669D792CC790370B9263A5442A5347D73F61C38CA02756A309A5A887919D17A3`
- Workflow tests: `0CF3E6190383E042D5C2D936E23BE8095F748D6CDDAA03F3B066FDB7CA36CDB2`
- Evidence: `8284044B3D3185B1D818A1EFF2F80F0819507BD937E82577FA3B4CF1462CF2C2`

Format and scoped lint passed. Full lint’s separate restore/source issues and revalidation remain outside this verdict. No full-check, T069/T075, clean hosted or feature acceptance is inferred.

No files changed, tests rerun or Azure operations performed.
