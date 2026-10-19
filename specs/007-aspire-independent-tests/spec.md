# Feature Specification: Aspire-independent application tests

**Feature Branch**: `main` (feature directory selected explicitly; no branch hook configured)

**Created**: 2026-10-16

**Status**: Implemented amendment — automated validation passed; independent quality/security review, convergence, and explicit acceptance pending (original revision accepted 2026-10-16)

**Input**: Simplify automated backend testing by removing Aspire as a test harness, preserving distinct application and infrastructure guarantees, consolidating retained Smoke coverage into Backend.Tests, and verifying local Aspire operation manually. The owner confirmed this scope and authorized the feature-team loop; final feature acceptance remains separate.

## Current amendment — 2026-10-19

The owner subsequently authorized xUnit v3, Microsoft.Testing.Platform, the nine-project test layout with shared TestSupport, and parallel execution across projects and within each project by default. This supersedes the original consolidation and deferred-concurrency decisions below. [The amendment record](supersession.md#testing-organization-and-concurrency-amendment--2026-10-19) defines current scope and evidence; original clarification answers and completed review records remain historical. Original acceptance does not accept this later revision.

## Clarifications

### Session 2026-10-16

- Q: Should all automated Aspire/AppHost tests, including local configuration, admin consoles, startup, and publishing, be removed? → A: Yes; verify local Aspire operation manually.
- Q: Should distinct application and infrastructure guarantees survive while redundant and Aspire-only assertions are removed? → A: Yes; preserve useful coverage through service factories and real infrastructure containers, and explicitly decide any distinct guarantee proposed for removal.
- Q: Should retained Smoke coverage move to Backend.Tests and Smoke.Tests be removed? → A: Yes; defer parallelization changes.
- Q: Are service-host recreation and real infrastructure-container restarts sufficient for recovery coverage? → A: Yes; separate application-process crash and network-listener verification are outside scope.
- Q: Should guidance and affected requirements be updated while preserving historical acceptance and review records? → A: Yes; explicitly identify superseded requirements without rewriting historical evidence.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Validate application guarantees without local orchestration (Priority: P1)

As a developer, I can run the required backend integration checks without starting or inspecting the local development orchestrator, while retaining confidence in application behavior and real infrastructure contracts.

**Why this priority**: Removing the orchestration dependency must not silently weaken protection against lost data, unauthorized access, failed delivery, or leaked secrets.

**Independent Test**: Run the retained backend checks with only the documented container prerequisites and inspect their coverage mapping; no local orchestrator or manifest publication is involved.

**Acceptance Scenarios**:

1. **Given** the supported container runtime and documented test prerequisites, **When** a developer runs the backend suite, **Then** application and provider checks execute without starting, constructing, publishing, or inspecting an AppHost.
2. **Given** a former Smoke assertion protects a distinct application or infrastructure guarantee, **When** it is removed or migrated, **Then** an explicit mapping identifies its retained automated replacement or an owner-approved removal decision; assertions solely about local orchestration are classified separately.
3. **Given** failures in delivery, authorization, provisioning, or recovery, **When** the relevant retained checks run, **Then** observable contractual outcomes remain covered, including rejection and privacy outcomes rather than only successful paths.

---

### User Story 2 - Preserve durable recovery behavior (Priority: P1)

As a maintainer, I can verify that committed work survives service-host recreation and infrastructure outages without relying on a large multi-AppHost journey.

**Why this priority**: Persistence and repeat-safe recovery are application guarantees independent of the development startup tool.

**Independent Test**: Exercise focused scenarios that retain the same isolated durable state while recreating service hosts and stopping/restarting the real infrastructure dependencies.

**Acceptance Scenarios**:

1. **Given** committed reservation changes and pending outgoing events, **When** relevant service hosts are recreated and the broker recovers, **Then** data and stable event identities survive and delivery resumes without duplicate business effects.
2. **Given** queued messages and committed inbox entries, **When** the broker restarts and the consumer host is recreated, **Then** queued work remains recoverable and redelivery preserves one identical inbox effect.
3. **Given** previously provisioned databases, broker authority, and identity-provider state, **When** existing repeat-provisioning or restart checks are migrated, **Then** their distinct persistence, credential-reconciliation, and least-privilege guarantees remain covered against real providers.

---

### User Story 3 - Understand and operate the revised test boundary (Priority: P2)

As a contributor, I have backend test projects organized by production responsibility plus cross-project integration coverage, a quality command that includes its required tests, and clear instructions for checking the local development environment manually.

**Why this priority**: The code, contributor guidance, and feature agreements must describe the same supported testing policy.

**Independent Test**: Follow the documented automated command and manual local-development checklist, then compare the repository guidance and supersession records with the implemented boundary.

**Acceptance Scenarios**:

1. **Given** the migration is complete, **When** contributors inspect the solution and quality commands, **Then** retained coverage belongs to the nine backend test projects and shared TestSupport described in the amended plan and no active project, package, or command depends on Smoke.Tests or Aspire testing.
2. **Given** a contributor checks local Aspire operation, **When** they follow the manual instructions, **Then** they can verify startup, dashboard links, local administration access, and persistent local dependencies, with expected observations and teardown steps; manifest publication is outside the supported scope.
3. **Given** an older agreement required automated AppHost or manifest evidence, **When** contributors read that agreement, **Then** an explicit supersession notice identifies the new policy while historical acceptance dates, review hashes, reports, and completed-task evidence remain intact.

### Edge Cases

- A single old test mixes local-orchestration assertions with meaningful permission, provisioning, persistence, or privacy assertions: split its guarantees before deciding what to delete.
- Several old assertions protect the same failure: one replacement may cover them only when the mapping explains the shared guarantee; raw test counts do not establish preservation.
- Container prerequisites are absent or a real provider fails readiness: fail with a diagnosable prerequisite failure; do not silently skip required checks or substitute an unverified fake.
- A service host is recreated but durable storage is accidentally recreated too: recovery evidence must demonstrate reuse of the same isolated state.
- A local console or startup defect is found manually: report the failed observation; do not restore automated AppHost coverage merely to clear this feature's acceptance.
- A distinct application guarantee cannot be retained within the approved scope: raise it to the human owner before removing it.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Required automated application tests MUST operate independently of Aspire: no AppHost construction, model inspection, startup, resource commands, or manifest publication in the test suite.
- **FR-002**: Every former Smoke test method and theory case, and its distinct contractual assertions, MUST have a reviewable disposition: retained with replacement evidence, redundant with an identified equivalent, Aspire-only and removed, or explicitly approved by the owner for removal. A mixed scenario MUST map its application guarantees individually; equivalent Aspire-only assertions elsewhere in automated tests MUST also be removed without dropping their mixed application guarantees.
- **FR-003**: Retained coverage MUST protect application delivery and recovery contracts, including stable outgoing-event contents/identities, confirmation and uncertain-outcome handling, bounded failure behavior, permanent-failure handling, interrupted commit/acknowledgment recovery, deduplication, poison-message rejection, and progress of subsequent valid work.
- **FR-004**: Retained real-provider coverage MUST protect database provisioning and service isolation, broker routing/durability/scoped permissions and denied authority, identity login and service credentials, repeat provisioning and persisted provider state, and relevant correlated telemetry and secret/privacy exclusions. Production provisioning behavior MUST remain represented rather than a test-only alternative silently replacing its contract.
- **FR-005**: Recovery coverage MUST use recreated service hosts and real infrastructure restarts with the same isolated durable state to demonstrate retained reservations, pending events, queued messages, and inbox effects. Separate application processes, process crashes, and actual application network-listener checks are not required.
- **FR-005a**: The recovery and provider mapping MUST account for unchanged migration ledgers, no destructive reseeding, retained equipment edits and booking history, legacy broker state, stable identity issuers/subjects, cross-user data isolation, configured provider metadata authority, special-character credentials, protected provider files, and safe diagnostics on rejected provider imports where these are existing distinct assertions. Aspire endpoint-allocation annotations, host staging lifetimes, and worker resource waiting states are orchestration checks eligible for removal; they do not authorize dropping provider outcomes housed in the same tests.
- **FR-006**: Retained coverage MUST reside in Inventory.Tests, Reservations.Tests, Notifications.Tests, IdentityAccess.Tests, Persistence.Tests, DatabaseBootstrap.Tests, BrokerBootstrap.Tests, IdentityBootstrap.Tests, and Integration.Tests, with reusable infrastructure in non-test TestSupport, using the owner-selected WebApplicationFactory and Testcontainers approach where applicable; the Smoke.Tests project and obsolete test-only Aspire dependencies/helpers MUST be removed from active solution, tooling, and package references.
- **FR-007**: Required quality commands MUST run all retained backend checks and propagate failures. Missing infrastructure prerequisites or unavailable checks MUST remain failures or pending evidence, never successful skips.
- **FR-008**: Contributor guidance MUST explain the automated/manual boundary and provide a reproducible manual local Aspire procedure with prerequisites, expected startup/dashboard/admin-console/access/persistence observations, and cleanup. Automated publication checks MUST be removed; cloud deployment and manifest generation are unsupported by this testing policy.
- **FR-009**: Affected existing feature agreements and repository guidance MUST explicitly identify superseded automated Aspire and publishing obligations and their replacements. Historical reviews, acceptance records, hashes, and completed-task history MUST be preserved; supersession MUST NOT falsely claim that old evidence validated the new implementation.
- **FR-010**: This refactoring MUST preserve application runtime behavior, wire contracts, security authority, and local development capabilities. Any necessary change beyond test structure, test tooling, and documentation MUST be raised for an explicit scope decision.
- **FR-011**: Backend tests MUST run concurrently by default across projects and within each project, including methods and theory cases, using native xUnit v3 `ParallelMode.All` with `MaxThreads = -1` and Microsoft.Testing.Platform through `dotnet test`. Quality tooling MUST permit every backend test module to run concurrently. Sequential execution MUST be limited to the smallest necessary scope with hard interference constraints documented beside its exclusion or in the linked engineering guide, including why scenario isolation cannot currently remove the constraint. Shared providers alone do not justify serialization. Fixtures MUST isolate scenario state and safely support concurrent use and cleanup. No wrapper scheduler is required.
- **FR-012**: Completion MUST require current-revision automated checks, independent quality/security reviews, convergence with no gaps, consistent completion metadata, and explicit human acceptance of the completed result. The pre-work scope confirmation is not final acceptance.

### Key Entities

- **Coverage disposition**: A former scenario or contractual assertion, the failure it detects, its disposition and rationale, and the retained automated evidence or explicit owner decision.
- **Supersession record**: An affected prior agreement, the obligation replaced, the new policy or evidence, and a link to this feature, preserving its historical records.
- **Manual local-development check**: Prerequisites, actions, expected observations, and cleanup for the local orchestration boundary deliberately excluded from automation.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of former Smoke scenarios have a disposition, and 100% of distinct retained application/infrastructure guarantees identify executable replacement evidence; none is silently dropped.
- **SC-002**: Zero required automated checks construct or operate the development orchestrator or publish a deployment manifest, and zero active references require the retired test project.
- **SC-003**: All retained backend checks pass in the documented environment, including negative authority, delivery-failure, durable recovery, and privacy scenarios, with no prerequisite failures reported as passes.
- **SC-004**: A contributor can follow the documented manual development-environment procedure and record an expected or failed observation for every listed step without relying on removed automated checks.
- **SC-005**: Every identified conflicting testing obligation has an explicit supersession record; historical acceptance and independent-review evidence remains intact.
- **SC-006**: Independent reviewers confirm that the coverage mapping, runtime-preservation boundary, and amended project organization, concurrency policy, and documented exclusions match the approved scope, and final human acceptance is separately recorded before completion.

## Assumptions

- This is a behavior-preserving test-policy and harness refactor; it does not add product functionality or change deployment architecture.
- The supported local container runtime and existing real provider choices remain unchanged; production provider upgrades remain outside scope; test-runner migration and fixture/concurrency changes are authorized by the 2026-10-19 amendment.
- Browser tests and unrelated client/application coverage remain required where already applicable; this feature does not replace them with backend-only checks.
- Local startup issues may first be discovered during manual development checks. The owner explicitly accepts this boundary; application/provider security and privacy guarantees remain automated.
- Existing constitutional requirements remain in force. The owner's approved testing-policy change permits corresponding engineering-guide updates without relaxing the constitution.
