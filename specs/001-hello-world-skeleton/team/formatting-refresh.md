# Formatting and linting refresh

Owner authorized the recommended Microsoft-native C# formatter/analyzers, Prettier/XML, ESLint/angular-eslint, editor setup, per-edit hook and agent instructions, with explicit coverage of IDE suggestions, on 2026-10-14. This was a repository maintenance request, not a restart of the feature-team loop.

Implemented shared configuration, pinned root tooling, root format/format-check/lint/check commands, safe synchronous post-edit handler and VS Code settings. Source, tests and project files were reformatted. IDE0330 changed NotificationStore to System.Threading.Lock. Explicit analyzer fixes include redundant imports, braces, consistent types/namespaces, cached JsonSerializerOptions.Web, source-generated structured logging, ordinal test URL comparison and allocation cleanup. No diagnostics were globally suppressed to clear a gate. IDE0005 is verified at suggestion severity by the mandatory dotnet-format style gate rather than requiring XML documentation output.

npm run check exited 0: formatting stable, ESLint zero warnings, .NET build zero warnings/errors, suggestion-level IDE verification clean, four actual hook-handler tests passed, strict Angular build passed, six rendered tests passed, 16 backend and two real RabbitMQ smoke/contract tests passed, no skips. npm audit for the final root tooling lockfile exited 0 with zero advisories.

Hook tests cover exact-file scope/idempotence, generated/external/symlink exclusion, visible unknown-payload failure, and actual C# Allman/four-space formatting. Native formatting can preserve fully compressed block trivia; agent instructions explicitly require authors to expand those blocks. The exact hook still requires owner trust in Codex before automatic runtime invocation. Direct handler tests are not represented as proof of runtime activation. Shell writes use explicit per-file commands under AGENTS.md.

Historical I1 quality/security/convergence reports remain unchanged and are no longer current source approvals. New independent reviews and convergence are pending; Q-001 manual keyboard review and explicit human acceptance also remain pending. Repair round counters, task history and findings were preserved. No merge, deployment, publication or external messages occurred.

Current snapshot: FMT2:1a2835959c8083370cc7d9231717bf43116a122a1c6e7f73751edf421cf1047d

Hash includes root source/tooling/policy configuration and source/test/script/hook/editor files; generated output, dependency directories and feature team records are excluded.

## Readability follow-up

Added explicit logical spacing to C# startup/service code and TypeScript application/setup code, expanded long callbacks and fluent chains, and replaced nested endpoint control-flow ternaries with guard clauses. AGENTS.md and the engineering guide require authors to inspect logical grouping after formatting. Existing analyzer rules remain enabled. npm run check exited 0 again: four tooling tests, six Angular tests, 16 backend tests and two real-broker tests passed, no skips; build, formatting, ESLint and suggestion-level IDE checks passed. Independent reviews and human gates remain pending for this changed snapshot.

Snapshot hashing uses sorted relative paths followed by a NUL, file contents and a NUL, with SHA-256; scope/exclusions are described above.
