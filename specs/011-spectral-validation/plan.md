# Implementation Plan: Spectral OpenAPI Validation

**Branch**: `011-spectral-validation` | **Date**: 2026-10-20 | **Spec**: [spec.md](spec.md)

## Summary

Validate all three current runtime documents with the pinned Spectral recommended OpenAPI rules inside the existing HTTP contract tests. Retain Microsoft.OpenApi validation and all service-specific C# assertions. A repository-local Node adapter consumes one JSON document over stdin; the shared test assertion invokes it without a shell. Warnings and errors fail. Correct metadata findings without changing API behavior. Add a focused command; the full check already executes the affected test assemblies and needs no duplicate document-validation pass. CI and schema exports remain deferred.

## Technical Context

- **Language/version**: C# 14 / .NET SDK 10.0.301; JavaScript ES modules; existing Node 24.15.0 / npm 11.12.1 prerequisite.
- **Dependencies**: development-only `@stoplight/spectral-core` 1.24.0, `@stoplight/spectral-rulesets` 1.23.0, `@stoplight/spectral-parsers` 1.0.5, exact root pins and npm lockfile. Existing ASP.NET Core OpenAPI 10.x / Microsoft.OpenApi 2.12.2 unchanged.
- **Storage**: no new storage; existing isolated PostgreSQL 18.6 Testcontainers fixtures retain generated runtime document authority.
- **Testing**: existing xUnit v3 / MTP HTTP contract tests in Inventory.Tests, Reservations.Tests and Notifications.Tests; Node built-in test runner for actual validator subprocess behavior.
- **Platform/type**: local development quality tooling for existing ASP.NET Core services; no application deployment dependency.
- **Performance/bounds**: one independent Node process per document check; 30-second overall subprocess budget includes stdin write, output drain and exit; cancellation kills the child process tree. No retries or circuit breaker for a local deterministic validator.
- **Scope**: three documents; no production endpoint, authentication, authorization, persistence or orchestration changes.

## Applicable standards and verification

Read constitution 1.1.1 and engineering guides: formatting-and-linting, testing, aspnet-core, openapi, resilience, observability and aspire (required cross-reference). Apply formatter per edited source file, inspect readability, run `npm run format-check`, `npm run lint`, `npm run check` plus the focused command. Node tool files belong to existing ESLint/Prettier scope. Markdown artifacts require link and consistency inspection. No new mandatory engineering rule or constitutional amendment is proposed; README describes executable commands.

The OpenAPI guide's runtime generation, exact contract assertions and Development-only exposure remain binding. Existing browser/login and manual AppHost evidence is unchanged in scope because this change adds no interactive or orchestration behavior; retain existing tests in the full check. Do not add automated AppHost inspection. Metadata changes are verified through current runtime documents and retained behavior assertions.

## Constitution Check

| Principle | Design and evidence |
| --- | --- |
| I: simple design | One small local Node adapter and shared assertion helper; no runtime package, service, exported document or replacement contract framework. |
| II: test first | Capture intended red results for new validator behavior and runtime document compliance before implementing corresponding adapter/metadata changes; preserve commands and output in team evidence. |
| III: public interfaces | Existing real HTTP hosts, routing, metadata, serialization and isolated PostgreSQL retained; tool tests invoke public stdin/exit/output contract. |
| IV: useful feedback | Warning and error rejection tested separately; service, rule and JSON path make failures actionable; independent processes preserve native parallelism. |
| V: observability | No new application dependency call or workflow; production OTel registrations/exporters are untouched. Development lint diagnostics are process output, not production telemetry. Existing production telemetry remains covered by the full suite. |
| VI: resilience | Local process has explicit 30-second cancellation/deadline and process-tree cleanup; no retry, remote rule loading or circuit breaker. Existing application dependency policies unchanged. |

Pre-research and post-design assessment: no known policy exception or unresolved product decision. Independent reviewers own their verdicts; this assessment does not approve implementation or human acceptance.

## Design

### Rule baseline and offline execution

Import the packaged `oas` ruleset and apply its recommended baseline using the documented JavaScript ruleset API (`extends: [[oas, 'recommended']]` or the verified equivalent supported by these pinned versions). Do not enable every rule, invent custom rules, disable recommended rules or filter individual findings. Errors (severity 0) and warnings (severity 1) fail; information/hints do not. All rules and schemas must come from installed local packages, not URLs or `npx` downloads.

Generated documents use internal references. Before Spectral resolution, reject non-fragment `$ref` and `$dynamicRef` values with a path diagnostic, preventing validator file/network reads. This is an input safety guard, not a custom Spectral rule. Preserve internal reference/schema validation. Verify malformed, empty and non-OpenAPI input cannot pass merely because no rules matched.

### Process contract and ownership

See [contracts/validator.md](contracts/validator.md). Node consumes raw JSON on stdin and a diagnostic-only service label; it never treats either as a path or executable argument. Use fixed repository-owned script paths and `ProcessStartInfo.ArgumentList`, `UseShellExecute = false`. Resolve repository root by locating committed solution/package markers from the test output ancestry; do not depend on current working directory or hard-code a developer path.

Close stdin after writing. Drain stdout and stderr concurrently while waiting, within the same linked test-cancellation/deadline token. Kill the entire process tree on cancellation/timeout and dispose resources. Missing executable, dependencies, script, malformed input or unexpected validator exit are failures with clear remediation. Report service identity and bounded failure diagnostics; never echo the whole input document or credentials. Do not retry deterministic failures or convert failure to skip.

Each invocation owns stdin, outputs and process; no temporary schema files, global mutable validator, shared filenames or new scheduling exclusions. Parallel tests remain safe.

### Metadata baseline

First run Spectral against current generated documents and retain findings. Correct authoritative endpoint metadata or shared document transformers only. Likely findings include `info.description`, `info.contact` and root tag declarations; use honest team contact name without invented email/URL, and existing operation tags. Do not fabricate licenses or API promises to satisfy optional rules. Preserve existing operation IDs, wire schemas/status codes, security metadata and exposure. If any finding requires API behavior changes or an override, stop that dependent edit and refer it to the coordinator/owner; no override is authorized by this plan.

### Quality commands

Add `npm run check:openapi` through `scripts/quality.mjs`: run the three existing OpenApiTests classes via MTP using the existing test-project layout, build when necessary, and propagate the first nonzero result. Do not rely on prebuilt binaries for this standalone command. Preserve normal parallelism; one MTP solution invocation with a class filter is preferred if verified supported; otherwise launch the three project commands concurrently and await all outcomes. The full check's existing complete suite already includes these tests. Include new validator tool tests in `test:tooling` so full check covers their process contract.

## Test design record and red-first evidence

1. **Runtime document integration**: extend `OpenApiAssertions.AssertDocumentAsync` at the existing HTTP contract boundary used by all three APIs. Real production hosts/routing/document generation/metadata and real isolated PostgreSQL remain. Existing identity boundary fixtures remain unchanged; document fetch needs no identity-provider network call. Preserve all current C# assertions. Capture initial Spectral findings before metadata fixes, then demonstrate all three documents pass.
2. **Validator behavior**: Node tests invoke the actual adapter subprocess with inline valid OpenAPI 3.1 JSON, then remove a recommended-warning field and introduce a schema error separately. Assert exit and service/rule/path diagnostics, not internal function calls or rule object layout. Empty/malformed/non-OpenAPI input, internal reference success and external reference rejection verify failure boundaries. These isolated tool tests are justified for a deterministic parser/validator public process contract, not a substitute for application behavior tests. No Spectral doubles or live third-party services.
3. **Contract retention**: preserve existing assertions and prove a representative application-specific mismatch still fails even when generic Spectral validation succeeds, using the existing assertion entry point and a scoped mutated in-memory document (no committed export). This is a deterministic document-contract test, not a claim about changed application behavior.
4. **Process/cancellation**: exercise unavailable prerequisites or execution failure and cancellation at the actual child-process boundary; check failure rather than skip and cleanup. Any controlled child fixture must model only the process responsibility and cannot replace Spectral in rule acceptance tests. Use condition-based readiness/deadlines, no sleeps or broad serialization.
5. **Command propagation**: demonstrate focused and full command propagation with a temporary reversible metadata violation at the authoritative generation boundary, preserving failing output then restoring; rerun green commands on final revision. This is evidence, not a committed invalid schema or permanent test-only production switch. Avoid repeated full runs absent changes; coordinator schedules final revision-matched checks.

## Project structure

```text
specs/011-spectral-validation/
  spec.md
  plan.md
  research.md
  data-model.md
  quickstart.md
  contracts/validator.md
  tasks.md                 # generated after preparation design review
scripts/
  openapi-lint.mjs         # new stdin adapter
  openapi-lint.test.mjs    # actual process contract tests
  quality.mjs              # focused command
package.json
package-lock.json
tests/TestSupport/
  OpenApiAssertions.cs     # retained assertions, invokes validator
  SpectralValidation.cs    # bounded subprocess helper if clarity warrants extraction
src/ApiDocumentation/ApiDocumentationExtensions.cs  # metadata only
README.md
```

No new production project or persistent data model. Tasks will map FR-001–FR-009 to these changes and evidence after independent preparation review. No complexity exception is requested.
