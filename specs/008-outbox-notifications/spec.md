# Feature Specification: Prompt Outbox Wake-ups

**Feature Branch**: Existing working branch; feature directory `specs/008-outbox-notifications`

**Created**: 2026-10-19

**Status**: Complete — implemented, independently reviewed, and accepted 2026-10-19

**Input**: Human owner confirmed all sixteen interview decisions and authorized feature-team implementation.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Deliver committed events promptly (Priority: P1)

As a reservation user, I want committed reservation events processed promptly even when the worker was idle.

**Why this priority**: The existing idle wait delays otherwise healthy delivery.

**Independent Test**: Commit an event through an existing insertion path while a worker is idle; observe publication start and durable completion.

**Acceptance Scenarios**:

1. **Given** healthy dependencies, an established listener, no backlog and an available worker, **When** an insertion commits, **Then** its first publication attempt starts within one second of commit.
2. **Given** an open insertion transaction, **When** it remains open or rolls back, **Then** that insertion emits no delivery signal before commit and rolled-back work is never published.
3. **Given** insertions during processing or immediately before sleep, **When** the worker drains ready work, **Then** eligible work is not stranded by a lost wake-up; redundant signals may collapse into one pending wake-up.

### User Story 2 - Recover without losing durable work (Priority: P1)

As an operator, I want delivery to survive missed signals, listener outages and worker restarts while preserving recovery protections.

**Why this priority**: Advisory signals must not replace durable delivery state.

**Independent Test**: Retain durable state across worker restart and listener interruption; observe eventual delivery and preserved retry eligibility.

**Acceptance Scenarios**:

1. **Given** existing committed rows, **When** startup or reconnection establishes listening, **Then** an immediate scan processes eligible work without requiring another insertion.
2. **Given** a healthy idle worker and missed signals or manual repairs to existing rows, **When** work becomes eligible, **Then** fallback scans occur at intervals no greater than 30 seconds, except during failure backoff.
3. **Given** a persisted retry becomes due sooner than the next fallback, **When** that deadline arrives, **Then** the worker wakes for it; restarting does not reset the persisted schedule.
4. **Given** temporary listener loss, **When** listening is unavailable, **Then** delivery uses the existing ten-second idle polling while bounded, jittered reconnection runs; reconnection establishes listening before immediately scanning.
5. **Given** active worker failure backoff, **When** inserts emit signals, **Then** backoff is not shortened. Permanent database authentication, permission or schema failures halt the worker with an observable failure.
6. **Given** waiting, recovery or publication is active, **When** shutdown cancels execution, **Then** waits end, listener resources are released and unconfirmed or uncertain publication is not marked successful.

### User Story 3 - Share work safely and reduce idle cost (Priority: P2)

As an operator, I want replicas and rolling deployments to preserve safe delivery while reducing idle database activity and exposing operating health.

**Why this priority**: The change must remain safe to deploy and diagnose.

**Independent Test**: Run multiple workers against isolated durable state, including an older polling worker; inspect delivery state, idle activity and exported telemetry.

**Acceptance Scenarios**:

1. **Given** one to five replicas receive the same signal, **When** work is eligible, **Then** each processes at most one event at a time, skips work locked by peers and drains available work safely.
2. **Given** polling and listening generations coexist, **When** events commit, **Then** both remain compatible with existing records and delivery contracts. Removing notification support leaves fallback delivery functional.
3. **Given** healthy idle operation, **When** observed over a representative steady interval, **Then** periodic scans occur at approximately one third the existing ten-second polling frequency.
4. **Given** normal operation, listener loss and recovery, **When** telemetry is exported, **Then** bounded signals distinguish wake-up causes, listener failures, reconnects and degraded polling without forbidden data.

### Edge Cases

- Commit occurs between establishing listening and scanning, or between the last scan and sleep.
- Repeated signals collapse; all replicas may wake for one event.
- A peer locks the only ready row; the remaining worker must avoid spinning on it.
- All remaining rows have future deadlines, including invalid events parked in the far future.
- Listener recovery and publisher failures overlap; notification recovery cannot bypass failure backoff.
- Publication succeeds but persisting success fails; duplicate redelivery remains possible.
- Messaging is disabled; the worker retains its existing no-op behavior.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Committed insertions MUST emit payload-free work signals; open or rolled-back insertions MUST NOT signal delivery work.
- **FR-002**: Durable records MUST remain authoritative. Missed, redundant or coalesced signals MUST NOT lose work. Listening MUST precede startup/reconnect scans; pending wake-ups MUST survive the transition from processing to waiting.
- **FR-003**: Each replica MUST process sequentially, preserve exclusive claiming that skips peer-locked work, and immediately continue after success until no eligible work remains.
- **FR-004**: Healthy idle scan intervals MUST be no greater than 30 seconds. Workers MUST wake sooner for the earliest persisted retry deadline, subject to active failure backoff. Existing-row repairs may wait for fallback.
- **FR-005**: Signals MUST NOT shorten worker-wide failure backoff or alter existing persisted retry eligibility, failure classification, invalid-message parking or the ten-second recovery check after a failed burst.
- **FR-006**: Temporary listener loss MUST activate ten-second idle polling with bounded retry bursts using exponential backoff and jitter for reconnection. Permanent database failures MUST halt the worker observably rather than retry indefinitely or silently degrade.
- **FR-007**: Startup and reconnection MUST scan immediately after establishing listening. Polling MUST preserve delivery if notification support is absent; detecting absent notification support is not required.
- **FR-008**: Cancellation MUST end listener waits and recovery delays, release listener resources and preserve existing in-flight publication semantics. The three-second publication attempt budget and disabled-messaging behavior MUST remain unchanged.
- **FR-009**: Existing at-least-once delivery, stable event identity and duplicate-safe downstream behavior MUST remain unchanged; exactly-once publication is not promised.
- **FR-010**: Older polling workers and new workers MUST coexist in rolling deployments without changing event schema or publication contracts.
- **FR-011**: Bounded telemetry MUST identify wake-up causes, listener health, reconnection and degraded polling. Existing pending-count and oldest-age measurements MUST refresh on processing scans, at intervals no greater than 30 seconds during healthy idle operation. Existing trace correlation and telemetry privacy MUST remain intact.
- **FR-012**: The deployment MUST support one to five replicas with one additional persistent listener connection each. All listeners may wake for the same insertion.

### Key Entities *(include if feature involves data)*

- **Outbox event**: Existing durable event identity, payload, publication state, attempts, retry eligibility and trace context; survives restart.
- **Wake-up signal**: Advisory indication of committed work; carries no event data and need not be individually retained or counted.
- **Worker replica**: Independent delivery service with sequential processing and observable normal, degraded, backoff and halted states.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Publication starts within one second of commit under healthy dependencies, an established listener, no backlog and an available worker. Controlled evidence separates the target from test scheduler noise.
- **SC-002**: Healthy idle periodic scans decrease by approximately two thirds against the ten-second baseline, using a 30-second cadence. Evidence counts additional idle operations as well as existing snapshot and selection work so added retry checks cannot hide increased load.
- **SC-003**: Recovery evidence shows no durable event loss across startup, disconnection, reconnection and wake-up races; retry eligibility and the existing failed-burst recovery bound survive restart.
- **SC-004**: One to five concurrent workers and mixed worker generations preserve sequential per-worker processing and existing delivery and duplicate-safety contracts.
- **SC-005**: Failure/recovery evidence distinguishes operating mode and wake-up cause without forbidden telemetry; cancellation releases listener resources and never marks uncertain publication successful.

## Assumptions

- Human-selected scope uses PostgreSQL LISTEN/NOTIFY and an insert-only trigger in an additive migration. Publication continues through existing RabbitMQ integration. These approved scope constraints are not alternatives to reopen during design.
- The one-second target excludes backlog, outages, backoff and scheduled retries; it concerns starting publication, not downstream consumption.
- Missing notification support may be undetectable while listening succeeds; periodic fallback maintains correctness.
- Batching, publisher connection reuse and snapshot-query optimization are excluded. Existing authentication and authorization remain unchanged.
- Exact bounded reconnect settings, operation budgets, telemetry names and deterministic test coordination are engineering decisions for planning under existing standards.
- Acceptance requires real PostgreSQL evidence for commit behavior, races, retries, recovery and replicas, retaining existing broker contracts. A notification double alone cannot establish these guarantees.
