# Research: Hello Retirement

Repository baseline: `5cfd6233e9d466e9a525f2fe18a30d1aa90015f7`, inspected 2026-10-15. This removal uses existing APIs and pinned dependencies; no version selection or uncertain external API fact requires new upstream research. All technical unknowns resolved below; no product clarification remains.

## Remove a vertical slice, preserve shared contracts

**Decision**: Delete the hello handlers, UI, transient store/consumer, topology and telemetry; rename the existing shared project/namespace to ReservationMessaging. Extract EquipmentIdValidation with unchanged character/length rule.

**Evidence**: `src/HelloMessaging/HelloRequested.cs` combines hello DTOs and validation used by Inventory/Reservations/ReservationEventValidation. The booking path uses InventoryItem rather than the hello Equipment DTO. `Program.cs` files mix both feature registrations. ReservationTopology is already distinct.

**Rationale**: Removing only navigation would leave broker consumers and obsolete health dependencies running. Renaming all hello types would preserve dead behavior unnecessarily.

**Alternatives considered**: Keep endpoint aliases/deprecate (owner rejected); new shared project/domain layer (unnecessary); delete shared library (breaks booking contracts/recovery).

## Preserve broker policy and state

**Decision**: Retain the connection factory settings in RabbitConnection and unchanged ReservationTopology. Do not carry hello TTL/cap into booking topology. Leave existing hello resources and messages untouched.

**Evidence**: RabbitTopology currently owns hello queue constants/declaration plus a factory used by ReservationPublisher, ReservationSubscription and BrokerHealth. ReservationTopology owns durable exchange/queue and confirmation/cancellation bindings without TTL/cap. BrokerContractTests currently verifies hello limits; booking delivery tests cover durable replay.

**Rationale**: A CLR rename must not change queue semantics or corrupt pending messages. Passive inspection of deliberately seeded isolated legacy artifacts establishes preservation without production compatibility.

**Alternatives considered**: Delete all RabbitTopology functionality (breaks shared factory); purge legacy broker state (owner rejected); add booking queue limits (changes booking contract).

## Preserve meaningful checks

**Decision (updated by explicit owner direction, 2026-10-15)**: Remove tests whose sole purpose is to assert old-feature absence, including the newly added HTTP/root/browser retirement checks. Preserve recorded red evidence as historical and mark T005/T006 superseded. Establish removal through source/configuration/documentation inspection. Preserve positive booking behavior tests and replace only missing shared-risk coverage through booking entry points. Remove dedicated hello tests and portions of mixed smoke/browser tests.

**Evidence**: BookingSmokeTests embeds hello restart assertions; booking browser foreign-origin scenario posts to hello; DatabaseTracingTests uses Equipment.Hello as capture control. OperationalTests, BookingTelemetryTests, ReservationTelemetryTests and database privacy tests already cover retained concerns.

**Rationale**: The owner explicitly withdrew absence-only tests. Positive security/privacy, booking and broker guarantees remain covered; exact concern-to-test mapping avoids mechanically duplicating existing cases. No constitution or engineering-policy change is made.

**Alternatives considered**: Keep absence-only tests (owner rejected); drop whole mixed test files (loses booking assertions); translate hello TTL/expiration expectations (wrong contract); assert no string hello anywhere (conflicts with preserved secret/history and state-preservation fixtures).

## Preserve history separately

**Decision**: Update active README and engineering formatter example, rename current web package identity, add docs/history/hello-retirement.md linking historical features. Do not rewrite old specs/contracts/tasks/review hashes or evidence snapshots.

**Rationale**: Old reports describe reviewed old snapshots, not this removal. A separate note records supersession without falsifying prior acceptance.

**Alternatives considered**: Rewrite walking-skeleton artifacts to remove hello (destroys evidence); leave live hello run instructions (misleading).

## Telemetry and dependencies

**Decision**: Preserve existing Npgsql.OpenTelemetry `.AddNpgsql()` production collection, privacy processors, HTTP instrumentation, booking workflow sources/meters and exporter settings; remove only Equipment.Hello and hello-only generated logs. Retain current dependency budgets/recovery strategies without upgrades.

**Evidence**: ServiceDefaults/Extensions.cs collects named sources and Npgsql centrally; database-tracing feature documents approved instrumentation and exception redaction gaps. ReservationPublisher/Subscription retain wire context; booking worker tests cover retry context.

**Rationale**: No new dependency integration is introduced; representative exported booking and Aspire evidence verifies preservation after namespace changes. Readiness failures use existing bounded reservation dependency signals.

**Alternatives considered**: New broker instrumentation package or tracing redesign (outside removal); keep hello meter for shared health (obsolete naming/registration).
