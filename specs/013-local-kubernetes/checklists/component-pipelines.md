# Component Pipelines Checklist: Local Kubernetes

**Purpose**: Assess completeness, clarity and consistency of independent component release requirements.
**Created**: 2026-10-22
**Feature**: [013-local-kubernetes](../spec.md)

Generated through speckit-checklist from the reviewer's proposal and confirmed owner scope. Reviewer-owned requirements-quality artifact. `[x]` means requirements quality is satisfied, not implementation completion.

## Selection and execution

- [x] CHK001 Are all seven component identities and the quality-before-component execution boundary explicitly defined? [Completeness, Spec FR-022]
- [x] CHK002 Are PR, automatic main and manual repository-branch selection/publication/promotion outcomes distinguished without contradicting superseded main-only promotion wording? [Consistency, Spec FR-012, AC-3.4]
- [x] CHK003 Are direct and transitive source dependencies, per-component successful baselines and conservative uncertainty fallback defined sufficiently to avoid silently missing affected images? [Clarity, Spec FR-022]
- [x] CHK004 Are documentation-only and no-affected-component outcomes specified, including the mandatory final summary? [Coverage, Spec FR-022]

## Independence, retries and partial releases

- [x] CHK005 Are independent component failures and final run status requirements explicit, without requiring successful components to await unrelated publication/promotion? [Completeness, Spec FR-023]
- [x] CHK006 Are rerun identity, retained same-run/source results, absent/expired artifacts and fresh-run recovery requirements unambiguous? [Edge Cases, Spec FR-023]
- [x] CHK007 Is first publication without a prior component baseline distinguished from a partial initial GitOps release, including which components can promote before all seven immutable images exist? [Clarity, Spec FR-024]
- [x] CHK008 Are the allowed incomplete initial release state and existing whole-release validator/lifecycle behavior reconciled explicitly, so a valid component proposal does not require fabricated digests or block unrelated components? [Consistency, Spec FR-024]

## Promotion and trust

- [x] CHK009 Are same-component stale proposals, concurrent parent changes, unrelated component edits and preservation of exact source/digest provenance specified? [Coverage, Spec FR-024]
- [x] CHK010 Are component promotion changes bounded to local GitOps intent, with no implicit adoption before merge or coupling to an all-component manifest transaction? [Clarity, Spec FR-024]
- [x] CHK011 Are fork-PR build isolation, least publication/promotion authority and untrusted artifact/source boundaries explicit across parent/reusable workflows? [Completeness, Spec FR-022]
- [x] CHK012 Are manual non-main promotion proposals explicitly distinguished from approved merged adoption and real-release acceptance? [Consistency, Spec FR-012, AC-3.4]

## Scope and evidence

- [x] CHK013 Are retained diagnostics/privacy, finite process/network budgets and cleanup outcomes consistent with the existing tooling standard? [Consistency, Spec FR-019–FR-021]
- [x] CHK014 Are excluded preproduction/compatibility infrastructure and remaining local/runtime/human acceptance obligations stated without presenting CI construction as acceptance? [Scope, Spec assumptions]

## Notes

Coordinator materializes; reviewer evaluates after frozen spec/plan/tasks. Implementers may read markers, not approve them.
