# Feature Specification: Local Administration Consoles

**Feature Branch**: `main` (feature directory: `005-admin-consoles`; no branch created)

**Created**: 2026-10-15

**Status**: Complete — implemented, independently reviewed, and accepted 2026-10-16

**Status metadata**: Metadata-only update 2026-10-16 after explicit result acceptance was recorded in team/human-acceptance.md and team/run-state.json. Required checks, independent quality/security reviews and convergence passed. Requirements and reviewed source unchanged; historical review snapshots and reports preserved.

**Input**: Add local administration consoles for RabbitMQ and PostgreSQL to the existing Aspire application. The owner confirmed the scope and access model in the pre-work interview and authorized the feature-team implementation loop.

## Clarifications

### Session 2026-10-15

These decisions were explicitly confirmed by the owner before specification. This clarification pass asks no additional questions.

- Q: Where are the consoles available? → A: Local development only, accessible only from the developer's own computer; exclude them from deployment output.
- Q: Which consoles and startup behavior are wanted? → A: RabbitMQ Management and pgAdmin through the existing Aspire integrations, starting automatically with the local application, with dashboard links and dynamic ports.
- Q: Which broker workflows are needed? → A: Inspect queues, exchanges, bindings, consumers, and messages; publish test messages and purge queues while debugging.
- Q: Which database workflows and privileges are needed? → A: Browse tables, run SQL, and edit development data across inventory, reservations, and notifications, with administrator privileges including schema changes and deletion.
- Q: How should access work? → A: Keep RabbitMQ's normal login using existing development credentials, document secure credential retrieval, and automatically connect pgAdmin without a separate pgAdmin login, conditional on verified local-only access.
- Q: Which state is preserved? → A: Preserve existing database and broker volumes, secrets, and application-role restrictions; pgAdmin preferences, saved queries, and UI history may reset when its container is recreated.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Inspect and manage local messaging (Priority: P1)

As a developer debugging booking notifications, I open the broker console from the application dashboard and inspect or manage my local messaging state.

**Why this priority**: Direct inspection of message routing and delivery helps diagnose the existing asynchronous workflow.

**Independent Test**: Start locally, open the broker dashboard link, sign in using the documented credential-retrieval procedure, and use isolated test resources to inspect routing, publish and inspect a message, and purge the test queue.

**Acceptance Scenarios**:

1. **Given** normal local startup, **When** the broker is ready, **Then** its console starts automatically with a working dashboard link and dynamically assigned host port, without an extra startup command or feature flag.
2. **Given** the login screen, **When** the developer retrieves existing development credentials using the documentation and signs in, **Then** administration is available; unauthenticated visitors cannot administer the broker.
3. **Given** isolated queues, exchanges, bindings, and a connected consumer, **When** the developer inspects them, publishes and inspects a test message, and purges its queue, **Then** routing, consumer, and message information is visible and publication and purging take effect.

### User Story 2 - Inspect and change local application data (Priority: P1)

As a developer investigating application behavior, I open the database console from the dashboard and administer all three local application databases without manually configuring connections.

**Why this priority**: Ready-to-use browsing and SQL execution support investigations across services.

**Independent Test**: Start locally, open the database console, browse and query all three databases, and use disposable objects to verify row edits, schema changes, and deletion.

**Acceptance Scenarios**:

1. **Given** normal local startup and ready databases, **When** the developer opens the database-console dashboard link, **Then** the console is automatically available at its dynamically assigned host port with no separate login or manual server registration and can connect to inventory, reservations, and notifications without entering database credentials.
2. **Given** each application database, **When** the developer browses tables and runs SQL, **Then** existing schema and query results are displayed.
3. **Given** disposable test objects in each database, **When** the developer creates or changes a schema object, inserts and edits a row, and deletes test data and objects, **Then** each operation succeeds with administrator privileges.
4. **Given** a recreated console container, **When** the developer opens it again, **Then** automatic access to all three databases works even if preferences, saved queries, and UI history have reset.

### User Story 3 - Keep administrative access local and preserve the application (Priority: P1)

As the local operator, I can administer development infrastructure without exposing it to other computers, resetting existing state, or changing application permissions and behavior.

**Why this priority**: Password-free database administration is acceptable only within the agreed workstation boundary.

**Independent Test**: Verify advertised links and effective host exposure, inspect deployment output, restart with existing state, and run existing booking and permission checks.

**Acceptance Scenarios**:

1. **Given** the running local application, **When** console listener/forwarding exposure is inspected and access is attempted through the host's non-loopback address, **Then** both consoles are reachable through loopback and not reachable through a non-loopback host interface, including direct URLs independently of dashboard authentication.
2. **Given** deployment output generated from the application model, **When** resources and endpoints are inspected, **Then** neither console nor its administrative endpoint is included.
3. **Given** existing database records, broker resources/messages, volumes, and secrets, **When** consoles are added and the application starts and restarts without intentional administrator mutations, **Then** that state and its identities remain intact with no reset, rotation, or purge.
4. **Given** existing service accounts and booking workflows, **When** permission and application checks run with consoles enabled, **Then** service-role isolation and booking behavior remain unchanged and application services do not receive database administrator credentials.
5. **Given** development instructions and diagnostic output produced by this feature, **When** inspected, **Then** instructions explain startup, access, secure credential retrieval, administrator powers, and disposable settings without secret values, and feature logs/telemetry do not disclose credentials or connection secrets.

### Edge Cases

- Assigned ports may change after restart: the current dashboard links remain usable and documentation does not require fixed ports.
- During dependency startup, outage, and recovery, existing dashboard resource/dependency diagnostics remain available; administration works when dependencies are ready. No custom failure UI or recovery service is requested.
- Empty databases and queues still permit inspection and supported creation/query/publication operations.
- Running workers may consume broker messages: validation uses isolated test resources to avoid interfering with bookings.
- Destructive operations are explicitly allowed locally; validation uses disposable objects rather than deleting existing application state.
- Dashboard authentication does not protect a password-free console's direct URL; every console endpoint must satisfy the loopback-only boundary.
- Console recreation may discard settings but must restore automatic database access.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Normal local startup MUST automatically provide both consoles with working Aspire dashboard links and dynamically assigned host ports, without extra startup commands or feature flags.
- **FR-002**: Broker administration MUST require existing development credentials through normal login and support inspection of queues, exchanges, bindings, consumers, and messages, test-message publication, and queue purging.
- **FR-003**: The database console MUST automatically offer administrator access to inventory, reservations, and notifications without separate console authentication, manual server registration, or manual database credential entry.
- **FR-004**: The database console MUST support table browsing, SQL execution, data edits, schema changes, and deletion in each database.
- **FR-005**: Both consoles and every host-accessible endpoint serving them MUST be available only through loopback on the developer's computer, independently of dashboard authentication. LAN and remote console access are outside scope.
- **FR-006**: Both consoles and their administrative endpoints MUST be excluded from deployment output and enabled only for local development execution.
- **FR-007**: Provisioning and normal startup/restart MUST preserve existing broker/database volume identities and contents, secrets and secret-store identity, and service-role restrictions. Intentional administrator mutations are the only permitted state changes attributable to console use.
- **FR-008**: Database-console preferences, saved queries, and UI history MUST be disposable. Console recreation MUST restore automatic access to existing application databases without restoring console settings.
- **FR-009**: Documentation MUST explain startup, dashboard links/dynamic ports, secure broker credential retrieval, local-only password-free database access and administrator powers, and disposable settings. Documentation MUST NOT embed credentials; new feature logs/telemetry MUST NOT disclose credentials or connection secrets.
- **FR-010**: Existing booking, notification, persistence, messaging recovery, service authorization, and observability behavior MUST remain unchanged with consoles enabled except for explicitly initiated administration operations.
- **FR-011**: Completion MUST include current-revision evidence for workflows, effective local exposure, deployment exclusion, state preservation, retained application behavior, required checks, independent quality/security reviews, convergence, and explicit owner acceptance. Authorization to implement MUST NOT count as acceptance of the result.

### Key Entities

- **Administration console**: A local browser interface administering the existing broker or database server, associated with a current dashboard link and loopback-only endpoint.
- **Application database**: inventory, reservations, or notifications, accessible to the developer with administrator privileges while service accounts retain existing restrictions.
- **Retained local state**: Existing records, schemas, broker resources/messages, volumes, credentials, and secret-store identity; provisioning does not reset these.
- **Disposable console state**: Database-console preferences, saved queries, and UI history that need not survive recreation.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Following one normal local startup, both interfaces are reachable from current dashboard links without separate console startup or manual connection setup.
- **SC-002**: Every agreed messaging workflow succeeds against isolated test resources: inspect queues, exchanges, bindings, consumers, and messages; publish a message; purge its queue.
- **SC-003**: All three application data stores support browsing, queries, row edits, schema changes, and deletion through the interface without credential entry or manual connection registration.
- **SC-004**: Both console interfaces are reachable through loopback, zero are reachable through non-loopback host interfaces, and zero console resources or administrative endpoints appear in deployment output.
- **SC-005**: Normal startup, restart, and console recreation cause zero resets/deletions of existing application state or credentials, preserve service permissions, and leave required booking checks passing.
- **SC-006**: A maintainer can follow documented access without credential values in committed documentation; discarding console settings does not prevent automatic access to the three data stores.
- **SC-007**: Every requirement has current-revision evidence and independent review coverage with no blocking findings or convergence gaps before explicit owner acceptance is recorded.

## Assumptions

- The operator is the trusted developer on their own workstation. Shared/production environments, remote administration, and a custom application admin screen are outside scope.
- The owner selected RabbitMQ Management and pgAdmin through installed Aspire integrations. These are scope constraints, not a request to compare or build alternatives. Changes to existing Aspire 13.6.1, broker, or database versions are outside scope.
- Consoles depend on the existing local broker, database server, application databases, container runtime, and credential store. Planning selects exact configuration and verification without weakening local-only access.
- Existing tools supply normal navigation, empty/error states, and destructive-operation behavior. Custom UI, new localization, collaboration, retained console history, and new console-specific application telemetry are not requested.
- Broad local administrator powers do not authorize relaxing application service permissions or treating intentional console-triggered data/schema changes as application defects.
- All product decisions are settled by the confirmed interview. Technical choices belong in planning under the constitution and engineering guides.


## Prospective testing-policy supersession — feature 007

On 2026-10-16, the owner approved [feature 007’s testing policy](../007-aspire-independent-tests/supersession.md), which supersedes this document’s automated Aspire/AppHost and manifest-publication obligations and retired Smoke.Tests paths. Retained application/provider guarantees have [replacement coverage](../007-aspire-independent-tests/team/coverage-disposition.md); local orchestration is verified manually. Deployment manifest support is outside scope. In particular, US3.2 and FR-006/FR-011/SC-004 deployment-output obligations are superseded; local Development-only console behavior, effective loopback exposure, access, and persistence remain manual guarantees. Original requirements, task markers, acceptance status, review hashes, and evidence above remain historical records; they do not approve feature 007.
