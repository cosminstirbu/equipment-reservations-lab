# Repository agent instructions

## Required reading and verification

Before editing, read the [constitution](.specify/memory/constitution.md) and use the
[engineering index](docs/engineering/README.md#required-reading-by-task) to read every
applicable guide. For review-only work, do this before assessing the changes. Follow
required cross-references in those guides; linked requirements remain binding regardless
of document depth. Reuse material already read in this session while it remains current.

Before implementation, identify the applicable standards and the evidence needed to verify
them. Record task-specific decisions in the existing plan or review artifacts, or briefly
in the task response for ordinary work. Use the testing guide's design record when changing
tests. Resolve policy conflicts and obtain required exception approval before dependent
work; continue unaffected work where possible.

During editing, follow the formatting guide's
[per-edit workflow](docs/engineering/formatting-and-linting.md#per-edit-workflow).
Before handoff, run its [required checks](docs/engineering/formatting-and-linting.md#required-checks-for-handoff)
and inspect the changes against every applicable requirement, including those automated
checks cannot establish. Report evidence, remaining deviations, and unavailable checks.
This author check does not replace independent reviewer verdicts or human acceptance
required by the feature-team workflow.

When updating instructions or standards, use the constitution's
[artifact ownership and amendment rules](.specify/memory/constitution.md#governance).
Edit a requirement in its authoritative document and update discovery links as needed.

## Spec Kit agent team

For requests explicitly starting the feature-team loop, the primary agent acts as
coordinator. Read the [protocol](docs/agent-team/protocol.md) and
[coordinator role](.codex/agents/coordinator.toml) before delegating to the five specialist
roles. Do not create an additional coordinator subagent. Ordinary small tasks do not
require the team loop.

Before reporting a feature complete, apply the protocol's
[completion contract and metadata procedure](docs/agent-team/protocol.md#completion-contract)
under the constitution's [quality gates](.specify/memory/constitution.md#development-workflow-and-quality-gates).
