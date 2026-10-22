# Manifest-only quality preparation security review

**Verdict: pass for preparation.** No blocking design findings.

**Scope:** feature 013 at `9f5e592ab89faa299740ae693a6de3af8fcac942`; FR-011, AC-3.8/AC-3.9, SC-013, T071–T077, design/requirements, quickstart and runtime amendment.

The design preserves the relevant trust boundaries:

- Eligibility uses an exact ten-path allowlist and real NUL-delimited Git comparisons, including both rename/copy endpoints. Unknown, mixed, missing-history or ambiguous changes retain full quality.
- Main eligibility requires trusted successful full-quality ancestor evidence, including repository/ref/workflow/job identity and the fixed successful completion step. Static success cannot advance that baseline or conceal earlier unchecked source changes.
- PR classification needs no credentialed lookup. Main discovery adds read-only Actions authority; publication/promotion permissions remain unchanged.
- Static validation retains real committed-state checks and pinned, checksum-verified Kustomize rendering.
- Partial-image allowances are restricted to seven exact workload/container slots and validated absent records. Present records require exact rendered references; third-party digest, Secret, resource and storage policies remain. Runtime completeness is unchanged.
- The required quality job and downstream dependencies remain. Manual runs retain full quality; publication backlog remains independently governed.
- Generator formatting correction retains separate regression evidence and source-change checks.

Implementation review must verify actual history/API failure handling, marker provenance, rename/deletion parsing, all seven slot identities, overlay image overrides and failure propagation through the required summary. Tests must establish that the static lane invokes no application/runtime/image work.

Reviewed design SHA-256: `1d65cad91080b829bdd4a503465e1b15fc84dc90c0ad7da3cb3ba0d4150f26cb`.

Read-only inspection; no files changed or external actions performed. New gate implementation remains pending T072 onward. T070, runtime qualification and human feature acceptance are not waived.
