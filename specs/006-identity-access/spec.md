# Feature Specification: Identity and Access

**Feature Branch**: `main` (feature directory: `specs/006-identity-access`; no branch created)

**Created**: 2026-10-16

**Status**: Complete — implemented, independently reviewed, and accepted 2026-10-16

**Input**: Implement Identity and Access and integrate it into Book and Cancel. The owner confirmed the bounded scope on 2026-10-16; this authorizes the feature-team work and does not accept the finished result.

## Clarifications

### Session 2026-10-16

These decisions were explicitly supplied during the pre-work interview; this specification/clarification pass asks no additional questions.

- Q: Which accounts and account-management workflows are required? → A: Administrator-provisioned local Keycloak accounts: two Employees, one Approver only and one Equipment Staff only. Registration, password recovery, MFA and production identity deployment are outside scope.
- Q: How do human roles combine? → A: Any authenticated human can browse equipment, check availability without booking details and view their own inbox. Employee is required to create bookings and list/read/cancel their own reservations. Roles combine only when explicitly assigned; Approver and Equipment Staff imply neither Employee nor cross-user access.
- Q: What happens to demo-owned state and compatibility? → A: The owner will delete local volumes; no migration, retention, reassignment, legacy application contract or queued-event compatibility is required. Agents must not delete volumes. Subsequent normal startup/restarts preserve data. Remove demo assumptions and update meaningful behavior tests, without tests solely asserting removal of demo code.
- Q: What does logout guarantee? → A: End application and Keycloak login sessions and clear browser authentication; already-issued short-lived access tokens may remain valid until expiry. Document the distinction.
- Q: What happens after expiry, account change or an interrupted write? → A: Clear the previous user's displayed data, require an explicit action after login for any booking/cancellation, never replay writes automatically, and recover uncertain results by refreshing the authenticated user's history. Routine technical choices belong to planning and independent review.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Sign in and end a session (Priority: P1)

As a provisioned user, I can sign in, recognize my current account and available actions, and sign out without leaving another account's information on the screen.

**Why this priority**: Every protected journey needs a trustworthy identity and understandable session state.

**Independent Test**: Follow documented local startup, sign in with each of the four provisioned identities using the real local identity provider, sign out, expire a session and change accounts.

**Acceptance Scenarios**:

1. **Given** a fresh owner-reset local environment, **When** documented startup completes, **Then** the provider, application clients, roles and four test identities are provisioned repeatably, with credentials retrievable by the documented secure procedure.
2. **Given** a signed-out visitor, **When** they enter the application, **Then** sign-in is available and protected equipment, reservation and inbox data is unavailable until authentication succeeds.
3. **Given** a successful sign-in, **When** the application returns from the provider, **Then** the current account and permitted actions are clear; cancelled/failed sign-in presents a recoverable state without exposing protected data.
4. **Given** a signed-in session, **When** the user signs out, **Then** application authentication and provider login sessions end, private displayed data is cleared and protected application actions require sign-in again; documentation explains that an independently held issued access token may work until its short expiry.
5. **Given** an expired session or a switch from Employee A to Employee B, **When** a response or action completes, **Then** A's cached/displayed reservations and notifications cannot reappear, and B sees only B's authorized data.
6. **Given** an expired session during a write or an interrupted response, **When** the user signs in again, **Then** no booking/cancellation is replayed automatically and the user can inspect their history before choosing a new explicit action.

### User Story 2 - Book and cancel as the authenticated owner (Priority: P1)

As an Employee, I can book equipment and manage my own reservations while other users' reservations remain private and continue to prevent conflicting bookings.

**Why this priority**: Authentication must protect ownership without weakening allocation correctness.

**Independent Test**: Employee A books and cancels through the browser; Employee B attempts to list, read and cancel A's reservation through public interfaces, including forged ownership inputs and concurrent overlap attempts.

**Acceptance Scenarios**:

1. **Given** any authenticated human role, **When** equipment and interval availability are requested, **Then** equipment can be browsed and availability reports only whether the interval is available, without owners, reservation identifiers or booking details.
2. **Given** an Employee and valid operational equipment with an available valid future interval, **When** the Employee books it, **Then** one Confirmed reservation and its event belong to the validated current identity, and the owner's history exposes the durable record.
3. **Given** A's reservation, **When** B lists reservations, requests its individual record or cancels it, **Then** it is absent from B's list and individual operations return the same not-found outcome as an unknown identifier with no state/event change.
4. **Given** any caller-supplied ownership value in a body, query or identity-like header, **When** creation or mutation is requested, **Then** the request cannot create, read or mutate state under another identity; explicit ownership inputs are rejected and create no reservation/event.
5. **Given** an Approver-only or Equipment Staff-only identity, **When** booking, reservation history, individual read or cancellation is requested directly, **Then** access is forbidden, including for records nominally associated with that identity; equipment, advisory availability and own inbox remain allowed.
6. **Given** concurrent Employees requesting overlapping intervals, **When** requests compete, **Then** exactly one allocation succeeds; valid adjacency and independent equipment allocations remain allowed.
7. **Given** an owner's eligible Confirmed reservation, **When** cancelled before start, **Then** it remains in owner history as Cancelled, releases availability and creates exactly one event. Repetition, including concurrent repetition or after original start, returns the existing Cancelled result without another event; a still-Confirmed reservation at/after start is rejected.

### User Story 3 - Receive only my own durable notifications (Priority: P1)

As an authenticated user, I see only my own inbox, including booking/cancellation results delivered after an outage or after I sign out.

**Why this priority**: Identity must survive asynchronous delivery independently of browser session lifetime.

**Independent Test**: A books/cancels during a controlled messaging outage, signs out, delivery recovers, and A and B inspect their separate inboxes after restarts.

**Acceptance Scenarios**:

1. **Given** A's committed transition, **When** its event reaches Notifications, **Then** exactly one durable entry belongs to A and B cannot obtain it by listing or supplying A's identity.
2. **Given** an outage, repeated event delivery, changed display name/email or a later browser session, **When** delivery completes and the owner signs in, **Then** the recipient remains the same stable identity, exactly one entry exists per transition and other identities receive none.
3. **Given** broker traffic and captured application diagnostics, **When** a booking/cancellation and delivery are inspected, **Then** no access token, login credential or browser-session secret is present; only the stable recipient key needed for delivery is carried.

### User Story 4 - Keep internal access limited (Priority: P1)

As the local operator, I can run authenticated service communication and constrained messaging accounts without granting a service human-user privileges or infrastructure administration.

**Why this priority**: Public API authorization alone leaves internal trust boundaries unprotected.

**Independent Test**: Use the actual local provider for a Reservations-to-Inventory call; attempt missing/insufficient/wrong-target service authorization and exercise both allowed and denied broker operations for each service.

**Acceptance Scenarios**:

1. **Given** normal booking, **When** Reservations validates equipment with Inventory, **Then** it uses its own authenticated service identity with only the required equipment-read permission, independently of the browser's token.
2. **Given** absent, expired, invalid, incorrectly targeted or insufficient service authority, **When** Inventory is called, **Then** access is rejected and a booking dependent on that call creates no reservation/event; the user sees a safe dependency error rather than false success.
3. **Given** application messaging accounts, **When** each performs its required operations and attempts unrelated publication, consumption or administration, **Then** required operations succeed and unrelated operations are denied. Appropriate existing restrictions remain and overly broad access is remediated.
4. **Given** repeated startup and ordinary restarts after the owner's one-time reset, **When** provisioning runs, **Then** identity/role provisioning creates no duplicate users or unintended privilege changes, existing authenticated ownership remains usable and application persistence/messaging guarantees hold.

### Edge Cases

- A missing, malformed, expired, incorrectly signed, wrong-issuer or wrong-audience access token is rejected before protected data or side effects are available. A login identity token is not sufficient API authority.
- Role denial is forbidden; for an authenticated Employee's individual reservation access, another owner's and an unknown identifier both produce not found. Lists contain only owned records.
- A service identity cannot act as an Employee or read a human inbox merely by supplying a recipient or owner identifier.
- Equal subjects from different issuers are distinct identities; subjects are opaque. Email/display-name changes do not transfer ownership. Reprovisioning a deleted account with a new subject does not inherit old records.
- Logout ends session state but is not a promise of immediate revocation of every issued token. Identity-provider downtime or unusable authorization must fail closed without silently using demo identity or anonymous access.
- Late responses from a previous session, including an in-flight inbox load, must not populate the new session's display. Safe equipment/date input may be retained but writes require a fresh explicit action.
- Authorization failures create no transition, outbox entry or inbox disclosure. Existing validation, bounded retries, atomic allocation, poison-message handling and permanent-fault recovery still apply.
- Availability reflects all blocking reservations while disclosing no booking metadata; it remains advisory and cannot authorize a later allocation.
- The owner resets local volumes manually before the new schema/contracts are used. No reset action is part of automated startup, tests against user state, or agent work.
- Loading, empty, sign-in failure, forbidden, expiry and dependency-error states remain distinguishable and accessible by keyboard, meaningful labels, focus and status announcements.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Local startup MUST repeatably provision the identity provider, application clients, explicit roles and exactly the four requested test identities, without credentials in committed configuration. Documentation MUST explain startup and secure credential provisioning/retrieval.
- **FR-002**: The frontend MUST support sign-in/sign-out, show the current account and permitted actions, and clearly handle cancelled login, login failure, session expiry and forbidden actions without exposing protected data.
- **FR-003**: Every protected backend operation MUST independently validate access-token issuer, audience, signature and expiry, reject missing/invalid authority, and enforce permissions server-side regardless of UI visibility. Human and service identities MUST receive only their explicitly granted permissions.
- **FR-004**: Human ownership MUST be derived only from validated issuer and opaque subject, mapped to a stable internal user key. Caller-supplied ownership in bodies, query parameters or identity-like headers MUST be rejected without effects and MUST never override validated identity. Email and display name MUST NOT be ownership keys.
- **FR-005**: Any authenticated human MUST be permitted to browse equipment, check advisory interval availability and view only their own notifications. Availability MUST disclose only interval availability, not reservation identifiers, owners or other users' booking details.
- **FR-006**: Only explicitly assigned Employees MUST create bookings or list/read/cancel reservations, and only their own. Approver and Equipment Staff roles MUST NOT imply Employee or cross-user access; explicit multiple-role grants are additive. Future approval and staff workflows are excluded.
- **FR-007**: Reservation and inbox lists MUST be scoped to the validated owner. An authenticated Employee accessing another owner's individual reservation MUST receive the same not-found outcome as an unknown identifier. Authenticated callers missing a required role MUST receive forbidden; unauthenticated/invalid-token requests MUST be rejected as unauthorized.
- **FR-008**: Authenticated booking/cancellation MUST preserve Book and Cancel's equipment validation, future interval rules, `[start, end)` boundaries, atomic conflict prevention, advisory availability, before-start cancellation, idempotent repeated cancellation, released availability and durable history. These guarantees apply across different users as well as within one account.
- **FR-009**: Every transition/outbox event and inbox entry MUST retain the stable correct recipient key. Reliable outbox recovery and idempotent consumption MUST remain valid after logout, delayed/repeated delivery and restarts, independently of access-token lifetime. Broker messages MUST NOT contain browser tokens or credentials.
- **FR-010**: Reservations-to-Inventory HTTP calls MUST authenticate using a dedicated narrowly scoped service identity, with only the required equipment-read permission. Missing/invalid/insufficient authority MUST be rejected and MUST cause no dependent booking/event. Browser-token forwarding MUST NOT substitute for this service identity.
- **FR-011**: Each RabbitMQ application service account MUST have only the resource/operation permissions required by its workload, with required operations demonstrated and unrelated operations denied. Appropriate restrictions MUST be preserved; overly broad permissions MUST be corrected without granting application services administrative access.
- **FR-012**: Logout MUST clear browser authentication/private displayed state and end the identity-provider login session. Already-issued short-lived access tokens MAY remain valid until expiry; documentation MUST distinguish this from login-session state and state the selected expiry bound. Browser token handling MUST be documented and independently security-reviewed; persistent token storage MUST NOT be introduced without evaluating its risks.
- **FR-013**: Session expiry/account change MUST clear the previous user's private state and prevent stale responses from restoring it. No booking/cancellation MUST be automatically replayed after authentication. Uncertain committed outcomes MUST be recoverable by the authenticated owner's history before an explicit further action.
- **FR-014**: The owner's manual one-time local-volume deletion is the replacement strategy. No migration, automatic reassignment, data retention across that reset, old application contracts or queued-event compatibility is required. Agents MUST NOT delete volumes. Normal later startup/restarts MUST preserve identities, equipment, reservations, pending events and inbox entries.
- **FR-015**: Credentials, tokens and session secrets MUST be absent from committed artifacts, application logs and telemetry. Authorization/dependency outcomes MUST remain observable with correlated safe traces/logs/metrics under the constitution; user identifiers MUST NOT become metric dimensions. Existing local-only infrastructure, own-database permissions and administration-console boundaries MUST remain effective.
- **FR-016**: Meaningful behavior tests MUST cover invalid authority, role/owner isolation, ownership forgery, service permission failure, recipient continuity, authenticated browser booking/cancellation and retained concurrency/messaging/persistence guarantees. Verification MUST include the real local provider, not exclusively authentication doubles. Tests solely asserting removal of demo implementation MUST NOT be added.
- **FR-017**: The identity journey and existing booking interface MUST preserve keyboard navigation, meaningful labels, status announcements, usable focus and non-color status cues across success, expiry, authorization and dependency failure states.
- **FR-018**: Preserve the existing frontend, backend services, persistence, broker and orchestration tooling. Update affected Book and Cancel requirements by targeted amendment, preserve task/review history, and document startup, identities, permissions, reset strategy, logout limitations and verification. Do not add retired hello work, registration, password recovery, MFA, future approval/staff workflows or production deployment.
- **FR-019**: Required checks, independent requirements/quality/security reviews and convergence MUST have current-revision evidence, with no unresolved blocking findings; explicit final human acceptance MUST be recorded separately from scope authorization before completion is reported.

### Key Entities

- **Human identity**: Validated issuer and opaque subject with a stable internal key; has explicit role assignments. User-facing names are descriptive only.
- **Role/permission grant**: Explicit authority for equipment browsing, availability, own inbox, or Employee-owned reservation actions. Roles do not imply one another.
- **Login session / access token**: Distinct lifetimes: ending a session clears application state and provider login while issued short-lived authority may last until expiry.
- **Service identity**: A non-human principal permitted only the internal operations required by its workload; no human reservation/inbox privileges.
- **Owned reservation / transition / inbox entry**: Existing durable records and messages associated with the stable human key; event identity still prevents duplicate inbox effects.
- **Local provisioned state**: Provider identities/grants and application state created after the owner reset, retained across ordinary restarts.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: One documented local startup enables all four requested identities to sign in with their distinct grants; repeating startup creates zero duplicate accounts or unrequested role grants.
- **SC-002**: Each identity can sign in/out; every tested expired-session, cancelled-login and account-switch journey produces clear state, zero previous-account data disclosures and zero automatically replayed writes.
- **SC-003**: Every missing, malformed, expired, invalid-signature, wrong-issuer and wrong-target authority case is denied with zero protected-data disclosure or unauthorized state/event change.
- **SC-004**: Employee A completes browse → availability → book → own history → cancel → own inbox through the authenticated screen; the record and inbox results survive ordinary restart.
- **SC-005**: Employee B obtains zero A-owned reservations or inbox entries through lists, individual access or forged ownership inputs, and changes zero A-owned records/events.
- **SC-006**: Both non-Employee test identities can browse/check availability and view their own inbox, while all reservation operations are denied and zero cross-user access is granted. Explicit combined-role scenarios grant only the union of their documented permissions.
- **SC-007**: All existing allocation, concurrency, cancellation, durable-history and messaging recovery/duplicate-delivery scenarios pass under authenticated ownership; each transition reaches exactly its owner's inbox once.
- **SC-008**: Required internal equipment validation succeeds with the dedicated service authority; every missing, invalid and insufficient service-authority scenario is denied without creating a dependent booking/event. Each messaging account passes required operations and fails unrelated operations.
- **SC-009**: Ordinary repeated startup/restarts after the owner's reset cause zero loss of newly created ownership, reservations, pending events or inbox entries; no agent or startup procedure deletes volumes or reassigns old state.
- **SC-010**: Independent inspection of committed artifacts, captured messages and diagnostic evidence finds zero sensitive credentials, tokens or session secrets; documentation explains credential retrieval and the selected bound on post-logout token validity.
- **SC-011**: Current-revision automated and manual accessibility evidence covers the authenticated journey and its failure states, all required checks/reviews pass, convergence reports no gaps and final owner acceptance is separately recorded.

## Assumptions

- This remains an early, local learning application with nothing deployed to pre-production. The owner performs the one-time volume reset; no migration or backward compatibility is requested.
- The owner selected local Keycloak and the existing Angular/ASP.NET Core/PostgreSQL/RabbitMQ/Aspire stack. Sign-in uses OpenID Connect Authorization Code with PKCE and a public browser client with no client secret. These are explicit project constraints; detailed provider/client settings, browser token handling and internal identity representation belong in planning and independent security review.
- Existing Book and Cancel behavior and accessibility requirements remain applicable except for the explicitly superseded demo identity/authentication assumptions. Existing administration consoles remain restricted to the developer's workstation.
- Subjects are opaque and unique within their issuer. Local account provisioning must preserve established subjects across normal startup; deleting/recreating provider state is an intentional developer reset rather than identity migration.
- Provider discovery/key retrieval, token acquisition, cache behavior, timeout/retry policy, exact expiry duration, event contract changes and broker resource permission expressions are routine design choices. They must meet the constitution, fail closed and obtain independent review; no new product decision is delegated to the implementer.
- No new production uptime/scale, localization, self-service identity lifecycle or immediate universal token-revocation guarantee is introduced. Existing booking responsiveness and bounded recovery requirements remain.
- Completion requires explicit human acceptance of the result; the confirmed interview is scope authorization only.
