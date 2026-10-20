# Identity and retention repair batch 05

Baseline: main `94081ed2da5bf8003aeb9314afdb124e2d972d44`.
Owner requested “Fix both tests” after release attempt 1, then supplied attempts 2
and 3 while the repair was active. This is one bounded batch resumed from the
persisted intervention state. Earlier rounds and their approvals remain historical.

## Hosted observations

Release run 39429285803, same source revision:

- Attempt 1, job 118649972865: 562/564 passed. Single-flight initial availability
  returned 503 instead of 200. The Inventory authorization theory failed opening
  the new scenario database's first migration connection, before HTTP assertions.
- Attempt 2, job 118654005981: 563/564 passed. IdentityAccess passed. Database
  retention found zero matching edited camera rows after forced container replacement.
- Attempt 3, job 118658568114: 560/564 passed. Stalled token acquisition exceeded
  its outer five-second wait; one reservation migration first connection and two
  administrator first connections timed out during scenario setup.

Image build/push steps were skipped in all three attempts. Moving failures are not
evidence that retries fix the underlying problem. The final preceding PR quality
run 39428221191 passed, with deployment intentionally skipped.

## Diagnosis and test design

Retain public HTTP/provider assertions, actual migrations, isolated PostgreSQL,
faithful external HTTP handlers, production timeout budgets and native module/test
scheduling. Temporary diagnostics use fixed phase names, opaque operation IDs,
elapsed times, bounded numeric worker/CPU counters and allowlisted failure types.
Private files are created with mode 0600 inside a coordinator-owned 0700 directory.
Original source bytes are saved for exact restoration before final validation.

The retention regression checks the real provider's effective fsync,
full_page_writes and synchronous_commit settings before the edit and after replacement.
These are prerequisites for its existing forced-replacement durability claim, rather
than implementation details of the production provisioner. Existing role isolation,
password preservation, edited-row and exact seed-count assertions remain intact.

## Local evidence so far

- Rebuilt baseline ServiceIdentityTests: 21/21 passed, zero skipped. This does not
  reproduce or close a hosted failure.
- Initial temporary diagnostic build failed IDE0007 and CA1416 before tests. Those
  errors were corrected explicitly; they are not intended behavioral RED evidence.
- Full native application check with temporary diagnostics: formatting, lint, 24
  tooling and 64 frontend tests passed. Backend 559/564 passed, zero skipped,
  3m26.142s. One intended retention prerequisite RED was expected on,on,on versus
  actual off,off,off. Four separate Notifications AMQP restart/reset failures remain
  unresolved and must not be reported as passing checks.
- HTTP single-flight capture returned eight 200 responses. Token gate entry to
  release was under one millisecond. PostgreSQL captures recorded 255 successful
  database creations and 241 successful migration phases, no captured failures;
  longest migration/open phase 553ms. These successful observations do not identify
  the hosted cause.

Independent security review raised SEC-DIAG-005: temporary PostgreSQL diagnostic
write errors must be sanitized and must not bypass gate cleanup if retained for
another capture. Exact removal before handoff is also a valid closure.

## Causal startup evidence and repair

The correctly configured private Linux full-nine-module comparison under an actual
four-CPU SDK quota reproduced two first-migration-open failures: 562/564 passed,
zero skipped. Administrator database creation took about 109–111ms; affected first
opens consumed 13.5–16.4 seconds of wall time while queued work grew. This is native
arm64 with sibling provider containers on a six-CPU Podman VM, not hosted amd64.

A WAF-only dedicated-thread experiment passed but moved 12–15 seconds of delay into
administrator setup. It was rejected as a causal repair. A subsequent stack-only
capture found 34 workers blocked in Data Protection key-ring startup, reached through
IdentityHttpHarness. Framework key-ring refresh queues work to the same pool before
synchronously waiting. The profiler run's green result is not timing evidence.

The permanent repair uses one shared four-slot startup gate and dedicated startup
threads for both standalone harness and WAF initialization. It awaits the original
startup task through completion, releases capacity in finally and disposes failed
partial harness applications. Requests and test methods retain native scheduling;
real authentication, Data Protection, signing, SQL and application budgets remain.
Temporary HTTP and PG instrumentation has been removed from repository source.

The retention fixture now asserts and enables actual PostgreSQL durability settings
for both same-volume container incarnations. Focused forced-replacement verification
passed 1/1 with zero skips. Independent quality/security retention reviews passed.

The historical HTTP 503 has not independently reproduced locally; do not claim its
particular boundary was proven. Current-source Linux regression, full repository
checks and final independent source reviews remain pending. No commit or push is
authorized; no new-source hosted pass can be established without publishing changes.


## Final same-command Linux comparison

The first candidate compilation stopped before tests with CA1822: after moving
startup admission to shared state, CreateClientAsync was stateless. It was made
static and its twelve callers updated; no assertion changed. Exact-file formatting,
readback and renewed independent quality/security source reviews passed.

The final pinned Linux SDK comparison, without profiler, passed **564/564 tests,
zero failures/skips, 3m01.998s** with warnings-as-errors compilation. Actual SDK
cgroup quota remained four CPUs and the original nine-module scheduler was used.
Private provider ownership-label cleanup completed without errors.

All captured 391 administrator creations and 376 migration phases completed without
failure. Within IdentityAccess's 25 scenarios, maximum observed worker count fell
from 59 to 14 and pending work from 299 to 82. Administrator setup maximum was
543ms, rather than the rejected WAF-only candidate's approximately15-second stall;
migration/open maximum was 1756ms. Early operations3/5 completed migration/open in
191/202ms instead of the baseline's16.4/13.5-second failures. This supports closure
of the reproduced startup-starvation defect, beyond a single green aggregate.

Final repository format-check passed. Lint and full native repository check remain
in progress. Historical HTTP503 and hostedamd64 recovery remain unproven pending
external validation of these uncommitted changes.

## Author compliance inspection

Applicable constitution and engineering guides: formatting/static analysis, testing,
ASP.NET Core, resilience and observability. The test-design records distinguish real
provider behavior from harness scheduling; initial failed behavior and source hashes
are preserved. No retries, application timeout increases, assertion removals, global
ThreadPool tuning, authentication substitutions or test-method serialization were
introduced. Dedicated startup capacity is process-scoped; original asynchronous
completion owns the lease through failure/success. Test cancellation reaches admission
and standalone host startup; synchronous WAF startup is not falsely described as
interruptible. Existing factories/scenarios retain disposal ownership. Durability
settings are asserted on both actual container incarnations. No diagnostic body,
credential, raw exception or capture file remains in source. Native scheduling and
real PostgreSQL/HTTP/security behavior remain exercised. Final static call-site edits
change only qualification, and source reviewers rechecked their exact hashes.

No workflow or deployment guard changes are included. No commit, push, merge or
image publication was performed in this repair batch. Existing full-feature runtime,
release and human acceptance gates remain represented by ten pending tasks.

## Final uninstrumented repository checks

All final source hashes match the independent source reviews, including the static
API correction. Temporary diagnostics are absent from the repository.

- `npm run format-check`: exit0, passed.
- `npm run lint`: exit0, zero build warnings/errors and style verification passed.
- `npm run check`: exit0; 24 tooling,64 frontend,564 backend tests passed, zero
  failures/skips; backend duration3m23.166s. All nine modules ran in the native
  scheduler with actual Podman providers. Earlier AMQP failures did not recur in
  this run; no AMQP fix or assertion weakening was introduced.
- Same-command Linux causal comparison:564/564 passed, zero skips,3m01.998s.
- `git diff --check`: passed.

Private logs: `/private/tmp/equipment-round05-final-format.log`,
`/private/tmp/equipment-round05-final-lint.log`,
`/private/tmp/equipment-round05-final-check.log`.

The reproduced starvation and non-durable fixture defects have locally validated
repairs. The old HTTP503 cause is not independently established, and these results
are not a hostedamd64 pass. No commit/push is permitted; publication and a new-source
hosted workflow remain for the owner. Feature-level acceptance stays pending.

## Publication authorization

After local validation, the owner explicitly requested committing the fixes, pushing
the branch and creating a pull request to inspect hosted test results. This supersedes
the earlier no-commit/no-push constraint. Source hashes remain unchanged from review;
hosted results are pending and must not be inferred from the local pass.
