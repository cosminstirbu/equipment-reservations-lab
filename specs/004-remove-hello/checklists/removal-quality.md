# Removal Requirements Quality Checklist: Remove Hello

**Purpose**: Assess complete hello retirement and preservation of booking behavior, useful coverage, and existing state.
**Created**: 2026-10-15
**Feature**: [spec.md](../spec.md)

**Note**: This custom checklist follows the `$speckit-checklist` requirements-quality workflow.
**Review Ownership**: The verifier reviewer owns this checklist. Mark `[x]` only when the requirements-quality criterion is satisfied.
**Marker Semantics**: `[x]` means requirements quality is approved; it does not mean implementation is complete.

## Requirement Completeness

- [x] CHK001 Are hello retirement requirements explicit across UI, API, message production/consumption, transient storage, telemetry, configuration, and current documentation? [Completeness, Spec FR-001–003/008]
- [x] CHK002 Are shared booking contracts and validation explicitly distinguished from hello-only functionality, including the agreed ReservationMessaging rename? [Completeness, Spec FR-005, Assumptions]
- [x] CHK003 Are booking wire contracts, durable messaging topology, persistence, and equipment-ID validation preservation requirements explicit? [Completeness, Spec FR-004/006, SC-002]
- [x] CHK004 Are current documentation and project/package naming obligations distinguished from historical material and preserved local identifiers? [Completeness, Spec FR-005/008, SC-005, Assumptions]

## Requirement Clarity and Consistency

- [x] CHK005 Is immediate removal without compatibility endpoints or a deprecation period stated unambiguously? [Clarity, Spec FR-002]
- [x] CHK006 Are direct visits and requests to retired hello surfaces covered without requiring an undocumented replacement feature? [Clarity, Spec US1 scenario 3, Edge Cases, FR-002]
- [x] CHK007 Is the meaning of complete removal bounded by an explicit list of allowed historical and local-identity references? [Clarity, Spec SC-005, Assumptions]
- [x] CHK008 Are booking preservation requirements consistent with removing hello dependencies from readiness, security, and telemetry? [Consistency, Spec FR-009–010, Edge Cases]

## Acceptance Criteria Quality

- [x] CHK009 Are the removal success criteria objectively measurable across all declared active source, test, configuration, and documentation scopes? [Measurability, Spec SC-001/005]
- [x] CHK010 Are unchanged booking behavior and shared validation measurable against named existing contracts or acceptance criteria? [Measurability, Spec SC-002, Edge Cases, Assumptions]
- [x] CHK011 Are useful replacement coverage obligations defined by the underlying infrastructure, security, and telemetry behaviors rather than test counts? [Measurability, Spec FR-007, SC-004]

## Scenario and Edge-Case Coverage

- [x] CHK012 Are normal booking, dependency failure, broker recovery, and restart/persistence preservation scenarios included or explicitly referenced? [Coverage, Spec US1 scenario 2, US2 scenarios 1/3, SC-002]
- [x] CHK013 Are mixed hello/booking tests covered by requirements that preserve their meaningful booking assertions? [Coverage, Spec US3 scenario 3, FR-007]
- [x] CHK014 Are malformed and boundary equipment identifiers covered by the shared-validation preservation agreement? [Edge Cases, Spec FR-004/005, Edge Cases]
- [x] CHK015 Are previously provisioned hello queues/exchanges and stored local state explicitly excluded from destructive cleanup? [Coverage, Spec US2 scenario 2, FR-006]

## Non-Functional Requirements

- [x] CHK016 Are booking browser-write protections, accessibility, and telemetry privacy/correlation requirements preserved explicitly or through authoritative references? [Non-Functional Requirements, Spec US1 scenario 4, FR-007/009/010]
- [x] CHK017 Are continued booking dependency health and failure signals specified when hello telemetry is removed? [Non-Functional Requirements, Spec FR-010, US2 scenario 4]

## Dependencies and Historical Agreements

- [x] CHK018 Are the AppHost secret-store identifier, existing secrets, persisted data, and reservation topology identities explicitly protected? [Dependencies, Spec FR-004/006, Assumptions]
- [x] CHK019 Are historical specifications, task records, review reports, and hashes protected from rewriting, with retirement annotations distinguished from past evidence? [Consistency, Spec US3 scenario 4, FR-008]
- [x] CHK020 Are required validation, independent review, convergence, and explicit human acceptance gates consistent with the constitution and team protocol? [Dependencies, Spec FR-011, SC-006]

## Notes

- Leave items unchecked until the verifier reviewer supplies an explicit evaluation.
- `$speckit-implement` reads checklist state but must not modify markers.
- Built-in `requirements.md` remains owned by specify/clarify.
- Checklist approval concerns the written agreements; implementation evidence is reviewed separately.

Reviewer evaluation: verifier_reviewer explicitly approved CHK001–CHK020 on prep-spec-0, 2026-10-15. Coordinator materialized unchecked items before recording these verdicts. Design/tasks and implementation reviews remain separate gates.

prep-design-0: reviewer reopened CHK007/CHK009 for VQ-001 (SC-005 evidence-reference allowlist); corrected spec awaits original-reviewer revalidation.

prep-design-1: original verifier closed VQ-001 and reapproved CHK007/CHK009; all 20 requirements-quality items pass.

Owner-directed evidence update reviewed by verifier_reviewer, 2026-10-15: CHK001–CHK020 remain satisfied for the revised agreements. Obsolete-surface outcomes are assessed through source/configuration/documentation review; no retired-feature absence tests are required or approved. Positive booking coverage and isolated state-preservation checks remain required. Earlier red absence-test evidence is superseded history, not evidence of retained tests. Implementation verdict remains pending.
