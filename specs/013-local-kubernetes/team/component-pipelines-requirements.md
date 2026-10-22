# Component pipeline requirements amendment

Feature: [013-local-kubernetes](../spec.md). Confirmed amendment: 2026-10-22. Baseline HEAD: `424a6701ac97206ecc0067e7ea41763fb3abc950`.

The coordinator supplied confirmed owner decisions for independent component pipelines. These supersede the combined manifest/all-success release model and the earlier main-only promotion interpretation. This assignment authorizes specification work, not committing, pushing, publication, workflow execution or feature acceptance.

## Decisions and acceptance mapping

| Confirmed behavior | Requirement | Acceptance | Verification obligation |
| --- | --- | --- | --- |
| Quality prerequisite workflow first; affected PR builds for both architectures without publication/publish secrets, including forks; required final summary even when none affected | FR-011 | AC-3.1 | Quality gating, fork isolation, architecture and empty-selection outcomes |
| Main publishes affected components; manual repository-branch invocation selects all seven; either may propose component-specific local GitOps updates; merge required before adoption | FR-012 | AC-3.2, AC-3.4 | Main/manual branch matrix, immutable images, exact source SHA/branch and merge boundary |
| Transitive shared references, Dockerfiles, locks, ignore/global/pipeline inputs affect selection; uncertainty selects all; per-component successful publication baseline preserves failed work | FR-022 | AC-3.5 | Impact matrix, unknown impact and a failed component followed by later main execution |
| Seven separate reusable component workflows run in parallel after quality; independent failure does not cancel/block others | FR-023 | AC-3.2, AC-3.6 | Mixed component success/failure and retained independent progress |
| Failed-job reruns retain successful same-run/same-SHA results; missing required artifacts fail clearly and direct a fresh run | FR-023 | AC-3.6 | Rerun retention, wrong-source/run rejection and missing-artifact failure |
| Component-specific promotion blocks/refreshes stale same-component changes, preserves unrelated proposals and no-ops identical deployed digest | FR-024 | AC-3.7 | Stale/concurrent/unchanged update outcomes |

SC-010 covers branch/main release behavior; SC-011 covers quality, PR and impact selection; SC-012 covers independent failures, reruns and promotions. Exact source provenance is mandatory per component; a combined seven-image successful release is not required.

## Initial unpublished state

The architect identified an absent initial release record and previously coupled complete-inventory validation. FR-024 and AC-3.7 require initial partial component records to remain valid while unknown/unpublished components stay explicitly and safely unreleased. No image reference or success may be fabricated for them. This derives from the confirmed independent-publication requirement; it does not relax complete-demo setup acceptance (AC-1.1). Record layout, validation, bootstrap identity and safe unreleased-state rendering are planning responsibilities.

## Scope and author verification

Preparation repair CP-Q001: AC-3.3, FR-013 and SC-004 now distinguish deployment-reference-only impact from outstanding unpublished build inputs. Deployment-reference changes alone do not select otherwise-current components or create recursive promotions; they do not erase a prior component publication failure. A later deployment-only main merge still compares that component against its last successful publication and selects outstanding build-input changes (FR-022 / AC-3.5). This is a consistency consequence of the confirmed per-component publication baseline, not a new product decision. Verification must cover both cases.

Existing compatibility tests remain the compatibility boundary; new OpenAPI compatibility gates and preproduction environments are excluded. Existing diagnostic/privacy standards, independent reviews, convergence, runtime/release evidence and explicit human acceptance remain binding. Prior commits and completed tasks are preserved; affected design and review evidence must be refreshed for this amendment.

Read current AGENTS.md, role, protocol, constitution, engineering index, tooling guide, existing specification and requirements checklist; reused previously read installed specify/clarify instructions and applicable formatting/testing/privacy guidance. Applied specify/clarify as targeted existing-feature changes with explicit feature selection and no shared active-feature persistence. No additional product questions remain for this confirmed scope; exact algorithms, workflow wiring and storage mechanisms are planning decisions. Clarification taxonomy is clear across functional scope, domain/state, interaction, quality attributes, dependencies, edge cases, constraints, terminology and completion signals; implementation methods are deferred to planning.

Revalidated the built-in requirements checklist: 16/16 remains passing with no changed markers or remaining unchecked items. Owner-prescribed workflow boundaries are delivery constraints, not invented architecture. Author mapping/consistency review checks removed contradictory main-only promotion and whole-release language in the current specification. This author assessment does not supply independent reviewer approval. Full repository format-check/lint remain coordinator batch checks; no code or tests are edited by this assignment.
