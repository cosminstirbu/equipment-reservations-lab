Updated only plan, research, telemetry contract and quickstart for the authorized `.AddNpgsql()` delta. Pinned source confirms it delegates directly to `.AddSource("Npgsql")`; all privacy controls remain required.

Proposed tasks:

- **T028:** ServiceDefaults package 10.0.3, registration, affected lockfiles/docs.
- **T029:** Existing integration/privacy tests, registration-removal mutation and required checks.
- **T030:** Runtime evidence, independent delta reviews and convergence refresh.

Preserve T026’s human acceptance gate and historical review evidence. Exact-file formatting, reread and diff checks passed; hashes supplied to coordinator.
