# Research: Book and Cancel Equipment

**Date**: 2026-10-14 | **Baseline**: `0f3ee965` | **Scope**: frozen feature spec `e2822291...cb96`.

All product decisions are supplied by the spec; routine implementation choices below resolve technical unknowns. Existing-role research was coordinated with coder/security specialists; no extra coordinator or application edits were created. Official version-sensitive references were checked during planning.

## PostgreSQL allocation

**Decision**: PostgreSQL 18.6, parameterized Npgsql 10.0.3, explicit UTC timestamptz columns and a partial GiST exclusion constraint using btree_gist.

**Rationale**: Database exclusion arbitrates concurrent overlapping writes and supports item equality plus half-open interval overlap. Partial Confirmed membership releases cancelled allocations while retaining history. Supported scalar GiST operators and range construction are established PostgreSQL capabilities. [PostgreSQL range constraints](https://www.postgresql.org/docs/18/rangetypes.html), [btree_gist](https://www.postgresql.org/docs/18/btree-gist.html), [CREATE TABLE exclusion predicates](https://www.postgresql.org/docs/18/sql-createtable.html).

**Alternatives considered**: Application check-then-insert races; serializable transactions require retry policy and complexity; advisory item locks require every writer to cooperate. PostgreSQL 18 WITHOUT OVERLAPS is less direct for a partial status predicate. EF Core adds mapping/migration machinery without current benefit; focused SQL exposes the correctness boundary.

[Official support listing](https://www.postgresql.org/support/versioning/) selected supported PostgreSQL 18 patch 18.6. [Npgsql NuGet](https://www.nuget.org/packages/Npgsql/) lists 10.0.3; [Npgsql release notes](https://www.npgsql.org/doc/release-notes/10.0.html) document async provider support. Verify package/image availability, audit restored dependencies and pin exact versions during implementation.

## UTC precision and time

**Decision**: Offset-required ISO8601 input, normalized UTC, maximum six fractional digits, reject finer precision; injected authoritative TimeProvider sampled immediately before write/after cancellation row lock and truncated to microseconds. Display browser zone/offset visibly; reject ambiguous/nonexistent local input using conversion/round-trip validation and explicit offset selection where necessary.

**Rationale**: Npgsql timestamptz expects UTC and PostgreSQL precision is microseconds. Rejecting excessive precision avoids accidentally permitting overlaps or altering boundary instants through rounding. [Npgsql time mapping](https://www.npgsql.org/doc/types/datetime.html), [PostgreSQL date/time](https://www.postgresql.org/docs/18/datatype-datetime.html).

**Alternatives considered**: Unspecified local time accepts ambiguous DST values; raw DateTimeOffset binder alone can infer a timezone; silent truncation changes the requested interval. NodaTime adds a dependency unnecessary for offset-based instants in this feature.

## Aspire and credentials

**Decision**: Aspire.Hosting.PostgreSQL13.6.1, one persistent server, distinct fixed service roles/database grants; explicit one-shot bootstrap every startup, migrations tracked by version/checksum. APIs receive only their own connection. Stable secret parameters outside Git.

**Rationale**: Database resources inherit server credential properties; creating three AddDatabase resources alone does not isolate privileges. Creation/init scripts do not provide repeatable schema upgrades or password reconciliation on existing volumes. Bootstrap uses admin only for provisioning/extension and own roles for schema migrations; WaitForCompletion prevents APIs starting early. [Aspire postgres integration](https://aspire.dev/integrations/databases/postgres/postgres-host/), [pinned hosting package](https://www.nuget.org/packages/Aspire.Hosting.PostgreSQL/13.6.1), [WaitForCompletion](https://aspire.dev/hub/glossary/waitforcompletion/), [resource volume lifetimes](https://aspire.dev/app-host/resource-lifetimes/), [PostgreSQL privileges](https://www.postgresql.org/docs/18/ddl-priv.html).

**Alternatives considered**: Separate servers add unnecessary infrastructure; shared admin credentials violate isolation; first-run init scripts leave future migrations unapplied; ephemeral generated secrets against persistent admin volumes fail subsequent authentication. Separate runtime/migration role for each service is valid production hardening but adds six role identities without a local-scope requirement; runtime own-DB ownership is documented and independently reviewed.

## Outbox and inbox

**Decision**: Transactional outbox, stable EventId, separate durable reservation topology, persistent messages, mandatory publisher confirmations; row lock during bounded publication, commit Published after confirmation; inbox EventId primary key and ACK after commit.

**Rationale**: No broker operation can roll back a committed booking. Publication uncertainty can duplicate delivery; database uniqueness makes effects idempotent. Durable queue/messages/volume survive consumer/broker restart. Confirmation proves broker acceptance, not notification observation. [RabbitMQ confirmations/acknowledgements](https://www.rabbitmq.com/docs/confirms), [RabbitMQ .NET guide](https://www.rabbitmq.com/client-libraries/dotnet-api-guide).

**Alternatives considered**: Synchronous publish couples writes to broker; marking before publication loses events; exactly-once transport is not promised; leases add fencing/clock complexity unnecessary here. Existing hello topology retains TTL/cap/nonpersistent semantics so adapter contracts remain valid; reservation events cannot reuse that lossy queue.

## Recovery and verification

**Decision**: Bounded transient retry bursts with exponential jitter and durable scheduled cycles; no write retry. Real PostgreSQL Testcontainers 4.16.0 for HTTP allocation/cancellation tests; real broker adapter/outage coverage plus small AppHost smoke. Inject time/random boundaries.

**Rationale**: Permanent business errors never retry; stable event IDs permit eventual scheduled delivery after outages without unbounded single attempts. Real database tests must prove production constraint behavior, not a double's approximation. [Testcontainers PostgreSQL](https://dotnet.testcontainers.org/modules/postgres/), [pinned module listing](https://www.nuget.org/packages/Testcontainers.PostgreSql/). Existing tests and Aspire tooling are retained.

**Alternatives considered**: SQLite/in-memory databases do not reproduce GiST/concurrency; sleeps are flaky; testing only worker internals misses transactional effects. Circuit breakers are omitted for local PostgreSQL/broker: explicit short budgets and scheduled backoff already bound work, while a breaker adds state/recovery coordination. Inventory HTTP fails promptly with no retry.

## Permanent database-failure clarification

**Decision**: Generic database-failure classification belongs in the shared infrastructure Persistence library, alongside migration bookkeeping, without shared domain tables/entities. Known permanent authentication/permission/schema/catalog faults halt the affected outbox/inbox worker until developer repair plus explicit service restart. A selected permanent publication fault may be parked Pending only when own-database scheduling metadata remains writable; outer open/selection or permanent metadata-write faults cannot pretend to persist that disposition. Failed inbox persistence stays unACKed.

**Rationale**: ConstitutionVI already allows retries only for transient faults. Repeating an invalid credential/permission/schema operation cannot recover without repair, while unknown/uncertain connection or commit outcomes need the existing bounded repeat-safe policy. Retaining committed outbox events and durable EventId uniqueness protects publisher uncertainty and consumer redelivery after repaired restart. This is a factual implementation clarification, with regression-first revalidation, not a new business policy/schema or owner exception.

**Alternatives considered**: A blanket provider-exception retry hides known permanent faults; trying to park through an inaccessible database falsely claims durable scheduling; classifying every unknown provider error as permanent weakens outage/uncertain-commit recovery. Do not log raw provider diagnostics or copy growing code-level classifications into public contracts.

**Dashboard retention clarification**: Aspire 13.6 introduced AppHost-default SQLite Run history (up to 10 unpinned runs/application); observed local run metadata corroborates this default. Retain the selected dashboard/local scope/AlwaysOn sampler; no application-data retention or telemetry-content permissions change. Keep diagnostic stores/exports private because resource snapshots can include sensitive configuration. [Official 13.6 release notes](https://aspire.dev/whats-new/aspire-13-6/) / [persistence](https://aspire.dev/dashboard/data-persistence/).
