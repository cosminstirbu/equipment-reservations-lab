# Tasks: API metadata beside contracts and endpoints

**Input**: [spec.md](spec.md), [plan.md](plan.md), [research.md](research.md), [models](data-model.md), [coverage matrix](contracts/coverage.md).
**Tests**: Required by FR-007 and constitution. Existing observable shape/behavior expectations remain unchanged. New description assertions precede prose implementation with retained intended red evidence.

## Phase 1: Setup

- [X] T001 Verify the eight-operation/five-application-model inventory and test/runtime prerequisites against specs/012-local-api-metadata/contracts/coverage.md and record baseline/test revision in specs/012-local-api-metadata/team/implementation.md; preserve unrelated Kubernetes files and approved engineering guide amendment.

## Phase 2: Foundational

- [X] T002 Inspect existing HTTP fixtures and confirm the plan's test design record in specs/012-local-api-metadata/plan.md applies; record actual collaborators, doubles/provider contracts and planned description-regression assertions in specs/012-local-api-metadata/team/implementation.md without creating solitary reflection tests.

## Phase 3: US1 — Understand every business field (P1 / MVP)

**Goal**: Every public model/property has accurate consumer prose.
**Independent test**: Three real generated HTTP documents contain descriptions on five application models/33 properties and framework ProblemDetails/declared properties/extensions.

- [X] T003 [US1] Extend tests/TestSupport/OpenApiAssertions.cs to assert nonempty descriptions on every scoped model and declared property, retaining all existing shape expectations; run npm run check:openapi and retain intended missing-description failures in specs/012-local-api-metadata/team/implementation.md before prose changes.
- [X] T004 [P] [US1] Add model/property Description attributes to EquipmentItem in src/Inventory/EquipmentStore.cs, covering id/name/operational without changing types, serialization or constraints.
- [X] T005 [P] [US1] Add model/property Description attributes to ReservationInput, Reservation and Availability in src/Reservations/ReservationContracts.cs; preserve "Three required non-null valid string inputs; reject extra fields; offset timestamp, max six fractional digits; start before end and not past", "cancellation timestamp/event identifier null until cancelled", and "advisory does not lock or reserve equipment" as documentation only; leave unexposed ReservationInterval/InventoryItem untouched.
- [X] T006 [P] [US1] Add model/property Description attributes to InboxEntry in src/Notifications/NotificationContracts.cs for all eleven fields, distinguishing source occurrence and local receipt timestamps without changing event or serialization behavior.
- [X] T007 [US1] Add narrow ProblemDetails model/standard-property prose in src/ApiDocumentation/ApiDocumentationExtensions.cs, preserving code/field optional extension semantics, all schema shape and shared security configuration; verify model attributes surface through generated output and use the documented narrow attribute bridge only if a proven inference gap requires it.
- [X] T008 [US1] Remove contract-description overrides from src/Reservations/ReservationDocumentation.cs while retaining required fields, non-null string and extra-property schema corrections; run focused HTTP document checks and record US1 outcomes in specs/012-local-api-metadata/team/implementation.md.

## Phase 4: US2 — Understand each operation (P1)

**Goal**: All eight operations describe inputs, successes/errors and documented bodies/headers.
**Independent test**: Existing generated HTTP documents assert descriptions on every operation/parameter/response and present request body/header; auth/body/schema expectations remain unchanged.

- [X] T009 [US2] Extend tests/TestSupport/OpenApiAssertions.cs to assert useful nonempty operation, parameter, response, present request-body and documented header descriptions; add semantic assertions only where meaningful contract distinctions need coverage, retain existing shape assertions, and record intended red evidence in specs/012-local-api-metadata/team/implementation.md before endpoint prose changes.
- [X] T010 [P] [US2] Place prose for both Inventory operations in src/Inventory/Program.cs, add Description to existing string id parameter, and endpoint-local response descriptions covering declared successes/errors, empty auth denials and equipment access requirements without binding/status/security changes.
- [X] T011 [P] [US2] Place prose for ListNotifications and every declared response in src/Notifications/Program.cs, documenting current-owner results, unavailable storage and empty auth denials without new inputs or security changes.
- [X] T012 [P] [US2] Place prose for all five reservation operations in src/Reservations/ReservationEndpoints.cs, including bound string path ids; attach local transformers for existing three required string availability queries, creation body/Location, every declared response and optional browser403 content; preserve 4 KiB, duplicate/additional/ownership field rejection, explicit offset/max six fractional digits/start before end/not past, advisory availability, and cancellation empty-or-null-body behavior without adding requestBody metadata for cancellation.
- [X] T013 [US2] Remove global reservation operation-ID transformer dispatch from src/Reservations/ReservationDocumentation.cs after local metadata is attached; retain only narrow schema correction and run npm run check:openapi, recording results in specs/012-local-api-metadata/team/implementation.md.

## Phase 5: US3 — Maintain documentation beside its owner (P2)

**Goal**: Source ownership remains discoverable without runtime/contract regressions.
**Independent test**: Source review confirms contract/endpoint locality, narrowly justified remaining corrections, no reservation global dispatch, and unchanged existing generated-contract/application expectations.

- [X] T014 [US3] Review src/Inventory/Program.cs, src/Reservations/ReservationEndpoints.cs, src/Notifications/Program.cs and their contract declarations for local ownership, factual prose, no invented payloads/examples and no new runtime validation/binding; inspect remaining shared/schema corrections against specs/012-local-api-metadata/plan.md and record evidence in specs/012-local-api-metadata/team/implementation.md.
- [x] T015 [US3] Verify unchanged contract shape with existing assertions in tests/TestSupport/OpenApiAssertions.cs and existing behavior tests under tests/Inventory.Tests, tests/Reservations.Tests and tests/Notifications.Tests; optionally compare temporary baseline/generated documents excluding descriptions, and record exact evidence/limitations in specs/012-local-api-metadata/team/implementation.md without committing exports or rewriting behavior expectations.

## Phase 6: Polish and cross-cutting verification

- [x] T016 Execute specs/012-local-api-metadata/quickstart.md verification, including npm run format-check, npm run lint, npm run check and whitespace/link/readability inspection; record commands, environment, revision and results in specs/012-local-api-metadata/team/implementation.md and update task statuses from evidence.
- [x] T017 Coordinate independent quality/security review and current-task convergence through specs/012-local-api-metadata/team/ review artifacts; resolve blocking findings with original reviewer closure, preserving task history and recording unavailable gates accurately; keep human acceptance pending until explicit owner acceptance.

## Dependencies and parallel opportunities

T001 → T002 → T003 → T004/T005/T006 in parallel → T007 → T008. T009 precedes T010/T011/T012 in parallel → T013. T007 must precede endpoint edits if shared helper auth prose is adjusted; T008 precedes T012/T013 because the same reservation correction file is involved. T014–T015 follow both description stories; T016 then T017 close implementation evidence. Full delivery requires all stories; US1 alone is only the inspectable MVP, never acceptance of the full request.

Parallel examples: US1 workers may independently edit EquipmentStore.cs, ReservationContracts.cs and NotificationContracts.cs after T003. US2 workers may independently edit Inventory/Program.cs, Notifications/Program.cs and ReservationEndpoints.cs after T009. US3 source review/structural regression assessment can be read in parallel after writes freeze, with evidence writes serialized by the coordinator. Do not run whole-repository formatters while other workers write.

## Implementation strategy and requirement mapping

Incrementally prove model prose first, then operation prose, then locality and compatibility. Test coverage concerns observable generated documents rather than internal extension arrangement. Format each changed source file immediately and inspect it before further work.

| Requirements | Tasks |
| --- | --- |
| FR-001 / SC-001 / SC-002 | T001, T003–T013 |
| FR-002 / US1 | T003–T008 |
| FR-003 / US2 | T009–T013 |
| FR-004 / SC-004 / US3 | T008, T010–T014 |
| FR-005 / FR-006 / SC-003 | T004–T008, T010–T016 |
| FR-007 | T002–T003, T009, T013, T015–T016 |
| FR-008 | T004–T007, T010–T014, T017 |

All seventeen tasks use stable sequential IDs and exact owned artifact/source paths. Parallel labels indicate disjoint writes only; coordinator owns review verdict/state persistence and explicit human acceptance.
