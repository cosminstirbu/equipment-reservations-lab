# Formatting and static analysis

Use the committed configuration as the shared source of style for developers and agents. Use Microsoft C# conventions, Angular conventions, and the configured Prettier layout. The tool/layout conventions were approved with the formatting-tooling change. They apply to source, tests, and application/tooling configuration; generated output, lockfiles, Spec Kit agreements, and installed skills are excluded from automatic formatting.

## Tools and conventions

- C#: Microsoft .NET 10 Roslyn analyzers and `dotnet format`, four spaces, Allman braces, expanded statement/block layout. All Style/IDE diagnostics are visible as warnings where supported; IDE0330 prefers `System.Threading.Lock`. `EnforceCodeStyleInBuild` applies style analysis during builds. IDE0005 stays suggestion-level because Roslyn build-time analysis otherwise requires XML documentation output; the mandatory `dotnet format style --severity info --verify-no-changes` gate catches suggestions too.
- TypeScript/JavaScript: Prettier for layout, ESLint recommended rules, typescript-eslint recommended type-aware rules, and angular-eslint recommended TypeScript/template/accessibility rules. Inline Angular templates are processed. `eslint-config-prettier` prevents conflicting layout rules. Framework conventions follow the Angular guide, including its TypeScript guidance.
- MSBuild/XML: Prettier's XML plugin formats `.csproj`, `.props`, `.targets`, and `.slnx`, preserving text-node/attribute whitespace. Restore/build validate project semantics. Never reorder MSBuild elements to satisfy layout.
- HTML, CSS, and JSON: Prettier, two spaces. Angular's build validates application templates and styles. Prettier layout is a documented repository convention, not a claim of a universal vendor formatting specification.

Pin tooling versions in root `package.json`/`package-lock.json`; the .NET SDK is pinned in `global.json`. Do not add blanket rule suppressions or disable diagnostics to hide a failure. Explain any legitimate scoped exception and obtain owner approval. Address CA, IDE (including suggestions), and ESLint diagnostics. Semantic fixes must be explicit, reviewed, and tested; routine post-edit formatting only changes layout.

Authors must add blank lines between imports and declarations, between types/methods, and between logical phases within a method or startup file. Keep related declarations together rather than adding a blank line after every statement. Use guard clauses instead of nested control-flow ternaries, and break lengthy callbacks and fluent chains at natural boundaries. These choices require inspection after formatting: neither Roslyn nor Prettier infers logical sections.

The native C# formatter can preserve fully compressed blocks even with wrapping preferences configured. Authors must not compress multiple declarations or statements onto one line. Write block callbacks and exception handlers across readable lines and separate members with blank lines. Break long conditions and fluent expressions at natural boundaries. Prefer `var` when the type is apparent; otherwise follow the configured explicit-type rule. The hook tests verify the formatter's actual Allman/indentation behavior; they do not claim it reconstructs every possible layout.

References: [Microsoft conventions](https://learn.microsoft.com/en-us/dotnet/csharp/fundamentals/coding-style/coding-conventions), [dotnet format](https://learn.microsoft.com/en-us/dotnet/core/tools/dotnet-format), [IDE0330](https://learn.microsoft.com/en-us/dotnet/fundamentals/code-analysis/style-rules/ide0330), [Angular style guide](https://angular.dev/style-guide), [angular-eslint](https://github.com/angular-eslint/angular-eslint), [Prettier/linter integration](https://prettier.io/docs/integrating-with-linters), [XML whitespace policy](https://github.com/prettier/plugin-xml#whitespace).

## Setup and checks

```sh
npm ci
npm --prefix src/Web ci
dotnet restore EquipmentReservation.slnx
npm run format
npm run format-check
npm run lint
npm run test:tooling
npm run check
```

`lint` runs ESLint with zero warnings, .NET build with warnings treated as errors, and the suggestion-level IDE verification gate. `check` adds hook tests, frontend build/tests and the complete backend integration suite (real PostgreSQL, RabbitMQ and Keycloak), requiring running Podman. Browser checks remain documented in the application README.

After the solution build and frontend checks, `check` runs `dotnet test --solution EquipmentReservation.slnx --max-parallel-test-modules <test-project-count> --no-build`. Backend tests run in parallel by default within and across test projects. Sequential exclusions require a concrete, documented constraint and the smallest justified scope; follow the [testing parallelism rules](testing.md#backend-parallelism-is-the-default). The command uses Microsoft Testing Platform selected in `global.json` and propagates a backend failure. For automated orchestration scope, follow the [application test boundary](testing.md#automated-application-boundary).

## Per-edit workflow

At each logical edit boundary, format the owned changed files before testing or review,
then re-read them and inspect readability. Several related edits may form one boundary;
formatting is not required between every patch and inspection. Use the committed exclusions for
generated files and lockfiles. After changing formatter configuration, format the owned
source scope again.

```sh
npm run format -- src/Notifications/ReservationInbox.cs src/Web/src/app/booking/booking-api.ts
```

The trusted post-edit hook described below performs this layout step for supported edit
tools. Shell writes and clients without a trusted working hook must invoke the command
explicitly at the logical edit boundary when needed. Never format another worker's files or run a whole-repository formatter while
workers are writing;
formatter commands serialize themselves.

Apply semantic .NET IDE fixes explicitly, then inspect the diff, format, and test:

```sh
dotnet format style EquipmentReservation.slnx --no-restore --severity info
```

## Terraform quality gates

The owner approved Terraform formatting, validation, TFLint Azure rules and Trivy
security checks for feature 014 on 2026-10-26. Tool versions, Windows/Linux artifact
and executable checksums, provider versions and immutable policy inputs are pinned
in `infra/azure/tools.lock.json`. Commit each root's provider lockfile; do not ignore
or regenerate it silently during a read-only gate.
The same lock pins kubectl and kubelogin for Entra AKS access; use their verified
workspace executables rather than fetching an unpinned CLI or admin kubeconfig.

Use `npm run infra:tools` to prepare verified tools and policy inputs, then
`npm run infra:format` for explicit local Terraform formatting and
`npm run infra:check` for the same checks locally and in workflows. The check command
runs recursive `terraform fmt -check`, backend-free initialization and validation
per root, TFLint with the committed AzureRM plugin configuration, and an offline
Trivy scan against the pinned, integrity-verified policy content. Terraform formats
its supported source/test extensions; Prettier does not format HCL. Format edited
Terraform files with the pinned `terraform fmt` before rereading or testing them.
Run `npm run infra:test` locally and in the required infrastructure CI lane as well.
It uses the same controlled pinned Terraform execution, backend-free initialization
and existing mocked native `.tftest.hcl` suites; private reports expose only safe
pass counts. Failed, errored, skipped or missing native contracts block the gate.
This command does not provision Azure resources.

Every enabled security finding and scanner error blocks unless the human owner has
approved an exact documented exception. Inline suppressions, mutable policy updates,
missing tools, invalid policy cache and private diagnostic leakage cannot silently
produce a passing result. Plan scans use actual resolved inputs and remain private.
Source checks do not establish Azure deployment, restore or authorization acceptance.
Follow [operational output classification](tooling.md) for provider and scanner data.
Foundation source scanning supplies only the fixed synthetic expiry in
`infra/azure/examples/source-scan.tfvars`, making an otherwise unknown variable
visible to the scanner. This fixture has no environment configuration and cannot
provision infrastructure; its date is not the actual key lifetime. Resolved plans
must use the current private reviewed expiration input and enforce its policy.

The two exact upstream YAML paths in `.prettierignore` retain vendor bytes for
provenance verification; authored overlays and patches still receive formatting and
validation. Their installation must verify the reviewed upstream hashes.

## Required checks for handoff

Choose checks by changed area; mixed changes take the union. Record commands, scope and
results, including unavailable checks. Reuse passing evidence when its inputs and relevant
tool/configuration versions are unchanged. The existing command implementations remain
the definitions of what each command covers; this table does not add new CLI switches.
This table governs author checks. Required CI jobs remain in force; changing their path
selection or execution requires a separate implementation change.

| Changed area | Handoff checks |
| --- | --- |
| Markdown only | Link, consistency and readability review plus `git diff --check`; no application build |
| JavaScript tooling only | `npm run format-check -- <changed files>`, scoped `npx eslint <changed files> --max-warnings 0`, and relevant tooling tests |
| Other scripts or configuration | Configured formatter/syntax/lint checks for that language and relevant behavior tests; no unrelated application build |
| Terraform only | Pinned native format/validate/lint/security and relevant native contracts declared in the infrastructure plan; no unrelated .NET build |
| Kubernetes/workflow configuration | Supported formatter, relevant schema/render/workflow checks, and provider acceptance at the declared infrastructure milestone |
| Application source, dependencies, shared build/analyzer configuration | `npm run format-check`, `npm run lint` and applicable application checks; application changes require `npm run check` with Podman |
| Formatter/linter or gate implementation | Its behavior tests and revalidation of the formats/areas it affects |

The source formatter excludes Markdown. For configuration formats without a configured
formatter, validate syntax and inspect layout explicitly. Infrastructure acceptance follows
the testing guide's [execution profile](testing.md#infrastructure-execution-profile).

Inspect readability and semantic analyzer fixes in addition to the automated results.
For Minimal API changes, manually inspect compliance with the
[endpoint organization rules](aspnet-core.md#endpoint-organization); the formatter and
analyzers do not enforce endpoint placement, handler structure, or group policy scope.
For independent reviews, follow the [revision and revalidation procedure](../agent-team/protocol.md#implementation-loop)
after any source, formatter, or analyzer repair.

## Editors and agents

VS Code workspace settings enable format-on-save with Microsoft C# and Prettier formatters and explicit ESLint fixes. Install the recommended extensions. EditorConfig-aware editors such as Rider can use the same C# settings; command-line checks remain authoritative.

The workspace also points C# Dev Kit's coverage runner to `coverage.runsettings`, which excludes `obj` source paths. CLI and CI runs must pass coverage settings explicitly and install the Microsoft Testing Platform coverage extension in the test projects; see [backend code coverage](testing.md#backend-code-coverage-in-vs-code-and-ci) for prerequisites and commands.

The repository `.codex/hooks.json` runs a synchronous formatter after `apply_patch`, `Edit`, or `Write`, limited to paths identified by that edit. Formatter runs share a serialization lock; deleted, generated, external, and symlinked-outside paths are excluded. Failure returns explicit feedback. Shell writes cannot be safely inferred from arbitrary shell code; apply the explicit command in the per-edit workflow when the hook cannot handle the edit.

Codex requires review/trust of the exact hook definition and a trusted project configuration layer before it executes local hooks. Review and trust the hook in Codex, then start/reload the repository session. Do not record hook registration as proof it fired; the test suite exercises the actual handler separately. Changing the hook definition requires trust review again. [Official hook documentation](https://learn.chatgpt.com/docs/hooks).

Formatting commands do not install dependencies, run restore, or apply semantic lint fixes from the edit hook. Root tooling dependencies must already be installed. If a formatter is interrupted and leaves `.cache/quality-format.lock`, verify no formatter is running before removing that lock.
