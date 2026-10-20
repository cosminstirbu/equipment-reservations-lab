# Tasks: Spectral OpenAPI Validation

**Input**: [spec.md](spec.md), [plan.md](plan.md), [research.md](research.md), [data-model.md](data-model.md), [validator contract](contracts/validator.md), [quickstart.md](quickstart.md).

**Tests**: Required by the feature acceptance scenarios and constitution; retain commands/output proving intended red before implementing each new behavior or metadata fix. Coordinator owns team evidence, independent review and acceptance records. Coder supplies evidence; never self-approve those gates.

## Phase 1: Setup

- [X] T001 Pin development-only `@stoplight/spectral-core` 1.24.0, `@stoplight/spectral-rulesets` 1.23.0 and `@stoplight/spectral-parsers` 1.0.5 in package.json/package-lock.json; verify installed API supports local recommended OAS preset on existing Node prerequisite and record dependency/version evidence for specs/011-spectral-validation/team/.

## Phase 2: Foundation

- [X] T002 Write actual-subprocess public-contract tests first in scripts/openapi-lint.test.mjs using inline OpenAPI 3.1 fixtures: clean input, warning-only and error findings, malformed/empty/non-OpenAPI input, local reference success, external file/HTTP reference rejection, independent concurrent labels; retain intended failing command/output for specs/011-spectral-validation/team/ before adapter implementation.

**Checkpoint**: Dependencies available and behavioral red evidence retained. No production metadata fix before its corresponding failing runtime validation.

## Phase 3: US1 — Detect document regressions (P1)

**Goal**: Actual Spectral validates all three current HTTP documents while existing C# contracts remain authoritative for application specifics.

**Independent test**: Run adapter tests and existing three OpenApiTests classes; representative warning and error each fail with service/rule/path. Before US3 fixes, current metadata failures are expected and retained.

- [X] T003 [US1] Implement scripts/openapi-lint.mjs with fixed local packaged recommended OAS preset, no custom rules/overrides, raw stdin JSON and diagnostic service label; warnings/errors fail, malformed/unknown input and execution errors fail clearly; reject non-fragment `$ref`/`$dynamicRef` before resolution; never load remote rules or echo the whole document; obtain green T002 evidence.
- [X] T004 [US1] Add test-first process failure/cancellation and retained-contract regression cases at existing public assertion/test boundaries in tests/Inventory.Tests/OpenApiTests.cs (or a focused tests/Inventory.Tests/SpectralValidationTests.cs if clearer); retain real host/isolated PostgreSQL for document integration, use scoped in-memory mutation for a contract mismatch generic Spectral accepts, and record intended red evidence for specs/011-spectral-validation/team/.
- [X] T005 [US1] Extend tests/TestSupport/OpenApiAssertions.cs and, if useful, extract tests/TestSupport/SpectralValidation.cs to invoke fixed Node script without a shell, with ArgumentList/stdin, repository-root discovery independent of cwd, concurrent stream drain, linked cancellation and 30-second overall deadline including write/drain/exit, process-tree kill/disposal and actionable prerequisite failures; preserve every Microsoft.OpenApi and C# contract assertion.
- [X] T006 [US1] Run scripts/openapi-lint.test.mjs and all three existing HTTP OpenApiTests classes in tests/Inventory.Tests/, tests/Reservations.Tests/ and tests/Notifications.Tests/ using real isolated PostgreSQL; verify T004 scenarios, preserve baseline Spectral failures before metadata edits and supply service-attributable diagnostics to specs/011-spectral-validation/team/.

## Phase 4: US2 — Run familiar local checks (P2)

**Goal**: Focused and full quality commands execute identical validation and propagate failures.

**Independent test**: Focused command builds/runs all three existing classes without a running application; full command retains original checks; actual document regression yields nonzero in both.

- [X] T007 [US2] Extend scripts/quality.test.mjs with focused-command selection and failure-propagation coverage at the executable command boundary; retain red evidence before adding command behavior in scripts/quality.mjs.
- [X] T008 [US2] Add check:openapi wiring in package.json and scripts/quality.mjs to build/run all three existing OpenApiTests classes through verified MTP filters with normal parallelism and nonzero propagation; include scripts/openapi-lint.test.mjs in test:tooling; preserve all existing full-check stages, avoiding duplicate Spectral execution because its backend suite already includes the assertions.
- [X] T009 [US2] Update README.md with root npm installation, existing SDK/Podman/Testcontainers prerequisites, focused/full commands, no running Aspire requirement, warning/error failure threshold, service/rule/path interpretation and authoritative metadata-fix location; explain no exports or CI workflow are added.
- [X] T010 [US2] Verify focused/full command rejection from the known Spectral runtime findings captured by T006 in src/ApiDocumentation/ApiDocumentationExtensions.cs; if the baseline is already fixed, introduce a reversible metadata violation, restore/format immediately after the check, and supply failing command/revision/output evidence to specs/011-spectral-validation/team/; no committed failing document or production test switch.

## Phase 5: US3 — Establish a compliant baseline safely (P2)

**Goal**: All generated documents pass with unchanged application behavior.

**Independent test**: All three current documents have zero warnings/errors; existing operation/schema/security/exposure assertions and application behavior suite pass.

- [X] T011 [US3] After T006 captures red findings, correct only authoritative metadata in src/ApiDocumentation/ApiDocumentationExtensions.cs and affected endpoint/documentation source files identified by actual findings; preserve operation IDs, contracts, auth and behavior, use honest contact metadata, introduce no custom rules or override; escalate behavior-changing findings or proposed overrides before dependent edits.
- [X] T012 [US3] Run npm run check:openapi against compliant runtime documents and retain zero-warning/error plus retained C# contract evidence for all three services in specs/011-spectral-validation/team/; inspect metadata-only source diff against FR-005/FR-009.

## Phase 6: Verification and handoff

- [x] T013 Inspect every changed file for applicable constitution/engineering requirements and readability, run npm run format-check, npm run lint, npm run test:tooling and npm run check on final implementation, and supply commands/environment/exit/results/tested revision for specs/011-spectral-validation/team/; skipped prerequisites remain pending rather than passing.
- [X] T014 Check specs/011-spectral-validation/quickstart.md against actual commands and artifacts, report changed files/evidence/deviations to coordinator, preserve completed tasks and leave independent review/convergence/human acceptance to their owners; ensure no CI workflow, schema exports or custom rules were introduced.

## Requirements mapping

| Requirement | Tasks |
| --- | --- |
| FR-001 | T001–T003, T005–T006, T011–T012 |
| FR-002 | T002–T006, T010, T012 |
| FR-003 | T004–T006, T012–T013 |
| FR-004 | T007–T010, T013 |
| FR-005 | T006, T011–T013 |
| FR-006 | T003, T011, T014 |
| FR-007 | T005, T008–T009, T014 |
| FR-008 | T002–T005, T007–T008 |
| FR-009 | T009, T011, T013–T014 |

Data-model constraints are carried into tasks: service identities are the three named services (T006/T008/T012); input is raw OpenAPI 3.1 JSON with fragment-only references (T002/T003); findings include rule/severity/message/path (T002/T003); success requires no severity 0/1 and successful execution (T003/T005); baseline has no custom rules or selected overrides (T003/T011).

## Dependencies and implementation strategy

T001 → T002 → T003 → T004 → T005 → T006 forms the US1 integration increment. Run actual tool tests green before wiring runtime assertions; preserve runtime red evidence before metadata correction. US1 is the technical MVP, but cannot meet final clean-baseline acceptance until US3.

US2 can start after T006: T007 → T008 → T009 → T010. US3 depends on T006 and proceeds T011 → T012; T012 also requires focused command T008. T010 requires T008 and the known runtime findings from T006; if metadata has already been corrected by a parallel worker, use a reversible violation and restore before final checks. Simplest single-coder order is T001–T014. T013/T014 require all user-story tasks complete.

No task is marked [P] because this bounded implementation batch deliberately shares adapter/command/test paths and red-first dependencies. Opportunities for disjoint parallel work, if coordinator assigns explicit ownership: after T006, US2 command tests/implementation (scripts/quality*, package.json) can overlap US3 metadata fixes (src/ApiDocumentation); US1 subprocess tests can be reviewed while US2 README documentation is drafted; US3 metadata diff can be independently inspected while US2 documentation is reviewed. Do not concurrently mutate package files or run a repository-wide formatter while another agent writes. Parallel test execution itself remains the default.

Incremental checkpoints: adapter contract passes; runtime red baseline retained; focused command available; metadata baseline green; command failure evidence retained and restored; final required checks; coordinator arranges revision-matched independent quality/security reviews and convergence, then obtains explicit human acceptance separately.
