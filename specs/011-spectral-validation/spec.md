# Feature Specification: Spectral OpenAPI Validation

**Feature Branch**: `011-spectral-validation`

**Created**: 2026-10-20

**Status**: Implemented and independently reviewed — convergence passed; explicit human acceptance pending

**Input**: Human-confirmed scope: Spectral recommended OpenAPI rules for all three runtime-generated service documents, warnings and errors fail, existing contract assertions retained, focused and full local checks, CI workflow deferred.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Detect document regressions (Priority: P1)

As an API maintainer, I want current Inventory, Reservations, and Notifications documents checked against a shared quality baseline before handoff.

**Why this priority**: Consumers depend on accurate, usable descriptions across all three APIs.

**Independent Test**: Check each current document and introduce a representative rule violation to demonstrate an actionable failure.

**Acceptance Scenarios**:

1. **Given** current documents for all three services, **When** validation runs, **Then** each is assessed against Spectral's recommended OpenAPI rules and the compliant baseline has zero warnings and errors.
2. **Given** a recommended-rule warning or error, **When** validation runs, **Then** it fails with the document identity, rule, and location or document path needed to correct the issue.
3. **Given** a service-specific contract regression, **When** document tests run, **Then** existing contract assertions still detect it alongside general validation.

### User Story 2 - Run familiar local checks (Priority: P2)

As a developer, I want focused validation and inclusion in the full quality check so I can validate document changes reliably.

**Why this priority**: One documented workflow supports everyday development and future automation.

**Independent Test**: Run both documented commands and verify they propagate document-validation failures.

**Acceptance Scenarios**:

1. **Given** documented prerequisites, **When** a developer runs `npm run check:openapi`, **Then** all three existing HTTP document contract tests execute with Spectral validation without a separately running application.
2. **Given** a document-validation failure, **When** either `npm run check:openapi` or `npm run check` reaches validation, **Then** the command exits unsuccessfully; the full command retains its existing checks.
3. **Given** a fresh checkout, **When** a developer follows committed instructions, **Then** prerequisites, commands, failure threshold, and finding interpretation are explained sufficiently to run the checks.

### User Story 3 - Establish a compliant baseline safely (Priority: P2)

As an API owner, I want metadata issues corrected while preserving application behavior.

**Why this priority**: Documentation improvements must preserve clients' existing contracts.

**Independent Test**: Compare corrected metadata with existing HTTP behavior assertions and inspect any documented overrides.

**Acceptance Scenarios**:

1. **Given** baseline rule findings, **When** they are corrected, **Then** metadata complies while existing API behavior remains unchanged.
2. **Given** a proposed rule override, **When** it is considered, **Then** its scope and reason are documented and applicable repository approvals are obtained; behavior changes require a separate human decision.

### Edge Cases

- A warning alone fails; zero errors cannot silently pass warnings.
- Missing or malformed input, unavailable validator, and missing prerequisites fail clearly rather than skipping validation successfully.
- Concurrent document checks retain service-attributable diagnostics and independent state.
- Current generated documents remain authoritative; saved exports cannot substitute for runtime generation.
- Findings that require API behavior changes are raised for decision rather than hidden.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Validate runtime-generated Inventory, Reservations, and Notifications documents with Spectral's recommended OpenAPI rules.
- **FR-002**: Fail on warnings and errors and report document identity, rule, and relevant location or document path.
- **FR-003**: Retain existing C# contract assertions and validate inside existing HTTP contract tests using actual application hosts and their isolated real PostgreSQL fixtures.
- **FR-004**: Provide `npm run check:openapi` and integrate validation into `npm run check`, preserving existing checks and propagating validation failures.
- **FR-005**: Correct baseline findings through metadata while preserving API behavior. Behavior changes require a separate human-owner decision.
- **FR-006**: Document the reason and scope for any rule override and follow repository approval requirements. Introduce no custom Spectral rules.
- **FR-007**: Document reproducible setup, commands, failure threshold, and diagnostic interpretation. Require no separately running Aspire application or committed schema exports.
- **FR-008**: Fail clearly for missing/malformed input, validator execution failure, or unavailable prerequisites; never report skipped validation as passing.
- **FR-009**: Defer CI workflow creation and schema exports. Preserve document exposure, authentication, authorization, and business-operation behavior.

### Key Entities

- **Service document**: Current generated business-operation description belonging to one of the three services.
- **Validation finding**: Rule result with severity, document identity, and corrective diagnostic location or path.
- **Rule baseline**: Recommended OpenAPI rules and any explicitly documented, approved scoped overrides.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: All three current service documents pass the agreed baseline with zero warnings and errors.
- **SC-002**: Representative warning and error violations each produce an unsuccessful check with actionable document, rule, and location diagnostics.
- **SC-003**: Focused and full local checks reject document regressions; existing service-specific checks still pass for the compliant baseline.
- **SC-004**: A developer can follow committed instructions to check all documents without separately starting the application or committing generated files.
- **SC-005**: Delivery introduces zero API behavior changes, CI workflows, custom rules, or committed exported schemas.

## Assumptions

- The owner confirmed implementation authorization and scope on 2026-10-20. Final feature acceptance remains a separate gate.
- Existing HTTP tests and isolated database fixtures are the agreed boundary; documented toolchain and container prerequisites apply.
- Versions, process boundaries, execution bounds, and test design belong in the plan. No new production dependency or telemetry behavior is requested.
- CI enforcement is explicitly deferred; the full local quality command will be usable by later automation.
- No critical business ambiguity remains after the confirmed interview. Rule overrides remain subject to repository governance rather than implied approval.
