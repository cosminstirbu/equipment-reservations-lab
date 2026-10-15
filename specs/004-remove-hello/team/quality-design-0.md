# Preparation Design Review — Hello Retirement

- Reviewer: verifier_reviewer
- Date: 2026-10-15
- Feature: specs/004-remove-hello
- Snapshot: prep-design-0; source baseline 5cfd6233e9d466e9a525f2fe18a30d1aa90015f7
- Verdict: changes_requested
- Scope: spec.md, plan.md, research.md, data-model.md, quickstart.md, contracts/retirement.md, checklists/removal-quality.md; baseline shared validation/transport/topology and mixed tests.

## Finding VQ-001

- Category: requirements
- Severity: medium
- Blocking: true
- Owner: requirements_analyst
- Evidence: spec.md:113 SC-005 permits residual active hello references only for preserved secret-store identity or separated historical/retirement context. plan.md:95 additionally permits negative retirement assertions and legacy-resource fixtures in active tests; plan.md:91 requires those focused evidence cases. The otherwise sensible validation plan therefore cannot literally satisfy the exhaustive SC-005 allowlist.
- Required correction: Clarify SC-005 to permit references used solely in negative retirement assertions and isolated retained-resource fixtures that prove obsolete surfaces/resources are absent or inert, without restoring production hello behavior. Align related allowlist wording if needed. This is a technical evidence clarification within agreed scope.
- Revalidation: reviewer re-read corrected spec/design and related checklist references before closing.

## Assessment

The design otherwise preserves the agreed scope: complete vertical-slice deletion; exact shared ID rule; unchanged booking wire topology/schema, persistence and resilience; neutral connection factory; removal of hello worker health while retaining reservation health; safe bounded reservation readiness telemetry; current documentation/package rename and separately preserved history. Planned negative tests, real infrastructure checks, concern mapping, production telemetry proof and revision-matched independent reviews align with constitution. No additional product decision is required.

Checklist fidelity: coordinator materialized all 20 proposed quality items with accurate FR/SC references and explicit reviewer provenance. The prep-spec-0 approval was faithfully recorded; CHK007/CHK009 require reassessment for this newly identified cross-artifact allowlist mismatch. Other requirements-quality assessments remain satisfied. Tasks are not yet generated; analyze and final preparation verdict remain pending.

Changed files: none. Validation commands: read-only inspection only; application/test execution not yet appropriate. Unresolved questions: none beyond VQ-001 correction.
