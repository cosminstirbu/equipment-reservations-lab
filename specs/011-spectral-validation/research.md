# Research: Spectral validation

## Packages and rule selection

**Decision**: Pin development dependencies spectral-core 1.24.0, spectral-rulesets 1.23.0 and spectral-parsers 1.0.5 in root package files. Use the recommended OAS preset through its local JavaScript export.

**Rationale**: npm registry metadata queried 2026-10-20 reports these published versions, with Node support `^16.20 || ^18.18 || >= 20.17`; the existing Node 24.15.0 meets it. Core 1.24.0 satisfies rulesets' `^1.23.0` dependency. Lock transitive resolution. The official [ruleset guide](https://github.com/stoplightio/spectral/blob/develop/docs/getting-started/3-rulesets.md) identifies the packaged OpenAPI baseline; [extends](https://github.com/stoplightio/spectral/blob/develop/docs/guides/4b-extends.md) distinguishes recommended and all rules. Verify the pinned package exports during installation rather than copying current development-branch APIs blindly.

**Alternatives**: Spectral CLI plus temp schema files adds file lifecycle/concurrency concerns; remote rulesets add network and version drift; a C# reimplementation loses the actual Spectral baseline. No new CLI package is necessary.

## Runtime and integration

**Decision**: Existing OpenApiTests fetch `/openapi/v1.json` from real WebApplicationFactory hosts with isolated PostgreSQL. Add the validator to their shared document assertion, preserving Microsoft.OpenApi and service-specific checks.

**Rationale**: Reuses the approved public HTTP boundary and covers actual current documents without AppHost or saved exports. Existing full check already includes the assemblies.

**Alternatives**: Build-time exports or independently running services introduce deferred scope; replacing C# assertions loses application-specific contractual coverage.

## Process safety and concurrency

**Decision**: Fixed local Node script, no shell, raw stdin input, isolated per-call process, linked cancellation/30-second deadline and process-tree termination. Reject non-fragment document references before resolution; installed packages provide rules/schemas locally.

**Rationale**: Prevents shell injection, reference-triggered network/file access, stale files and parallel-state collisions. Broken tooling fails closed. No retries/circuit breaker are useful for deterministic local linting.

**Alternatives**: Shared validator daemon is unnecessary; stdin avoids temporary exports; silent skips would violate FR-008.

## Telemetry and metadata

**Decision**: Retain production telemetry unchanged; emit service/rule/path tool diagnostics. Fix only authoritative metadata findings, with a contact name if required and no fabricated address or license.

**Rationale**: A development-only local validator adds no application external dependency or business workflow. No production trace/export registration is changed. Existing tests and full check protect those contracts.

**Alternatives**: Adding application instrumentation for linting expands production scope without value; suppressions need governance and are not selected.
