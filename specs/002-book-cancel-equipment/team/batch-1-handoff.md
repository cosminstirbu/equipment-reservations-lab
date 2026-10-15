Batch 1 T001–T009 implemented and frozen for independent review.

Snapshot: `3a8c0d24bfd8632b52d6ccd0fbc172bc2378106e025f3aa71784b24a0ae54739`. Hash covers 90 sorted source/config/test paths, concatenating each path, NUL and binary SHA-256 content digest.

Implemented:

- Pinned PostgreSQL 18.6, Npgsql 10.0.3, Aspire PostgreSQL 13.6.1 and Testcontainers PostgreSQL 4.16.0; restore and images verified.
- Transactional versioned migrations with checksum ledger and database advisory locking.
- Own-service schemas, deterministic equipment seeds, partial GiST reservation exclusion, outbox and persistent inbox tables.
- Privileged bootstrap reconciles distinct restricted roles, database grants and passwords; migrations execute using own-service credentials.
- AppHost persists generated external secrets and named database/broker volumes. APIs receive only own database credentials and wait for bootstrap completion.
- Database/Inventory readiness remains separate from broker/consumer health.
- Real PostgreSQL fixtures support legacy HTTP tests; hello contracts and broker topology remain intact.

Changed files: new `src/Persistence/*`, `src/DatabaseBootstrap/*`, each service’s `Migrations/001_initial.sql` and `ServiceMigrations.cs`; AppHost/service project configuration, lockfiles, startup/readiness code; backend migration/fixture/legacy tests; smoke provisioning/startup/hello tests; solution and task markers. Complete paths were supplied in tool evidence. No spec, plan or team-report edits.

Actual verification:

- `dotnet restore EquipmentReservation.slnx`: exit 0.
- `podman pull docker.io/library/postgres:18.6`: exit 0.
- `podman image inspect docker.io/library/rabbitmq:4.3.6 --format '{{.Id}}'`: exit 0.
- Migration red: filtered `MigrationTests`, with Podman socket and `TESTCONTAINERS_RYUK_DISABLED=true`: exit 1, five intended failures and one PostgreSQL-version prerequisite pass.
- Provisioning red: filtered `DatabaseProvisioningTests` with the same environment: exit 1, missing service-role authentication.
- Migration green: six passed. Provisioning green: passed.
- `npm run format-check`: exit 0.
- `npm run lint`: exit 0, zero warnings/errors.
- Final `npm run check`: exit 0; 4 tooling, 6 Angular, 23 backend and 3 real smoke tests; zero skips.
- `git diff --check`: exit 0.

Final smoke evidence includes actual PostgreSQL container recreation on the same isolated volume, preserved modified seed data, reconciled passwords, denied cross-database connections, restricted role attributes, API environment isolation and the real hello journey.

A readiness regression exposed password redaction when rebuilding a fixture connection from `NpgsqlDataSource.ConnectionString`. Registering the real fixture data source corrected it without weakening production security settings.

T002 provides database isolation and controlled clock. Randomness/delay controls remain explicitly staged with T029, as instructed. Booking APIs/UI, durable event workers, final README and broader acceptance work belong subsequent batches. No full-feature completion or reviewer approval claimed.
