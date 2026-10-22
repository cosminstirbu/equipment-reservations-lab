# Promotion suffix quoting regression

Date: 2026-10-22. Branch: `feature/independent-component-pipelines`, parent `ebab091`. Ordinary bounded repair; existing feature acceptance and qualification gates remain pending.

## Diagnosis and test design

Hosted run 39737714328 attempt 2 rejected the bot-owned promotion branch as unmanaged. Read-only GitHub comparison confirmed unchanged main, one expected bot commit and only permitted files. Both Job wrapper diffs removed `nameSuffix: '-unreleased'`; the line allowlist accepted only unquoted values.

Extend the existing public `githubGateway().readState()` transport seam. Keep real managed-branch validation; double only GitHub HTTP responses using the ref/compare schema and exact suffix diff observed in the failed run. Observe an initially absent branch followed by its existing bot-owned comparison, asserting the resulting managed status. This does not simulate live publication or PR creation. No solitary production parser seam or private helper is exposed.

The regression first failed against production with `false !== true` for the legacy release branch. After the minimal validator change, it passes for legacy and both bootstrap component branches. Supplementary cases cover plain/single/double quoting and reject mismatched quotes, arbitrary suffixes and additional YAML changes. Existing human-edit/file/CAS safeguards remain real and covered. Quotes must pair exactly; suffix grammar stays restricted to `-unreleased` or a 16-character lowercase hexadecimal hash.

## Verification

- Focused intended regression: exit 1 before production change, exit 0 after.
- Linux promotion and deployment-validation suites: 51 passed, zero skipped, exit 0, using the existing cached Node 24.15 container with read-only checkout and disposable temporary files.
- Windows aggregate attempted: 49 passed, one Unix applicability skip, one fixture failure because Windows disallowed symlink creation. The full Linux run covers that contract; no platform check was weakened.
- Repository format-check and lint passed, including a solution build with zero warnings/errors and style verification. No application behavior changed, so no application runtime acceptance is inferred.
- Author inspection retains exact allowed paths, bot history, same-value grammar, paired quotes and rejection of unrelated patch lines. Earlier source-02 independent verdicts remain historical and do not constitute independent review of this repair.

No commit, push, remote branch mutation or workflow rerun was performed. A rerun of the old hosted run remains pinned to its original source and will not pick up this working-tree fix.
