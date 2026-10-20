# Implementation evidence

Feature: specs/011-spectral-validation. Base: 0036cbccad665b2a2e1aec96183c172baa837425; evolving working tree 2026-10-20. Author evidence, not independent approval or human acceptance.

## Preparation

Read AGENTS, coder role, protocol, constitution 1.1.1, formatting/testing/ASP.NET/OpenAPI/resilience/observability/Aspire guides and approved feature artifacts. Implement prerequisite command returned the correct absolute feature directory. Requirements checklist 16/16; spectral-quality 10/10 checked. No extensions.yml/hooks. Existing ignore files cover Node/.NET outputs; private package does not publish. Test-design rationale is in approved plan; process tests additionally exercise test-support process responsibility using actual Node, not a Spectral double for rules acceptance.

## T001–T003

- `npm install --save-dev --save-exact @stoplight/spectral-core@1.24.0 @stoplight/spectral-rulesets@1.23.0 @stoplight/spectral-parsers@1.0.5`: exit 0, 148 packages added, audit 0 vulnerabilities. Node v24.15.0. Verified installed `Spectral.setRuleset({ extends: [[oas, 'recommended']] })` succeeds. CJS exports require default interop under ESM, verified directly.
- Red: `node --test scripts/openapi-lint.test.mjs`: exit 1, 0/14 pass; adapter did not exist (`MODULE_NOT_FOUND`), including intended clean-document success and diagnostic contracts. Tests preceded adapter implementation.
- Green: same command after adapter: exit 0, 14/14 pass, 1.86 seconds. Actual subprocess tests cover valid/internal references, warning-only info-contact, error oas3-schema, four invalid inputs, file/http/relative references for both keywords, concurrent service labels.
- Initial implementation run identified parser CJS interop (`parse` undefined), corrected using installed default export; not counted as valid baseline evidence.

## T004 red

- `dotnet test --project tests/Inventory.Tests/Inventory.Tests.csproj --filter-class Inventory.Tests.SpectralValidationTests`: exit 1, CS0103 SpectralValidation absent at both tests. Missing executable and actual Node process deadline tests preceded helper.
- Existing public HTTP test extended with a real runtime document mutation removing 503; explicit Spectral success followed by retained application assertion failure is required. No committed schema fixture/export.

## T005–T009 focused integration and commands

- Sandbox `.NET test` invocation stalled without output; inspected owned process, terminated only PID 47104, and retried exact command escalated. No functional pass inferred from the stalled attempt. Escalated `dotnet test --project tests/Inventory.Tests/Inventory.Tests.csproj --filter-class Inventory.Tests.SpectralValidationTests`: exit 0, 2/2 pass (missing Node and actual process deadline/cleanup). Subsequent author inspection added explicit external cancellation coverage.
- Runtime red: `dotnet test --project tests/Inventory.Tests/Inventory.Tests.csproj --no-restore --filter-class Inventory.Tests.OpenApiTests`: exit 2, 2/4 failed because actual generated Inventory document lacks `info.contact` and `info.description`; both exposure cases pass. Metadata untouched. Diagnostics: `Inventory: warning info-contact $["info"]`, `Inventory: warning info-description $["info"]`.
- Command-test red: `node --test --test-name-pattern='focused OpenAPI' scripts/quality.test.mjs`: exit 1; no dotnet calls were made because command was not implemented. Green after command wiring: same command exit 0, 1/1 pass. The executable fixture models only dotnet command exit/arguments and checks all three modules execute, without replacing actual validation acceptance tests.
- Focused runtime red: documented Podman environment plus `npm run check:openapi > /tmp/spectral-focused-red.log 2>&1`: exit 1. Solution build passes without warnings/errors; all three current runtime documents fail actual Spectral `info-contact` and `info-description` warnings. Inventory 2/4 fail (including mutation case awaiting compliant baseline), Reservations 1/3, Notifications 1/3; exposure checks pass. No metadata fix preceded this evidence.
- Command builds solution once, then runs three filtered module commands concurrently with --no-build. This avoids racing shared reference-project builds while providing a standalone self-building command; it does not rely on preexisting binaries. Existing full check stages preserved without duplicate document pass. README describes local setup, severity/path interpretation and metadata source.
- Environment for actual HTTP runs: `DOCKER_HOST=unix:///var/folders/6k/z9rq_rsj7gj5ghmy_rx43nzh0000gp/T/podman/podman-machine-default-api.sock ASPIRE_CONTAINER_RUNTIME=podman TESTCONTAINERS_RYUK_DISABLED=true`; .NET 10.0.301, Node 24.15.0; Testcontainers confirmed Podman 6.0.2, real isolated PostgreSQL.

## T010 negative full-gate evidence

`npm run check > /tmp/spectral-full-red.log 2>&1` with the documented environment and escalated runtime access: exit 1 (backend MTP exit 2). All format/analyzer/tooling/frontend stages passed, frontend 60/60. Backend 513 total, 509 pass, 4 fail, 0 skipped, 2m41s. The four failures are exactly actual Spectral metadata warnings in Inventory (two tests), Reservations, Notifications. This establishes full-command regression propagation rather than an unrelated prerequisite failure. The compiled pre-fix baseline was preserved until the backend process began; metadata/reader edits were then made without any rebuild while its final Integration module completed. No red document/export or behavior switch committed.

## T011 metadata and author inspection

Actual findings required only shared document `Info.Description` and an honest `Info.Contact.Name` (Equipment Reservations team). No fabricated address/license, tag changes, suppressions, custom rules, schema exports or CI. Existing shared assertion file gains only the Spectral call, retaining all Microsoft.OpenApi and service-specific assertions verbatim. All endpoint IDs/security/status/schema/exposure and production telemetry/orchestration remain untouched.

Process helper uses ArgumentList/no shell, ancestry markers independent of cwd, stdin/EOF, per-call process, shared linked 30-second budget including writes/drain/exit, capped readers honoring cancellation and process-tree kill/disposal. Actual process failure/deadline/external cancellation tests do not replace Spectral in rule acceptance tests. Manual readability/semantic inspection completed; per-file formatting applied after each source edit. Full gate authorizes no independent or human acceptance.

## T012/T014 final focused evidence and handoff

Final source snapshot SHA-256 (sorted path+bytes for the 12 files listed below): `96b1f9b4d8c2a4b10029fd1b24e70edc4633cff2d38b3e8b068cad5d6f5710e9`. Base commit remains 0036cbccad665b2a2e1aec96183c172baa837425; source freeze reported to coordinator.

- `npm run check:openapi > /tmp/spectral-focused-green.log 2>&1` with documented environment, escalated: exit 0, solution build 0 warnings/errors; Inventory 4/4, Reservations 3/3, Notifications 3/3, 0 skipped. This includes current runtime documents, exact existing C# contracts, exposure behavior and generic-valid but app-invalid 503 mutation rejection.
- `node --test scripts/openapi-lint.test.mjs`: exit 0, 14/14; warning-only explicitly contains no error, schema-error explicitly contains no warning.
- `git diff --check`: exit 0.
- Quickstart commands/prerequisites checked against actual root package, quality script and README. No running AppHost, generated schema files, custom rules, override or CI workflow introduced. Existing README verification and OpenAPI material retained.
- T013 final whole-repository format/lint/tooling/full gates delegated to coordinator as explicitly assigned; leave checkbox pending until reported. Independent quality/security, convergence and human acceptance remain owner gates, never inferred from task completion.

Changed implementation files:

- package.json
- package-lock.json
- readme.md
- scripts/quality.mjs
- scripts/quality.test.mjs
- scripts/openapi-lint.mjs
- scripts/openapi-lint.test.mjs
- src/ApiDocumentation/ApiDocumentationExtensions.cs
- tests/Inventory.Tests/OpenApiTests.cs
- tests/Inventory.Tests/SpectralValidationTests.cs
- tests/TestSupport/OpenApiAssertions.cs
- tests/TestSupport/SpectralValidation.cs

Final process helper check: documented environment plus `dotnet test --project tests/Inventory.Tests/Inventory.Tests.csproj --no-build --filter-class Inventory.Tests.SpectralValidationTests`, escalated: exit 0, 3/3 pass, 0 skipped, 3.70s. Missing executable produces service/setup instructions; deadline and external cancellation each terminate the actual Node process, verified by PID no longer existing. Streams retain diagnostics under cancellation and are bounded; no temporary schema files used.

## Repair round 1 — IDE0008

Coordinator final lint found IDE0008 at SpectralValidation.cs buffer declaration. Changed only `var buffer` to `char[] buffer`, formatted exact file and re-read. `dotnet test --project tests/Inventory.Tests/Inventory.Tests.csproj --no-restore --filter-class Inventory.Tests.SpectralValidationTests` with documented escalated runtime environment: exit 0, 3/3 pass, 0 skipped, 3.73s. Source freeze restored; coordinator owns refreshed hash/final lint/reviews. Earlier source snapshot is historical and superseded for this one declaration.
