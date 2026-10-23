# Independent component pipelines design

Current execution topology is amended by the owner-approved
[PR validation/main release split](../plan.md#pr-validation-and-main-release-split-2026-10-23).
That amendment supersedes this document's earlier PR multi-architecture build topology,
classifier placement and quality-only release/baseline gates; other contracts remain.

Current amendment: [direct component promotion](direct-component-promotion-design.md)
supersedes this historical design's generated PR/branch mutation and shared-image-file
instructions. Retain original preparation/review evidence at its original scope.

Date: 2026-10-22. Source baseline: `424a6701ac97206ecc0067e7ea41763fb3abc950`
on `main`. Requirements: FR-011–FR-013, FR-022–FR-024; AC-3.1–AC-3.7;
SC-010–SC-012. Supersedes the earlier all-image release/main-only promotion design
for current implementation; historical evidence and task IDs remain intact.

## Boundaries and workflow graph

One parent `.github/workflows/validate.yaml` handles pull requests, pushes to exact
main and manual repository-branch dispatch. Retire the duplicate release entrypoint
instead of running quality twice. Retain the disabled deployment verification job
under its existing exception; this change does not enable or remove its obligations.
Quality runs once, including existing full application checks, before selection or
any component work. A final summary uses `always()`, reports quality plus every
component's selected/skipped/success/failure outcome, succeeds for an empty affected
set only when quality/selection passed, and fails for required component failures.
Summary is feedback, not an all-success publication or promotion barrier.

Seven fixed reusable wrappers are `.github/workflows/component-NAME.yaml`, where
NAME is inventory, reservations, notifications, web, database-bootstrap,
identity-bootstrap or broker-bootstrap. Each trusted wrapper owns its build and
promotion dependency; its promotion waits only for that component. A common
`.github/workflows/component-build.yaml` owns repeated build mechanics. Reuse is
for real seven-component duplication, not a generic pipeline framework. Avoid a
matrix output aggregator or workflow_run privileged handoff. Independent component
failure never cancels siblings or prevents their promotions.

PR and trusted contexts have separate static call sites because permissions are
not dynamically interpolated. PR calls have contents:read, no package/repository
write, no login or publication/promotion secrets, and build both architectures
with cache-only output. Trusted callers may grant only the maximum needed across
their nested component pipeline; actual build jobs narrow to contents:read,
packages:write and actions:read, while promotion jobs narrow to contents:write,
pull-requests:write and actions:read. No secrets:inherit or personal token fallback.
Every new third-party action is pinned to a verified official commit SHA.

The approved graph uses seven PR calls directly to the readonly common build core,
with fixed component literals, and seven trusted calls to the seven component
wrappers. The common core declares no write permission and inherits its caller;
the trusted wrapper's build call explicitly narrows its envelope, and its separate
promotion job narrows independently. This distinction is required because
[runner permission validation](https://github.com/actions/runner/blob/main/src/Sdk/WorkflowParser/Conversion/PermissionsHelper.cs)
checks declared embedded permissions even when an if condition would skip a job.
Calling a write-declaring wrapper from a readonly PR path would fail validation.
Seven deployable component wrappers still each own build/promotion; PR validation
deliberately bypasses those privileged wrappers. Do not widen PR permissions.

Manual dispatch selects all seven on any nonempty refs/heads branch and can open
local-target component promotion PRs. Main pushes select affected components only.
Tags, pull_request_target and untrusted PR publication are rejected before Docker
or GitHub writes, including direct CLI misuse. Source is the immutable event SHA,
never a fresh branch checkout; sourceRef is recorded separately. A non-main proposal
does not deploy: only explicitly reviewed merge into target main enables Argo.
No preproduction environment or new API compatibility gate is introduced.

## Component impact and successful baselines

Implement a narrow `scripts/component-pipelines.mjs` seam for component catalog,
Git dependency/impact selection and trusted run/artifact metadata; keep build in
deployment-ci and promotion in promote-images. Resolve ProjectReference closure
from candidate AND baseline revisions, using Git object reads rather than mutable
filesystem guesses. Deleted/renamed references, invalid XML/paths, unsupported
imports or uncertain history select all components. Git diffs are NUL-delimited
and include both rename endpoints. Do not use only the previous push SHA.

Current concrete closure: all three APIs reference ApiDocumentation, IdentityAccess,
Persistence, ServiceDefaults and ReservationMessaging. DatabaseBootstrap references
all three APIs plus Persistence/ServiceDefaults; IdentityBootstrap references
IdentityAccess/ServiceDefaults; BrokerBootstrap references ServiceDefaults; and
ServiceDefaults references Persistence. Include transitive source, project and
lock files. Web includes src/Web and its npm lock/build inputs. Shared global SDK,
MSBuild/NuGet inputs, Dockerfiles and their ignore/context inputs, build/selection
scripts and pipeline configuration affect every relevant consumer. Conservatively
select all for unknown build-impact paths or uncertain graph interpretation.
Known documentation/deployment-reference-only changes can select none after a trusted
baseline, but cannot hide previously unpublished component build-input changes.

PR selection compares the merge-base with its base branch using the same catalog,
with no publication-baseline credentials. Main selects each component relative to
its own last trusted successful main publication. An earlier failed component
therefore remains selected even after later unrelated/docs-only changes. Baseline
namespaces bind exact repository, sourceRef and component; manual feature evidence
does not advance main baselines. A missing/expired baseline or nonancestor/force-push
history conservatively selects the component, or all if impact is uncertain.

Use finite Actions API lookup of run/artifact and exact component publication job
success, not parent workflow conclusion: siblings may fail. Bind schema, component,
repository ID/name, workflow identity, run ID, attempt, source SHA/ref and index
digest. Artifact filename alone, PR artifact, arbitrary latest run or artifact
presence is insufficient authority. Candidate baseline SHA must be an ancestor of
the current selected source. Limit lookup to 10 pages of 100 records and 60 seconds
total; exhaustion/absent evidence causes conservative rebuild, never false skip.
API requests use existing 15-second budgets and at most two transient read retries
with existing bounded backoff. No generic write retry or circuit breaker is needed.

## Results, reruns and expected-target capture

Each successful publication uploads a small public component result containing
schemaVersion, component, repository, sourceRevision, sourceRef, runId, runAttempt,
workflow identity, image, digest and linux/amd64+linux/arm64 index evidence. Do not
attach raw logs. Names include component/run/attempt; artifacts are immutable and
retention bounded. Validate the associated successful producer job through Actions
metadata. Keep the original successful same-run result on failed-job reruns even
if the overall run failed; never rebuild all seven to reconstruct a combined file.
On a later attempt, missing result is an error only when an earlier exact
component producer job succeeded: missing/expired evidence then requires a fresh
dispatch. If all prior producer attempts failed, were canceled or never reached
the build, no successful result exists to retain; return available=false and build
that component. Check producer-job history before making this distinction; absence
of a result alone cannot establish either outcome. Original run intent remains
required on every later attempt regardless of producer success. Wrong-run,
wrong-component, wrong-SHA and ambiguous cross-attempt artifacts fail closed.

After quality and before builds, record one immutable run intent with exact source,
an explicit top-level `selected` array in catalog order containing unique known
component names (empty permitted),
event/ref/repository and each component's expected target main record/digest
(including explicit absent), plus existing component proposal branch head and its
component record (both explicit absent when no proposal exists). Retain this original intent across reruns, including
full reruns of the original run. A rerun cannot silently recapture a newer target
and overwrite it with old source. Missing original intent on a later attempt fails
with fresh-dispatch instructions. The original selected set is also authoritative
on every later attempt. Do not
recompute selection from newer successful-publication baselines during a full rerun:
a component may already have published successfully while its promotion failed.
Recomputed selection could hide that component and prevent its pending promotion
from retrying. First attempt computes selection and then captures selection/target
intent once, after quality and before any component work. Later attempts load and
validate original intent first, then emit its exact selected set; no fresh baseline
selection or target capture replaces it. A/C CLI ordering must enforce this sequence.
Artifacts are a bounded durable evidence mechanism. Retention loss yields rebuild
for baseline lookup, but failure for required rerun
intent/results. These are distinct decisions. Consume only fixed small JSON members
from verified artifacts; cap metadata at 64KiB, forbid unexpected archive paths,
symlinks and ambiguous entries, and never extract arbitrary archive trees. Use the
runner's Python 3 standard-library zipfile through a bounded process call, not a new
homegrown ZIP parser: archive <=256KiB, exactly one regular fixed-name JSON member
(component-result.json or run-intent.json), uncompressed member <=64KiB, no encrypted
member, no extraction to disk. Verify available API artifact digest before reading.

## Independent deployment records and promotion

Replace the global release.json contract with
`deploy/environments/local/releases/NAME.json`, one public component record containing
schemaVersion, component, image, digest, sourceRevision, sourceRef and verified run
provenance. Exact 40-hex source SHA and valid OCI index digest remain mandatory.
An internal assembled map may help complete-demo validation but is never an all-image
publication artifact or promotion prerequisite. No fabricated first release exists.

Initial zero/partial records are valid committed unreleased/partially released states.
Overlay images must equal exactly the available genuine records; missing components
stay unresolved explicitly. Local setup/smoke/runtime rendering must fail with missing
component names before cluster mutation until all seven exist. This preserves complete
demo acceptance while allowing the first independent component PR. Reject unknown
components, malformed records, mismatched overlays and symlinked metadata. Migrate
consumers/tests/quickstart together; legacy global data may be converted only if real,
validated and provenance-preserving, never synthesized. Current baseline has no
release.json or image references to migrate.

Each component uses branch `automation/local-image-promotion-NAME` and its own PR.
Allow changes only to its NAME.json, its overlay image entry, and its corresponding
Job suffix when NAME is database-bootstrap or identity-bootstrap. Derive each Job
identity from its own bootstrap component record plus the existing public base/local
configuration and Job template with the existing canonical/framed SHA256 algorithm;
other component promotion must not alter that suffix. Configuration refresh updates
only genuine affected bootstrap records; missing records remain safely unreleased.

At promotion time, reread fresh target main and managed component branch snapshots.
Separate candidate source SHA/ref from target parent: manual feature code need not
be an ancestor of main. Validate the retained intent's expected component target
against current target AND the captured managed proposal head/record; a changed
proposal after capture rejects instead of silently refreshing its precondition.
A proposal present at capture may be refreshed when its captured head still matches
and same-lineage freshness/human-edit checks pass. No-op if the same digest is already
deployed. Reject a changed same-component record/digest or obsolete candidate on the
same lineage; a new manual dispatch may intentionally override a different lineage
only with fresh expected-target intent. Old reruns cannot refresh that authority.
Preserve other components and unrelated target-main commits by generating the exact
component patch from fresh target blobs, not stale candidate checkout files.

Retain managed-branch/human-edit rejection and commit/tree allowlists; reread remote
parent refs immediately before mutation and use non-force compare-and-swap. Refresh
a managed same-component PR only if expected source/target and permitted fields still
match; otherwise fail with review/fresh-run guidance. Promotion jobs serialize remote
mutation with one global promotion concurrency group using explicit `queue: max`
and `cancel-in-progress: false`; image builds
run in parallel with no global whole-release serialization. A target ref race fails
clearly rather than retrying writes blindly. An unrelated main advancement may be
rebased safely from fresh snapshots when the captured component target still matches;
do not reject solely because target main moved. Successful proposals survive a sibling
failure. No merge, dispatch, push or publication is performed in this implementation.

CP-S001 repair: [current GitHub concurrency semantics](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency)
allow only one pending job by default even when running-job cancellation is false.
`queue: max` retains up to 100 pending promotions, preventing seven sibling jobs
from replacing one another. Queue overflow cancels additional jobs; the always-run
summary must treat any selected component's canceled/missing promotion as a visible
failure with rerun/fresh-run guidance, never a successful skip. Queue waiting order
does not prove source freshness, so existing intent/CAS controls remain required.
Do not combine queue:max with cancel-in-progress:true. Tests must assert all seven
promotion definitions carry both required fields and canceled selected outcomes fail
the summary. Workflow semantic validation must support queue:max; an older actionlint
schema rejection is a tooling compatibility issue to resolve or report, not permission
to delete the queue policy.

## Test design and evidence

Extend existing deployment-ci, deployment-validation and promote-images suites and add
`scripts/component-pipelines.test.mjs` for the new public selection/metadata seam.
Capture intended red evidence before each changed contract; historical EX-013-003
does not authorize test-after implementation for this work. Retain production Git,
parsing, validation, build planning and transformation collaborators. Real temporary
Git repositories exercise dependency closure, deletion/rename, baseline ancestry,
failed component followed by docs-only main change, divergent refs and empty selection.
Pure deterministic schema/impact algorithms justify solitary tests because parsing
and conservative selection are the behavior; avoid internal call-count assertions.

Docker subprocess shims replace only external build/index operations under the existing
metadata/index JSON provider contract. Public CLI tests prove seven individual build
selection, two platforms, PR no push/login, event/ref guards and exact source records.
Workflow parsing and real Bash step execution establish job dependencies/summary,
static read/write permissions and no matrix aggregation; they do not prove live Actions.
Run available pinned actionlint or equivalent actual workflow schema/semantic validation
for reusable inputs/outputs, needs and permissions; record tool version/checksum and
unavailability honestly. Plain YAML syntax checks alone do not establish workflow validity.
Use narrow GitHub HTTP fixtures following the documented run/job/artifact/Git/PR API
schemas and a faithful fixed-member artifact archive. Verify identity mismatches,
expired/missing/ambiguous artifacts, successful job inside failed parent and reruns.
Include failed-image rerun with legitimately absent result rebuilding, versus successful
producer with missing retained evidence failing for fresh dispatch; both still reject
missing original intent on later attempts.
Also cover a full rerun after successful publication/failed promotion: newer baseline
evidence would now select none, but original intent keeps the component selected,
reuses its successful result and retries promotion. Reject duplicate/unknown/out-of-order
selected values and retain an originally empty selection without recalculating it.
Existing provider contract probes remain; no new compatibility environment/test gate.

Promotion tests keep real transformation/allowlists and fixture transport only at
GitHub boundary. Cover partial first component, identical deployed no-op, sibling
failure independence, unrelated preserved component, manual divergent source proposal,
newer same-lineage rejection, stale rerun intent, target/proposal race, human edits and
fresh reconstruction after unrelated main advance. Assert actual resulting component
files/PR effects and zero unauthorized writes. Extend lifecycle/manifest tests to prove
partial state fails before mutation and complete state preserves runtime validation.

Run focused Node suites, source formatting after each edit, full format-check/lint,
existing required application/deployment checks where prerequisites exist. Record
snapshot, environment, commands, exits and missing prerequisites; independent reviewers
inspect output safety, trust/provenance and transitive impact manually. Keep provider
responses, tokens, errors/causes and authenticated URLs private; use existing process
helper and safe GitHub projections. No automatic raw diagnostic artifacts. Full feature
local/runtime/publication/human gates remain pending until real authorized evidence.

## Implementation seams and ownership

Freeze these public seams before dependent edits. No general-purpose framework or
new library is required. Function argument objects may grow only by coordination.

- Selection/evidence owner A: `scripts/component-pipelines.mjs` and
  `scripts/component-selection.test.mjs`. Export `componentNames`,
  `selectComponents({root,event,sourceRef,sourceRevision,baseRevision,baselines})`
  returning `{selected,reasons}`, `validateRunIntent(intent)`,
  `validatePublicationEvidence(evidence,expected)`, and
  `discoverBaselines({repository,sourceRef,sourceRevision,gateway,root})`.
  Own bounded GitHub run/job/artifact discovery, fixed-member artifact validation,
  original-intent/result reuse and public CLI JSON selection/intent commands.
  Retain real Git graph/diff; inject only external GitHub transport.
- State/promotion owner B: `scripts/deployment-validation.mjs`,
  `scripts/promote-images.mjs`, their tests, `scripts/local-kubernetes.mjs` and tests,
  local metadata/Job wrapper files as needed. Export
  `validateComponentRelease(record)`, `readComponentState(root,{requireComplete})`
  returning `{records,missing,status}`, and `verifyComponentIndex(record,inspect)`.
  Evolve `promotionFiles` and `promote` to consume one component record plus original
  expected-target intent, retaining safe remote snapshots/CAS and all other records.
- Workflow/build owner C: `.github/workflows/validate.yaml`, old release entrypoint
  retirement, seven component wrappers/common build, `scripts/deployment-ci.mjs`,
  its test, and `scripts/component-workflows.test.mjs`. Extend `buildImages` with
  explicit component selection, and expose a single-component public CLI result
  using B's schema and A's evidence/intent validators. The legacy ephemeral CI loop
  may build multiple components locally but is not a publication transaction.
  Use a separate workflow test file to avoid B's validation-test ownership.
- Coordinator: root `package.json` test registration, combined checks/team state.
  Architect: plan/tasks/quickstart/runtime documentation. No worker edits another
  owner's files without a coordinated ownership transfer.

Record schema validation belongs deployment-validation and is dependency-first;
selection consumes it, and promotion consumes selection intent validation. Avoid
cycles: selection must not import promotion. The shared JSON interfaces are the
component record/intent/evidence schemas defined above, not a seven-image manifest.

## Primary evidence checked 2026-10-22

- [Reusable workflows](https://docs.github.com/en/actions/how-tos/reuse-automations/reuse-workflows): local calls use caller commit; nested permissions only narrow.
- [Reusable workflow reference](https://docs.github.com/en/actions/reference/workflows-and-actions/reusing-workflow-configurations): ref/rerun and caller-context behavior.
- [Reruns](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/re-run-workflows-and-jobs): original source/ref and original actor privileges persist.
- [Workflow artifacts](https://docs.github.com/en/actions/tutorials/store-and-share-data), [artifact API](https://docs.github.com/en/rest/actions/artifacts) and [job API](https://docs.github.com/en/rest/actions/workflow-jobs): explicit identity, immutable transfer and job-success evidence.

These sources establish platform semantics, not tested repository execution. Preparation
and implementation verdicts remain independently owned. No constitutional amendment or
new engineering exception is proposed; formatting/testing/tooling/privacy/resilience
guides apply through the existing engineering index. New bounded scope counters belong
to coordinator state and preserve earlier rounds. Existing tasks/history are not reset.
