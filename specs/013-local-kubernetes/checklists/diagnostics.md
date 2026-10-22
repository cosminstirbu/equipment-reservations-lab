# Diagnostics Checklist: Local Kubernetes

**Purpose**: Assess completeness and clarity of the approved repository script diagnostics requirements.
**Created**: 2026-10-21
**Feature**: [013-local-kubernetes](../spec.md)

**Review Ownership**: Reviewer-owned requirements-quality artifact. `[x]` means reviewed requirements quality, not implementation completion. Generated items start unchecked.

## Scope and output contracts

- [x] CHK001 Is the assessment scope explicitly all repository scripts and test helpers? [Completeness, Spec FR-019, SC-008]
- [x] CHK002 Are stdout and stderr visibility requirements stated for ordinary operations, with explicit machine-readable and sensitive capture boundaries? [Clarity, Spec FR-019, AC-4.4]
- [x] CHK003 Are failure identity, duration, category, available exit status and signal requirements specified? [Completeness, Spec FR-020, AC-4.5]
- [x] CHK004 Are captured output bounds and truncation indicators objectively specified, including both output streams? [Measurability, Spec FR-020; Plan diagnostics output limits]

## Privacy and failure scenarios

- [x] CHK005 Are sensitive projections and excluded diagnostic data stated explicitly without weakening existing credential and URL privacy? [Consistency, Spec FR-020, Edge Cases]
- [x] CHK006 Are automatic raw-log persistence and privacy-bypassing debug modes explicitly excluded? [Clarity, Spec FR-020]
- [x] CHK007 Are start failure, timeout, signal, either-stream-only failure and excessive output covered by requirements? [Coverage, Spec SC-008, Edge Cases]
- [x] CHK008 Are cleanup-after-success and simultaneous primary/cleanup failure outcomes unambiguous? [Coverage, Spec FR-021, SC-009]

## Evidence and authority

- [x] CHK009 Are inventory and representative failure evidence required without treating requirements checkmarks as implementation evidence? [Measurability, Spec SC-008, SC-009; diagnostics-requirements.md]
- [x] CHK010 Is the approved diagnostic batch distinguished from feature acceptance and external-action authorization? [Consistency, Spec SC-007, Assumptions; diagnostics-requirements.md]

## Notes

- `$speckit-implement` reads checklist state and must not modify markers.
- Built-in requirements.md remains owned by specify/clarify.
- Numerical output bounds belong to the approved design; CHK004 requires the frozen plan.
