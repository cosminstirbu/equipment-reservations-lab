# Manifest quality helper implementation

Owner A; T073 and T074 helper/wrapper scope; 2026-10-22. Baseline `9f5e592`
plus the approved manifest-quality preparation artifacts and T072 verdicts.
Owned changes are `scripts/manifest-quality.mjs`, its test file and this record.
No other worker's sources, requirements, checklist verdicts or task markers changed.

## Standards and test design

Applied the constitution and engineering testing, tooling, formatting, resilience
and privacy rules. Spec Kit prerequisites resolved feature 013 explicitly; all
requirements-quality checklists passed, including the six manifest-quality items.
The approved public seams are the real-Git classifier, trusted full-quality baseline
discovery, public CLI and static deployment validator. Tests retain production Git,
schema/state validation, rendering policy, promotion transformation and process
handling. GitHub HTTP doubles replace only authenticated REST transport and follow
workflow-run / attempt-specific job / job-step contracts from the design references.
Pure evidence/allowlist checks are justified deterministic validation algorithms.

Actual temporary Git repositories establish NUL-delimited status/path behavior,
rename endpoints, deletion, source backlog, missing objects and ancestry. The
explicit provider contract uses the real pinned kubectl against copies of the
repository's deploy tree, applying real promotion transformations for all seven
components. Its assertions concern actual policy outcomes, not snapshots of code or
internal call counts. Fixtures are isolated and removed after each test.

## Test-first record

Each new behavior below had an observed intended failure before its dependent
production change, then a focused passing run:

| Contract | Intended red | Green |
| --- | --- | --- |
| Allowlisted PR classifier | actual full/empty versus manifest/overlay path | Exact ten-path status/NUL classifier using real merge-base |
| Main full-quality comparison | full versus expected manifest | Trusted ancestor diff; unchecked source followed by metadata remains full |
| Full-quality authority | null versus verified ancestor evidence | Exact repository/ref/push/workflow/job/step/source proof; failed parent may qualify |
| Public selection CLI | empty stdout versus JSON selection | Controlled mode/paths/reason Actions outputs and scope file |
| Main HTTP adapter | full versus expected manifest with valid HTTP proof | Bounded readonly authenticated lookup and private full fallback |
| Static rendering | unavailable validation on valid initial fixture | Actual pinned render and real partial-state policy across initial/seven successive promotions/complete state; missing generator rejected |
| Public validation wrapper | unknown command on valid scope | Scoped formatter, committed-state validation and actual render/policy with machine-readable stdout |

Additional conservative-path and forged-proof tables verify existing implemented
behavior without dependent production changes. One Windows fixture initially used
a newline filename unsupported by that filesystem; it now uses spaces on Windows
and the newline case on Linux. That setup error is not counted as a qualifying red.
No historical test-first exception was used.

## Implementation and operational boundaries

`select --output PATH` runs with Node builtins before npm installation. It handles
PR merge-base and exact-main successful full-quality ancestry; manual, missing,
empty, mixed, unknown and unproven comparisons choose full quality. Both rename/copy
endpoints must be allowlisted. Main does not use event.before or component publication
baselines. Static-success jobs lack the fixed successful full-completion marker and
therefore cannot advance this baseline.

The narrow readonly GitHub adapter uses 15-second request deadlines, two transient
read retries with exponential backoff/jitter, a 60-second total budget, ten pages of
100 runs, bounded job completeness and a 2MiB response limit. It has no write API,
receipt/archive subsystem or circuit breaker. Unknown evidence selects full quality.
Authenticated payloads/errors remain private; only fixed classification projections
leave the helper. A small dedicated adapter is needed because importing the existing
component module before npm installation would load XML package dependencies.

`validate --selection PATH --kubectl ABSOLUTE_PATH` rejects non-manifest, malformed,
duplicate or outside-allowlist scope. Existing eligible files pass through the
repository's actual quality formatter helper; deleted files have no formatting
target. An all-deleted selection does not invoke a default whole-repo formatter.
Formatter success output is deliberately captured to preserve JSON stdout, with the
shared bounded public failure diagnostics. Symlinked public paths remain rejected.

The wrapper dynamically loads the current production component-state validator only
after root dependencies are installed. `readComponentState` performs the committed
component/overlay/bootstrap/generator checks and passes its unchanged validated state
to owner B's static policy. Rendering uses the explicit pinned kubectl executable,
60 seconds and 16MiB, with bounded public process-failure evidence. No cluster,
application test/build, frontend/.NET setup, image operation or publication occurs.
Default runtime completeness policy is untouched. This is structural/current-policy
validation, not complete Kubernetes schema/admission/runtime compatibility proof.

## Checks and provider evidence

Windows explicit provider invocation:

```powershell
$env:MANIFEST_KUBECTL = Join-Path $env:TEMP 'equipment-kubectl-1.35.8/kubectl.exe'
node --test scripts/manifest-quality.test.mjs
```

Result: exit 0, **9 passed, zero failed/skipped**, 9.73 seconds. The pinned
kubectl 1.35.8 binary's SHA256, verified by the coordinator before use, is
`f675d70224b42b84e0442e8d7644efbe440e4451a4b02bdc5d95823a96316ba8`.
The real provider cases cover initial state, each of seven partial/complete updates,
an actual missing-generator Kustomize failure and the actual public CLI's formatter
plus render/policy path. They do not contact a cluster or registry.

Without `MANIFEST_KUBECTL`, the two named provider-contract tests explicitly skip;
ordinary tooling does not assume a host kubectl installation. Such a default run
alone does not satisfy required provider qualification. To run only those contracts:
`node --test --test-name-pattern='pinned Kustomize' scripts/manifest-quality.test.mjs`.

Scoped ESLint with zero warnings, Prettier verification and `git diff --check` all
exited 0. Exact-file formatting and rereading followed every source edit. Source is
frozen for combined checks and independent review. Coordinator owns full required
format/lint/application checks, reviewer verdicts, convergence and retained feature
qualification/acceptance obligations. No external mutation, workflow run, commit or
push was performed.
