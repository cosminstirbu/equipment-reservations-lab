# Component selection and retained evidence implementation

Owner A; tasks T062/T063; 2026-10-22. Baseline `424a670` plus
`component-preparation-01` and coordinator-approved rerun/immutable-selection
preparation addenda. Scope: `scripts/component-pipelines.mjs`,
`scripts/component-selection.test.mjs`, and this record. No external mutations,
publication, dispatch, commit or push were performed.

## Public contracts and test design

The production public seam is `selectComponents`, `discoverBaselines`,
`validateRunIntent`, `validatePublicationEvidence`, `readArtifactJson`,
`createEvidenceGateway`, and the component pipeline command entry point.
`validateComponentRelease`/`verifyComponentIndex` remain real owner-B collaborators.
Real temporary Git repositories establish source diffs, merge-base, ancestry,
project reference closure, rename endpoints and missing objects. Existing pinned
XML tooling parses project XML; unknown graphs conservatively rebuild everything.
Deterministic schema/selection tests are justified solitary parser/algorithm tests,
not substitutes for provider or application integration tests.

HTTP doubles replace only GitHub REST transport. Their responses use the run,
attempt-specific jobs, artifact metadata, Git ref and content shapes specified in
the design's primary GitHub API references. Real Response streams exercise body
parsing and payload bounds; actual ZIP archives generated and consumed by Python
standard-library zipfile exercise the fixed-member contract. No arbitrary archive
tree is extracted. Real child-process CLI tests observe JSON, exit code and safe
stderr. The fixtures do not claim that live Actions, GHCR or permissions work.

Git reads and authenticated API responses are captured privately. Only validated
component decisions and fixed failure projections leave the module. API reads have
15-second request limits, two transient read retries with exponential backoff and
jitter, a 60-second overall gateway budget, and bounded body reads. Lookup is capped
at ten pages of 100 artifacts. Permanent read failures never become trusted skip
evidence. No API write, generic write retry or circuit breaker is introduced.

## Test-first evidence

Every changed behavior below had an observed intended failing assertion before its
dependent production edit, followed by a focused green run. Initial conservative
all-components scaffold was approved as runnable seam setup by coordinator and
original verifier. A discarded missing-module fallback was removed before the
qualifying real-module red; that discarded run is not counted as evidence.

| Slice | Observed intended red | Green behavior |
| --- | --- | --- |
| Web selection | actual all seven versus expected Web | Web-only selection against component baselines |
| Transitive closure | actual empty versus expected two APIs/database bootstrap | Candidate and baseline ProjectReference closure |
| Shared/unknown inputs | global.json actual empty versus all | Shared configuration/pipeline inputs rebuild; known documentation/deployment references do not |
| Rename | actual empty versus Inventory/database bootstrap | NUL-delimited no-renames diff retains both endpoints |
| Publication authority | missing expected exception for failed producer | Exact repository/component/ref/SHA/run/attempt/artifact/job checks; successful component inside failed parent accepted |
| Intent schema | missing expected exception for missing target | Explicit targets/proposals, trusted context and component/repository binding |
| Baseline discovery | actual empty baseline versus genuine Inventory ancestor | Independent successful component baseline, preserving failed siblings |
| ZIP reader | actual empty object versus fixed member JSON | Exactly one regular fixed-name member, 64KiB JSON/256KiB ZIP limits, available digest verification, no extraction |
| Evidence HTTP | missing API total_count | Bounded transport parsing and private error projections |
| Actual archive/API adapter | empty baseline versus verified artifact baseline | Real ZIP consumption and attempt-specific job/run API shapes |
| Manual CLI | empty stdout versus required JSON | All components plus GitHub output booleans |
| Capture | unsupported command / invalid target snapshot | Immutable target/proposal capture from exact remote records |
| Original intent reuse | fresh-run failure despite retained valid intent | Exact original attempt reused without target recapture |
| Initial result | unsupported command | No retained result permits first build |
| Failed producer retry | fresh-run failure despite verified failed producer | Bounded prior unsuccessful producer history permits retry; successful/missing/unknown history fails closed |
| Successful result reuse | fresh-run failure despite valid same-run result | Exact successful result retained; ambiguity, wrong source/run fail closed |
| Retained selection | schema rejection and all seven versus original Inventory | Canonical selected array and full-rerun reuse, including original empty set |
| Unknown source/graph | empty versus all for unmapped source | Conservative all-component fallback for unknown source, imports or malformed XML |
| Non-reference wildcard | all seven versus Web for EmbeddedResource wildcard | Ordinary embedded resources do not make ProjectReference graph uncertain |
| Verified never started | fresh-run failure despite complete original intent/history | Only completed failed/canceled exact attempts with complete listings and original selection permit build; incomplete/unknown/successful history fails |
| Creation size | missing expected rejection | Retained JSON creation refuses over 64KiB before write |
| Unexpected CLI failure | stderr undefined versus safe phase | Safe phase/fallback without filesystem marker disclosure |
| Removed reference/self-closing Project | all seven versus old dependency consumers | Valid self-closing project retains baseline dependency impact |

The PR merge-base/backlog/nonancestor cases were added as verification of existing
implemented behavior and passed without dependent production changes. An initial
rename fixture lacked its destination directory; that setup failure was repaired
before the qualifying empty-selection assertion above.

## CLI integration

`select --output PATH` writes optional public selection JSON and emits `selected`
plus component booleans using underscores. On later trusted attempts it uses the
original immutable selected set, not new successful-baseline discovery.
`intent --selection PATH --output PATH` captures attempt-one intent and emits
`created=true`; later attempts verify/reuse the original intent and emit false.
`load-intent --output PATH` requires original run evidence.
`load-result --component NAME --output PATH` emits `available=true` for verified
same-run successful results, false for first builds or proven prior unsuccessful /
never-started producers. Required expired/missing/ambiguous successful evidence or
incomplete history produces fresh-dispatch guidance.

Fixed artifact members are `run-intent.json` and `component-result.json`; artifact
names are `run-intent-RUNID` and `component-NAME-RUNID-ATTEMPT`. Actual expected job
identities are `Select components` and `Publish NAME`, including valid reusable-job
prefixes. The intent contains all seven explicit target/proposal entries and the
canonical original selected subset. Component records use nested repository id/name.

## Verification and limitations

- `node --test scripts/component-selection.test.mjs`: exit 0, **24 passed, 0
  failed/skipped**, 45.69 seconds, Windows Node/Python 3.14.4.
- `npx.cmd eslint scripts/component-pipelines.mjs scripts/component-selection.test.mjs --max-warnings 0`:
  exit 0.
- `npx.cmd prettier --check scripts/component-pipelines.mjs scripts/component-selection.test.mjs`:
  exit 0.
- `git diff --check -- scripts/component-pipelines.mjs scripts/component-selection.test.mjs`:
  exit 0.
- Every source edit was formatted with the exact-file npm formatter, then reread.

Coordinator owns combined format-check/lint/application/deployment verification and
independent quality/security verdicts. Live provider behavior and full feature
runtime/human acceptance remain pending; this report does not approve those gates.
Source is frozen for combined review. No task/checklist verdict was self-approved.

## Implementation repair round 1: CP-Q002 and CP-Q003

Coordinator authorized this bounded repair against frozen source 01 and the original
quality review. No requirements, checklists, task verdicts or other owners' files
were changed.

CP-Q002: two separate real-public-command regressions for prior failed and prior
successful producers both failed with **missing expected rejection** before the
production fix. Each covers missing original artifact, mismatched original identity,
and a valid original intent that did not select the component. The assertions also
prove that rejected intent prevents consuming the downstream result provider.
`load-result` now verifies original intent and component selection for every later
attempt before branching into retry or retained-result reuse. Existing valid retry
and success fixtures now provide complete original-intent run/artifact/job evidence;
the ambiguity test preserves that valid intent so it still tests result ambiguity.
The verified-never-started proof remains enforced. Five focused recovery tests passed.

CP-Q003: two real temporary-Git regressions establish a BrokerBootstrap project
linking `../Inventory/Program.cs` via Compile and EmbeddedResource at the baseline,
then modify that linked source. Both failed before the fix: selection contained only
Inventory and DatabaseBootstrap, omitting BrokerBootstrap. Project XML traversal now
treats parent-traversing, absolute, property-dependent or entity/multi-item linked
Compile/EmbeddedResource paths as uncertain and conservatively selects all images.
Ordinary in-project resource wildcards remain supported. Four focused graph tests
passed, including the original normal EmbeddedResource wildcard and transitive cases.

Fresh Windows verification on repaired source:

- `node --test scripts/component-selection.test.mjs`: exit 0, **28/28 passed,
  zero skipped**, 45.22 seconds.
- Scoped ESLint with zero warnings: exit 0.
- Scoped Prettier verification: exit 0.
- Scoped `git diff --check`: exit 0.

Files are frozen again for coordinator snapshot/checks and original reviewers'
closure assessment. These changes do not self-close the findings.
