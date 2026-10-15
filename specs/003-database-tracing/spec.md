# Feature Specification: Database Operation Tracing

**Feature Branch**: `main` (feature directory: `003-database-tracing`; no branch created)

**Created**: 2026-10-15

**Status**: Complete — implemented, independently reviewed, and accepted 2026-10-15

**Input**: User description: "Implement missing database tracing through the feature team; ask questions and provide recommendations about capturing actual raw SQL statements."

## Clarifications

### Session 2026-10-15

- Q: Should database traces contain safe parameterized SQL text or operation metadata only? → A: Owner chose safe parameterized SQL text without parameter values.
- Q: Should SQL text capture be enabled by default or require explicit opt-in in the supported local application? → A: Owner chose enabled by default for the supported local development application.
- Q: Should coverage include all existing database paths or only runtime APIs and workers? → A: Owner chose all current database paths, including startup and background operations; provisioning SQL text is excluded.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Locate database work within a workflow (Priority: P1)

As the developer operating the local application, I can inspect a request or background workflow and see the database operations it performed, so I can identify where time was spent and which operation failed.

**Why this priority**: Existing workflow traces omit database work, preventing diagnosis of a major external dependency.

**Independent Test**: Exercise equipment listing, reservation creation/cancellation, and notification delivery with real databases, then inspect the exported traces and local trace viewer.

**Acceptance Scenarios**:

1. **Given** a running local application and successful equipment or reservation work, **When** I inspect its trace, **Then** each executed database command has a visible dependency span with database identity, operation identity, duration, outcome, and the correct relationship to the initiating workflow.
2. **Given** a reservation event delivered asynchronously, **When** I inspect outbox publication and notification consumption, **Then** the database operations belong to the workflows performing them, and existing cross-service trace relationships are preserved without attaching unrelated polling work to a reservation.
3. **Given** a controlled database command failure, **When** the application handles it, **Then** the exported trace identifies the failed database operation and a safe failure category while preserving the existing application outcome.

---

### User Story 2 - Inspect useful diagnostics without exposing data (Priority: P1)

As the developer inspecting database work, I can understand the operation at the owner-approved detail level without exposing secrets or application payload values.

**Why this priority**: Automatic database instrumentation can expose SQL text and exception data; provisioning commands currently contain password literals.

**Independent Test**: Run successful and failing real-database commands containing distinctive sensitive test values and inspect all exported telemetry fields against the chosen SQL policy.

**Acceptance Scenarios**:

1. **Given** a reviewed safe application command, **When** its database span is exported, **Then** SQL text is available by default as a diagnostic attribute, retains placeholders and reviewed fixed literals without substituting bound values, and can be disabled while preserving operation metadata.
2. **Given** command parameters, returned rows, credentials, connection strings, or error details containing distinctive sensitive values, **When** telemetry is exported, **Then** those values do not appear in span names, attributes, events, resource attributes, logs, or metric dimensions.
3. **Given** any provisioning command, including one containing a password literal, **When** it executes, **Then** telemetry contains no provisioning SQL text and exposes only safe operation information; disabling parameter logging alone is insufficient.

---

### User Story 3 - Prevent missing database visibility from recurring (Priority: P2)

As a maintainer, I can rely on automated checks and representative runtime evidence to detect database instrumentation that is absent from the actual application configuration.

**Why this priority**: Existing custom workflow tests passed while database spans were completely absent.

**Independent Test**: Capture exported spans through the actual application's telemetry configuration while exercising real isolated databases; demonstrate that removal of the required production instrumentation makes the regression test fail.

**Acceptance Scenarios**:

1. **Given** representative real-database operations and the application's normal telemetry registration, **When** regression checks run, **Then** they assert success, controlled failure, correlation, and privacy without independently subscribing to database activity sources or adding instrumentation absent from the application.
2. **Given** that database instrumentation registration is removed, **When** the regression check runs, **Then** it fails because expected database spans are missing.
3. **Given** all checks pass, **When** independent reviewers assess completion, **Then** they have representative local trace evidence, operation coverage evidence, and any explicitly approved limitations for the current revision.

### Edge Cases

- A database command fails before successful execution, including connection failure: expose a safe dependency failure signal without claiming a command executed when it did not.
- A handled database exception contains sensitive detail: diagnostic usefulness does not permit exporting that detail.
- A transaction performs several commands: each command is visible without requiring that the driver produce a separate transaction-control span.
- A poll finds no pending event: its database work must not inherit an unrelated reservation's context.
- A command runs without a current request: it can be a standalone trace or belong to its actual startup/background workflow.
- Command text contains literal data rather than parameters: placeholders elsewhere in the statement do not establish that the whole text is safe.
- The SQL capture setting is disabled: dependency identity, timing, outcome, and trace correlation remain available.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST export operation-level database spans through the application's actual telemetry configuration for every in-scope executed database command.
- **FR-002**: Database spans MUST identify the database and operation, expose duration and success/failure, and preserve the correct parent/child relationship when a calling workflow exists. Asynchronous operations MUST preserve their actual execution context and existing message correlation relationships.
- **FR-003**: Controlled database failures MUST remain observable with safe failure categories, including failures handled by application code; application results and persistence behavior MUST remain unchanged.
- **FR-004**: The system MUST include reviewed safe parameterized command SQL text as a diagnostic attribute, retain placeholders and reviewed safe fixed literals, use bounded operation names, and never reconstruct SQL with bound values. Provisioning SQL text is excluded.
- **FR-005**: Approved SQL text capture MUST be enabled by default in the supported local development application. A setting MUST allow turning text capture off while preserving operation spans and their safe metadata.
- **FR-006**: All current application database command paths MUST be covered, including API reads/writes, reservation outbox, notification inbox, startup migrations, bootstrap provisioning, database health checks, and background polling. Each path MUST have documented expected operations and representative verification. Provisioning remains visible through safe operation spans with SQL text excluded; no operation path is owner-approved for omission.
- **FR-007**: All exported telemetry MUST exclude SQL parameter values, query results, credentials, connection strings, tokens, request/message bodies, and unapproved personal data. Inspect automatic span names, attributes, events, resource attributes, exception details, logs, and metric dimensions. Existing permission for user/equipment correlation identifiers does not authorize capturing arbitrary SQL parameter values.
- **FR-008**: All provisioning commands MUST omit SQL text, even when SQL capture is enabled elsewhere, while retaining safe operation-level spans. Unknown or unreviewed statement text MUST be omitted rather than presumed safe because parameter logging is disabled. Startup migration text is eligible only when reviewed as safe; migration commands executed during bootstrap follow the same reviewed-text rule, while administrative provisioning commands always omit text.
- **FR-009**: Automated regression checks MUST use real isolated databases and capture exported spans through production application registration; test-only instrumentation or independent database activity subscriptions MUST NOT make missing production registration pass. Checks MUST establish success, controlled failure, correlation, privacy, and sensitivity to removal of required instrumentation.
- **FR-010**: Completion MUST include representative local trace-viewer evidence containing database operations, recorded coverage and privacy evidence, and independent review against this specification and the observability guide.
- **FR-011**: Database diagnostics MUST NOT introduce high-cardinality metric dimensions or change application responses, database contents, reservation behavior, retry behavior, or authorization rules.

### Key Entities

- **Database operation span**: A timed database dependency operation, identified by database and operation, with outcome and a relationship to the executing workflow.
- **Approved SQL text**: Reviewed command text containing safe fixed structure and placeholders; it excludes substituted parameter values, sensitive literals, and secret-bearing provisioning text.
- **Coverage evidence**: The inventory of included database paths, expected spans, automated checks, representative runtime traces, and explicitly approved omissions.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Every executed database command in each representative in-scope acceptance workflow is visible in its exported trace with identity, duration, outcome, and the correct execution relationship.
- **SC-002**: Each selected controlled failure exposes a distinguishable database failure signal while preserving the expected application result.
- **SC-003**: No prohibited sensitive test value appears anywhere in the telemetry captured during success, failure, and applicable provisioning acceptance checks; SQL text matches the owner-approved policy.
- **SC-004**: The regression check fails when required database tracing registration is removed and passes with the implemented registration restored.
- **SC-005**: Independent reviewers can reconcile every in-scope database path with recorded test or representative runtime evidence and explicit approved limitations before owner acceptance.

## Assumptions

- This change targets the existing trusted local-workstation application; it does not add a production hosting, retention, or access-control product.
- Existing database engines, service boundaries, application endpoints, messaging behavior, and trace viewer remain in use.
- Existing trace sampling is retained; acceptance evidence uses a configuration that records the representative operations.
- Connection establishment is distinct from executed SQL commands; the plan records the driver-supported connection and transaction signals without inventing guarantees.
- This feature does not modify Spec Kit templates or relax constitutional telemetry privacy requirements.
