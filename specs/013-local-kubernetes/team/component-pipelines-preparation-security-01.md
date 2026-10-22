# Component pipelines preparation security review

**Verdict: changes_requested.** One blocking design finding; the remaining reviewed trust boundaries are sound.

**Scope:** feature 013, baseline `424a6701ac97206ecc0067e7ea41763fb3abc950`; frozen spec, plan, T060–T069, component design, runtime contract and quickstart. Reviewed design SHA-256: `21cabc51978df0bd61ee69d4e427d752f7f834a696d7954785e0016856cb932d`.

## CP-SEC-001 — Medium, blocking: queued sibling promotions can be canceled

**Evidence:** `team/component-pipelines-design.md`, “Independent deployment records and promotion,” specifies one global promotion concurrency group with cancellation disabled, but no queue policy.

**Scenario/preconditions:** three or more component promotions become ready while one occupies the group. GitHub’s default allows only one pending job; a newly queued promotion replaces the previously pending sibling even with `cancel-in-progress: false`. This violates FR-023’s independent component progress.

**Remediation:** specify `queue: max` with `cancel-in-progress: false` for promotion serialization. Record the platform’s bounded queue and make overflow/cancellation visible in the required summary; retain stale-intent/CAS checks rather than relying on queue order.

**Verification:** workflow contracts must verify queue preservation and no sibling dependency barrier. Available semantic validation must support the selected syntax; unavailable live scheduling evidence remains pending. [Official concurrency documentation](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency)

## Other reviewed boundaries

- Read-only PR calls directly use the common core; trusted wrappers own separately narrowed publication and promotion jobs.
- Artifact/baseline authority binds repository, component, source ref/SHA, workflow, run/attempt and successful producer job. Fixed-member archive bounds prevent arbitrary extraction.
- Original rerun intent retains expected target component and managed proposal head; reruns cannot silently refresh stale authority.
- Promotion separates candidate source from fresh target blobs, preserves unrelated components/human edits and retains narrow changes and CAS.
- Missing historical baselines rebuild conservatively; missing required same-run evidence fails. Partial records cannot establish complete runtime readiness.
- Manual repository-branch promotion proposals follow the newly approved scope; merge remains the adoption boundary.

Read-only inspection only; no changes, intrusive probes or external execution. This report grants no exception, publication authorization or feature acceptance.
