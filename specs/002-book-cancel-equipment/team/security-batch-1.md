**Batch 1 security verdict: pass within T001–T009 scope.** No confirmed security findings, risk acceptance or waivers. This does not approve the full feature.

**Revision and scope**

Feature: `specs/002-book-cancel-equipment`  
HEAD: `0f3ee965011ddf3fc473ea1a5bba6bfa3acdc7b1` plus frozen working tree.  
Coordinator-assigned B1 digest: `3a8c0d24bfd8632b52d6ccd0fbc172bc2378106e025f3aa71784b24a0ae54739`.

Inspected bootstrap, AppHost, migration runner/service schemas, shared database configuration, readiness changes, generated bootstrap logging and provisioning tests. The digest manifest was not supplied for independent reconstruction.

**Security evidence**

- `DatabaseProvisioner.ReconcileAsync` validates required external passwords, uses fixed database/role names, quotes identifiers and escapes password literals with standard-conforming strings enabled. Catalog values and migration ledger values are parameterized.
- Service roles are reconciled as non-superusers without database/role creation, replication or bypass-RLS privileges. Existing memberships are revoked.
- PUBLIC database access and cross-service role grants are revoked. Each service role receives its own CONNECT grant; schema PUBLIC privileges are revoked. Applications owning their own database remains the documented local migration simplification.
- Administrator access remains confined to bootstrap. AppHost constructs API connections with the corresponding service username/password rather than passing its administrative connection.
- AppHost secrets use secret parameters with persistence enabled. PostgreSQL and RabbitMQ have explicit persistent volumes. Service passwords can be reconciled against an existing PostgreSQL volume.
- Bootstrap logging uses source-generated methods and reports only completion or exception type. Inspected application connections disable parameter logging and detailed provider errors.
- The migration runner serializes per-database migration application, checks applied SQL checksums and commits schema changes with ledger insertion. Cancellation-aware budgets bound operations.
- The initial Reservations schema contains the named partial GiST exclusion constraint, interval/status checks and unique reservation/event-type constraint. Inbox event identity is a primary key; timestamps and snapshot lengths have storage checks.
- Database-dependent readiness is separate from process liveness and broker worker readiness. APIs await successful bootstrap; booking/frontend startup no longer directly requires broker health.
- Existing loopback targets remain explicit. Actual final listener inspection is still required; configuration targets alone do not prove every listener’s bind address.

**Checks supplied by coordinator**

`npm run check`: exit 0; four tooling, six Angular, twenty-three backend and three real smoke tests; zero warnings or skips. Formatting, lint and diff checks passed.

Provisioning execution evidence reports persisted modified seeds across isolated-volume recreation, password reconciliation, denied cross-service/admin-database connections, no elevated role capabilities/memberships and own-credential-only API environments. The inspected provisioning test directly exercises role metadata, denied connections, preserved data and password reconciliation.

These are coordinator-supplied execution results, not checks run by this reviewer.

**Remaining verification**

Final T042 listener/mapping inspection, tracked-secret inspection, dependency audits and captured telemetry remain pending. Durable event validation, publisher/consumer recovery and booking/cancellation behavior are later batches. Inventory’s business endpoint migration to its persisted catalog is also later work; foundation approval does not establish endpoint persistence.

No files changed, application checks executed or intrusive probes performed. Re-review is required after affected source changes.
