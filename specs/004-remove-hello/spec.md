# Feature Specification: Retire the Hello Walking Skeleton

**Feature Branch**: `main` (feature directory: `004-remove-hello`; no branch created)

**Created**: 2026-10-15

**Status**: Complete — implemented, independently reviewed, and accepted 2026-10-15

**Input**: Remove the complete hello walking-skeleton feature now that bookings provides the real application journey. The owner confirmed removal scope, immediate retirement, preservation of historical evidence, shared-code renaming, equivalent booking coverage, and preservation of existing local state before authorizing the feature-team loop.

## Clarifications

### Session 2026-10-15

The following decisions were explicitly confirmed by the owner during the pre-work interview and subsequent evidence-strategy update; this clarification pass asks no additional questions.

- Q: Should removal cover hello application code, UI, endpoints, dedicated tests, and current documentation references? → A: Yes; remove the complete feature and use bookings for ongoing examples and checks that require a real feature.
- Q: Can hello endpoints disappear immediately without deprecation or compatibility responses? → A: Yes; hello is disposable walking-skeleton functionality.
- Q: Should historical specifications, completed tasks, and review evidence remain intact? → A: Yes; preserve historical evidence and hashes, with clearly separate retirement notes where necessary.
- Q: Should shared hello-named messaging and equipment-ID validation be renamed while retaining booking behavior? → A: Yes; use ReservationMessaging for shared messaging and appropriately name or extract the equipment-ID validation.
- Q: Should mixed tests retain booking assertions and useful infrastructure, security, and telemetry checks move to bookings? → A: Yes; delete hello-specific expectations and preserve meaningful coverage through bookings.
- Q: Should existing secrets and persisted data, including the hello-named AppHost secret-store identifier, remain untouched? → A: Yes; stop declaring and using hello broker resources, but do not delete existing queues or exchanges.
- Q: Should tests check that the retired hello feature is absent? → A: No. The owner explicitly requested removal of such tests; assess retirement through code, configuration, and documentation review while retaining positive booking tests.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Use bookings without the connectivity demo (Priority: P1)

As the local demo user, I use equipment booking, reservation history, cancellation, and the notification inbox without seeing or invoking the obsolete hello demo.

**Why this priority**: The application should present its real purpose while preserving the working booking journey.

**Independent Test**: Start the local application, inspect navigation, book future equipment, view its notification, cancel the booking, and refresh history and the inbox.

**Acceptance Scenarios**:

1. **Given** the running application, **When** the user opens the main screen, **Then** bookings is available and no connectivity-demo link, hello screen, send-hello action, or hello-result state is offered.
2. **Given** an operational item and a valid future interval, **When** the user checks availability, creates a reservation, views history, and cancels it before its start, **Then** existing booking results, validation, concurrency protection, persistent history, and confirmation/cancellation inbox behavior remain unchanged.
3. **Given** an old hello page address or hello operation address, **When** a client uses it after removal, **Then** no hello screen, successful hello operation, hello notification lookup, or compatibility/deprecation response is provided. Direct requests to the former service operations return not found; ordinary application fallback or not-found behavior is acceptable for an obsolete page address.
4. **Given** keyboard and assistive-technology use, **When** the user completes booking and cancellation, **Then** existing meaningful labels, status announcements, pending-action behavior, and focus behavior remain usable.

### User Story 2 - Operate bookings without hello dependencies (Priority: P1)

As the local operator, I can start, inspect, and recover the booking application without running or depending on obsolete hello processing.

**Why this priority**: Removing a demo must not damage the dependencies or diagnostic signals that real bookings need.

**Independent Test**: Start with existing local data and secrets, exercise booking and notification delivery, interrupt and recover messaging, and inspect booking health and telemetry.

**Acceptance Scenarios**:

1. **Given** existing local equipment, reservations, pending events, inbox entries, and secrets, **When** the updated application starts and restarts, **Then** existing state and secret-store identity remain intact and booking processing works without hello publishers, consumers, or hello-specific readiness dependencies.
2. **Given** old hello messages, queues, or exchanges remain in the local broker, **When** the application starts or processes bookings, **Then** it neither declares nor uses hello-specific resources, deletes those existing resources, nor turns retained hello messages into booking notifications.
3. **Given** a booking or cancellation during a messaging outage, **When** messaging recovers, **Then** committed reservation changes and their events remain durable and produce the existing single-entry notification effects.
4. **Given** successful, rejected, or dependency-failing booking work, **When** diagnostics are inspected, **Then** existing booking correlation, structured outcomes, latency, dependency health, and database-operation visibility remain available under the existing privacy policy, with no hello-specific telemetry emitted or registered.

### User Story 3 - Maintain one current application story (Priority: P2)

As a maintainer, I can use current instructions and checks to understand and validate bookings while retaining trustworthy historical records of the walking skeleton.

**Why this priority**: Current guidance and regression checks should describe the application that exists; historical evidence must retain its meaning.

**Independent Test**: Follow current startup and verification instructions, inspect the active feature surface and regression coverage, and compare historical evidence against its pre-removal contents.

**Acceptance Scenarios**:

1. **Given** current documentation and runnable examples, **When** a maintainer follows them, **Then** active feature demonstrations and feature-dependent checks use bookings and do not instruct the user to invoke hello.
2. **Given** shared components previously named for hello but still required by bookings, **When** a maintainer inspects the active application and checks, **Then** their naming describes reservation messaging or shared equipment validation and their existing observable contracts remain intact.
3. **Given** dedicated hello tests and tests mixing hello with booking or infrastructure assertions, **When** the retained verification suite is inspected and run, **Then** hello-only expectations are removed, meaningful booking assertions remain, and useful infrastructure, security, telemetry, and accessibility coverage formerly dependent on hello is exercised through bookings.
4. **Given** historical specifications, plans, tasks, contracts, review reports, and recorded hashes, **When** retirement is documented, **Then** their original contents and historical verdicts remain intact; any needed retirement context is clearly separate and does not imply that prior reviews approve this removal.

### Edge Cases

- A caller posts to an obsolete hello endpoint or polls an old notification identifier: no hello handler or compatibility behavior remains. Common host-level error or security handling may still apply.
- A browser opens a bookmarked hello page: it cannot render the removed feature; the ordinary fallback may display bookings.
- A retained broker resource contains hello messages: those resources and messages are left untouched and are not consumed by booking processing.
- Shared equipment-ID validation rejects malformed values and accepts previously valid values exactly as before, including the existing seeded Demo Camera identifier.
- A test named generically or for bookings may still contain hello-specific setup or assertions; removing those portions must preserve its meaningful remaining behavior coverage.
- Hello-specific worker health checks are removed without disabling reservation-worker or persistence/dependency health signals.
- A stale hello name survives in persisted state or the explicitly preserved secret-store identifier: it is not grounds for deleting data or rotating secrets.
- Existing trace-control tests or documentation examples use hello naming without implementing the feature: current examples/checks are updated while retaining their original diagnostic purpose.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The application MUST remove the hello screen, navigation entry, send action, client integration, and hello-specific UI states while retaining bookings as the main journey.
- **FR-002**: The application MUST remove hello request and notification-lookup operations immediately, with no deprecation period, compatibility response, or replacement hello operation. Direct requests to the former service operations MUST return not found, subject to common host-level protections.
- **FR-003**: The application MUST remove hello-only publishing, consumption, contracts, transient notification storage, configuration, health dependencies, and telemetry registrations/signals. It MUST stop declaring or using hello broker resources.
- **FR-004**: The application MUST preserve existing booking, availability, equipment, cancellation, outbox, inbox, recovery, validation, and externally observable booking message contracts, including repeat safety and concurrency guarantees.
- **FR-005**: Shared components still required by bookings MUST use reservation-oriented messaging and appropriately named equipment-validation terminology, preserving their behavior. Hello-only components MUST be removed rather than retained under new names.
- **FR-006**: Existing persisted application data, local secrets, and the existing secret-store identifier MUST remain unchanged by retirement. Existing broker queues, exchanges, and retained messages MUST NOT be deleted or purged as part of this feature.
- **FR-007**: Dedicated hello tests MUST be retired. Dedicated tests and assertions checking that retired hello endpoints, UI, navigation, or other feature surfaces are absent MUST NOT be retained or added. Removal acceptance MUST use code, configuration, and documentation review, together with retained positive booking tests. Mixed tests MUST retain meaningful booking assertions; useful infrastructure, security, telemetry, privacy, and accessibility coverage previously relying on hello MUST be retained through representative booking workflows.
- **FR-008**: Current operational documentation and runnable examples MUST describe bookings and the remaining application. Historical specifications, plans, completed tasks, contracts, review evidence, and review hashes MUST be preserved; retirement annotations MUST be clearly separate from historical evidence.
- **FR-009**: Remaining workflows MUST preserve existing local-only exposure, browser-write protections, safe malformed/oversized-input handling, dependency timeouts/retry guarantees, telemetry privacy, and bounded metric dimensions.
- **FR-010**: Booking traces, structured logs, metrics, health signals, and database-operation tracing MUST remain useful for success, failure, and recovery. Removing hello MUST NOT disable shared production instrumentation or weaken its regression checks. Reservation-worker, persistence, and remaining dependency readiness semantics MUST remain intact when hello-only readiness is removed.
- **FR-011**: Completion MUST include current-revision verification of removed hello surfaces and retained booking behavior, independent quality and security verdicts, no remaining convergence gaps, and explicit owner acceptance. Authorization to perform this work MUST NOT be recorded as acceptance of its completed result.

### Key Entities

- **Reservation and transition event**: Existing booking records and their confirmation/cancellation events; identities, statuses, timestamps, payload contracts, and durability guarantees are preserved.
- **Notification inbox entry**: Existing durable booking notification associated with a distinct transition event; duplicate delivery remains safe.
- **Historical evidence**: Prior feature agreements, task history, contracts, review reports, and hashes that describe earlier revisions; these remain auditable after retirement.
- **Retained local state**: Existing equipment, reservation and inbox data, pending events, credentials, secret-store identity, and obsolete broker resources; removal does not authorize deleting or resetting them.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Zero supported user journeys or current runnable instructions offer hello; obsolete addresses cannot successfully perform hello or retrieve a hello result. This retirement outcome is established by code, configuration, and documentation review, without dedicated absence tests or retired-feature negative assertions.
- **SC-002**: All existing booking acceptance behaviors remain satisfied, including conflict prevention, cancellation repeat safety, persisted history, and one inbox entry per delivered transition after outage/restart recovery.
- **SC-003**: No existing local application record, credential, or retained broker resource is deleted, reset, or purged by the removal or its normal startup/restart procedure.
- **SC-004**: Every useful retained infrastructure, security, privacy, telemetry, and accessibility concern previously exercised through hello has a recorded booking-based validation path; required checks pass for the reviewed revision.
- **SC-005**: All historical evidence remains intact and every remaining active hello reference is either removed or identified as the explicitly preserved secret-store identifier, clearly separated historical/retirement context, or isolated legacy-resource fixture needed to validate retained-state preservation. Review evidence may identify obsolete addresses and resources; automated checks MUST NOT assert the absence of retired hello functionality. Permitted references MUST NOT provide production hello processing, compatibility behavior, or instructions to use hello.
- **SC-006**: Independent reviewers can reconcile every requirement with current-revision evidence and explicit owner acceptance before completion is recorded.

## Assumptions

- This is retirement within the existing trusted local-workstation demo, not a new authentication, hosting, deployment, or data-migration feature.
- The owner explicitly approved immediate removal and preservation of existing state. Separate broker cleanup, secret rotation, and data deletion remain outside this feature.
- Owner-supplied naming constraints pass to planning unchanged: rename shared `HelloMessaging` to `ReservationMessaging`, extract or rename `HelloValidation` for equipment-ID validation, and preserve AppHost `UserSecretsId` value `equipment-hello-apphost-local`.
- Active package names and shared equipment or connection components may be renamed or extracted as needed to remove obsolete hello terminology; this does not authorize changes to their remaining observable behavior or stored state.
- The existing booking specification and accepted database-tracing specification define retained behavior; this feature intentionally supersedes the former requirement to keep hello functional without rewriting that historical agreement.
- Historical evidence may include snapshots of current documentation or source. Preserving that evidence does not permit active application guidance to continue offering hello.
- Ordinary not-found, fallback, or shared security responses at obsolete addresses are technical planning choices; no successful hello operation or compatibility promise is required.
- The owner's explicit evidence-strategy update excludes tests whose purpose is to prove an old feature is absent. This does not change retirement outcomes, retained positive booking coverage, state preservation, security requirements, or constitutional policy.
- No additional product decisions remain after the owner's six confirmed interview answers. Missing implementation details are planning choices bounded by these requirements and the constitution.
