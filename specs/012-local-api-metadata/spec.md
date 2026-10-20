# Feature Specification: API metadata beside contracts and endpoints

**Feature Branch**: `main` (feature directory is independent of branch)

**Created**: 2026-10-20

**Status**: Complete — implemented, independently reviewed, and accepted 2026-10-20

**Input**: Apply the approved OpenAPI engineering guidance to all APIs and all documented business endpoints, including prose for apparently self-explanatory fields, so the owner can inspect the resulting shape.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Understand every business field (Priority: P1)

An API consumer can read the development documentation and understand every request and response field without searching application implementation.

**Why this priority**: Consistent prose makes the full public contract visible, including identifiers, timestamps and nullable lifecycle fields.

**Independent Test**: Retrieve each service's generated document through its HTTP documentation route and inspect all reachable request/response model properties.

**Acceptance Scenarios**:

1. **Given** Inventory, Reservations and Notifications documentation, **When** a consumer opens any business request or response model, **Then** the model and every declared property have nonempty descriptions explaining their meaning, even for apparently obvious fields.
2. **Given** timestamps, identifiers, states, optional fields and advisory availability, **When** their descriptions are read, **Then** they accurately explain existing meaning and relevant constraints without claiming new behavior.
3. **Given** standard error responses, **When** their schemas are inspected, **Then** standard fields and application error extensions are described consistently with actual responses.

### User Story 2 - Understand each operation (Priority: P1)

An API consumer can understand inputs, successful outcomes and failure outcomes for every documented business operation.

**Why this priority**: Field descriptions alone do not explain how an operation can be called or why it fails.

**Independent Test**: Inspect the generated operation metadata for every business method/path in all three services.

**Acceptance Scenarios**:

1. **Given** any documented business operation, **When** its documentation is inspected, **Then** it has a stable operation ID, grouping, useful summary and description, descriptions for every path/query parameter and declared response, and descriptions for documented response headers and any request body.
2. **Given** reservation creation and cancellation, **When** their error documentation is inspected, **Then** empty authorization denials remain distinguishable from optional browser-write Problem Details.
3. **Given** manually validated reservation inputs and availability queries, **When** documentation is inspected, **Then** required inputs, nullability, formats, extra-field rejection and existing validation constraints remain accurate.

### User Story 3 - Maintain documentation beside its owner (Priority: P2)

A maintainer changing a contract or operation can find its documentation beside the definition, with only unavoidable shared corrections maintained centrally.

**Why this priority**: Local ownership reduces drift and demonstrates the requested refactoring style.

**Independent Test**: Review metadata ownership alongside generated-document and HTTP behavior regression results.

**Acceptance Scenarios**:

1. **Given** contract-owned field descriptions, **When** a maintainer inspects the contract definition, **Then** the descriptions are declared there rather than duplicated in a central override.
2. **Given** endpoint-specific documentation, **When** a maintainer inspects its endpoint definition, **Then** the metadata or attached correction is present there rather than selected by global operation-ID dispatch.
3. **Given** a remaining shared or schema correction, **When** it is reviewed, **Then** its narrow purpose and inference gap are recorded and it does not replace contract-owned prose.
4. **Given** the refactoring, **When** existing behavior and contract checks run, **Then** expectations remain valid without changing request processing, serialization, authentication, authorization or business outcomes.

### Edge Cases

- Null cancellation timestamps/event identifiers describe the uncancelled state rather than becoming required.
- A documented response may have no body; adding prose must not invent a payload or media type.
- Standard error schemas may be shared and contain dynamic extension fields; shared documentation remains accurate without exposing implementation details or secrets.
- Operational routes remain excluded, and documentation remains restricted to its existing development exposure.
- Manually parsed inputs retain their existing validation and binding behavior even where documentation expresses a stricter valid-input shape than nullable request storage types.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Cover every currently documented business operation of Inventory, Reservations and Notifications; exclude operational routes.
- **FR-002**: Supply nonempty, accurate prose for each reachable public request/response model and every declared property, including standard error properties and application-defined error extensions. Describe meaning and existing constraints; brevity is acceptable for self-explanatory fields.
- **FR-003**: Supply useful operation summaries/descriptions, path/query parameter descriptions, request-body descriptions where present, declared response descriptions and documented response-header descriptions for all scoped operations.
- **FR-004**: Locate contract-owned metadata with its contract definition and operation-owned metadata with its endpoint definition wherever supported. Remove global dispatch of reservation operation documentation by operation ID; retain only narrow, justified shared/schema corrections.
- **FR-005**: Preserve existing observable contracts apart from additive or relocated descriptions: routes, operation IDs, tags, fields, requiredness, nullability, formats, extra-field handling, response codes, headers, content types and security metadata remain accurate and compatible.
- **FR-006**: Preserve runtime binding, validation, serialization, business behavior, authentication, authorization, browser-write protections and environment exposure. Do not introduce validation constraints merely to generate documentation.
- **FR-007**: Verify the added descriptions through generated documents retrieved at service HTTP boundaries; retain existing contract and application behavior expectations and the established warning/error validation threshold.
- **FR-008**: Do not expose persistence-only/internal models, credentials, tokens or personal sample data in documentation, and do not add new operations or change role/ownership requirements.

### Key Entities

- **Business operation**: A currently documented method/path and its inputs, outcomes and access requirements.
- **Public contract**: A request/response schema reachable from a business operation, including its properties and error extensions.
- **Metadata owner**: The contract or endpoint whose definition explains the documented item; shared corrections address only gaps not accurately expressible there.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: All three services have descriptions for 100% of scoped public models and their declared properties.
- **SC-002**: 100% of scoped business operations, declared parameters, responses, documented headers and present request bodies have nonempty descriptions consistent with implemented behavior.
- **SC-003**: Existing consumer-visible contract and business-behavior expectations continue to pass unchanged; documentation validation reports zero warnings or errors.
- **SC-004**: Independent review confirms every contract/operation-specific description has a local owner where supported, all remaining corrections have recorded reasons, and no global reservation operation-ID dispatch remains.

## Assumptions

- The current generated business documents define the operation inventory; planning records an explicit coverage matrix before implementation.
- This is an additive documentation and behavior-preserving refactoring exercise, not authorization for new product behavior.
- Shared framework error models may require a narrow shared documentation correction because their declarations are not application-owned.
- Existing development UI, identity configuration, dependencies, telemetry and resilience policies remain in force; no new dependency or workflow is required.
- CI workflow, build-time export, custom Spectral rules, generated clients and unrelated Kubernetes planning are outside scope.
