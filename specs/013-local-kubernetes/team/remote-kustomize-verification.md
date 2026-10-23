# Remote Kustomize implementation verification

Date: 2026-10-23. Worktree: `equipment-reservations-argocd-kustomize`, branch
`explore/013-argocd-kustomize`, base `3161f5d`. T093–T095 evidence covers the
uncommitted candidate, not acceptance of all feature 013 requirements.

## Scope and test design

Applied `speckit-implement` only to assigned T093–T095 following preparation pass.
Explicit `SPECIFY_FEATURE_DIRECTORY=specs/013-local-kubernetes` and
`SPECIFY_FEATURE_NO_PERSIST=1` resolved the intended absolute feature directory via
Git Bash `check-prerequisites.sh --json --require-tasks --include-tasks`, exit 0.
All six existing/custom checklists had zero unchecked items. No extensions file
exists, so no before/after implementation hooks apply. Existing earlier pending
tasks remain untouched; coordinator owns task and review metadata.

Tests exercise the renderer API and real child process with real source validation,
SHA256 hashing, staging, patch configuration and cleanup. Fetch Response and
ReadableStream doubles replace the external HTTP service; a clock boundary records
the fixed 30000 ms policy while delivering an accelerated real abort. The real
upstream fetch/pinned render below checks provider fidelity. Process privacy uses
the existing real process executor and an actual child exiting 7 with a private
marker; stdout/stderr/diagnostics must exclude that marker. Actual removal of the
operation-owned staging directory at the external render boundary provokes cleanup
failure, preserving any primary failure and reporting cleanup separately. No
filesystem internals or private methods are exposed for tests.

Existing lifecycle tests retain actual release validation, private-file handling,
resource provisioning, ownership, application ordering and sync logic. Their narrow
renderer double represents the external verified render boundary; new assertions
verify exact submitted stdin and no credentials/provider mutation on refusal.
Source/config validation cases are deterministic policy parsing with no service
collaborators. Existing quality YAML discovery coverage is updated for authored
source metadata after the vendor file exclusion is removed.

## Test-first evidence

- `node --test scripts/argocd-installation.test.mjs`, before helper creation: exit 1,
  intended missing `argocd-installation.mjs` module. Formatter prerequisite initially
  required elevation for the dedicated worktree `.cache`; PowerShell requires
  `npm.cmd` because script execution policy disallows `npm.ps1`.
- With existing Git OpenSSL added to PATH, `node --test
  --test-name-pattern='setup applies exactly|unavailable or invalid'
  scripts/local-kubernetes.test.mjs`, before lifecycle implementation: exit 1,
  0/2 pass. Exact failures: verified installation missing stdin apply; invalid
  source missing expected rejection. Both use complete published-release fixtures.
- Added stalled-body clock-boundary test before timing seam refinement: exit 1
  after the real 30-second budget, because injected clock had not been consulted;
  actual abort still occurred. The subsequent timing seam retains fixed 30000 ms
  production budget and accelerates only the test's external clock.

## Focused results and render equivalence

- `node --test scripts/argocd-installation.test.mjs`: initial 9/9 pass; subsequent
  combined focused execution reports all 12 renderer tests pass, including HTTP
  503, integrity, transport, timeout, oversize, redirect, body cancellation, real
  process privacy and cleanup success/primary-failure handling.
- New lifecycle exact-byte/refusal regressions after implementation: 2/2 pass.
- Coordinator frozen snapshot 02 `npm.cmd run format-check`: exit 0.
- Coordinator frozen snapshot 02 `npm.cmd run lint`: exit 0, build zero warnings/
  errors and suggestion-level style verification passed.
- Coordinator frozen snapshot 02 `npm.cmd run test:tooling`, with `MANIFEST_KUBECTL`
  set to the revalidated pinned Windows binary: exit 0, 122 total, 120 passed,
  2 explicit POSIX-only skips. All four real pinned-Kustomize cases passed.
- Snapshot 02 complete renderer/lifecycle run: exit 0, 51 total, 49 passed, 2
  explicit Windows/POSIX contract skips; duration approximately 204 seconds.
- Snapshot 03 complete focused rerun follows the aggregate deadline repair below;
  pending. No unavailable check is recorded as passed. Coordinator snapshot JSON
  preserves exact source hashes.

The first complete focused run found one retained TLS-order test still selecting
the old `-k` apply path (47 passed, 1 failed, 2 Windows/POSIX skips). Updated that
assertion to locate the exact verified stdin bytes while preserving TLS-before-apply
behavior; focused TLS case passed 1/1. The POSIX child fixture now copies the new
renderer import. A retained-installation refusal case also verifies byte-identical
existing credentials and no provider mutation/suspension. Final complete rerun is
in progress. Coordinator initial format-check passed; initial lint identified only
19 new helper/test global-name errors. Fixed through explicit Node imports and
`globalThis`, with focused zero-warning ESLint passing and renderer 12/12 passing.
No suppression or global lint-policy change was introduced.

Author inspection identified that the first renderer integration bypassed the
lifecycle's remaining aggregate setup deadline. The coordinator confirmed retaining
the existing 15-minute bound. Added a public setup regression using the REAL default
renderer, real hashing/staging and existing lifecycle collaborators, with only the
external HTTP/provider and wall-clock boundaries controlled. Advance the clock at
reviewed ref resolution to leave 500 ms; observe the requested fetch signal and
renderer process timeout. Intended red: fetch requested 30000 instead of 500 ms.
Repair derives both bounds from the existing remaining-budget guard and routes
rendering through the lifecycle call wrapper, retaining private output handling.
The renderer closure is created inside the factory body so it accesses that guard.
Focused real-default regression passed 1/1 and affected ESLint passed, exit 0.
Standalone renderer retains its 30-second fetch/180-second process defaults; no
CLI/environment source or deadline override was added. Final snapshot is 03.

Actual Windows amd64 kubectl binary:
`C:/Users/stirb/AppData/Local/Temp/equipment-kubectl-1.35.8/kubectl.exe`.
Revalidated SHA256
`f675d70224b42b84e0442e8d7644efbe440e4451a4b02bdc5d95823a96316ba8`
matches adjacent checksum. Client reports v1.35.8 and Kustomize v5.7.1.

Executed a read-only Node harness importing `renderArgoInstallation({kubectl})`
with the actual immutable upstream HTTPS fetch and actual pinned Kustomize.
Compared its parsed resource documents, recursively sorting object keys and sorting
resource identities, to the existing main worktree vendored overlay rendered with
the same pinned kubectl. Exit 0: semantic parity true, 59 resources, identical
canonical semantic SHA256
`517e88f32d929a36117ed7f96005b00e755f463e9036aaf5517c6a29ee5b0e8c`.
Successful helper rendering establishes raw upstream bytes match configured SHA256
`90dc9094bf4c5964afd9c0e35d735e1c2fcbbda4f8e36799c092d9864ed65f50`.
Only then removed the obsolete vendor file in the candidate worktree. No raw render
or downloaded manifest is retained in Git or automatic logs.

Actual renderer CLI also passed through the production process executor with pinned
kubectl on PATH, exit 0. Captured manifest size 1,919,512 bytes, rendered-byte SHA256
`a4644cf244aa9e49d9ece0aecc6c3d75ec92bc18ba34ad4518862afdbe51fb20`.
Only that summary was printed; the captured public YAML was not retained.

## Author inspection and runtime boundary

Authored overlay changes only its one resource reference; all image digests, TLS
configuration, resource bounds, disabled optional controllers, namespace and
application-controller replica omission remain unchanged. Semantic equality includes
all these fields. AppProject/local Application YAML is untouched. Setup awaits the
verified render before credentials, suspension, cluster creation or resource apply,
then sends exactly its captured bytes to the existing server-side field manager.
Only the single remote source is allowed; component/base/generator/transformer and
external patch paths are rejected before fetching. Staging copies only two authored
overlay files and verified upstream bytes; CLI has no source override or cache.

No live mutation was performed by the coder. Coordinator owns T096 and exact removal
inventory approval. Read-only elevated preparation verified main private kubeconfig
and credential bundle exist, no operation lock exists, and Podman machine is running;
no credential contents were printed or copied. Main state stays outside candidate
worktree. The programmatic harness retains main root/state and maps only candidate
authored inputs, production renderer and precise reviewed Git ref. It adds no product
branch/state override.

Coordinator reported baseline `smoke --verify-persistence` exit 0 using existing
private checkpoint: persisted reservation, identity and notification effects verified.
This is pre-replacement evidence only. Actual replacement, rerun, stop/resume,
authenticated access and retained fixtures remain pending in this record.

## Coordinator final static qualification (snapshot 03)

Source hashes: remote-kustomize-snapshot.json, snapshot remote-kustomize-source-03.
Final npm.cmd run format-check and npm.cmd run lint both exited 0; .NET build
reported zero warnings/errors and suggestion-level style verification passed.
Full tooling with MANIFEST_KUBECTL set to the verified kubectl passed 120/122,
zero failures and two POSIX-only skips (shell lane and signal semantics). Its helper,
quality and tooling inputs are unchanged by the later lifecycle-only deadline repair.
All four previously optional pinned-Kustomize tests ran and passed.

Final affected renderer/lifecycle suite after deadline repair exited 0: 52 tests,
50 passed, two explicit platform skips, duration 152408 ms. The actual default
renderer regression checks a 500 ms remaining setup budget for both download and
render subprocess. These checks do not claim Linux/macOS execution.

The security-reviewed scratch harness initially could not import an unavailable
YAML package; this failed before any provider call. It was corrected to the existing
Spectral parser without a dependency change, reviewed again, and preflight then
exited 0: retained fixtures and trusted authenticated access passed. No workload
replacement occurred during either preflight invocation. Exact operational removal
inventory and original reviewer closure: remote-kustomize-harness-security.md.

## Actual local Argo-only qualification (2026-10-23)

Environment: Windows amd64, existing rootful Podman machine and equipment-local kind
cluster; verified kubectl v1.35.8/Kustomize v5.7.1; candidate source snapshot03.
Reviewed disposable operational harness SHA256:
`cba2593438526918d0154d8fd59e1043c93ce8419855010a7deb8d738e04c830`.
Command: `node .cache/remote-kustomize-live.mjs execute`, with pinned kubectl and
existing Git OpenSSL on PATH and NODE_EXTRA_CA_CERTS pointing to the existing local
CA certificate. Exit 0. No raw provider output, secret payload or automatic render
log was retained. The scratch harness remains ignored, outside product source.

The exact Argo-only inventory was six Deployments named argocd-applicationset-controller,
argocd-dex-server, argocd-notifications-controller, argocd-redis, argocd-repo-server and
argocd-server, plus StatefulSet argocd-application-controller. Controller suspension
and Pod exit preceded non-cascading Application removal and these exact workload
deletions. Namespace, CRDs, RBAC, Services, ConfigMaps and Secrets were retained.
The new controller StatefulSet UID differed from baseline, proving actual replacement.
No cluster, application namespace, PV/PVC or application data was deleted.

Passed actual provider phases:

- Preflight retained fixtures and trusted authenticated access.
- Candidate setup following actual Argo workload replacement.
- Candidate setup rerun.
- Candidate stop followed by candidate setup/resume.
- Repeated persistence/authentication/private-state checks after each setup/resume.
- Exact owned broker sentinel, private Application fixture and forwarding cleanup;
  no rollback was required. Exit 0 includes cleanup success.

Before/after fixtures compared privately in memory: existing reservation/identity/
notification checkpoint through genuine authentication; four database names/OIDs;
inventory rows; Keycloak credential data; equipment Secret data; original credential
bundle and CA/leaf/key bytes; three namespace UIDs; all three PV/PVC UIDs, bindings
and Bound state. A uniquely owned durable broker queue with a persistent message
survived all phases and was removed afterward. The exact previously recorded
Dashboard span survived stop/resume and was queried again through its authenticated
telemetry API. Only equality/pass results were exposed.

Argo access used verified HTTPS/IP SAN and the retained local CA, with no TLS bypass:
anonymous API 401; retained admin login 200; authenticated Application API 200,
Healthy/Synced at the retained exact revision; invalid token 401. Final safe readiness
inspection showed all eight equipment Pods Running/ready, and Argo Synced/Healthy
with operation Succeeded.

### Source-preserving fixture boundary

The existing live Application deliberately tracks
`fix/cross-platform-local-kubernetes`, revision
`3161f5df917369330a4c8330334bb6209687de6b`. Normal committed setup still targets main.
The operational harness used candidate createLifecycle with main checkout root for
secure existing state. Its real provider adapter mapped exact authored deployment
paths to candidate files, used the real candidate verified renderer, and mapped only
the expected Git main ref query to a real lookup of that existing branch (requiring
the same exact SHA). The ephemeral Application fixture reused the exact captured
desired Application spec; the AppProject stayed candidate-authored and unchanged.
No credential copy, product source/state override or fabricated revision was used.
The exact desired Application spec was compared after every phase and preserved.

This proves candidate installation and real lifecycle behavior with the current live
source retained. It does not establish adoption of unpublished candidate changes
from remote main. T091 and all earlier macOS/capacity/VM-restart/full-feature/human
acceptance obligations remain separate. No commit, push, merge, hosted workflow or
publication was performed.

## Coordinator convergence and final metadata

Spec Kit convergence prerequisites resolved the intended feature after implement;
no extension hooks exist. Current-state assessment (no branch comparison) inventoried
26 functional requirements, 14 success criteria, 27 acceptance identifiers and all
97 pre-convergence tasks, including retained pending work and constitutional rules.
Six constitutional principles were considered; this is not a claim that older
unavailable feature evidence now passed.

Outcome: tasks_appended. No remaining code gap was found for FR-025/FR-026 after
passing SC-014 local qualification. Four concrete retained broader-feature partial
HIGH gaps were appended as T098-T101 under Phase 20: existing smoke interval selection,
broker AMQP readiness, all-resource cleanup and bounded owned-process termination.
They trace earlier T089/T080/BTS and tooling tasks and do not expand the Argo batch.
Missing/contradicts/unrequested counts: zero new scoped findings; broader partial
findings: four. Independent quality/security passed snapshot03 in their own reports.
The closed operational finding RK-S001 remains recorded with original reviewer closure.

Completion metadata inspection: T092-T097 record the completed scoped preparation,
implementation, local testing, independent reviews and convergence assessment.
The feature spec remains implementation-in-progress; earlier pending tasks and new
convergence follow-ups remain unchecked, and human acceptance is null in run-state.
No full-feature completion, remote-main adoption or human acceptance is claimed.
Changed local documentation links and diff whitespace passed author checks.

## Rebase reference note

During authorized Git integration, main already used task IDs T092-T095. Current
Argo tasks are T096-T101 and retained convergence tasks T102-T105. Historical task
references and original reviewer verdicts above are preserved. See
[the rebase record](remote-kustomize-rebase.md) for the exact mapping, new baseline,
source-hash preservation and current verification.
