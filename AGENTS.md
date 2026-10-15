# Spec Kit agent team

For requests explicitly starting the feature-team loop, the primary agent acts as coordinator. Read docs/agent-team/protocol.md and .codex/agents/coordinator.toml, and delegate using the five specialist roles. Do not create an additional coordinator subagent. Ordinary small tasks do not require the team loop.

Feature documents and the project constitution are shared agreements. Missing product decisions go to the human owner. Reviewers own custom requirements-quality and security verdicts; the coder cannot self-approve them. Preserve existing repository instructions when integrating this file.

Do not merge, deploy, publish, or create external issues merely because a feature passes the loop. These actions require their own authorization.

## Feature-team completion rules

The coordinator owns the final completion-metadata consistency check.

**Synchronize completion metadata.** Before reporting a feature complete, verify that `spec.md`, `tasks.md`, and the team state consistently reflect implementation, independent reviews, convergence, and explicit human acceptance. After acceptance, update the spec's Status to `Complete — implemented, independently reviewed, and accepted YYYY-MM-DD`. Record acceptance before changing that status. Preserve historical review hashes and reports; identify the status edit as a metadata-only change. If a required gate remains pending, name that gate accurately instead of leaving a generic Draft status. Completion checks must inspect these files, not rely solely on task checkboxes.

## .NET source generation

Follow the source-generation rules in docs/engineering/aspnet-core.md. Use supported
.NET generators for compile-time-known JSON contracts, logging, regular expressions,
and other applicable features. Preserve behavior and wire contracts, inspect generator
diagnostics, and document unsupported or dynamic cases for owner review.

## Formatting and static analysis

Follow docs/engineering/formatting-and-linting.md and the committed formatter/linter configuration. After each source-file edit, format that exact file before reading, testing or editing it again: `npm run format -- <edited paths>`. The trusted Codex post-edit hook handles apply_patch/Edit/Write automatically; shell writes and clients without hooks must invoke this command explicitly. Re-read files after formatting. Never format another worker's files or run a whole-repository formatter while workers are writing; formatter commands serialize themselves.

Use Microsoft C# conventions, Angular conventions and the configured Prettier layout. Address CA and IDE diagnostics, including suggestions, rather than suppressing them. Semantic analyzer/ESLint fixes must be explicit and verified; the edit hook only changes layout. Do not disable rules or add suppressions just to pass a gate; document any justified exception for owner review. Generated files and lockfiles are excluded from formatting. After changing formatter configuration, format the owned source scope again.

Blank lines are an authoring responsibility: separate imports from declarations, types and methods from their neighbors, and logical phases such as setup, validation, execution and result handling. Keep related declarations together. Replace nested conditional expressions used for control flow with guard clauses; use multiline callbacks and fluent chains when they obscure the flow. Inspect readability after formatting; a clean formatter check alone is insufficient.

Do not compress multiple declarations/statements into one line. Write block callbacks and exception handlers across readable lines and separate members with blank lines, even when a formatter preserves the original layout. Break long conditions and fluent expressions at natural boundaries. Prefer `var` when the type is apparent; otherwise follow the configured explicit-type rule.

Before handing off changes, run `npm run format-check` and `npm run lint`; run `npm run check` for application changes (requires a running Podman runtime for the real smoke tests). Keep independent review snapshots frozen: any source or analyzer fix invalidates affected evidence and requires revalidation. Preserve the existing feature-team workflow and human acceptance gates.
