# Application test and coverage reporting

Owner decisions, 2026-10-23: add Test Reporter and ReportGenerator to full PR/main
quality. Report backend application tests and frontend Vitest only; tooling, browser
and Kubernetes checks retain existing output. Coverage is informational, without
thresholds. Attempt both application suites after a test failure; build/setup failures
still block dependent tests. Preserve ordinary local check behavior and offer explicit
local reporting mode. Separate backend/frontend coverage; include unexecuted eligible
application code. Missing expected reports or failed generation fail quality.

Use readonly workflow summaries and downloadable reports, without PR comments,
checks:write, privileged workflow_run, external coverage services or new secrets.
Retain manifest-only behavior, main release provenance and the completion marker.
User authorized branch, commit, push, PR creation and hosted inspection, followed by
merge when the PR passes review and validation, then inspection of the main release
workflow. Stop on any GitHub authentication or authorization issue. Feature acceptance
remains pending.

Applicable standards: constitution; formatting, testing, tooling and Angular guides.
Keep local check fail-fast behavior; reporting mode continues only after application
test failures and aggregates failure status. Real runners collect native TRX/JUnit and
Cobertura. Raw reports are private temporary inputs and never uploaded; publish only
project/source-derived test identities, enumerated outcomes, numeric durations and a
fixed failure note pointing to live logs. Drop console output, assertion payloads,
attachments and arbitrary error messages. Coverage publishes tracked application
source locations and numeric line/branch measurements, excluding test/generated code,
AppHost and tooling. ReportGenerator HTML includes public application source only.
Private scratch must be cleaned on success/failure; prepared public reports must not
reuse earlier runs. Retain no raw-log artifacts. Summary/artifact generation runs
after failed application tests; missing or partial collection is explicit and fails.

Versions selected from official sources: Test Reporter v3 commit
d1b5dff021aa968b288b02285a8bf47471c5928a (summary mode avoids check creation),
ReportGenerator action 5.5.11 commit d3ebf1f760f7d8ab92cc44d9bcfee7ad73722a31,
Microsoft.Testing.Extensions.CodeCoverage 18.12.0 (MTP >=2.5.0; current xUnit uses
2.5.1), Vitest coverage-v8 4.1.11 matching Vitest, fast-xml-parser 5.11.2.
Preserve nine-project backend concurrency and existing test deadlines. No retry or
threshold can turn a failed suite into success.

Test design: exercise the report preparation/publication entry point with actual XML
parsing/filesystem operations, private markers in raw reports and missing/malformed
reports. Parser isolation is justified by deterministic data projection; it makes no
application behavior claim. Exercise orchestration failure propagation with real child
processes at the command boundary; executable fixtures replace the test runners only
and do not establish actual runner fidelity. Validate actual Vitest, MTP and
ReportGenerator outputs separately, then inspect hosted reports/artifacts and gates.
Reuse existing workflow tests for permissions/required quality, avoiding per-command
mirrors. Record intended red, checks and hosted limitations below.

Sources: [Test Reporter](https://github.com/dorny/test-reporter),
[ReportGenerator](https://github.com/danielpalme/ReportGenerator),
[MTP coverage](https://learn.microsoft.com/en-us/dotnet/core/testing/unit-testing-platform-extensions-code-coverage),
[coverage instrumentation](https://github.com/microsoft/codecoverage/blob/main/docs/instrumentation.md),
[Vitest coverage](https://vitest.dev/guide/coverage.html).

Local evidence: the focused report tests fail before implementation and pass after
projection, including parameterized test-name privacy, partial collection and real
child-process failures. Existing workflow regressions pass (17 passed, one Windows
platform skip). Actionlint 1.7.12 passes for the changed workflows with optional
shellcheck/pyflakes integrations disabled. Actual Vitest collection passes all 64
tests and its projected Cobertura renders with ReportGenerator 5.5.11. A real MTP
Persistence subset passes 23 tests and supplies native TRX/Cobertura contracts.
The full local reporting check collected 596 backend results: 526 passed, 56 failed,
14 skipped; failures included container/fixture readiness timeouts. This is retained
as a failed application run, not waived or claimed green. That run also exposed
projection incompatibilities subsequently repaired and covered by focused checks.
Hosted qualification remains required for the final combined collectors, readonly
Test Reporter summaries, artifact contents and main release execution.

Hosted PR run 39963560857 passed all jobs: 596 backend tests and 64 frontend
tests passed, Test Reporter wrote both summaries with readonly permissions,
ReportGenerator produced both HTML/Markdown/Cobertura reports, collection status
was complete, and real Kubernetes verification passed. Artifact inspection exposed
ReportGenerator interpreting slash-shaped class names as nested types and merging
unrelated files; canonical dotted source names correct that collision. Re-rendering
the same nine assessed backend inputs produces 57 distinct source entries rather
than three collided classes. The correction requires a fresh hosted run before merge.
Final local format-check and lint/build pass (zero build warnings/errors).
