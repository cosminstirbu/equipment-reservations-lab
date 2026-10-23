# Remote Kustomize requirements amendment

Date: 2026-10-23. Feature: [013-local-kubernetes](../spec.md).
Baseline: `3161f5d`; dedicated worktree `equipment-reservations-argocd-kustomize`.

## Authority and scope

The coordinator supplied the owner's completed interview answers: final implementation
with local testing; network fetching allowed; replace only Argo CD, preserving the
cluster and all application state and credentials. The owner selected remote Kustomize
in place of Helm. Immutable upstream identity and integrity verification, existing
v3.5.5, local patches, image digests, security and lifecycle behavior are retained.
No migration compatibility is required. This records scope, not human acceptance.

Applied `speckit-specify` and `speckit-clarify` as a targeted amendment to the existing
feature, without regenerating artifacts or modifying shared active-feature state.
No critical ambiguities detected worth formal clarification; zero new questions.

## Requirement and acceptance mapping

| Requirement | Acceptance criteria | Required evidence |
| --- | --- | --- |
| FR-025: verified remote installation, no full vendored manifest | AC-2.5 | Repository inspection, render/configuration comparison, successful local setup and rerun, authenticated access and reconciliation |
| FR-025: fail before unverified apply or replacement | AC-2.6 | Controlled unavailable-upstream and integrity-mismatch checks, finite failure and safe diagnostic evidence; retained working installation |
| FR-026: Argo-only replacement and retained state/lifecycle | AC-2.7 | Before/after fixtures for databases, broker, Dashboard history and application credentials; cluster retained; replacement, rerun and stop/resume runtime results |
| SC-014: local qualification | AC-2.5–AC-2.7 | Revision-matched commands, environment, results and nonsensitive evidence; independent reviews remain required |

## Standards and clarification coverage

Read AGENTS.md, constitution, team protocol and requirements analyst role, engineering
index, formatting/static-analysis, tooling and testing guides. Constitutional test-first,
privacy, bounded failure, state protection and independent approval requirements apply.
The amendment adds no policy exception, test code or design mechanism.

All clarification categories are Clear: functional scope, domain/data, interaction,
nonfunctional qualities, external dependencies, failures, constraints, terminology,
completion signals and placeholders. Concrete fetching, timeout and test-boundary
choices belong to the plan. No unresolved business question remains.

## Author verification

- Explicit `SPECIFY_FEATURE_DIRECTORY=specs/013-local-kubernetes` prerequisite check
  passed through Git Bash with `--json --paths-only`; returned the intended worktree
  and existing feature files. Default Windows bash launcher was unavailable.
- `.specify/extensions.yml` is absent: no specify/clarify pre/post hooks apply.
- Existing built-in requirements checklist revalidated: 16/16 to 16/16; no marker
  changes or unchecked items. Explicit technology constraints remain in clarifications
  and assumptions; no new architecture is prescribed by outcomes.
- Markdown links, requirement identifiers, acceptance mappings and readability inspected.
  Independent reviewer verdicts and implementation evidence are pending.
- Required format-check/lint handoff checks remain coordinator-owned for the combined
  change; this amendment changes only Markdown agreements, excluded from autoformatting.
