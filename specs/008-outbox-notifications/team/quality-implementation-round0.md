**Verdict: changes_requested**

Reviewed frozen source/design snapshot `164c3c3f56995c5dfe2fe0f90271e02c6a427891c74e60f7e64efa46e38564ed` against feature 008 requirements, approved design, tasks, constitution and applicable standards. No concrete production correctness defect identified; two required acceptance scenarios lack sufficient regression evidence.

| ID | Category | Severity | Blocking | Evidence | Required remediation |
|---|---|---|---|---|---|
| Q008-001 | code / test coverage | medium | Yes | `OutboxNotificationTests.cs:61–85` covers ordinary idle notification and insertion during gated publication. It does not control insertion after the final empty scan but before waiting. FR-002, Story 1 scenario 3, SC-003 and T005 explicitly include that transition. | Add a public-lifecycle test controlling the idle scheduling boundary. Commit while the worker is between empty selection and notification waiting; release the boundary and demonstrate publication without advancing fallback. Retain real listener/database and avoid private-state hooks. |
| Q008-002 | code / observability coverage | medium | Yes | `OutboxNotificationTelemetryTests.cs` verifies successful listening/notification and permanent setup failure. Transient recovery/degraded-poll tests use `NullLogger` without telemetry capture. Consequently, unavailable→recovered transitions and degraded polling signals required by FR-011, Story 3 scenario 4, SC-005 and T018 lack actual exported evidence. | Exercise real listener interruption and recovery through production telemetry registration. Assert unavailable/recovered transitions, degraded polling wake cause, useful safe recovery tracing/log signals, and privacy. Do not fabricate provider exceptions or add missing instrumentation only in tests. |

Production review covered trigger transaction semantics and migration admission; separate listener/processing connections; LISTEN-before-scan ordering; capacity-one signal handling; strict-future retry discovery and locked-row behavior; sequential claiming; independent publication/reconnect backoff; terminal cancellation; bounded explicit UNLISTEN cleanup; stable event identity; and telemetry cardinality/privacy. These paths appear consistent with the approved design.

Tests retain real worker, listener, PostgreSQL migrations, SQL, serialization and production dependency instrumentation. Publisher doubles operate at the declared external boundary; retained broker contracts supply provider fidelity. Recorded red/green evidence and the `.AddNpgsql()` mutation check were inspected. The two retained recovery expectation changes correctly update healthy idle cadence while preserving failure backoff.

Evidence inspected: focused 20-test green, recorded 127.4 ms latency upper bound, format-check/lint passes, native SQL accounting, dependency error sanitization and cleanup export. Full `npm run check`, manual Aspire trace inspection, latest convergence and human acceptance were pending at review time; these are pending gates, not additional code findings.

Manifest verification: every frozen source, test and design hash matches. Only `tasks.md` changed as coordinator metadata. `git diff --check` passed. Changed files: none.

Re-review the two repaired tests and revision-matched verification results before closing Q008-001 and Q008-002.
