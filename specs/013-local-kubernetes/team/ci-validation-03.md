# Bounded CI follow-up validation

Source snapshot: `ci-followup-013-03`, six files against baseline `c1ac45c`.
The original three fixes remain in snapshot `ci-repair-013-01` and its historical
validation reports. This follow-up does not redefine or waive their requirements.

## New evidence

Hosted run 39417401158 passed the CoreDNS/platform regressions and eight application
modules, including broker, identity and outbox Integration cases. Its 49 Notifications
cases could not execute because the PostgreSQL assembly fixture encountered an exact
Docker 28 pre-process TCP publication collision. The separate application deployment
advanced past CoreDNS, then timed out waiting for an unknown bootstrap Job. The cluster
was deleted by the existing always-cleanup step, and raw private output was suppressed;
its Job identity and underlying failure cannot be established retrospectively.

The reviewed follow-up adds one bounded initial-start retry only for that exact typed
Docker 500 networking/listen failure, plus bounded whitelisted failed-Job status
reporting. It does not change application retries, provider restart semantics, timeout
budgets, test parallelism, bootstrap behavior or success criteria. Unknown Job failure
is an open observation, not a repaired code defect by inference.

## Test-first and independent evidence

- Retained real PostgreSQL migration case passed after direct delegation extraction.
- The initial Docker boundary regression failed 4/14 cases for intended retry/bound/
  cancellation behavior; ten negative cases passed. Then all 29 Persistence cases
  passed, including the 14 boundary cases and real PostgreSQL behavior.
- Public CI orchestration regressions failed 3/9 for the missing safe Job-stage/status
  behavior, then passed 9/9 after implementation. Hostile sentinels, malformed and
  oversized responses and diagnostic errors cannot expose raw provider data.
- Scoped CI orchestration plus actual render/TLS fixture contract passed 10/10 with
  pinned kubectl1.35.8. No application Kubernetes/AppHost test was introduced.
- Independent quality and security code verdicts pass, including final six-file hashes
  and explicit JSON annotation addenda. See `ci-quality-review-03.md` and
  `ci-security-review-03.md`.

Final format-check and lint passed (zero build warnings/errors, no style suppression).
Earlier JSON002 style failures are recorded, not counted as passes: raw strings alone
were insufficient; four explicit JSON language annotations corrected the final bytes
without changing payloads. The full application check passed on those exact bytes: 555 backend, 64 frontend and 24 tooling cases, zero failures/skips; backend duration 3m10.027s.
The 77-case full provider deployment suite passed before this follow-up; only CI status
projection and initial-start handling subsequently changed. Targeted changed CI suites
were rerun; unrelated provider fixtures were not repeated without a new concern.

## Scope and remaining gates

This is the third repair batch in the existing feature-team budget. The failed Job
needs actual status from the next hosted run before an evidence-based correction can
be proposed; diagnostics alone do not establish its resolution. Actual Docker checks
remain required for hosted acceptance. The original ten release/runtime/human feature
gates remain pending; no acceptance, merge or publication is implied.

Per-commit [PR checks](https://github.com/cosminstirbu/equipment-reservations-lab/pull/1/checks)
remain the authoritative hosted record; the PR description summarizes final outcomes.
