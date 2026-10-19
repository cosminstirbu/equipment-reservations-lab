# Feature-team protocol

## Start and state
The primary session is the coordinator. Load its role instructions; spawn only the five specialists as needed. The coordinator owns a feature-local `team/` directory containing run-state.json, findings.json and review reports. Create it from docs/agent-team/templates after the feature directory exists. These team files are our conventions, not built-in Spec Kit artifacts or machine-enforced gates.

Each assignment includes feature_directory, revision or working-tree snapshot identifier, task/finding IDs, inputs, allowed writes and expected result. Resolve Spec Kit's active feature explicitly: verify `.specify/feature.json` or set SPECIFY_FEATURE_DIRECTORY consistently before invoking skills. Do not change the shared active feature while workers are running. For concurrent features, use separate checkouts and consistent feature state.

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
3. Freeze the working tree during independent quality and security reviews. Reviewers return structured findings and verdicts; coordinator persists them. Parallel review is allowed, parallel writes require disjoint ownership or worktrees.
4. Coordinator runs converge only after implement has run on current tasks.md. It may append tasks; it must not rewrite code or remove old tasks through that command.
5. Route every blocking finding. Requirements changes invalidate affected plans, tasks and review evidence; design changes invalidate affected implementation and reviews. Code changes invalidate affected checks and reviews. Re-run the appropriate preparation gates after baseline changes.
6. Deduplicate by root cause and stable finding ID. Coordinator tracks assignments; original reviewer validates closure. Convergence tasks are addressed by coder and assessed again by converge. Preserve completed task history.
7. Re-run checks, reviews and convergence after fixes. A clean review on an old revision cannot approve a new one. Do not rerun specify/plan/tasks wholesale on every code repair.

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
Default limits: three preparation repair rounds and three implementation repair rounds. A round is one repair batch followed by revalidation, not one agent message. Stop early if the same blocking root cause recurs twice with no materially new evidence or fix. Budget exhaustion yields needs_intervention, not done. Report blocker, attempted fixes, current evidence and the specific decision/action needed. Resume from persisted state after human input; do not reset limits silently.

## Optional issue export
Taskstoissues is an external tracking action, not a completion gate. Invoke only when explicitly requested and its installed command/tool requirements are met. Keep issue links mapped to stable task IDs.
