# Temporary deployment-job suspension

2026-10-23 restoration: the owner authorized re-enabling Kubernetes verification for
PR validation and main release, with the manifest-only exception described in the
[workflow split](../plan.md#pr-validation-and-main-release-split-2026-10-23).
EX-013-002 no longer disables execution in this implementation. The historical
reviews below apply to the suspension revision, not the restored workflow; earlier
failures and broader acceptance remain pending.

Owner request2026-10-20: temporarily disable only the deployment job, retain quality,
and re-enable deployment after exploratory testing. Exception `EX-013-002` records
the narrow scope. This configuration-only change retains the full job definition;
application source and existing contract expectations are unchanged. Existing workflow
contracts are reused rather than adding a test that merely mirrors a reversible guard.
Required format/lint and focused workflow/promotion/orchestration checks are recorded
in the task handoff. No complete application/provider rerun is necessary for this guard.

Latest source validation before suspension: commit `b22d131`, hosted run39425930936.
Quality562/564, two IdentityAccess HTTP503 assertions. Standalone Docker bootstrap
processes both passed; kind database-bootstrap failed with safely projected
NpgsqlException. Those observations remain open. This change does not fix or waive
quality failures; the release workflow still runs its full checks before publication.

## Independent quality report — verbatim

**Scoped configuration verdict: PASS**, against `b22d131`.

Only the deployment job gains the temporary `if: ${{ false }}` guard and exception comment. Quality remains enabled; release workflow and deployment steps are unchanged. Remove that guard to restore execution, then remove the explanatory comment.

Validate workflow SHA256: `c5824f13dbbe0d18c37c7bece74d3ea639a39e42527a3f395bde06d9861fea6c`.

This does not resolve or approve existing failing checks. EX-013-002 must retain the owner’s temporary scope and restoration requirement. No builds or provider commands run.

## Independent security report — verbatim

**Pass for the owner-authorized narrow change.**

Against `b22d131`, the workflow diff adds only the EX-013-002 comment and `deployment.if: ${{ false }}`. Quality remains enabled; permissions, credentials and release behavior are unchanged.

Verified workflow SHA256: `c5824f13dbbe0d18c37c7bece74d3ea639a39e42527a3f395bde06d9861fea6c`.

The deployment job will be skipped, not passed. Existing quality failures and unresolved deployment/security acceptance evidence remain outstanding; this review grants no broader waiver or completion approval.

Read-only review; no builds or provider commands.
