<!--
Sync Impact Report (temporary; remove before committing this amendment)
Version change: unratified scaffold -> 1.0.0 (initial adoption)
Modified principles: unnamed scaffold slots replaced by principles I-VI.
Added sections: Application and Technology Constraints; Development Workflow and Quality Gates.
Removed sections: none; template examples replaced by project policy.
Follow-up TODOs: none. Database engine, telemetry backend, dependency resilience settings,
and testing approaches for additional infrastructure are intentional planning decisions.
-->
# Equipment Reservations Constitution

## Core Principles

### I. Simple, Idiomatic Design

Design MUST follow Beck's rules of simple design: pass the tests, reveal intention,
eliminate duplicated logic, and use the fewest elements needed to satisfy those rules.
Correctness takes precedence; clarity MUST guide decisions when eliminating duplication
would obscure intent. Abstractions MUST serve current requirements rather than speculative
future flexibility. Code MUST follow the idioms of its language and framework.

Code comments MUST be limited to non-trivial implementation details whose rationale or
constraints cannot be expressed clearly through code. Comments MUST NOT restate obvious
behavior. Naming and structure MUST carry routine explanation.

Reference: [Beck Design Rules](https://martinfowler.com/bliki/BeckDesignRules.html).

### II. Test-First Development

New behavior and behavior changes MUST begin with an automated test that fails for the
intended reason before implementation. Bug fixes MUST begin with a failing regression
test. Developers MUST implement the behavior, obtain a passing test, and refactor while
keeping relevant tests passing. Behavior-preserving refactoring MUST retain passing
behavior tests; it does not require inventing a new behavior or a failing test.

Tests MUST provide frequent feedback during development and run without human intervention.
Required tests MUST pass before a change is considered complete.

### III. Public-Interface Behavior Tests

The primary application tests MUST exercise behavior through stable public entry points,
using real internal collaborators. External service interactions MUST primarily use narrow
integration tests with faithful boundary doubles, verified through contract tests.
This combines sociable application behavior tests with Fowler's narrow integration tests;
these terms MUST NOT be treated as interchangeable.

Database tests MUST use real, isolated databases provisioned with Testcontainers rather
than substitutes for database behavior. Testing approaches for additional infrastructure,
including Redis, Kafka, or RabbitMQ, MUST be decided case by case during planning and
recorded before implementing the affected integration.

Solitary tests MAY be used only where the specific case requires them; the review MUST
record the reason. They MUST exercise the class or component's public interface.
Production code MUST NOT expose private state or methods solely to enable tests.
Assertions MUST concern observable results and contractual effects rather than internal
class arrangements or incidental collaborator calls. Behavior-preserving internal
refactoring MUST NOT require rewriting behavior expectations.

References: [Integration Test](https://martinfowler.com/bliki/IntegrationTest.html) and
[Unit Test](https://martinfowler.com/bliki/UnitTest.html).

### IV. Useful, Maintainable Test Feedback

Tests MUST be deterministic, independent of execution order, composable, automated, and
sensitive to behavior changes while remaining insensitive to internal structure changes.
Tests MUST state their purpose clearly and make failures diagnosable. Test design MUST
minimize waiting and the effort to write, read, and change tests, while providing confidence
in production behavior. Flaky results MUST be corrected rather than treated as passing
evidence through repeated reruns.

Reviews MUST assess speed, confidence, readability, diagnostic specificity, maintenance
cost, and predictive value. Tradeoffs among these qualities MUST identify the greater
value gained; they MUST NOT silently relax public-interface or test-first rules.

References: [Test Desiderata](https://medium.com/@kentbeck_7670/test-desiderata-94150638a4b3)
and [Programmer Test Principles](https://medium.com/@kentbeck_7670/programmer-test-principles-d01c064d7934).

### V. Correlated Observability

The application MUST use OpenTelemetry for traces, logs, and metrics. Key reservation,
approval, collection, and return workflows and external calls MUST be traceable.
Logs MUST be structured and correlated with traces where a trace context exists.
Metrics MUST cover latency, errors, dependency health, and reservation outcomes.
Each feature plan MUST identify relevant telemetry and its validation approach.
Telemetry storage and dashboard products MUST be selected during planning.

Telemetry MUST exclude credentials, tokens, request bodies, and personal data unless the
human owner explicitly approves a specific exception. User and equipment identifiers MAY
be used for correlation; this permission does not authorize additional personal data.
High-cardinality identifiers MUST NOT be used as metric dimensions.

### VI. Bounded, Safe Resilience

Remote calls MUST have explicit timeouts. Retries MUST be bounded, apply only to transient
failures, and use exponential backoff with jitter. Operations with side effects MUST be
safe to repeat before retries are enabled; reservation creation, approval, collection,
and return MUST NOT produce duplicate effects through retrying.

Circuit breakers MUST protect remote dependencies where justified by their failure modes.
Each dependency's plan MUST document timeout and retry settings, repeat-safety guarantees,
and the decision to use or omit a circuit breaker. Resilience MUST NOT conceal permanent
failures or turn rejected business operations into successful ones. Relevant timeout,
retry, and circuit-breaker behavior MUST have tests and observable failure signals.

## Application and Technology Constraints

This constitution governs the Equipment Reservations application. Users reserve shared
equipment such as laptops, cameras, and meeting-room devices. Managers approve restricted
equipment; staff record collection and return. Detailed business rules and authorization
decisions MUST be captured in feature specifications with the human owner.

The client application MUST use Angular. Backend services MUST use ASP.NET Core.
Local application and dependency orchestration MUST use .NET Aspire. These choices do
not require a particular service decomposition. Framework versions, database engine,
hosting, and additional infrastructure MUST be selected in implementation plans.

## Development Workflow and Quality Gates

Feature work MUST follow approved specifications, plans, and tasks. Missing product
decisions MUST be referred to the human owner before dependent work proceeds.
The workflow in `AGENTS.md` and `docs/agent-team/protocol.md` MUST apply when the
feature-team loop is explicitly invoked, including independent quality and security
reviews. Reviewers own their verdicts; implementers MUST NOT self-approve those gates.

Completion MUST require satisfied acceptance criteria, complete tasks, passing required
checks, consistent artifacts, no unresolved blocking quality or security findings,
and the human owner's explicit feature acceptance. Checks and reviews MUST match the
current revision; unavailable or skipped required checks remain pending. Within the
feature-team loop, the latest convergence assessment MUST also find no remaining gaps.
Critical and high security findings block by default. Policy exceptions and security
risk acceptance MUST identify scope or finding, rationale, owner, and date and require
the human owner's explicit approval.

Passing gates MUST NOT authorize merging, deployment, publication, external messages,
or external issue creation. Each action requires its own authorization.

## Governance

This constitution is the governing application-policy agreement. Feature specifications,
plans, tasks, implementation, and reviews MUST comply with it. Repository workflow
instructions remain applicable; conflicts MUST be raised with the human owner rather
than silently resolved by relaxing either agreement.

Amendments MUST document the proposed policy change, rationale, and impact on existing
work and obtain explicit approval from the human owner. Agents MUST NOT amend or relax
the constitution merely to clear a gate. Approved exceptions MUST be recorded and scoped;
an exception does not silently amend the general policy.

Constitution versions MUST use semantic versioning: MAJOR for incompatible principle
removals or redefinitions, MINOR for new principles or materially expanded guidance,
and PATCH for non-semantic clarifications. Amendments MUST update the version and last
amended date while preserving the original ratification date.

Planning and independent reviews MUST explicitly assess constitution compliance.
Violations MUST be resolved or receive a recorded human-approved exception before
completion. References explain adopted principles; their future revisions MUST NOT
automatically change this constitution.

**Version**: 1.0.0 | **Ratified**: 2026-10-13 | **Last Amended**: 2026-10-13
