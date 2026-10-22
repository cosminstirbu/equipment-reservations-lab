# Manifest Quality Checklist: Local Kubernetes

**Purpose**: Assess requirements clarity and conservative boundaries for scoped manifest quality.
**Created**: 2026-10-22
**Feature**: [013-local-kubernetes](../spec.md)

**Review Ownership**: Reviewer-owned requirements-quality artifact. Checked means reviewed requirements quality, not implementation completion.

## Scope and eligibility

- [x] CHK001 Are exact eligible paths, supported actual Git comparisons/rename endpoints and manual/mixed/uncertain full-quality outcomes explicitly defined? [Clarity, FR-011, AC-3.9; manifest-quality-design scope]
- [x] CHK002 Is main eligibility tied to trusted successful full-quality ancestor evidence, with prior failed source and successful-static cases distinguished? [Consistency, AC-3.9, SC-013]
- [x] CHK003 Is lightweight-gate behavior distinguished from downstream validated publication backlog without skipping required PR component outcomes? [Consistency, AC-3.8, FR-013, FR-022]

## Validation and evidence

- [x] CHK004 Are formatting, committed state/provenance/bootstrap checks and actual bounded render/policy validation specified without claiming complete schema or runtime acceptance? [Completeness, AC-3.8, SC-013]
- [x] CHK005 Are partial aliases restricted to exact missing-component slots while present records, external image pins and ordinary runtime completeness remain strict? [Coverage, manifest-quality-design partial-state boundary]
- [x] CHK006 Are required quality/summary failure outcomes, unchanged full/manual checks, generator test-first evidence and retained unavailable/full-feature gates explicit? [Coverage, AC-3.9, SC-013; T070–T077]

## Notes

- Implementers may read checklist state, not approve it.
- Historical exceptions do not waive this batch's test-first requirements.

