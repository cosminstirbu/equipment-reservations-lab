# Formatting and static analysis

Use the committed configuration as the shared source of style for developers and agents. Use Microsoft C# conventions, Angular conventions, and the configured Prettier layout. These rules were approved by the owner together with the formatting-tooling change. They apply to source, tests, and application/tooling configuration; generated output, lockfiles, Spec Kit agreements, and installed skills are excluded from automatic formatting.

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

After each source-file edit, format that exact file before reading, testing, or editing
it again, then re-read it and inspect readability. Use the committed exclusions for
generated files and lockfiles. After changing formatter configuration, format the owned
source scope again.

```sh
npm run format -- src/Notifications/ReservationInbox.cs src/Web/src/app/booking/booking-api.ts
```

The trusted post-edit hook described below performs this layout step for supported edit
tools. Shell writes and clients without a trusted working hook must invoke the command
explicitly. Never format another worker's files or run a whole-repository formatter while
workers are writing;
formatter commands serialize themselves.

Apply semantic .NET IDE fixes explicitly, then inspect the diff, format, and test:

```sh
dotnet format style EquipmentReservation.slnx --no-restore --severity info
```

## Required checks for handoff

Run `npm run format-check` and `npm run lint` before handoff. For application changes,
also run `npm run check` with the required Podman runtime. Use the existing scripts as
the executable definitions of these checks; unavailable prerequisites leave the check
pending. Documentation-only changes still require link, consistency, and readability
review; the source formatter does not format Markdown.

Inspect readability and semantic analyzer fixes in addition to the automated results.
For independent reviews, follow the [revision and revalidation procedure](../agent-team/protocol.md#implementation-loop)
after any source, formatter, or analyzer repair.

## Editors and agents

VS Code workspace settings enable format-on-save with Microsoft C# and Prettier formatters and explicit ESLint fixes. Install the recommended extensions. EditorConfig-aware editors such as Rider can use the same C# settings; command-line checks remain authoritative.

The workspace also points C# Dev Kit's coverage runner to `coverage.runsettings`, which excludes `obj` source paths. CLI and CI runs must pass coverage settings explicitly and install the Microsoft Testing Platform coverage extension in the test projects; see [backend code coverage](testing.md#backend-code-coverage-in-vs-code-and-ci) for prerequisites and commands.

The repository `.codex/hooks.json` runs a synchronous formatter after `apply_patch`, `Edit`, or `Write`, limited to paths identified by that edit. Formatter runs share a serialization lock; deleted, generated, external, and symlinked-outside paths are excluded. Failure returns explicit feedback. Shell writes cannot be safely inferred from arbitrary shell code; apply the explicit command in the per-edit workflow when the hook cannot handle the edit.

Codex requires review/trust of the exact hook definition and a trusted project configuration layer before it executes local hooks. Review and trust the hook in Codex, then start/reload the repository session. Do not record hook registration as proof it fired; the test suite exercises the actual handler separately. Changing the hook definition requires trust review again. [Official hook documentation](https://learn.chatgpt.com/docs/hooks).

Formatting commands do not install dependencies, run restore, or apply semantic lint fixes from the edit hook. Root tooling dependencies must already be installed. If a formatter is interrupted and leaves `.cache/quality-format.lock`, verify no formatter is running before removing that lock.
