**Design review: pass** — snapshot `prep-design-round0`, feature `specs/008-outbox-notifications`.

Reviewed `plan.md`, `research.md`, `data-model.md`, `contracts/notifications.md`, and `quickstart.md` against FR-001–FR-012, SC-001–SC-005, CHK001–CHK012, constitution 1.1.1, and applicable engineering standards.

No findings. Design addresses commit-only signals, startup/reconnect races, coalescing and sleep transitions, retry deadlines without peer-lock spinning, independent failure backoff, bounded reconnect attempts, permanent-failure propagation, cancellation, rolling compatibility, and additional connection limits. Test design retains real production collaborators and providers, requires red evidence, accounts for added SQL operations, and separates deterministic scheduling evidence from observed latency. Dependency tracing uses official instrumentation with explicit privacy admission and production-registration verification.

Selected lifecycle and tracing APIs agree with official [PostgreSQL LISTEN](https://www.postgresql.org/docs/18/sql-listen.html), [Npgsql notification waiting](https://www.npgsql.org/doc/wait.html), and [Npgsql tracing](https://www.npgsql.org/doc/diagnostics/tracing.html) documentation.

Checks: read-only artifact consistency/readability review; `git diff --check` passed. Changed files: none. Unresolved questions: none. This verdict approves preparation design; tasks analysis, implementation verification, runtime checks, and human acceptance remain pending.
