# Feature-team protocol

## Start and state
The primary session is the coordinator. Load its role instructions; use the five specialist roles as needed, without requiring every role for every task. Ordinary small tasks use one agent. The coordinator owns a feature-local `team/` directory containing run-state.json, findings.json and a review/evidence ledger. Use existing templates where useful. These files are conventions, not machine-enforced gates.

Each assignment includes feature_directory, revision or working-tree snapshot identifier, task/finding IDs, inputs, allowed writes and expected result. Resolve Spec Kit's active feature explicitly: verify `.specify/feature.json` or set SPECIFY_FEATURE_DIRECTORY consistently before invoking skills. Do not change the shared active feature while workers are running. For concurrent features, use separate checkouts and consistent feature state.

Supply concise task briefs and relevant artifact paths rather than full conversation history
when those suffice. Reuse agents and unchanged standards already read. Delegate independent
implementation or review work; avoid duplicate investigations and agents whose sole job is
to restate policy. Parallel writes require disjoint ownership or separate worktrees.

## Scope and milestones

Before substantial implementation, agree on independently usable milestones, acceptance
evidence and a time/token or tool-execution budget. State the threat model, including which
operator/workflow identities are trusted and whether their compromise is in scope. Prefer
established platform controls; explain the concrete gap and implementation/test/review cost
before adding custom authorization, cryptography or provenance machinery.

For infrastructure, perform cheap feasibility checks first: quota/SKU availability, critical
provider capabilities and identity/access prerequisites. An authorized disposable spike may
resolve uncertainty before permanent orchestration code. Its spend, data and cleanup scope
must be bounded. Separate a first working deployment from delivery automation, recovery and
advanced hardening where practical. Deferring approved requirements requires owner agreement;
milestone completion never implies that the whole feature is accepted.

Tasks should produce observable milestone outcomes. Separate source implementation from
live qualification when they have different prerequisites, so partial progress is visible
without calling unqualified behavior complete.

## Preparation loop
1. Establish the constitution with the human owner once; update only on an intentional project-policy change. No agent may relax it to clear a gate.
2. requirements_analyst executes specify and clarify. Missing business decisions pause dependent work; research can continue.
3. architect_planner executes plan.
4. verifier_reviewer proposes custom requirements-quality checklists; coordinator invokes checklist/materializes artifacts and records only explicit reviewer verdicts. Security reviewer evaluates requirements and design. Built-in requirements.md remains owned by specify/clarify.
5. Route requirements findings to analyst and design findings to architect. Never treat checked requirements-quality items as implementation evidence.
6. architect_planner generates tasks. verifier_reviewer executes analyze; security reviewer checks relevant changes. Repeat targeted repairs until preparation gates pass.

## Implementation loop
1. Freeze the approved requirements and design baseline. Assign a bounded task batch to coder using implement. A batch may be the whole feature for small work.
2. Coordinator arranges required build, test and acceptance checks. Record command, environment, exit status, result and tested revision. Skipped/unavailable checks remain pending, never pass.
3. Freeze the affected milestone files for independent quality review. Security reviews the initial design and milestone changes affecting trust boundaries, IAM, secrets, recovery or destructive operations. Both independent verdicts remain required at feature handoff. Review low-risk follow-up fixes as targeted deltas; reuse unaffected verdicts with an explicit scope statement. Temporary diagnostics follow the tooling classification and need targeted security review only when changing the assessed privacy/authority boundary.
4. Coordinator runs converge only after implement has run on current tasks.md. It may append tasks; it must not rewrite code or remove old tasks through that command.
5. Route every blocking finding. Requirements changes invalidate affected plans, tasks and review evidence; design changes invalidate affected implementation and reviews. Code changes invalidate affected checks and reviews. Re-run the appropriate preparation gates after baseline changes.
6. Deduplicate by root cause and stable finding ID. Coordinator tracks assignments; original reviewer validates closure. Convergence tasks are addressed by coder and assessed again by converge. Preserve completed task history.
7. Re-run affected checks and targeted reviews after fixes; run integrated gates at milestone handoff. A prior verdict covers only unchanged inputs/boundaries, never a changed implementation. Run convergence for the integrated milestone/feature, rather than every small fix. Do not rerun specify/plan/tasks wholesale on every code repair.

## Evidence economy

Keep current status in run-state.json, stable findings in findings.json and append reviewer
verdicts/evidence to one ledger such as `team/reviews.md`. Preserve reviewer-authored verdicts
verbatim with their scope/revision. Separate reports are useful for substantial reviews,
not mandatory for every diagnostic probe, passing command or small fix. Preserve existing
historical reports; this convention does not authorize deleting or rewriting their evidence.

Record command, relevant environment/tool versions, outcome and source revision once per
cohesive check. Reference existing records instead of copying them into multiple checkpoints.
Generate hashes when an exact byte binding is necessary; do not hand-maintain duplicate hash
tables. Keep detailed diagnostic content under the tooling guide's access/retention rules,
and put concise outcomes and limitations into agent handoffs.

## Findings and verdicts
Use findings.json. Findings have category requirements/design/code/security/environment, severity critical/high/medium/low, blocking flag, evidence and owner. All critical/high security findings block by default. Mark lower-severity findings blocking when they violate an acceptance criterion or agreed policy. Agree on any different threshold before execution.
Review outcomes: pass, changes_requested, needs_information. Absence of findings is not pass when review scope or evidence is incomplete. Human risk acceptance must identify finding, rationale, owner and date. Agents cannot record risk acceptance without that decision. Accepted security findings are reported in the final result.

## Completion contract
All acceptance criteria have revision-matched evidence; tasks are complete; required checks pass; no unresolved blocking quality/security findings remain; latest convergence finds no gaps; artifacts agree; any required human acceptance is recorded. Report done only when every condition holds. Done means feature ready for the next authorized action, not automatically merged or deployed.

### Completion metadata

The coordinator owns the final completion-metadata consistency check. Before reporting a
feature complete, inspect `spec.md`, `tasks.md`, and the team state together. They must
consistently reflect implementation, independent reviews, convergence, and explicit human
acceptance; task checkboxes alone are insufficient evidence.

Record human acceptance before changing the spec's Status to
`Complete — implemented, independently reviewed, and accepted YYYY-MM-DD`. Preserve
historical review hashes and reports, and identify this status edit as metadata-only.
If a required gate remains pending, name that gate accurately in the status instead of
leaving a generic Draft status or claiming completion.

## Bounded execution
Set budgets before work begins. Default to three preparation and three implementation repair
rounds per agreed milestone. A round is a repair batch followed by revalidation, not one
message. Milestones cannot be split or renamed after a blockage to reset the budget.

Infrastructure/provider investigations default to 30 minutes of active investigation or two
unsuccessful provider runs without actionable evidence, whichever comes first. Actionable
evidence supports a concrete fix or distinguishes a hypothesis; another coarse signature
alone is insufficient. Environment investigations have this budget even when no source edit
has occurred. Cleanup must still complete when a budget is reached.

At a limit, report needs_intervention with the evidence and a concrete choice: repair the
environment, use an approved alternative runner, simplify scope or defer the blocked gate.
Continue independent work where possible. An extension must name the changed strategy and
next observable deliverable, not merely request more rounds of the same sampling. Existing
spend, privacy, permission and exception approvals remain separate. Resume from persisted
state after the owner decision; never silently reset budgets or label an unavailable gate passed.

## Optional issue export
Taskstoissues is an external tracking action, not a completion gate. Invoke only when explicitly requested and its installed command/tool requirements are met. Keep issue links mapped to stable task IDs.
