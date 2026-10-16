# Feature Specification: Feature 0 — Hello World Walking Skeleton

**Feature Directory**: `specs/001-hello-world-skeleton`
**Created**: 2026-10-13
**Status**: Implemented — awaiting independent review refresh, convergence, and explicit human feature acceptance
**Input**: Build a local-only equipment application proving the real end-to-end hello journey, with one seeded item and three service responsibilities. The owner corrected startup to .NET Aspire AppHost with Podman; implementation constraints are carried into planning.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Send hello for equipment (Priority: P1)

As a developer trying the initial application locally, I can see the seeded equipment, send a hello, and see the matching message so I know the application components communicate successfully.

**Why this priority**: This is the only product journey and proves connectivity before reservation functionality is built.

**Independent Test**: Start the documented local environment, open the application, and send one hello. Verify the returned correlation ID retrieves the displayed message through the actual services and broker.

**Acceptance Scenarios**:

1. **Given** a fresh checkout and documented prerequisites, **When** the developer follows the single local startup procedure, **Then** the application starts and displays exactly one item obtained from Inventory, including its ID and name.
2. **Given** the displayed item, **When** the developer clicks “Send hello”, **Then** the application shows pending progress, Reservations checks that ID with Inventory, publishes a HelloRequested event through the actual broker, and returns a correlation ID; Notifications consumes the event and the application displays “Hello received for <equipment name>” for that correlation ID.
3. **Given** a completed hello, **When** the developer sends another hello, **Then** it has a distinct correlation ID and its own corresponding result.
4. **Given** a healthy local environment, **When** the automated integration smoke check runs without human interaction, **Then** it verifies the seeded item, complete real communication path, and matching correlation ID/message.

### Edge Cases

- Unknown equipment is rejected clearly and produces no HelloRequested event.
- Missing, malformed, or oversized input is rejected without publishing; malformed correlation IDs are rejected clearly.
- Unavailable Inventory, broker, or Notifications produces an understandable error without exposing internal exceptions or secrets.
- A missing notification remains pending only within the polling deadline, then becomes an explicit timeout error.
- Leaving the component or receiving a result stops polling; a slow response cannot extend the overall deadline.
- Repeated clicks while pending cannot start overlapping polling sessions.
- Expired or evicted messages are unavailable and handled as missing results; restarting Notifications clears its messages.
- Restarting services resets transient state; the demo promises neither persistence nor delivery across restarts.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Inventory MUST return one hardcoded equipment item with a stable non-empty ID and display name; the application MUST display the returned item rather than a separate client copy.
- **FR-002**: The application MUST send the displayed equipment ID to Reservations when “Send hello” is clicked. Reservations MUST confirm its existence by making a direct request to Inventory before publishing.
- **FR-003**: For valid equipment, Reservations MUST publish one HelloRequested event through the real broker and return a new correlation ID after successful publication. Use one exchange, one queue, and one consumer; simulated messaging or bypassed Inventory verification is prohibited.
- **FR-004**: Notifications MUST consume the event, store a message in memory, and allow lookup by correlation ID. The message MUST read “Hello received for <equipment name>” using the equipment name confirmed by Inventory.
- **FR-005**: The application MUST display loading equipment, pending hello, success, and understandable error states. It MUST show the returned correlation ID with the result and allow another deliberate send after completion or error.
- **FR-006**: Unknown equipment MUST be rejected without publishing. Invalid request shapes MUST be rejected clearly. Inventory or broker failure MUST result in an understandable request failure instead of claimed success.
- **FR-007**: Polling MUST stop upon success, component destruction, or a maximum 30-second notification-wait deadline. Each remote operation MUST have an explicit timeout; the application MUST leave pending state even when an individual operation stalls.
- **FR-008**: Notifications MUST retain at most 1,000 messages and expire each after five minutes. At capacity it MUST evict the oldest retained message. Restarting services MUST reset in-memory state; broker state MUST NOT promise replay or recovery.
- **FR-009**: A fresh checkout MUST have one documented local startup procedure, with prerequisites and exact compatible supported stable versions recorded. Documentation MUST describe the journey, verification, troubleshooting, failure/timeout behavior, and intentional limitations.
- **FR-010**: One small automated integration smoke check MUST verify the complete path against running services and the actual broker, including equipment confirmation, publication, consumption, correlation ID lookup, and returned message. Required behavior tests MUST follow the constitution's test-first and public-interface rules.
- **FR-011**: Local configuration MUST commit no sensitive credentials and MUST prevent unintended public exposure of backend services and the broker. Deferred authentication and authorization MUST be documented as a local-only scope decision, never as an implemented capability.
- **FR-012**: The feature MUST provide correlated traces, structured logs, and metrics for the hello journey and remote dependency failures under the constitution. Telemetry MUST exclude secrets and request bodies; high-cardinality IDs MUST NOT be metric dimensions.
- **FR-013**: The feature MUST NOT implement reservations, authentication, authorization, an identity provider, databases, migrations, an outbox, deduplication, automatic retries, approval workflows, real bookings, or production deployment infrastructure.
- **FR-014**: The equipment name, send control, and state messages MUST be accessible with keyboard navigation and meaningful labels; pending, success, and error changes MUST be announced to assistive technology without relying on color alone.

### Key Entities *(include if feature involves data)*

- **Equipment**: The sole seeded item, identified by its stable ID and display name.
- **HelloRequested**: The event connecting confirmed equipment ID/name to a newly generated correlation ID.
- **Hello notification**: The in-memory message and its correlation ID, creation time, and expiry time.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001 / AC1**: A developer with documented prerequisites can start a fresh checkout through one documented local procedure.
- **SC-002 / AC2**: The application displays the single equipment item supplied by Inventory.
- **SC-003 / AC3**: One “Send hello” action completes the actual request, equipment verification, queued event, notification, and display journey in a healthy local run.
- **SC-004 / AC4**: The returned correlation ID identifies the displayed notification; two successful sends have distinct IDs.
- **SC-005 / AC5**: Unknown equipment produces a clear rejection and zero published hello events for that request.
- **SC-006 / AC6**: Dependency failures show an understandable error; absent notifications leave pending state within 30 seconds of starting the wait, with no further polling after success or component destruction.
- **SC-007 / AC7**: The automated smoke check passes against the running local environment and fails diagnostically if any link in the journey is unavailable.
- **SC-008 / AC8**: Independent configuration review confirms zero committed sensitive credentials and no unintended public access to services or the broker; retention never exceeds 1,000 messages and expired messages are unavailable after five minutes.

## Assumptions

- The sole actor is a developer on a trusted local workstation. No real personal data or shared/public deployment is in scope.
- The owner explicitly chose Angular, three ASP.NET Core services, RabbitMQ, and a monorepo. The corrected startup instruction is .NET Aspire AppHost using Podman. These implementation constraints pass to the plan without adding product behavior.
- Routine defaults are a 30-second notification wait, five-minute retention, and 1,000-message capacity. Dependency timeout values and supported versions are planning decisions.
- Polling is an explicit observation loop, not an automatic retry of sending. A new click after completion/error is a new operation.
- This is a connectivity demonstration, with no uptime, production throughput, or cross-restart recovery promise.
- Human final feature acceptance remains required by the constitution; it is not inferred from the request or automated checks.


## Prospective testing-policy supersession — feature 007

On 2026-10-16, the owner approved [feature 007’s testing policy](../007-aspire-independent-tests/supersession.md), which supersedes this document’s automated Aspire/AppHost and manifest-publication obligations and retired Smoke.Tests paths. Retained application/provider guarantees have [replacement coverage](../007-aspire-independent-tests/team/coverage-disposition.md); local orchestration is verified manually. Deployment manifest support is outside scope. Original requirements, task markers, acceptance status, review hashes, and evidence above remain historical records; they do not approve feature 007.
