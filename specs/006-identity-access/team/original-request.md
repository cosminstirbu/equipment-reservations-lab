Implement Identity and Access and integrate it into the existing Book and Cancel feature.

Act as the primary coordinator for our six-role Spec Kit team. Read AGENTS.md, docs/agent-team/protocol.md, and .codex/agents/coordinator.toml. Explicitly delegate to requirements_analyst, architect_planner, coder, verifier_reviewer, and security_reviewer. Do not spawn another coordinator.

## Inspect existing work

Review the current implementation, Book and Cancel specification, task status, tests, and outstanding findings.

Preserve completed work and uncommitted changes. Coordinate any active implementation before editing overlapping files.

Establish a validation baseline and distinguish pre-existing failures from new regressions.

Create a new Spec Kit feature for Identity and Access. Reference and update affected Book and Cancel requirements without losing task history or regenerating its artifacts wholesale. Use an explicit feature directory for every assignment.

The hello journey has already been retired. No further retirement work is required.

## Objectives

1. Introduce real login and API authorization.
2. Replace demo-user assumptions with authenticated ownership.
3. Authenticate service-to-service HTTP calls.
4. Review and appropriately restrict RabbitMQ service access.

Preserve the existing Angular frontend, ASP.NET Core services, PostgreSQL, RabbitMQ, and repository orchestration tooling.

## Identity integration

Use an OpenID Connect identity provider, preferably Keycloak unless an appropriate provider already exists.

Implement:
- Angular login/logout using Authorization Code with PKCE.
- A public SPA client without a client secret.
- Access-token validation in every protected backend API.
- Correct issuer, audience, signature, and expiry validation.
- Clear handling of expired sessions and unauthorized actions.
- A stable internal user key based on validated issuer and subject.
- Server-side authorization independent of UI visibility.
- Reservations-to-Inventory authentication using a narrowly scoped service identity.

Choose and document browser token handling appropriate to the existing architecture. Do not add persistent token storage without evaluating its risks.

Distinguish login-session state from access-token validity and document logout behavior.

Do not forward browser tokens through RabbitMQ or expose tokens in logs. Events may include the stable recipient identifier needed by Notifications.

Review RabbitMQ credentials and permissions for each service. Preserve existing appropriate restrictions and remediate overly broad access.

## Roles and permissions

Provision local test identities for:
- Two Employees.
- One Approver.
- One Equipment Staff member.

Define explicit permission mapping:
- Authenticated users can browse equipment.
- Employees can create bookings and view/cancel only their own reservations.
- Users can view only their own notifications.
- Approver and Equipment Staff roles do not automatically grant cross-user access.
- Service identities receive only the API permissions they need.

Provision Approver and Equipment Staff roles for later features, but do not implement their future workflows.

## Integrate with Book and Cancel

Replace demo identities throughout APIs, persistence, UI, events, and tests.

Derive ownership from validated identity. Reject attempts to supply or change ownership through client input.

Scope list queries and enforce ownership on individual-resource endpoints. Define consistent forbidden/not-found behavior that avoids unnecessary disclosure.

Preserve existing booking behavior:
- Existing, operational equipment only.
- Valid future intervals using [start, end).
- Atomic overlapping-booking prevention.
- Advisory availability checks.
- Cancellation before the start time only.
- Idempotent cancellation without duplicate events.
- Cancelled bookings release availability and remain in history.
- Reliable outbox delivery and idempotent notification consumption.

Ensure background processing preserves the correct recipient identity through to the notification inbox.

## Data migration and local provisioning

Inspect existing demo-owned reservations and notifications before changing ownership.

Do not assign existing records automatically to the first user who logs in. Define an explicit migration or local seed-data replacement strategy.

Preserve user-created data. Ask before destructive resets unless already authorized.

Make migrations and identity-provider provisioning repeatable. Treat provider subjects as opaque identifiers; email addresses are not stable ownership keys.

Keep sensitive credentials outside committed configuration. Document how local test credentials are provisioned and retrieved.

## Acceptance criteria

1. The documented startup procedure provisions the identity provider, clients, roles, and test identities.
2. Angular supports login/logout and handles session expiry clearly.
3. Unauthenticated protected API calls are rejected.
4. Invalid, expired, or incorrectly targeted tokens are rejected.
5. Employee A can create, list, and cancel their own eligible reservation.
6. Employee B cannot list, read, or cancel Employee A’s reservations.
7. Employee B cannot access Employee A’s notifications.
8. Ownership cannot be forged through bodies, query parameters, or headers.
9. Approver and Equipment Staff gain no undocumented cross-user access.
10. Reservations-to-Inventory calls use an authenticated, appropriately scoped service identity.
11. Missing or insufficient service permissions are rejected.
12. Reservation events reach the correct user’s inbox without containing access tokens.
13. Existing booking, concurrency, cancellation, persistence, and messaging guarantees still pass.
14. The authenticated Angular booking/cancellation journey passes.
15. Identity migration is explicit and preserves data unless a reset is authorized.
16. Sensitive credentials and tokens are absent from committed files and logs.

## Agent-team workflow

The requirements analyst defines identity, permission mapping, ownership, migration behavior, and amendments to Book and Cancel.

The architect plans provider integration, token validation, service authentication, data changes, and event identity contracts.

Before coding, the verifier checks requirements quality and artifact consistency. The security reviewer evaluates trust boundaries, browser token handling, authorization, cross-user access, service credentials, and migration risks.

Generate dependency-ordered tasks and implement in bounded batches.

Run independent quality and security reviews against the same frozen revision. Route findings to their owners and require reviewer verification of fixes. The coordinator persists review records and executes convergence.

Follow the protocol’s repair budgets and no-progress rules. Unavailable checks remain pending. Do not weaken requirements to reach done.

## Verification and deliverables

Add meaningful automated coverage for:
- Token validation and access rejection.
- Cross-user reservation and notification isolation.
- Ownership-forgery attempts.
- Service-to-service authentication and permission failures.
- Authenticated browser booking and cancellation.
- Existing concurrency and messaging guarantees.

Validate against the real local identity provider rather than relying exclusively on mocked authentication.

Deliver updated application code, provisioning, migrations, Spec Kit artifacts, team state, review reports, and README instructions covering startup, test identities, permissions, migration, and verification.

Finish with done or needs_intervention, checks actually run, remaining findings, and relevant limitations.

Make routine technical decisions autonomously. Ask for material missing product decisions or genuinely required authorization.

Do not merge, deploy, publish, send external messages, or create external issues.