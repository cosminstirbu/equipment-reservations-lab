# Branch release requirements amendment

Date: 2026-10-22. Feature: [013-local-kubernetes](../spec.md). Baseline: current feature working tree following the 2026-10-21 diagnostics amendment.

The owner requested: “Let's also update so we can run the release workflow from any branch”. The coordinator communicated the interpretation: manual invocation from any repository branch, automatic pushes restricted to main, and promotion proposals restricted to main to avoid adoption of unmerged source. The latter boundaries are coordinator interpretations, not additional quoted human decisions. No actual publication, workflow execution, commit or push is authorized by this amendment.

## Requirement and acceptance mapping

| Behavior | Requirement | Acceptance | Required evidence |
| --- | --- | --- | --- |
| Main application merges retain automatic publication and reviewable immutable promotion | FR-012 | AC-3.2 | Main publication/promotion regression evidence |
| Manual publication accepts any repository branch | FR-012 | AC-3.4 | Main and non-main manual release paths publish both architecture targets with source provenance |
| Ordinary non-main pushes do not publish | FR-012 | AC-3.4 | Trigger and guard evidence excluding automatic non-main publication |
| Non-main publication does not propose promotion or change deployment references | FR-012 | AC-3.4 | Branch release evidence showing zero promotion proposals and reference changes |

SC-010 captures the branch/main verification matrix. Actual registry publication remains separately authorized; tests and generated workflow changes alone do not satisfy the existing real-release acceptance gate.

## Author assessment

Applied specify and clarify as a targeted amendment to the existing feature; retained prior IDs, completed history and pending feature status. No new product question is needed for the coordinator's supplied scope. Clarification coverage is clear for functional scope, roles, negative flows, dependencies, constraints, terminology and completion signals; exact event guards, ref validation, concurrency and tests remain planning responsibilities. Tags are not repository branches and are outside this extension.

Existing constitutional privacy, credential isolation, independent review and human acceptance requirements remain binding. The installed specify/clarify instructions and previously read AGENTS.md, constitution, team protocol and engineering guidance remain applicable. The built-in requirements checklist was revalidated against the targeted changes: 16/16 remains passing, with no marker changes. This is an author assessment, not an independent verdict. Repository format-check/lint remain coordinator batch checks. No code, plan, tasks or team state is edited by this assignment.
