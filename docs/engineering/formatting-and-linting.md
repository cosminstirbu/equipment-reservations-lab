# Formatting and static analysis

Use the committed configuration as the shared source of style for developers and agents. These rules were approved by the owner together with the formatting-tooling change. They apply to source, tests, and application/tooling configuration; generated output, lockfiles, Spec Kit agreements, and installed skills are excluded from automatic formatting.

## Tools and conventions

- C#: Microsoft .NET 10 Roslyn analyzers and `dotnet format`, four spaces, Allman braces, expanded statement/block layout. All Style/IDE diagnostics are visible as warnings where supported; IDE0330 prefers `System.Threading.Lock`. `EnforceCodeStyleInBuild` applies style analysis during builds. IDE0005 stays suggestion-level because Roslyn build-time analysis otherwise requires XML documentation output; the mandatory `dotnet format style --severity info --verify-no-changes` gate catches suggestions too.
- TypeScript/JavaScript: Prettier for layout, ESLint recommended rules, typescript-eslint recommended type-aware rules, and angular-eslint recommended TypeScript/template/accessibility rules. Inline Angular templates are processed. `eslint-config-prettier` prevents conflicting layout rules. Framework conventions follow the Angular guide, including its TypeScript guidance.
- MSBuild/XML: Prettier's XML plugin formats `.csproj`, `.props`, `.targets`, and `.slnx`, preserving text-node/attribute whitespace. Restore/build validate project semantics. Never reorder MSBuild elements to satisfy layout.
- HTML, CSS, and JSON: Prettier, two spaces. Angular's build validates application templates and styles. Prettier layout is a documented repository convention, not a claim of a universal vendor formatting specification.

Pin tooling versions in root `package.json`/`package-lock.json`; the .NET SDK is pinned in `global.json`. Do not add blanket rule suppressions or disable diagnostics to hide a failure. Explain any legitimate scoped exception and obtain owner approval. Semantic fixes must be reviewed and tested; routine post-edit formatting only changes layout.

Authors must add blank lines between imports and declarations, between types/methods, and between logical phases within a method or startup file. Keep related declarations together rather than adding a blank line after every statement. Use guard clauses instead of nested control-flow ternaries, and break lengthy callbacks and fluent chains at natural boundaries. These choices require inspection after formatting: neither Roslyn nor Prettier infers logical sections.

The native C# formatter can preserve some fully compressed blocks even with wrapping preferences configured. AGENTS.md therefore also prohibits authors from compressing multiple statements/declarations onto one line. Write callbacks, exception handlers and long conditions with readable line breaks before invoking the formatter. The hook tests verify the formatter's actual Allman/indentation behavior; they do not claim it reconstructs every possible layout.

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

After the solution build and frontend checks, `check` runs `dotnet test tests/Backend.Tests/Backend.Tests.csproj --no-build -m:1`. Backend.Tests keeps assembly-wide and existing collection serialization. The command propagates a backend failure; parallelization changes are deferred. Automated checks never start or inspect Aspire or publish a manifest.

To format only edited files after each edit:

```sh
npm run format -- src/Notifications/ReservationInbox.cs src/Web/src/app/booking/booking-api.ts
```

Apply semantic .NET IDE fixes explicitly, then inspect the diff, format, and test:

```sh
dotnet format style EquipmentReservation.slnx --no-restore --severity info
```

## Editors and agents

VS Code workspace settings enable format-on-save with Microsoft C# and Prettier formatters and explicit ESLint fixes. Install the recommended extensions. EditorConfig-aware editors such as Rider can use the same C# settings; command-line checks remain authoritative.

The repository `.codex/hooks.json` runs a synchronous formatter after `apply_patch`, `Edit`, or `Write`, limited to paths identified by that edit. Formatter runs share a serialization lock; deleted, generated, external, and symlinked-outside paths are excluded. Failure returns explicit feedback. Shell writes cannot be safely inferred from arbitrary shell code, so AGENTS.md requires agents to invoke the same per-file formatter explicitly after shell writes. The instructions are also the fallback when hooks are unavailable/untrusted.

Codex requires review/trust of the exact hook definition and a trusted project configuration layer before it executes local hooks. Review and trust the hook in Codex, then start/reload the repository session. Do not record hook registration as proof it fired; the test suite exercises the actual handler separately. Changing the hook definition requires trust review again. [Official hook documentation](https://learn.chatgpt.com/docs/hooks).

Formatting commands do not install dependencies, run restore, or apply semantic lint fixes from the edit hook. Root tooling dependencies must already be installed. If a formatter is interrupted and leaves `.cache/quality-format.lock`, verify no formatter is running before removing that lock. Do not use whole-repository formatting while other agents are editing. Independent reviewers own their verdicts; formatting or analyzer fixes invalidate affected review/check evidence.
