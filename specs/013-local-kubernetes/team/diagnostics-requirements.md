# Script diagnostics requirements amendment

Date: 2026-10-21. Feature: [013-local-kubernetes](../spec.md). Assignment baseline: `623bfaf`.

The human owner answered yes to Q1–Q4 and then yes to Q5–Q7. This authorizes the requirements amendment, a mandatory engineering guide discoverable through the engineering index, implementation across all repository scripts and test helpers, regression verification, independent reviews and convergence within feature 013. It does not establish feature acceptance or authorize this batch to commit, push or trigger workflows. Existing completed task history and pending acceptance gates must be preserved.

## Requirement and acceptance mapping

| Approved behavior | Requirement | Acceptance | Outcome evidence required |
| --- | --- | --- | --- |
| Ordinary audited operations stream stdout and stderr; capture machine-readable results | FR-019 | AC-4.4 | Inventory of all scripts/helpers and observable stream behavior; parsed consumers retain valid results |
| Captured failures retain safe operation/tool/duration/category and available status/signal | FR-020 | AC-4.5 | Controlled start, exit, timeout and signal failures identify the cause safely |
| Safe tails include both streams, are bounded and mark truncation | FR-020 | AC-4.5 | Either-stream failures and excessive output retain bounded actionable context |
| Sensitive capture uses safe projections; no secrets, raw arguments, environment values, input payloads, automatic raw logs or privacy bypass | FR-020 | AC-4.5 | Controlled sensitive payloads remain absent from displayed/persisted diagnostics while safe failure context remains available |
| Cleanup failure fails primary success; combined failure retains primary cause and separate cleanup diagnostic | FR-021 | AC-4.6 | Both result combinations verified through public script/test-helper behavior |

SC-008 requires the whole-scope inventory and representative failure evidence. SC-009 requires both cleanup combinations. Concrete output bounds, audited operation classifications and test design belong in the plan and engineering guide, rather than being invented as human decisions here.

## Standards and author verification

Read AGENTS.md, the constitution, feature-team protocol, requirements analyst role, engineering index, formatting, observability and resilience guides, existing spec and built-in requirements checklist. Applied specify and clarify as a targeted amendment under the coordinator's scope; preserved existing sections, IDs and status. No critical ambiguities detected worth formal clarification; no additional questions were asked. Functional scope, domain/data, interaction, nonfunctional attributes, dependencies, edge cases, constraints, terminology, completion signals and placeholders are clear for this amendment; concrete implementation methods remain planning work.

Spec Kit paths were verified with `SPECIFY_FEATURE_DIRECTORY=specs/013-local-kubernetes` and Git Bash `check-prerequisites.sh --json --paths-only`; the default `bash.exe` was inaccessible, so the installed Git Bash executable was used successfully. `.specify/extensions.yml` is absent: no specify/clarify hooks apply. Existing requirements checklist revalidated 16/16 → 16/16, with no marker changes, regressions or unchecked items. No new implementation detail is prescribed by the amendment.

Author review checked requirement-to-acceptance mapping, consistency with existing secret-free diagnostics, stable prior IDs, Markdown readability and retained pending status. These documentation-only edits do not change tests; implementation regression test design and actual verification remain required downstream. Repository format-check and lint are coordinator-owned batch checks and are not claimed here. This author assessment does not replace independent reviewer verdicts or human acceptance.
