# Feature Specification: Generated API documentation and interactive testing

**Feature Branch**: `010-openapi-documentation` (feature identifier; no branch created)

**Created**: 2026-10-19

**Status**: Complete — implemented, independently reviewed, and accepted 2026-10-20

**Input**: Implement the agreed OpenAPI generation and interactive API testing feature for Inventory, Reservations, and Notifications, under the approved [OpenAPI engineering standard](../../docs/engineering/openapi.md).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Discover accurate business API contracts (Priority: P1)

As an application developer, I can inspect each running development service's business operations and their input, output, and access requirements so I can call them correctly without reading handler code.

**Why this priority**: Accurate contracts are the foundation for useful interactive documentation.

**Independent Test**: Retrieve each service's document through its public HTTP entry point and compare its operations and contracts with expected business behavior.

**Acceptance Scenarios**:

1. **Given** each service is running in Development, **When** I retrieve its document, **Then** it describes every business operation and excludes health and operational endpoints.
2. **Given** a documented operation, **When** I inspect its contract, **Then** I can identify its stable unique operation name, summary, group, parameter locations, required inputs, request/response shapes and media types, expected statuses, validation failures, and access requirements.
3. **Given** requests handled manually or failures produced by middleware, **When** I compare documentation with wire responses, **Then** contracts describe actual behavior, including empty authentication and permission failures, without changing that behavior for documentation convenience.
4. **Given** viewers with different permissions or no credentials, **When** they retrieve the same service document, **Then** they receive the same business-operation contract and its stated role requirements.

---

### User Story 2 - Exercise APIs with my development identity (Priority: P1)

As a developer, I can discover each service's interactive documentation, sign in with the existing identity provider, and execute real requests using my permissions so I can investigate permitted and forbidden behavior.

**Why this priority**: The feature must support realistic API testing, including writes and access failures.

**Independent Test**: In a browser, open a service UI, sign in, make an authenticated call and representative write, then verify a permission-denied operation.

**Acceptance Scenarios**:

1. **Given** the local application is running, **When** I inspect its dashboard, **Then** each service offers a browser-reachable link to its own interactive API documentation.
2. **Given** the UI is open, **When** I sign in with my existing human identity, **Then** I can execute requests directly against that service with the same identity, audience, roles, and permissions as normal API use.
3. **Given** an authorized developer and valid inputs, **When** I create or cancel a reservation through the UI, **Then** the operation changes development data under normal browser-write protections and produces the normal API result.
4. **Given** an unauthenticated developer or a signed-in developer without the required permission, **When** the developer invokes a protected operation, **Then** the normal authentication or permission failure is preserved and visible.
5. **Given** developer instructions, **When** I follow them, **Then** I can discover the UI, sign in, test permitted and forbidden operations, and understand that requests change real development data.

---

### User Story 3 - Keep documentation access bounded and private (Priority: P1)

As the application owner, I can make interactive documentation available for development without exposing it in other environments or disclosing developer credentials.

**Why this priority**: Documentation must preserve the existing security boundary.

**Independent Test**: Check document/UI exposure in Development and non-Development hosts and inspect browser authorization configuration and traffic.

**Acceptance Scenarios**:

1. **Given** default service configuration outside Development, **When** document or UI routes are requested, **Then** neither is available.
2. **Given** a development documentation login, **When** authentication runs, **Then** only explicitly allowed development browser origins and redirects are accepted, with no client secret required by the browser.
3. **Given** the UI has authenticated, **When** the browser session ends and a new session opens, **Then** UI authorization from the prior session is not restored from persistent browser storage.
4. **Given** an interactive request or login, **When** traffic and exported telemetry are inspected, **Then** API traffic uses no external proxy or AI agent, and credentials, tokens, request bodies, and unapproved personal data are not disclosed through committed configuration or telemetry.

### Edge Cases

- A service may have no request body, an empty response, or manually parsed input; the document must reflect those distinctions.
- An expired token, cancelled login, unavailable identity provider, or insufficient role must not bypass API authorization or report a protected request as successful.
- A browser write blocked by existing origin/security checks must remain blocked; documentation cannot relax those checks.
- Local endpoint addresses may vary between runs; dashboard links and registered development redirect/origin handling must remain consistent with actual browser-reachable endpoints.
- Middleware failures, malformed input, and business rejection may have different response formats; documentation must not invent a common body.
- Generated contracts must remain complete when the requesting user lacks permissions for some documented operations.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Each of Inventory, Reservations, and Notifications MUST provide a runtime-generated business API document derived from its implemented endpoint definitions and request/response contracts, without a separately maintained handwritten schema.
- **FR-002**: Documents MUST cover all business operations, exclude health and operational endpoints, and remain identical across viewer permissions.
- **FR-003**: Every operation MUST expose a stable unique identifier, useful summary, grouping, complete input/output contracts, expected status codes, validation failures, and authentication and role/permission requirements.
- **FR-004**: Documentation MUST describe actual API wire behavior, including middleware errors and empty 401/403 responses; this feature MUST preserve business contracts and authorization behavior.
- **FR-005**: Each service MUST provide its own interactive UI and a discoverable browser-reachable dashboard link.
- **FR-006**: Both document and UI MUST be available only in Development by default. Any other exposure requires a separate explicit owner-approved decision and access-control plan; no such exposure is requested here.
- **FR-007**: Interactive login MUST use the existing human identity provider through a dedicated public documentation client without a client secret, preserve audience/role rules, and restrict browser origins and redirects to explicitly allowed development locations.
- **FR-008**: Interactive calls MUST execute directly against the service hosting the UI using the developer's normal permissions, including real writes, while preserving browser-write protections.
- **FR-009**: UI authorization MUST NOT persist across browser sessions. The UI MUST NOT use an external request proxy or AI agent. Committed configuration and telemetry MUST respect existing credential and privacy restrictions.
- **FR-010**: Developer instructions MUST explain UI discovery, sign-in, permitted and forbidden testing, and the effects of real development writes.
- **FR-011**: Automated verification MUST establish contract validity, expected operation coverage, input/output and status contracts, security metadata, excluded operational routes, and default environment exposure through service HTTP entry points with real production routing and metadata.
- **FR-012**: Browser verification MUST cover UI login, an authenticated call, a representative permitted write, and permission-denied behavior. Local dashboard discovery and orchestration MUST be checked manually under existing repository procedure, without automated application tests constructing or running the orchestration host.

### Key Entities

- **Service API document**: The generated description of one service's business operations, inputs, outputs, and access requirements.
- **Business operation**: An application HTTP action with a stable identifier and observable contract; excludes health and operational actions.
- **Documentation login identity**: An existing human identity whose permissions continue to govern interactive requests.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: All three services publish documentation covering 100% of expected business operations and zero operational endpoints, with each operation's required contract and access information verified.
- **SC-002**: A developer can discover each service's UI from the local dashboard and complete sign-in, an authenticated call, a permitted write, and a permission-denied request with results matching normal API behavior.
- **SC-003**: Default non-Development configuration exposes zero document or interactive UI routes across the three services.
- **SC-004**: Browser and telemetry verification finds no persisted UI authorization across sessions, external request proxy/AI traffic, committed tokens or credentials, or newly disclosed forbidden telemetry fields.

## Assumptions

- The approved engineering guide owns implementation constraints: built-in ASP.NET Core generation, OpenAPI 3.1, Scalar, Keycloak authorization code with PKCE S256, and related testing/privacy obligations. The implementation plan records package versions, routes, operation identifiers, metadata gaps, client configuration, and dependency/telemetry decisions; this spec does not duplicate those standards.
- Existing API contracts and identity/permission rules remain authoritative; this feature adds documentation and a development interaction surface rather than changing reservation rules.
- Runtime generation is sufficient for this phase. Angular client generation, schema-baseline breaking-change gates, build-time export, published schema artifacts, and a combined portal are out of scope.
- Existing API behavior suites remain responsible for business correctness; new documentation checks complement them.
- The human owner settled the scope and security choices in the preceding interview; there are no remaining business decisions requiring another interview.
