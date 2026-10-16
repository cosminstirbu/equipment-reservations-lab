# Coordinator browser workflow evidence

Date: 2026-10-15. Scope: coordinator-owned `scripts/admin-console-browser.mjs`; coder owns isolated AppHost fixture and invocation after effective binding gates.

- Rabbit branch: exact-file formatter, Node syntax and ESLint checks passed. Coder's opt-in isolated runtime invocation passed real login, queue/exchange/binding creation/inspection, publication, get/message inspection, purge, live consumer inspection and fixture cleanup. Canonical detailed runtime evidence remains in implementation-evidence.md.
- pgAdmin selector discovery: after coder reported first-start proxy/backing loopback and non-loopback gate pass, coordinator opened isolated `http://127.0.0.1:57551` through native Edge computer use. No login, server-registration or credential entry was required. The registered postgres server showed inventory, notifications, postgres and reservations.
- Selected inventory, opened Query Tool, executed `SELECT current_database(), current_user, table_name FROM information_schema.tables WHERE table_schema='public' LIMIT 3;`. Visible result rows showed inventory / postgres / schema_migrations and inventory / postgres / equipment. Expanded Schemas / public / Tables and observed equipment and schema_migrations in the object explorer.
- Closed only the temporary inspection tab. No credentials, screenshots, traces, raw container environment, generated registration file or page dumps retained in repository evidence.
- Temporary bounded selector-discovery branch was removed from the final script. It intentionally was not passing workflow evidence.
- Final postgres branch (awaiting runtime execution) covers existing table browsing/query, administrator identity, unique schema/table creation, insert/update/delete/drop and visible outcome checks in all three databases. Coder will execute it before and after pgAdmin recreation. Exact-file formatter, Node syntax and ESLint pass.

Manual discovery above proves only the recorded inventory read workflow on the intermediate source. Final acceptance evidence must use final scripted workflow results and current source hashes; it must not substitute this intermediate observation for final three-database mutation/recreation evidence.
