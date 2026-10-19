Affected-design security revalidation round 1 — **pass**

Scope: revised telemetry/privacy evidence in `plan.md` and T018 in `tasks.md`, feature `specs/008-outbox-notifications`. Architect readiness signal received.

The revised evidence remains sufficient:

- Actual successful LISTEN must export through production `.AddNpgsql()`.
- A real listener connection/open failure verifies setup failure classification.
- A real permission/schema failure in the changed snapshot command verifies native failing-command status and exception-event redaction.
- Production-registration removal sensitivity, payload privacy, safe attributes and trace relationships remain required.

This uses faults at the relevant real provider boundary without manufacturing a LISTEN failure through unrelated SQL or permissions. No instrumentation requirement, runtime recovery control or privacy requirement is waived.

No confirmed findings or unresolved security questions. Earlier preparation verdicts remain applicable outside this bounded change.

Checks: read-only review of the revised plan matrix, explanatory rationale and T018. No files changed, tests executed or source implementation reviewed. Implementation security review and runtime evidence remain pending.
