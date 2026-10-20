# Independent quality review — repair batch 05

The following retention verdict is reproduced verbatim from `/root/quality`.

**Scoped retention repair: PASS; fixture defect closed.**

Verified unchanged source SHA256 `a651568fb307aaf77e9acd2cd88ac458d26423a4bbc6187d41f83c9bdf42a25e` and evidence SHA256 `00a22c269760e9be2aa07b0ec6c39e3a0e35e5517d74e176e5f4a3eea8b4c856`.

Actual provider evidence shows intended durability-settings RED followed by focused GREEN: 1/1 passed, zero skipped. Both containers reported `on,on,on`; forced same-volume replacement preserved the modified row, exact count, scoped privileges and original credentials.

This closes the confirmed non-durable fixture defect, without proving the historical hosted failure’s causal sequence. **Overall quality remains pending**: unrelated AMQP failures and full/hosted validation are unresolved.

Read-only review; no edits, builds, provider runs, commits or pushes.

## Permanent startup source review

The following report is reproduced verbatim from `/root/quality`.

**Round 5 startup source-quality verdict: PASS.** Failure closure and overall validation remain pending the Linux regression.

Verified hashes:

| Source | SHA256 |
|---|---|
| `ApplicationStartup.cs` | `c905da150fe57f26b34fab8197f9742907f03777b73a078704aaa4b1773b4373` |
| `IdentityHttpHarness.cs` | `6fd953e11e663f64d89662f9e9f8ed6dfd44e5e00093bef27221fa478cb8d328` |
| `PostgresFixture.cs` | `8a5bc6a30ac94ae37d5541637ae58bf6db87becfed8fee4082eee29aa2c6b650` |

No new blocking code finding. The implementation matches the revised design: one process-wide four-slot admission gate, cancellation-aware 60-second acquisition, dedicated framework startup, original unwrapped-task completion before lease release, and unchanged database admission. Identity startup disposes a partial application on failure. Only the two identified startup boundaries change; application security, assertions, request budgets and native test scheduling remain intact.

Approved revised design for the review record:

> Actual managed stacks identify parallel Data Protection startup waits on work queued to the shared process ThreadPool. Use one shared TestSupport startup-admission helper with four slots and a 60-second cancellation-aware acquisition bound. Execute the real startup delegate through `Task.Factory.StartNew` with `LongRunning` and `TaskScheduler.Default`, preserving ExecutionContext flow, and await its original unwrapped task. Hold the lease until startup completes or fails; release exactly once in finally. Do not abandon running startup on cancellation. Route only IdentityHttpHarness application startup and the existing PostgresFixture initial factory-client boundary through it. Remove the superseded per-fixture host gate, retain the separate database gate, and leave requests, assertions, services, security configuration, budgets and module/method parallelism unchanged. Validate against the actual unchanged full-scheduler regression; retain prior failed experiments and avoid claiming an unobserved cause.

Retention source remains unchanged at previously approved SHA256 `a651568fb307aaf77e9acd2cd88ac458d26423a4bbc6187d41f83c9bdf42a25e`.

I remain read-only; the coordinator should materialize this report in `ci-quality-review-05.md`. No edits, builds, providers, commits or pushes were performed.

## Final static API correction

The following report is reproduced verbatim from `/root/quality`.

**Final startup source-quality verdict: PASS**, including the static API correction.

Verified hashes:

- `PostgresFixture.cs`: `b5ec7b1062330b2323ce9d82dec680563254700a69fa67365901d376cc9bbf7b`
- `BookingScenario.cs`: `11608f5cf56237da9520f8d03b409ae029af3ba7675aad380d0081462d915e47`
- `ServiceIdentityTests.cs`: `2c3d79de1fdc7d6a7b8a53088675d6f7cc24e790b43769ee8e76715d4756cbca`

The correction makes the stateless startup method static and updates its callers. Assertions, configuration, cleanup and application behavior remain unchanged. `ApplicationStartup.cs` and `IdentityHttpHarness.cs` match their previously reviewed hashes.

No new blocking code finding. Linux regression and final aggregate checks remain pending before failure closure.

Read-only inspection only; no edits, builds, providers, commits or pushes.

## Causal regression evidence

The following report is reproduced verbatim from `/root/quality`.

**Scoped causal startup regression: PASS.**

The evidence combines an actual unchanged Linux failure, managed stacks identifying 34 workers blocked in Data Protection startup, and a same-command repaired comparison passing **564/564 tests, zero skipped**, in 3m01.998s.

Recorded setup timings improved without moving the stall into administrator connections: the previously failing operations completed in approximately 191/202ms; all 391 administrator creations and 376 migration/open operations completed without failure. Cleanup completed.

This supports closure of the reproduced startup-starvation defect for the reviewed source. It does **not** establish the cause or independent resolution of the historical HTTP 503, nor hosted AMD64 equivalence.

Final uninstrumented repository checks and hosted validation remain pending. No edits, builds or provider commands run.

## Final local validation

The following report is reproduced verbatim from `/root/quality`.

**Round 5 scoped local-repair validation: PASS.**

All six reviewed source hashes remain unchanged. Final uninstrumented checks passed:

- Formatting and lint; build with zero warnings/errors.
- 24 tooling, 64 frontend and **564 backend tests**, zero failures/skips.
- Backend duration: 3m23.166s with all nine modules.

The reproduced startup-starvation defect and non-durable retention fixture have supporting repairs and validation. No unresolved blocking code finding remains in this local repair scope.

The historical HTTP 503 remains unproven as a distinct cause, and hosted validation is pending. This is not overall feature acceptance.

Read-only verification only; no edits, builds, provider runs, commits or pushes.
