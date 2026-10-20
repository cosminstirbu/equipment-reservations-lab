# Local validator contract

This internal development adapter is invoked by the HTTP test support; it is not an application HTTP API.

- Invocation: `node scripts/openapi-lint.mjs <service-label>` from a located repository root; executable/script paths are code-owned and the label is diagnostic text only.
- Input: one raw UTF-8 JSON OpenAPI document on stdin, terminated by EOF. No URL/file input and no schema export. Empty, malformed, non-OpenAPI or non-fragment-reference input fails before it can pass or access external resources.
- Baseline: local pinned Spectral recommended OAS rules; internal references resolve normally. No custom rules or overrides.
- Exit: 0 only for successful validation without severity 0/1 findings; any other execution/validation outcome exits nonzero. Information/hints may be displayed without failing.
- Diagnostics: service label, severity, rule and JSON path (or parser/tool location) plus useful message. Do not dump the input document, credentials or request bodies. A tool/prerequisite error must state what failed and relevant setup remediation.
- Lifecycle: per-call independent process and streams; no shared output files/state. C# caller supplies test cancellation plus 30-second deadline, drains stdout/stderr concurrently, closes stdin, terminates the process tree on failure/cancellation and disposes resources.
- Commands: `npm run check:openapi` runs all three existing HTTP OpenApiTests against real PostgreSQL; `npm run check` retains every existing check and reaches the same assertions through the full backend suite. Both propagate failures.

Representative negative contracts: warning-only input fails with a recommended-rule identifier/path; error-only input fails; malformed input fails clearly; unknown document format fails; a non-fragment reference fails without network/file access; missing Node/package/script cannot skip successfully.
