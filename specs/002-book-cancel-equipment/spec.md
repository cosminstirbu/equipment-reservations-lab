# Feature Specification: Feature 1 — Book and Cancel Equipment

**Feature Directory**: `specs/002-book-cancel-equipment`

**Created**: 2026-10-14

**Status**: Complete — implemented, independently reviewed, and accepted 2026-10-15

**Amendment 2026-10-16**: Identity and Access (`../006-identity-access/spec.md`) supersedes the original demo-user/security assumptions below for current behavior. The status above records acceptance of the original feature, not implementation or acceptance of this amendment. Identity integration is pending under feature 006. Existing task IDs, completed history and historical review hashes/reports remain unchanged; they do not approve the amended requirements.

**Input**: Extend the completed walking skeleton to browse equipment, check a time interval, create confirmed reservations, view history, cancel future reservations, and receive persistent asynchronous confirmation and cancellation notifications. Originally accepted for one local demo user; authenticated ownership and roles are added by feature 006.

## Clarifications

### Session 2026-10-14

- Q: Should cancellation of an already-Cancelled reservation still succeed after its original start time? → A: Yes. Return the existing Cancelled result without another event; the before-start restriction applies only to the Confirmed-to-Cancelled transition. Answer supplied by the human owner through the coordinator.

### Session 2026-10-16

- Q: How is the original demo identity replaced? → A: Use validated issuer/subject ownership under feature 006; authenticated humans browse/check availability and view their own inbox, Employees create/list/read/cancel only their own reservations, and Approver/Equipment Staff imply no Employee or cross-user privileges. The owner manually deletes local volumes; no legacy-data migration or compatibility is required, agents must not delete volumes, and subsequent restarts preserve data. No tests solely asserting demo-code removal are requested.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Browse and book equipment (Priority: P1)

As an authenticated Employee, I can select a physical equipment item and a start and end time, check availability, and obtain my own confirmed reservation without double booking the item.

**Why this priority**: Booking is the core value and the authoritative allocation must remain correct under competing requests.

**Independent Test**: Start a fresh local environment, select seeded equipment, check a future interval, create a reservation and read its confirmed status after restarting Reservations.

**Acceptance Scenarios**:

1. **Given** a fresh checkout with documented prerequisites and the owner's one-time volume reset, **When** startup completes and the user signs in, **Then** persisted deterministic equipment is visible, including Demo Camera and its operational status, and the screen identifies the authenticated account.
2. **Given** an operational item and a valid future interval, **When** the user checks availability, **Then** the screen reports whether the interval is available and explains that this result does not reserve it.
3. **Given** an available operational item and a valid interval, **When** an Employee books it, **Then** one persistent reservation immediately has status Confirmed, a stable identifier, the selected item and times, and validated owner identity; the screen shows confirmation independently of notification delivery.
4. **Given** invalid, equal, reversed or past creation times, unknown equipment or a non-operational item, **When** creation is attempted, **Then** an understandable validation or unavailable-item error is returned and no reservation or confirmation event is created.
5. **Given** a confirmed reservation, **When** an overlapping interval for the same item is requested, **Then** creation is rejected with an understandable conflict and the existing reservation is unchanged.
6. **Given** an existing reservation, **When** the requested interval starts exactly at its end, ends exactly at its start, or targets another item, **Then** the otherwise valid booking succeeds.
7. **Given** two simultaneous overlapping requests for the same available item, **When** both are processed, **Then** exactly one succeeds and exactly one is rejected for conflict.
8. **Given** a previously available result that becomes stale due to another booking, **When** creation is attempted, **Then** the overlap is rejected despite the earlier result.
9. **Given** Inventory is unavailable or returns an unusable response, **When** booking is attempted, **Then** an understandable dependency error is returned and no reservation or confirmation event is created.

### User Story 2 - View and cancel reservations (Priority: P1)

As an authenticated Employee, I can inspect my own confirmed and cancelled reservations and cancel my own confirmed reservation before it starts, releasing the equipment while preserving history.

**Why this priority**: Releasing equipment and showing durable history completes the requested allocation lifecycle.

**Independent Test**: Begin with a future confirmed reservation, cancel it, repeat cancellation, restart Reservations, read the cancelled record and book its released interval.

**Acceptance Scenarios**:

1. **Given** stored reservations, **When** an Employee loads or refreshes the list, **Then** it displays only that owner's reservations with stable identifier, equipment, start/end times with timezone information, and Confirmed or Cancelled status; an empty collection has a clear empty state.
2. **Given** a confirmed reservation whose start is still in the future, **When** cancellation succeeds, **Then** status becomes Cancelled persistently, the interval is released and one cancellation event is recorded.
3. **Given** a cancelled reservation, **When** cancellation is repeated, including concurrently or after its original start, **Then** it succeeds with the same cancelled record and creates no additional transition, event or notification.
4. **Given** a confirmed reservation at or after its start, **When** cancellation is attempted, **Then** it is rejected clearly, remains Confirmed and creates no cancellation event.
5. **Given** an unknown reservation identifier, **When** cancellation is attempted, **Then** it is rejected as not found without changing any record or recording an event.
6. **Given** a successfully cancelled reservation, **When** another otherwise valid reservation targets its released interval, **Then** creation succeeds and the cancelled history remains visible.

### User Story 3 - Receive durable notifications (Priority: P2)

As an authenticated user, I can see only my own inbox entries for successful booking and cancellation even when notification delivery is delayed by an outage.

**Why this priority**: The inbox communicates durable results without making booking depend on immediate delivery.

**Independent Test**: Create and cancel a reservation during a messaging or consumer outage, restore the affected dependency, refresh the inbox, and verify exactly one entry for each transition survives a Notifications restart.

**Acceptance Scenarios**:

1. **Given** a successful booking or cancellation, **When** its event is delivered, **Then** one persistent inbox entry describes that transition and identifies the reservation and equipment.
2. **Given** the messaging dependency is unavailable, **When** a valid booking or cancellation commits, **Then** that operation still succeeds, its event remains pending, and the screen distinguishes saved reservation state from a notification not yet observed.
3. **Given** committed events during a broker or consumer outage, **When** that dependency recovers, **Then** all events are eventually delivered without recreating the reservation transitions.
4. **Given** repeated delivery of the same event, **When** Notifications processes it, **Then** exactly one inbox entry exists for that event, including after service restarts.
5. **Given** a delayed or unavailable inbox, **When** the user refreshes, **Then** a loading, pending or dependency-error state appears as appropriate; the user can refresh later without repeating the booking or cancellation.

### Edge Cases

- Intervals are half-open: `[start, end)`. Identical intervals, containment and partial overlap conflict for the same item; adjacency and different items do not.
- Creation start equal to the authoritative current time is allowed; start strictly before it is rejected. Cancellation of a Confirmed record requires current time strictly before start.
- Inputs without an unambiguous timezone/offset, malformed timestamps, missing fields and malformed identifiers are rejected clearly without a state change.
- Availability can become stale between checking and booking. A booking never relies on the earlier result for correctness.
- A cancellation competing with booking must produce a consistent allocation: booking can succeed only if the committed cancellation has released the interval, otherwise it conflicts.
- Concurrent cancellations create at most one transition and one cancellation event. Already-cancelled repetitions create no effects.
- A successful operation with an interrupted response remains committed. Refreshing history is the recovery path; automatic retries must not duplicate side effects.
- A notification may appear after the user has left the screen or after a later transition. Each entry identifies its original transition; delivery order does not change reservation status.
- Invalid or unusable incoming events create no inbox entry, expose no secrets and must not prevent valid queued events from progressing.
- An empty equipment list or inbox is distinct from a failed load. A failed reservation load is distinct from having no reservations.
- Pending actions prevent accidental repeated clicks and expose progress; server correctness is independent of this client behavior.
- Ordinary service restarts preserve equipment, reservation history, pending events and inbox entries. An explicit documented developer reset may erase local data; normal startup must not reset it.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The application MUST use authenticated ownership and server-side authorization as specified in feature 006. Authenticated humans can browse/check availability and view only their own inbox; only explicitly assigned Employees can create/list/read/cancel their own reservations. Approver and Equipment Staff grant no implicit Employee or cross-user authority. The application remains local development scope.
- **FR-002**: Users MUST browse persisted equipment records with stable identifiers, display names and operational status. Existing seeded equipment MUST be preserved; seeds MUST be deterministic and repeatable without erasing existing data.
- **FR-003**: Users MUST select exactly one physical equipment item and an unambiguous start/end interval, with timezone information clearly displayed. Time values MUST represent consistent UTC instants when persisted and exchanged.
- **FR-004**: Creation MUST reject a missing, unknown or non-operational item, invalid timestamps, start greater than or equal to end, and start strictly before authoritative current time. Rejection MUST create no reservation or confirmation event.
- **FR-005**: Users MUST check availability for a selected interval. Confirmed reservations for the same item block overlapping intervals; cancelled reservations do not. Availability MUST be explicitly advisory and MUST NOT create a reservation.
- **FR-006**: Successful creation MUST immediately produce one persistent Confirmed reservation. Overlap prevention MUST be atomic at the persistence boundary so simultaneous overlapping requests cannot both succeed; an application-level check followed by an unprotected save is insufficient.
- **FR-007**: Interval allocation MUST use `[start, end)` and MUST allow adjacency and independent allocations of different items. A stale availability result MUST NOT bypass allocation enforcement.
- **FR-008**: Employees MUST list only their own persistent reservation history with identifier, equipment, interval/timezone and Confirmed or Cancelled status, including cancelled records after restarts. Other-owner individual read/cancellation MUST return the same not-found outcome as an unknown identifier; ownership supplied by clients MUST NOT override validated identity.
- **FR-009**: Cancellation MUST change a Confirmed reservation to Cancelled only strictly before its start, persist the transition, release the interval, and preserve the record. At or after start it MUST fail without effects; unknown reservations MUST return a clear not-found result.
- **FR-010**: Repeated cancellation of an already-Cancelled record MUST succeed with no additional transition or event, including concurrent repetitions and repetitions after original start.
- **FR-011**: Each confirmed or cancelled transition MUST save its corresponding uniquely identified event atomically with reservation state. A transaction that does not commit MUST leave neither a transition nor an event; committed transitions MUST retain their pending event during delivery failures.
- **FR-012**: Pending transition events MUST be published asynchronously and retried after recovery. A messaging outage MUST NOT invalidate a committed booking or cancellation; delivery MUST preserve stable event identity across retries.
- **FR-013**: Notifications MUST persist one inbox entry per distinct valid transition event and expose it only to its authenticated recipient. Stable validated ownership MUST survive outbox publication and consumption independently of browser tokens/session lifetime; events MUST NOT contain access tokens. Duplicate delivery MUST NOT create duplicate entries, including across consumer restarts. Notifications MUST describe confirmation or cancellation and identify the reservation and equipment.
- **FR-014**: Equipment validation for new bookings MUST contact Inventory using the narrowly scoped Reservations service identity defined by feature 006. Missing/insufficient service authority, Inventory failure or unusable responses MUST produce an understandable dependency error with no booking or event. Cancellation of an owned stored reservation MUST NOT depend on Inventory or broker availability.
- **FR-015**: The screen MUST support equipment selection, date/time entry, availability checking, creation, reservation history, cancellation and inbox viewing, including loading, empty, validation, conflict, dependency-error and asynchronous notification states. Saved reservation state MUST remain distinguishable from notification delivery; pending actions MUST prevent accidental repeated clicks.
- **FR-016**: The full journey MUST support keyboard navigation and meaningful input/action labels, announce status changes to assistive technology, preserve usable focus after actions and communicate status without relying on color alone.
- **FR-017**: The documented local startup MUST provision required persistence, apply migrations and seed equipment using existing project tooling. Each service MUST access only its own data store. Normal restarts MUST retain stored state; explicit reset instructions MUST explain data deletion.
- **FR-018**: Existing walking-skeleton behavior and checks MUST remain functional, or any intentional changes MUST have documented reasons and equivalent validation. Existing frontend, backend conventions, orchestration and working service communication MUST be preserved.
- **FR-019**: Local services and infrastructure MUST prevent unintended public exposure and commit no sensitive credentials. Inputs and event handling MUST reject malformed/oversized data with bounded work and safe errors. Telemetry MUST omit secrets, request bodies and personal data under the constitution.
- **FR-020**: Booking, conflict, cancellation, outbox publication and inbox consumption MUST provide correlated traces, structured logs and metrics for outcomes, latency, errors and dependency health. Identifiers MUST NOT become metric dimensions. Remote calls and retries MUST follow the constitution's timeout and repeat-safety requirements.
- **FR-021**: Approval, rescheduling, collection/returns, preparation buffers, maintenance workflows, waiting lists, real-time browser updates and production deployment MUST remain out of scope. Real authentication and authorization are introduced only through feature 006's bounded scope.

### Key Entities *(include if feature involves data)*

- **Authenticated owner**: Stable internal user key derived from validated issuer and opaque subject under feature 006; email/display name does not determine ownership.
- **Equipment**: One physical item with a stable identifier, display name and operational status; owned by Inventory.
- **Reservation**: Stable identifier, authenticated owner, equipment identifier, start/end UTC instants, Confirmed or Cancelled status and transition timestamps; owned by Reservations. Cancelled records remain owner history.
- **Reservation transition event**: Stable event identifier, confirmation/cancellation type, reservation and equipment identifiers, stable recipient key, interval and occurrence instant. It remains pending durably until publication succeeds; no browser token is included.
- **Inbox entry**: Persistent identifier, originating event identifier, associated authenticated recipient/reservation/equipment, transition message and occurrence time; owned by Notifications and disclosed only to that recipient. Event identity prevents duplicates.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001 / AC1**: A fresh local startup provisions durable stores and deterministic equipment through one documented procedure; repeating startup creates zero duplicate seed records.
- **SC-002 / AC2**: Every accepted valid booking immediately returns Confirmed and can be read with unchanged identifier, interval and status after a service restart.
- **SC-003 / AC3**: All invalid-date, unknown-item and non-operational-item creation scenarios create zero reservations and zero confirmation events.
- **SC-004 / AC4**: Every tested overlapping confirmed interval for the same item is rejected without modifying the existing allocation.
- **SC-005 / AC5**: Both adjacent-interval boundaries and different-item bookings succeed when otherwise valid.
- **SC-006 / AC6**: Each concurrent two-request overlap trial produces exactly one successful booking and one conflict, with one confirmed record.
- **SC-007 / AC7**: Booking against a stale available result is rejected whenever another confirmed reservation now overlaps.
- **SC-008 / AC8**: A future cancellation remains Cancelled after restart, retains its history and permits a new valid booking of the released interval.
- **SC-009 / AC9**: Repeated and concurrent cancellation produces exactly one cancellation transition, one event and one cancellation inbox entry.
- **SC-010 / AC10**: Every cancellation of a Confirmed reservation at or after start is rejected with zero state/event changes.
- **SC-011 / AC11**: Ordinary restarts preserve all seeded equipment, reservation records and inbox entries; no pending committed event is lost.
- **SC-012 / AC12**: Following broker or consumer recovery in automated bounded recovery checks, all committed transition events yield exactly one inbox entry each, including repeated deliveries.
- **SC-013 / AC13**: Inventory-unavailable booking trials return a dependency error and create zero reservations or confirmation events.
- **SC-014 / AC14**: The user completes browse → check → book → view → cancel → view inbox through the screen; automated journey and accessibility checks and required manual keyboard/focus/status review cover its success and failure states.
- **SC-015 / AC15**: All existing walking-skeleton checks pass or have explicitly documented intentional updates and corresponding passing replacement checks.
- **SC-016 / AC16**: Independent configuration/security review finds zero committed sensitive credentials and no unintended public exposure; local authenticated scope and permissions are clearly documented and validated under feature 006.
- **SC-017**: A successful booking and cancellation, one booking conflict and controlled dependency failures each produce correlated diagnostic evidence and measurable outcome/error signals, with zero secrets, request bodies or personal data in captured telemetry and zero identifier-valued metric dimensions.
- **SC-018**: Independent scope review confirms no approval, rescheduling, collection/return, buffer, maintenance, waiting-list, live browser update or production-deployment workflow has been added; authentication/authorization changes remain bounded to feature 006.

## Assumptions

- The original accepted scope was a trusted local learning application with one demo user and no authentication. Feature 006 supersedes that assumption with real authentication and owner isolation; there is still no production uptime or scale promise. The owner manually resets local volumes once rather than migrating demo data; ordinary later startup/restarts preserve authenticated state.
- The existing `camera-001` / `Demo Camera` seed remains. Additional deterministic items/statuses needed to demonstrate independent-item and non-operational behavior are routine seed choices during planning.
- The browser's local timezone with a visible timezone/offset is the display default; ambiguous input is rejected rather than silently assigned a different instant. The server clock is authoritative for date rules.
- The owner clarified that already-Cancelled repetition succeeds after original start without another event; the time restriction applies to the Confirmed-to-Cancelled transition.
- Inbox refresh is explicit; no live push or automatic browser refresh is promised. A saved transition whose matching inbox entry has not been observed is pending delivery from the user's perspective, rather than a failed booking.
- Local learning data has no automatic expiry in this feature. Only an explicit documented developer reset removes it. No read/unread, deletion or pagination workflow is added.
- The request's existing tooling, service responsibilities and named infrastructure constraints pass to the implementation plan unchanged. They constrain implementation, not additional user journeys.
- Dependency retry timing, contract formats, database concurrency mechanism, migration tooling and deterministic bounded recovery deadlines are routine planning decisions. They cannot weaken atomic allocation, repeat safety or eventual recovery requirements.
- Human final feature acceptance remains required by constitution 1.1.0 and is not inferred from this request or automated checks. The walking skeleton's open manual accessibility finding remains an independent review concern until explicitly closed.


## Prospective testing-policy supersession — feature 007

On 2026-10-16, the owner approved [feature 007’s testing policy](../007-aspire-independent-tests/supersession.md), which supersedes this document’s automated Aspire/AppHost and manifest-publication obligations and retired Smoke.Tests paths. Retained application/provider guarantees have [replacement coverage](../007-aspire-independent-tests/team/coverage-disposition.md); local orchestration is verified manually. Deployment manifest support is outside scope. Original requirements, task markers, acceptance status, review hashes, and evidence above remain historical records; they do not approve feature 007.
