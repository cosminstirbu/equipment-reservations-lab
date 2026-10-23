# Verified remote Kustomize Argo CD design

Date: 2026-10-23. Feature: [013](../spec.md). Baseline: `3161f5d`.
Scope: FR-025/FR-026, AC-2.5–AC-2.7, SC-014; final implementation in the dedicated
`explore/013-argocd-kustomize` worktree. [Requirements](remote-kustomize-requirements.md)
record owner authority. This design does not claim implementation or approval.

## Decision and trust boundary

Use upstream non-HA Argo CD v3.5.5, commit
`a5038b0e2bbac1715754380ae0084df8e3d5b48c`, manifest SHA256
`90dc9094bf4c5964afd9c0e35d735e1c2fcbbda4f8e36799c092d9864ed65f50`.
The [official release](https://github.com/argoproj/argo-cd/releases/tag/v3.5.5)
links that [signed commit](https://github.com/argoproj/argo-cd/commit/a5038b0e2bbac1715754380ae0084df8e3d5b48c).
The [official installation guidance](https://argo-cd.readthedocs.io/en/stable/operator-manual/installation/#kustomize)
recommends a remote resource with local Kustomize patches. Keep only the immutable
raw-content URL, its checksum, existing authored patches and image digests in Git;
delete the full vendored manifest. Preserve namespace, disabled optional controllers,
resource settings, authenticated TLS access, AppProject permissions and controller
replica omission exactly. No chart, operator, version upgrade or persistent cache.

Kustomize has no manifest SHA256 assertion. A direct `kubectl apply -k deploy/argocd`
therefore is not the supported integrity-enforced installation command. A shared
`scripts/argocd-installation.mjs` renderer obtains the configured immutable HTTPS
resource once, verifies the raw bytes before parsing/rendering, stages those exact
bytes alongside a copy of the authored overlay, substitutes only the single remote
resource with the staged filename, and invokes pinned kubectl 1.35.8 Kustomize.
Return the captured rendered public manifest; setup server-side applies exactly
those rendered bytes via captured stdin (`-f -`) with the existing field manager.
There is no second remote fetch between verification and apply. No downloaded
manifest or render is committed, cached, printed automatically or retained as a log.
A manual render CLI may deliberately emit public rendered YAML on stdout; status
and failures belong on stderr. Its supported invocation is recorded in README.

Treat source identity/checksum as reviewed repository configuration, not an
operator-provided URL or environment override. Validate exactly one allowed HTTPS
GitHub raw URL at a 40-hex commit and the checksum format; reject redirect responses
rather than following them. Hash the complete original bytes, never normalized YAML.
Use a fresh operation-owned temporary directory; stage only the exact local files
needed by this overlay. No mutation of source configuration. Attempt cleanup on
success and all failures; cleanup failure fails success and cannot hide the primary
failure. Existing process/cleanup helpers remain the implementation foundation.

## Failure and resilience policy

One HTTPS GET, no automatic retry, 30-second overall header/body budget, maximum
4 MiB actual body bytes (current manifest approximately 1.92 MB). Abort/cancel the
body on timeout/size failure. TLS verification stays enabled; no redirect, alternate
mirror, stale cache or unverified fallback. GET is repeat-safe, but retry is omitted
to keep setup failure finite and explicit; circuit breaker is unnecessary for one
bounded bootstrap request. HTTP failure exposes only operation, status and elapsed
time; transport failure exposes a fixed category/time, never response body, raw
error/cause or authenticated data. Hash mismatch names the integrity failure without
printing fetched content. Existing kubectl process bounds remain finite (180s,
16 MiB output cap); renderer output is machine-readable captured content and failure
tails remain private because local tool/environment output is not inherently safe.

Render and verify during setup preflight, before credentials creation, controller
suspension, namespace/PV/Secret operations, cluster creation or any other mutation.
Read-only ownership, component-index and prerequisite checks may precede rendering.
Unavailable/invalid upstream content therefore leaves a working installation intact.
All setup paths use this helper. Existing application-only CI/static render lanes do
not consume Argo installation and remain application-only; focused Argo verification
belongs to tooling tests and separately invoked live qualification.

## Test design and evidence

Use the renderer's public API/CLI with real hashing, URL/configuration validation,
file staging, cleanup and failure mapping. A faithful HTTP boundary double supplies
status, body chunks, timeout/abort and oversize behavior; its fidelity follows Node
Fetch Response/ReadableStream semantics and is checked by one real upstream fetch
and pinned kubectl render. Never make deterministic tooling tests depend on GitHub.
Use a child process/tool boundary fixture for output/exit/cleanup privacy claims;
process-boundary tests inject private markers and assert absence from diagnostics.
Deterministic URL/checksum validation may use solitary public-interface cases because
it is a parsing policy, not an application workflow. Retain real internal collaborators.

Extend existing local-kubernetes tests rather than duplicating lifecycle coverage:
setup uses exactly verified rendered bytes; fetch/integrity failure yields no mutating
command, credential creation or suspension; repeat setup retains lifecycle ordering.
The tool/HTTP doubles replace external providers, and observations concern submitted
objects, exit/status, state preservation and cleanup, not private function arrangements.
Capture intended-red evidence before production edits. Compare candidate actual pinned
render against the baseline vendored render semantically and inspect all security,
digest/resource/replica fields; equality is configuration evidence, not runtime proof.
Remove obsolete quality.mjs vendor exclusion and its test expectation; keep normal
formatting coverage of authored Argo YAML. No standards amendment is needed.

## Argo-only live qualification

The owner authorizes replacement only of Argo CD. Record private before/after fixture
comparisons for cluster identity, application database data, broker state, Dashboard
history and existing application credentials. Report equality/health only. Preserve
TLS private state; do not delete the cluster, equipment namespace, PVs/PVCs, databases,
broker files or credential bundle. Suspend controller first, preserve existing
Application/AppProject desired specs, remove Application non-cascading, then replace
only inventoried Argo namespaced/controller resources; do not blindly delete namespace
or CRDs. Retain/reprovision the existing Argo TLS Secret before restored server startup.
Review exact removal inventory with coordinator before execution. Wait for actual
controller/server/repo/Redis readiness and current healthy synchronization; verify
trusted HTTPS authentication and authorized/unauthorized access.

The current live Application may track previously authorized branch-only fixes.
Never silently switch it to main. For actual candidate setup/rerun/stop-resume use an
operation-owned isolated fixture root containing candidate authored deployment files
and securely access the retained existing private state through the test harness.
Only its Application target and read-only Git ref resolution may be mapped to the
existing live ref; preserve exact live source configuration, real kubectl/Podman,
verified fetch/render/apply and lifecycle collaborators. No product CLI branch option,
new supported environment or source publication is introduced. Record fixture diff,
source hashes, mapping and exact actual revision; identify default-main adoption as
unqualified locally where unpublished source prevents equivalent evidence. Restore
captured Application desired spec unchanged. Tests must not expose credentials.

Capture successful replacement, setup rerun, stop/resume, trusted authenticated access,
reconciliation and fixture retention at the candidate snapshot. Negative unavailable/
hash tests must prove no mutation; they can be controlled integration tests rather
than risking tampering with the live upstream. No migration support is required.
Existing full-feature pending tasks and human acceptance gates remain pending.

## Standards and preparation

Read constitution and engineering formatting, testing, tooling, resilience and
observability guides with their required cross-references. No application telemetry
registration changes: this public operational fetch reports bounded safe failure
signals and preserves existing correlated application telemetry. All affected output
contracts are classified above; no raw artifacts are permitted. Setup/Argo changes
require independent design quality/security verdicts before implementation, fresh
checks and independent reviews afterward, then convergence. Required handoff includes
format-check, lint, tooling tests, actual pinned render and this local qualification;
unavailable checks remain pending. Human acceptance is never inferred.

Applied installed speckit-plan and speckit-tasks as targeted amendment workflows.
Their setup scripts resolved this exact feature using explicit
SPECIFY_FEATURE_DIRECTORY and SPECIFY_FEATURE_NO_PERSIST=1; existing plan/tasks are
preserved. No .specify/extensions.yml exists, so no before/after hooks apply. Data
model needs no new entity: source URL/hash are installation configuration and staging
is ephemeral operation-owned state. Existing runtime and state ownership is retained.

Current implementation tasks are T096–T101 in [tasks.md](../tasks.md), following
authoritative backend tasks T092–T095. Broader-feature convergence trace tasks are
T102–T105. Historical reviewed task references retain their original identifiers;
the coordinator records their integration mapping separately.
