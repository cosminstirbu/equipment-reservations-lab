# Implementation Plan: Local Kubernetes and GitOps

**Branch**: `013-local-kubernetes` | **Date**: 2026-10-20 | **Spec**: [spec.md](spec.md)

## Current direct promotion amendment - 2026-10-22

The [direct component design](team/direct-component-promotion-design.md) supersedes
historical promotion branch/PR instructions in this plan. Use stable root references
to seven component image patches, exact-parent candidate rendering/validation and
non-force atomic commits to main. Preserve the quality/build graph and serialized
mutation queue; no PR permission or branch-rule bypass. Owner authorizes the
implementation PR, rebase merge after green PR checks, and post-main verification;
stop on authorization failures. Feature acceptance remains pending.

## Summary

Branch qualification reconciliation (2026-10-23): current Windows/WSL repairs,
interactive access and child-resource admission are recorded in
[local setup qualification](team/windows-local-setup.md). The owner-approved
[Dashboard persistence repair](team/dashboard-persistence.md) supersedes temporary
storage. The actual branch deployment is Healthy/Synced and Pod-replacement
persistence passed; full deployed smoke currently stops on an existing booking
covering its randomized time window. Track remaining work in tasks Phase 18.
These results do not close macOS, capacity/VM-restart, independent-review or human
acceptance gates. Older team evidence remains historical, not a current verdict.

Backend stability follow-up (2026-10-22): apply the testing guide's
[lifecycle guidance](../../docs/engineering/testing.md#diagnose-backend-flakes-at-the-lifecycle-boundary).
The [backend audit](team/backend-test-stability-audit.md) records recent admission
and AMQP repairs, remaining risks and qualification limits. The owner authorized
committing/pushing these repairs and monitoring PR #15; existing runtime,
independent-review and human-acceptance gates remain pending.

Implement the complete single-instance kind/Podman demo and reviewed GHCR/Argo release
path while preserving everyday Aspire development. Preparation is not runtime acceptance:
minimal kind proof passed; complete-system, trusted issuer and published-image checks
remain explicit gates. [Research](research.md) records decisions, exact host evidence
and sources; [runtime contract](contracts/runtime.md) owns operational interfaces.

## Targeted manual branch publication amendment — 2026-10-22

FR-012/AC-3.4/SC-010 add maintainer manual publication from any nonempty repository
branch while retaining main-only automatic pushes and main-only promotion. The
[branch release design](team/branch-release-design.md) defines event/ref guards at
workflow and CLI boundaries, global serialized concurrency, source-SHA provenance,
unchanged permissions/validation, and the existing CLI/Bash/YAML regression seams.
Append T054–T058; independent preparation review precedes dependent implementation.
No new dependency, policy exception, external execution or feature acceptance is
implied. Previous tasks, historical evidence and remaining full-feature gates persist.

The owner's 2026-10-22 follow-up retires commit `623bfaf`'s temporary Validate
`image-build-diagnostics` job and its dedicated builder diagnostic option/CLI path.
Apply a targeted removal rather than a wholesale Git revert: preserve overlapping
uncommitted safe-output repairs, normal image-build metadata/cleanup behavior and
manual branch release changes. T059 records test-first absence/rejection checks and
removal within this batch; it changes temporary plumbing, not product requirements.
Independent review/convergence must assess the combined final scope.
Promotion must use the case-sensitive Bash-derived main flag described in the design,
because GitHub expression string comparisons ignore case; manual `Main` publication
must not promote as lowercase `main`. Existing T055/T056 cover this guard clarification.

## Technical Context

## Current manifest-only quality amendment — 2026-10-22

FR-011/AC-3.8/AC-3.9/SC-013 add narrower quality for proven local-promotion metadata
changes on PRs and main pushes. [The manifest quality design](team/manifest-quality-design.md)
defines the exact closed allowlist, real Git comparisons, main's trusted successful
full-quality ancestor proof, scoped formatting, committed state/provenance consistency
and real pinned Kustomize plus structural/security policy. Mixed/unknown/uncertain
changes remain full quality; manual dispatch remains full. Main never relies only on
the previous push SHA, so prior failed source validation cannot be bypassed by a later
manifest merge. Component publication baselines remain independent and unchanged.

Retain required quality job/dependency/summary shape. This does not waive source-change
checks, claim complete Kubernetes OpenAPI/provider/runtime validation, or enable external
execution. T071 onward records generator formatting repair and this gate's test-first
implementation/reviews; preserve T070 and all earlier task statuses and evidence.
No engineering exception/new infrastructure is required.

Manifest-quality preparation passed independent [quality](team/manifest-quality-preparation-quality.md)
and [security](team/manifest-quality-preparation-security.md) review at T072. Test-first
implementation is active; final verdicts remain separate. The approved additive
readComponentState.jobSuffixes context lets validateStaticManifests(text,state)
verify exact database/identity Job names from actual validated public inputs; existing
records/missing/status and all static/runtime restrictions remain unchanged.

## Current component pipeline amendment — 2026-10-22

The owner-confirmed [component requirements](team/component-pipelines-requirements.md)
supersede earlier combined all-image publication and main-only promotion clauses in
this plan, runtime contract and historical task descriptions. Current FR-011–FR-013,
FR-022–FR-024 and AC-3.1–AC-3.7 require quality once, affected PR dual-platform builds
without publication, affected main publication, manual all-seven branch publication
and independent component PRs from either source. Existing complete-demo/human gates
and historical evidence remain intact. This is a new bounded scope, not retroactive
approval of previous implementation or reset of existing repair limits.

[Component design](team/component-pipelines-design.md) owns current workflow graph,
per-component successful baselines, exact source/run provenance, retained rerun intent,
partial release records, stale/CAS promotion controls, interfaces and test design.
Seven readonly PR calls directly use a common build core; seven trusted component
wrappers each build and promote independently. This avoids nested write declarations
under a readonly caller. No new compatibility gate, preproduction or business behavior
is introduced. Existing testing, formatting, tooling, privacy and resilience guides
apply; no policy exception or constitutional amendment is proposed.

T060 onward is the dependency-ordered amendment; preparation quality/security gates
must pass before code. Local/GHCR execution, commits/pushes and human acceptance are
separately authorized actions. Current partial publication must never imply demo
readiness; setup requires all seven genuine independent records.

### Original technical context retained

**Language/Version**: .NET 10.0.301/C#14, existing locked Angular/TypeScript/Node;
JavaScript lifecycle/CI tooling and Kubernetes YAML.
**Primary Dependencies**: Aspire 13.6.1, Keycloak 26.8.1, PostgreSQL 18.6,
RabbitMQ 4.3.6, kind 0.33.0/Kubernetes 1.35.8, Traefik 3.7.15, Argo CD 3.5.5.
**Storage**: one PostgreSQL with four separate databases/accounts; RabbitMQ durable
storage; retained Dashboard SQLite telemetry; private ignored credential bundle;
three local Retain PVs.
**Testing**: existing xUnit v3/MTP/Testcontainers, Angular tests/browser tests;
separate opt-in deployed smoke and hosted ephemeral kind verification.
**Target Platform**: existing macOS arm64 rootful Podman VM and hosted Linux CI;
owner-approved Windows/WSL Podman qualification is tracked in
[Windows local setup](team/windows-local-setup.md), including the explicit experimental
8 GiB trial. Default macOS capacity, trust and private-state requirements remain intact.
Application and third-party images must support linux/arm64 and linux/amd64.
**Project Type**: deployment/platform tooling plus existing web/API portability.
**Performance Goals**: setup <=15 minutes excluding first image download/build;
individual dependency waits <=180s, total bootstrap <=300s, smoke <=10 minutes.
**Constraints**: no VM mutation, trust install, publication, Azure or merged deployment
in this session without separate authorization. No fabricated image digests.
**Scale/Scope**: one replica per component, disposable demo; 6 CPU/11444MiB current VM.

## Constitution Check

Applicable guides: formatting, testing, ASP.NET Core, Angular, OpenAPI, Aspire,
observability, resilience, and all required cross references read. Test-first behavior
changes retain red command/results in team evidence. Production provisioners and
migrations remain real. No AppHost automation is introduced into application tests.
Scoped amendments below implement owner-approved handoff scope and require independent
review before dependent implementation. No general cloud/test/identity policy relaxation.
Exact issuer/audience/TLS validation, scoped accounts, telemetry privacy and bounded
repeat-safe retries remain mandatory. Independent review, convergence and explicit human
acceptance remain completion gates; no author verdict is approval.

Post-design: no constitutional exception proposed. Unexecuted runtime evidence is pending,
not silently accepted. Concrete version/digest lock must precede dependent image deployment.

## Project Structure

Feature artifacts: plan.md, research.md, data-model.md, contracts/runtime.md,
quickstart.md, tasks.md, team/ (coordinator owned).
Source: deploy/base, deploy/environments/local, deploy/platform, deploy/argocd;
scripts/local-kubernetes.mjs, scripts/deployment-smoke.mjs, scripts/promote-images.mjs;
.github/workflows; container build definitions; focused existing src/tests portability seams.
No Azure directory or second local environment.

## Proposed authoritative guide amendments

The handoff records owner approval to plan exactly this scope. Independent reviewers
must review the authoritative amendment before dependent implementation.

Testing: replace the final sentence `Manifest generation/cloud deployment is outside
the supported testing policy.` under Automated application boundary with:

> Manifest/schema validation and a separately invoked local Kubernetes deployment
> verification workflow are supported. Hosted CI may create an isolated ephemeral kind
> cluster and use locally built test images for deployment smoke checks. These checks
> remain separate from normal application tests and do not construct, inspect, run or
> publish AppHost. CI results do not establish macOS Podman networking, local trust or
> VM-restart durability. Cloud deployment verification remains outside this policy.

OpenAPI: replace the direct-service paragraph's first two sentences with:

> Send interactive API requests to the service hosting the UI, using the developer's
> identity and permissions. An explicitly configured deployed environment may expose
> each service through the application's same-origin reverse proxy, provided its
> service-specific documents, callback, authenticated requests, origin checks and path
> handling remain intact. Do not use an external request proxy.

Default non-Development denial and required explicit deployment exposure/access decision
remain unchanged. This plan records that decision: local overlay explicitly enables
service docs through trusted application HTTPS origin; business authorization remains
on operations; documents/UI contain no secret configuration. No combined API portal.

## Source-boundary and test design record

1. Extend existing public service HTTP OpenAPI/browser-write cases: real production
routing/auth/document generation, real internal collaborators, isolated PostgreSQL
where needed. HTTP identity double replaces provider transport, backed by existing real
Keycloak contract tests. Assert default denial, enabled configured HTTPS routes/server
prefix, exact approved callback/origin and forged host/header denial. Do not snapshot YAML
as substitute for request behavior. Existing public `ValidateCallback` tests may cover
deterministic canonical-URL parsing in isolation because input validation is the behavior.
2. Extend existing real-Keycloak provider contract: production IdentityProvisioning,
separate admin endpoint, HTTPS external issuer registration, repeated missing configuration
reconciliation and preserved changed human password. Existing provider fixture retains
its documented exclusivity. No fabricated private-method/call-count assertions.
3. Extend real-PostgreSQL DatabaseBootstrap public provisioner tests: fourth dedicated
keycloak account/database, denial of cross-database/admin access, rerun/data preservation.
Existing role/password reconciliation must be deliberately assessed: preserve original
passwords during ordinary reruns; supplied changed credentials must fail clearly rather
than silently rotate them. Test actual login outcomes, not SQL strings.
4. Frontend auth-config public configuration function validates canonical HTTPS issuer;
existing rendering/browser authentication cases retain real app/router/oidc library,
external HTTP doubles at transport boundary; browser smoke proves real PKCE/login/write.
5. Lifecycle/promoter tests use public CLI/functions with temporary files and faithful
process/GitHub transport doubles at external boundaries, and contract checks against
real disposable cluster. Assert missing credentials with durable state stops before
replacement, operation scoping, bounded failures and promotion CAS/loop prevention.
6. Deployment smoke invokes real deployed HTTP APIs, real identity/database/broker and
production instrumentation. No service mocks; bounded condition polling; create isolated
scenario data and assert notification effects once. Runtime privacy assertions inspect
actual exports; remove production registration to prove test sensitivity where changed.
Every new behavior test first fails for intended reason. Pure manifest parsing checks
only establish structural policy, never deployed behavior.

## Runtime, resilience and telemetry budgets

Initial requests/limits (CPU millicores, memory MiB): PostgreSQL 250/1000,256/1024;
RabbitMQ 250/1000,384/1024; Keycloak 250/1500,512/1536; each API
100/500,128/384; frontend 50/250,32/128; Dashboard 100/500,128/512;
bootstrap jobs 100/500,128/384. Platform Argo combined limit <=1536MiB,
Traefik <=256MiB; retain >=1GiB VM margin. Measure full system concurrent with unrelated
workloads; reduce justified limits only with evidence, request owner VM action on shortage.
PostgreSQL 8GiB and RabbitMQ 2GiB local Retain PVs; require >=20GiB available VM disk.

Startup probes: period 5s, timeout 2s, failure threshold 36 (180s); readiness
period 5s timeout 5s threshold 3; liveness only `/alive`, period 10s timeout 2s
threshold 3. Keycloak own health port 9000; no public management route. Jobs
activeDeadlineSeconds 300, backoffLimit 2, preserve failures; Argo sync waves order
storage/providers -> database bootstrap -> Keycloak -> identity bootstrap -> APIs/frontend.
Jobs rerun through immutable release/config-hash names with bounded cleanup after success;
no secret value in names/hash input. Avoid readiness dependency cycle by probing provider
health, not authenticated app routes before identity setup.

Retain existing application timeout/retry contracts unless portability changes require
specific reviewed adjustment. Bootstrap total 300s; requests 5s; repeat-safe GET/PUT
max 2 retries with exponential 100ms/200ms + 0–50ms jitter; POST uncertain outcome
resolved by lookup before recreation. No generic unsafe retry or side-effect hedging.
No bootstrap circuit breaker: finite one-shot budget and visible Job failure suffice.
CI/promotion API requests 15s, max 2 transient retries only for reads/CAS-safe operations.

Preserve production Npgsql/OpenTelemetry/HTTP and RabbitMQ instrumentation registrations,
privacy processors and trace propagation. No duplicate spans. Dashboard frontend
BrowserToken, OTLP ApiKey with >=256-bit generated key and explicit header;
API auth separately keyed if enabled. Internal OTLP only; frontend through loopback-bound
forward. Suppress token-bearing startup URLs from captured output. Dashboard limits:
`Dashboard:TelemetryLimits:MaxTraceCount=10000`,
`Dashboard:TelemetryLimits:MaxLogCount=10000`,
`Dashboard:TelemetryLimits:MaxMetricsCount=1000` (per metric dimension),
512MiB container cap; AlwaysOn demo sampling, bounded batch queues, retained SQLite
storage (`Dashboard:Data:PersistenceMode=Resume`) on a dedicated 1GiB local PV/PVC,
mounted at `/home/app` with data directory `/home/app/dashboard-data` and stable
application name `equipment-local`. One replica and Recreate preserve one-writer
ownership. Retain on stop/Pod replacement; delete only on explicit reset/teardown.
The local PV capacity is not a hard disk quota. This owner-approved 2026-10-23 repair
supersedes temporary storage; see [design and verification](team/dashboard-persistence.md). Set
`Dashboard:Frontend:MaxConsoleLogCount=10000`. No resource-service/AppHost controls promised. Inspect successful/failed SQL,
identity, broker/bootstrap exports, exception fields, URLs, labels and auth leakage.

## Delivery and trust boundaries

PR workflow has read-only contents, no publish secrets or pull_request_target checkout;
actions pinned by SHA. Release main workflow tests before publish with packages:write
only in publication job. Promotion job contents/pull-requests:write only; no cloud token.
Source revision/digests recorded; publication jobs exclude deploy/docs-only changes.
Promotion updates only local image references/provenance, validates both architectures,
uses one named branch/PR with compare-and-swap and serialized concurrency; fail rather
than overwrite changed human promotion edits. First images and actual GitOps release
remain external acceptance gates until explicitly authorized. Fork-safe CI smoke uses
only its own ephemeral cluster/images; no second supported local workflow.

## Complexity Tracking

No constitutional violation. Two controllers (ingress and GitOps) serve explicit existing
requirements; no chart, service mesh, secret operator or extra provisioning service.

## Targeted script diagnostics amendment — 2026-10-21

Owner-approved FR-019–FR-021 extend US4 across every script and test helper. The
[diagnostics design](team/diagnostics-design.md) records the per-operation inventory,
minimal process-helper interface, trust boundaries, output budgets and test design.
The new authoritative [tooling guide](../../docs/engineering/tooling.md) applies with
formatting, testing, observability and resilience; the engineering index routes
future work to it. Existing constitutional policies suffice; no amendment or exception
is proposed. Mandatory engineering practices have explicit owner approval.

Preparation review must pass on this amendment before dependent implementation.
Append T042 onward and preserve all completed IDs and pending acceptance tasks.
The coordinator records a new bounded scope batch without resetting historical repair
counts. Real-process and CLI diagnostics evidence is required in addition to provider
integration evidence; incompatible Windows signal/file-mode cases remain pending
until verified on a supported host. No commit/push/workflow action or feature acceptance
is implied. Existing full-feature acceptance gates remain unchanged.

## Targeted implementation clarification — broker definitions executable

After prep-design-012-03, independent quality/security reviewers approved this narrow
T012/FR-006 adaptation: BrokerBootstrap is currently a library, so add a minimal
production executable invoking its existing `BrokerProvisioning.Build`. This is a
technical entrypoint clarification, not a requirement change or a new topology
implementation. Preserve the historical preparation hashes/reports.

The executable receives credential material through existing private configuration,
requires an explicit output file, and creates the private definitions file atomically.
It never writes definitions, password hashes, credentials or unsafe exception details
to stdout/stderr. Existing output fails closed; retries cannot silently overwrite it.
The broker initContainer writes into a shared ephemeral volume; RabbitMQ mounts it
read-only with the same deliberate nonroot UID and private readable file permissions.
Initialization has a finite deadline and broker startup imports the production topology.
No duplicated JavaScript/shell topology or hashing implementation is introduced.

Test-design addition: exercise the public executable/process boundary and observable
output-file contract with real production Build/serialization retained. Cases cover
valid definitions, explicit output requirement, atomic create/no overwrite, permissions,
invalid configuration and secret-free diagnostics. A real isolated RabbitMQ provider
imports the generated file and proves scoped users, permissions, bindings and readiness;
file JSON assertions alone do not establish successful provider import. Capture intended
red evidence before implementation. No private-state/call-count assertions or AppHost
automation are required. Foundation coder owns production CLI/tests; image ownership
consumes that real executable after its contract passes.


## Targeted design clarification — deterministic bootstrap Job identity

Independent quality/security reviewers approved this narrow per-Job wrapper and
promotion expansion after prep-design-012-03; coordinator-owned targeted review
records retain their verdicts and historical hashes. This note records the design,
not author approval or runtime evidence. BrokerBootstrap is an initContainer, not a
separate Kubernetes Job.

The shared runtime base keeps stable Service/DNS names. Each database/identity Job
has its own base Kustomization and a local wrapper at exactly
`deploy/environments/local/jobs/database/kustomization.yaml` or
`deploy/environments/local/jobs/identity/kustomization.yaml`. Each wrapper includes
only the corresponding base Job and sets `nameSuffix: -<hash>`. Parent overlay image
and namespace transformations still apply; there is no global nameSuffix, dynamic
Argo plugin or dependency on ConfigMap hash-transformer ordering. Offline kubectl
1.35.8 proof rendered a suffixed Job while preserving Service postgres and its DB_HOST.

For each NAME in {database, identity}, derive hash from these ordered nonsecret inputs:

1. Canonical JSON of `deploy/environments/local/release.json`: recursively sort object
keys by Unicode codepoint order, preserve array order, retain JSON primitive values,
serialize with no insignificant whitespace and encode UTF-8. Reject invalid/nonfinite
JSON values and duplicate keys rather than normalizing an ambiguous release.
2. Raw UTF-8 bytes of `deploy/base/configuration.yaml`.
3. Raw UTF-8 bytes of `deploy/environments/local/configuration.yaml`.
4. Raw UTF-8 bytes of `deploy/base/jobs/NAME/job.yaml`.

Hash the sequence using unambiguous framing: for each input append its byte length
as unsigned 64-bit big-endian, then append exactly those bytes. Compute SHA-256 and
take the first 16 lowercase hexadecimal characters. The wrapper suffix is a hyphen
followed by those 16 characters. No credential, Secret value, local private file or
CA key enters this derivation. The suffix reflects committed public configuration and
real release image/provenance data, not mutable image tags or runtime secrets.

The promotion proposal may change only local release.json, the root local overlay's
image references/provenance already allowed by the release contract, and these two
wrapper `nameSuffix` fields. No other wrapper field or file is writable by promotion.
Reject symlinks, unexpected files/fields and human-edited promotion branches. Construct
and validate the complete proposal before any remote mutation; publish one atomic
commit and compare-and-swap against the observed remote head without force. Preserve
serialized promotion concurrency and fail on concurrent or unrecognized branch edits.
Independent manifest validation recomputes both suffixes and rejects stale/malformed
values; generation alone is insufficient validation.

Provide an explicit configuration-only refresh command using the same pure derivation
and restricted wrapper field edits. It does not build/publish images, change release
images, or create a promotion PR; the resulting local configuration diff remains
reviewable. Changes to config/template inputs require refreshed suffixes before sync.

Job status/lifecycle selectors use stable labels, never depend on suffixed names for
Service discovery. Bound successful old-Job cleanup by ownership labels and known
bootstrap kinds; retain failed Jobs and failure evidence for the current suffix until
explicit controlled retry/reset. Never broadly delete namespace Jobs. Document and
test exact rerun/cleanup semantics, wave ordering and Argo tracking before acceptance.


## Targeted required-check remediation — MessagePack patch

Required restore/build is blocked by upstream audit finding GHSA-qhrr-8q5h-9q3h in
AppHost's transitive MessagePack 2.5.302. [Research](research.md#required-check-dependency-remediation--messagepack-2026-10-20)
records maintainer fixed ranges and local dependency owners. Proposed narrow remedy:
AppHost-only direct MessagePack 2.5.303 with excluded build/analyzer assets matching
its existing transitives, plus the necessary AppHost package-lock update. Preserve
Aspire 13.6.1 family and service dependencies; no audit/warning suppression or policy
exception. Foundation coder owns implementation and pre/post check evidence.

Minimum-version constraints accept the same-line patched serializer. Verify exact
MessagePack/Annotations 2.5.303 resolution, warning-as-error audited restore and build,
required lint/check, and manual Aspire regression before claiming compatibility.
Independent security review of the concrete package/project lock change remains
required; the architect's recommendation does not approve that gate. No new business
behavior or application test boundary is introduced by this dependency remediation.


## Broker executable telemetry clarification

The minimal BrokerBootstrap executable remains subject to correlated observability:
sanitized stderr and a nonzero exit alone do not satisfy bootstrap telemetry. Reuse
the existing DatabaseBootstrap/IdentityBootstrap real Host lifecycle and production
`AddApplicationTelemetry` registration. Explicitly register activity source and meter
`Equipment.BrokerBootstrap` in production CLI registration. Emit one workflow activity
`broker.definitions.prepare` covering public argument/config validation and private
atomic output preparation, structured source-generated safe success/failure logs within
that activity, and a completed-operation counter with only bounded outcome labels.
Record Ok/Error status with constant safe failure reason. Do not record output paths,
arguments, credentials, password hashes, generated configuration, raw exceptions or
sensitive exception events. This is offline file preparation: no native broker call or
duplicate external dependency span is claimed; real RabbitMQ import evidence remains
separate.

Dispose the workflow activity before exporter draining. Start/stop the actual host and
flush/shutdown production trace, log and metric providers with explicit finite deadlines,
following existing short-lived bootstrap patterns. Export failure must remain bounded
and observable without leaking its endpoint/credential configuration. No background
exporter or running host may keep the init process alive indefinitely.

Test-design addition: extend public executable tests with the existing faithful local
OTLP HTTP/protobuf receiver pattern used by DatabaseBootstrapTracingTests. Keep actual
production telemetry registration, workflow, Build/serialization and file creation real;
the receiver replaces only external OTLP transport/storage. Execute successful creation
and a controlled actual file/config boundary failure; assert workflow status, correlated
safe structured outcome log, bounded metric dimensions and forbidden-value absence in
all exported payloads/console output. A removed production source/meter/log registration
must make relevant assertions fail. No independent ActivityListener/subscription or
test-only instrumentation may activate otherwise unregistered activities. Retain intended
red result before implementation. This closes an existing feature/policy obligation;
no policy exception or new requirement is inferred.


## Bootstrap Job cleanup integration

Use existing deterministic hash-named database/identity Jobs as Argo `Sync` hooks
with `argocd.argoproj.io/hook-delete-policy: HookSucceeded,BeforeHookCreation`.
Keep their dependency waves, active deadlines, retry limits and safe reconciliation.
No additional cleanup controller, image or CronJob is introduced. No `HookFailed`
policy or `ttlSecondsAfterFinished` may erase failed evidence. Success cleanup is owned
by Argo; same-name hook recreation replaces its previous object, so a same-hash retry
must be recognized as a diagnostic-retention boundary. Capture failure diagnostics
before retry, state any configured bounded automatic retry behavior explicitly, and
retain the final failure for inspection after retries stop. Different-hash failed
hook history must not be indiscriminately removed by ordinary resource pruning.

Pinned [Argo CD 3.5.5 phase/wave/hook documentation](https://github.com/argoproj/argo-cd/blob/v3.5.5/docs/user-guide/sync-waves.md)
confirms phase/wave combination and these hook deletion policies. It also notes that
selective sync does not run hooks; setup must use a full application sync and cannot
infer bootstrap completion from a selective deployment refresh. This is a targeted
cleanup integration proposal under the existing deterministic-name contract; exact
implementation and any required targeted review remain coordinator-owned.

Local lifecycle must not wait for the successful Job object after Argo deletes it.
Require the current Application sync operation to have succeeded, Healthy/Synced
state and expected revision where known, then required deployments Available within
finite deadlines. Existing healthy old workloads must not mask a failed new hook.
CI applies the same resources directly without Argo; hook annotations have no controller
effect there, so CI waits for each actual Job's Complete condition in dependency order.
Test failure visibility/retention, same-hash retry, successful cleanup, stale old
Application status rejection and CI raw-job completion. Actual Argo prune/history
behavior remains runtime evidence, not inferred from static annotations alone.


## Loopback Argo TLS access correction

The advertised Argo browser URL remains https://127.0.0.1:18443. The owner-prepared
local leaf must include IP SAN 127.0.0.1 in addition to the two public local DNS names.
Prerequisites verify its chain, matching key, expiry, macOS trust and exact loopback IP
before mutation. Private setup provisions the same leaf/key as `argocd-server-tls` in
`argocd` after namespace creation and before controller installation; only captured
stdin/server-side apply carries private values. The dedicated Secret is platform/private
setup owned, excluded from application GitOps and public manifests. Argo's documented
dedicated server-certificate support provides matching browser identity without a
separate trust bypass or disabling TLS. [Research](research.md#argo-loopback-browser-tls-2026-10-20)
records the official source and verification boundaries.

Extend prerequisite/Secret contract tests first, retaining real local certificate/IP
validation where possible and faithful process transport doubles for Kubernetes Secret
application. Include wrong/missing IP SAN rejection before mutation, correct Secret
name/namespace/type and absent secret-bearing output. Existing CI namespace preparation
may accept an unused Argo Secret without installing Argo. Actual pinned Argo browser
TLS/auth remains integrated acceptance; no host trust/certificate change was executed.


## Implementation repair round 1 — independent findings

These targeted clarifications address reviewer findings without changing requirement
IDs or completed task history. Original reviews/hashes remain historical evidence;
reviewers must validate the concrete repairs.

### Q-I001: stable durable broker identity

Keep one RabbitMQ instance with deliberate stable resolvable hostname and explicit
stable RABBITMQ_NODENAME, independent of transient Pod/container hostname. Use Deployment
Recreate strategy (or equivalently reviewed single-instance StatefulSet), preventing
two broker processes from mounting/writing the same durable node data. Prove real
persisted queue/message state survives container replacement with a different transient
hostname while preserving the explicit broker identity. No prior deployed preview state
exists; do not silently migrate/rename existing broker data. Any unexpected old node
identity requires an explicit diagnosis/recovery decision.

### Q-I002: public configuration rollout

Use native Kustomize built-in ConfigMapGenerator documents at the existing public
source paths. Convert `deploy/base/configuration.yaml` to `apiVersion: builtin`,
`kind: ConfigMapGenerator`, metadata.name equipment-runtime and literals KEY=value;
base Kustomization loads it through generators instead of resources. Convert
`deploy/environments/local/configuration.yaml` likewise with behavior: merge; local
Kustomization loads it through generators instead of a ConfigMap patch. Preserve
labels/sync-wave annotations using generator options. The original raw UTF-8 source
paths remain the exact deterministic Job-hash inputs; no input schema/path expansion.

Convert existing local web/proxy configuration paths to the same built-in generator
format, using multiline literals `auth-config.json=...` and `nginx.conf=...` so each
public value has one source. Load through generators, retaining native content suffixes
and ConfigMap reference rewriting. Do not disable name suffix hashes. EnvFrom and
subPath volume ConfigMap references in pod templates then change when public data
changes, triggering controller rollout. Services/DNS/PVCs stay stable; private Secrets
and equipment-ca remain lifecycle-owned and are never hash inputs. No secret-derived
pod annotation or broader promotion write field is introduced. This uses built-ins
without alpha plugins, external build tools or Argo plugins.

Offline proof with pinned kubectl1.35.8 at `/private/tmp/equipment-config-rollout-proof`:
base A=one plus local B=two yielded equipment-runtime-m6b8fb6ddk; B=changed yielded
-k48mhkt4m9 and changed the Deployment envFrom reference. A generated multiline
web auth JSON changed equipment-web-b29t2m7h26 to -c5f8mg42t4 and updated the pod's
subPath volume ConfigMap reference while preserving mount path/subPath. All renders
exited 0. A generator merged into an existing plain ConfigMap did NOT gain hashing in
the probe, so the base itself must be generated. Actual-manifest mutation tests verify
these rollout-trigger contracts; actual served configuration remains runtime evidence.
[Kubernetes generator documentation](https://kubernetes.io/docs/tasks/manage-kubernetes-objects/kustomization/#configmapgenerator)
explains generated suffix/reference behavior.

### Q-I003/Q-I004: broker init reconciliation and export

Refine the prior blanket existing-output refusal: an existing complete byte-identical
regular file owned by the effective runtime UID, with exact 0600 permissions, is a
successful reconciliation. Open/inspect the same file safely without following links;
refuse mismatched/incomplete data, symlinks, nonregular files, wrong ownership/mode or
unsupported verification without overwriting anything. Missing output retains private
atomic create semantics. Ownership must be established, not inferred from readability
alone; platform interop/API details require concrete security review. Test a real init
retry against retained emptyDir state and all negative safety cases, keeping secret-free
logs. This preserves fail-closed protection while supporting safe Kubernetes init retries.

Supply the broker initContainer the same public production OTLP registration settings
and private authenticated OTLP header as other bootstraps. A faithful authenticated
collector test must observe safe correlated exported workflow/log/metric payloads from
the real CLI using production registration. Never pass credentials in command arguments
or invent a broker network span for offline file generation.

### SEC001/SEC002/Q-I005: routing and release trust boundaries

Enable TLS explicitly on the selected Traefik websecure entrypoint/router and deny
unapproved HTTP paths; no alternate ingress architecture or verification bypass.
Promotion transformations must use exact remote-parent blobs and every public input
from the parent commit being updated, or reject any parent/checkout mismatch before
writes. Preserve atomic compare-and-swap and human-edit protections; changing the
expected-head value alone cannot make stale local content safe. Committed release and
Job-suffix validation must run in PR checks independently, with an explicit narrow
initial-unreleased path rather than accepting malformed release metadata.

### Q-I006 historical process exception

Human approval on 2026-10-20 is recorded only in
[EX-012-001](team/exceptions.json). Its precise historical scope, rationale and exclusions
remain authoritative there. This link does not extend that exception to repair tests,
correctness/security findings, acceptance or external actions.


## T032 deployed telemetry verification design

Coordinator approved this bounded automated/manual split. Use the actual authenticated
Aspire Dashboard 13.6.1 public telemetry API, not guessed endpoints or independent
instrumentation. Pinned source contracts:

- [DashboardEndpointsBuilder.cs](https://github.com/microsoft/aspire/blob/v13.6.1/src/Aspire.Dashboard/DashboardEndpointsBuilder.cs): GET /api/telemetry/resources, /spans, /logs, /traces and /traces/{traceId}; spans/logs accept resource, traceId and limit; x-api-key policy.
- [TelemetryApiService.cs](https://github.com/microsoft/aspire/blob/v13.6.1/src/Aspire.Dashboard/Api/TelemetryApiService.cs): bounded response selection and production repository export.
- [TelemetryApiResponse.cs](https://github.com/microsoft/aspire/blob/v13.6.1/src/Shared/Otlp/Serialization/TelemetryApiResponse.cs): data, totalCount and returnedCount wrapper.
- [ResourceInfoJson.cs](https://github.com/microsoft/aspire/blob/v13.6.1/src/Shared/Otlp/Serialization/ResourceInfoJson.cs): name, instanceId, displayName, hasLogs, hasTraces, hasMetrics.
- [OTLP trace JSON](https://github.com/microsoft/aspire/blob/v13.6.1/src/Shared/Otlp/Serialization/OtlpTraceJson.cs), [log JSON](https://github.com/microsoft/aspire/blob/v13.6.1/src/Shared/Otlp/Serialization/OtlpLogsJson.cs) and [export conversion](https://github.com/microsoft/aspire/blob/v13.6.1/src/Aspire.Dashboard/Model/TelemetryExportService.cs): resourceSpans/scopeSpans/spans and resourceLogs/scopeLogs/logRecords with string traceId/spanId, attributes and status.

Automated smoke attaches fresh W3C traceparent IDs to its real successful reservation
creation/cancellation and one controlled authenticated GET /api/reservations/not-a-guid.
The latter returns 400 through the real reservation.get activity, Error status with
invalid_request and the structured rejected log; it is a business-validation failure,
not a simulated database/broker/identity outage. Production success expectations include
reservation.book/cancel, Npgsql spans tagged db.system.name=postgresql, and propagated
reservation.publish/consume workflows with matching trace/parent or contractual links.
Logs must correlate to the actual workflow trace/span IDs. Do not require incidental
span counts or collector-generated probe telemetry as evidence of application tracing.

Poll authenticated API responses within one 60-second telemetry observation budget,
5-second per-request timeout, limit<=500 and <=2MiB response body per request. Parse
and validate response shape/counts and OTLP records; a successful empty/stale response
must not pass. Cover actual identity HTTP operations and database/identity/broker
bootstrap workflow records through bounded resource-filtered observations after fresh
CI/startup. Temporary Dashboard restart may erase those records; fail with instructions
to obtain a safe fresh bootstrap/capture instead of claiming omitted records passed.

Inspect all fetched resource/span/log attributes, events, status messages and bodies
for known private bundle values, acquired tokens and a generic JWT pattern, plus
forbidden credential/auth/request-body/URL-query/SQL-parameter fields. Do not print
rejected values or raw payloads; safe diagnostics identify the rule/resource category.
Do not ban sanctioned business/user/equipment/event identifiers from traces/logs, or
safe source-admitted parameterized SQL text. Parent/link assertions must follow actual
production asynchronous propagation rather than assume synchronous parentage.

Pinned Dashboard 13.6.1 exposes no metric datapoint API. Automation requires relevant
resource hasMetrics=true and validates bounded response counts only; neither establishes
metric cardinality, instrument dimensions or retention pressure. Existing real production
OTLP receiver tests verify changed bootstrap bounded outcome dimensions/registration.
Detailed deployed metric labels, instrument values, retention-pressure/resource limits
and controlled provider-outage diagnostics remain explicit T035/manual acceptance.
No fabricated /metrics API, retention claim from limit=500, or synthetic telemetry
substitute is permitted. All required manual evidence remains blocking acceptance.

Test-first record: extend public smoke HTTP-boundary tests retaining real request,
parsing, polling and assertions. Faithful Dashboard HTTP doubles follow the pinned JSON
contracts and mutate missing SQL/messaging/workflow/error/log/metric-presence, wrong
trace linkage, unsafe fields/known secrets, stale/empty exports, response count/body
bounds and timeout behavior; each must fail for the intended behavior. Extend the
existing actual pinned Dashboard probe to ingest safe fixture telemetry and verify
API response shape/authentication/filtering. That is provider API contract evidence,
not application integration or real workflow/privacy acceptance. No ActivityListener,
test-only production instrumentation or registration changes are needed. Capture real
application/export results later under T035 and retain scope distinctions in quickstart.

## Verified remote Argo CD installation amendment (2026-10-23)

Owner selected final remote Kustomize implementation with local Argo-only replacement;
network access is accepted. FR-025/FR-026, AC-2.5–AC-2.7 and SC-014 govern this scope.
[Remote Kustomize design](team/remote-kustomize-design.md) owns immutable source/hash,
fetch-once verified temporary staging, exact rendered-byte apply, failure/cleanup
budgets, public/private output classification, test design and safe live qualification.
Preserve v3.5.5, existing digests/patches/TLS/lifecycle/application state; remove the
full vendored manifest and its obsolete formatting exclusion. No Helm/cache/operator,
new product branch option, migration requirement or policy exception.

Applicable standards: constitution; formatting, testing, tooling, resilience and
observability guides and required cross-references. Render/hash validation occurs
before any setup mutation; failures cannot replace working Argo. Existing application
CI lanes do not install Argo and retain their scope. Required evidence: intended red,
HTTP/process contracts, actual upstream hash and pinned render parity, local replacement,
setup rerun, stop/resume, authenticated trusted access, healthy reconciliation and
private before/after state comparisons. Independent preparation/review/convergence and
explicit human acceptance remain gates; existing pending tasks are preserved. Live
qualification preserves the current Application source; any test-only source mapping
and default-main evidence limitation must be explicit in the verification report.

Current task allocation after integration with backend follow-up work: remote Argo
installation T096–T101; retained broader-feature convergence T102–T105 in
[tasks.md](tasks.md). Existing backend T092–T095 and all historical evidence remain
unchanged. This is identifier reconciliation only; no gate or acceptance status changes.

## Image selection tooling-scope repair

The owner requested that Argo deployment/quality/test tooling changes not rebuild
application images. [The targeted design and test record](team/image-selection-tooling.md)
limits exclusions to audited non-image scripts and proven quality-script-only root
package.json changes; image builders/dependencies/workflows and unknown inputs stay
conservative. Main compares each publication baseline and retains earlier unpublished
source work. Full quality and manual dispatch behavior remain unchanged (FR-022,
SC-011); this repair does not establish broader feature acceptance.

## Quality job deduplication (2026-10-23)

Owner requested removal of the full-quality job's standalone format-check and lint
steps. Keep `npm run check` unchanged: it already verifies formatting and lint before
tooling, frontend and backend checks. Manifest-only quality and deployment remain
unchanged. This behavior-preserving configuration cleanup requires workflow diff
inspection and the formatting guide's format-check/lint gates; no new test behavior
or test changes are needed. Feature approval and existing pending gates remain pending.

PR #26 hosted run 39945632044 exposed a stale shell-lane assertion requiring the
removed standalone commands. Correct the existing assertion to reject redundant
format/lint steps while retaining its combined-check assertion. Test design: retain
the real workflow YAML parser and Bash execution; existing node/npm command-recording
doubles verify dispatch only, not application check behavior or provider fidelity.
The observable contract is full-lane invocation of the combined gate without duplicate
standalone checks. The hosted failure supplies red evidence; the shell test is Unix-only
and Windows verification must report that skip. No broader tooling-test changes or
feature acceptance are included.

Verification on Windows: focused workflow suite 12 passed/1 skipped; full tooling
suite 121 passed/6 skipped; format-check and diff whitespace checks passed. Initial
concurrent lint observed the formatter test's temporary C# fixture; serialized lint
after tooling completion passed, including a zero-warning/error build. Linux shell
qualification remains for the next PR run.

## PR validation and main release split (2026-10-23)

Owner confirmed: PR validation runs quality and ephemeral Kubernetes verification
in parallel after shared scope classification, without separate component builds.
Full Kubernetes verification builds all seven disposable AMD64 images. Main retains
independent affected-component multi-architecture publication/promotion, gated on
both validation outcomes. Manifest-only changes retain static validation and skip
Kubernetes; manual branch dispatch retains full validation/all-component release.
ARM64 build failures may first surface after merge; disposable smoke-tested images
are distinct from subsequently rebuilt published images. Restore EX-013-002's job
execution; earlier runtime failures and broader feature acceptance remain pending.

Keep validate.yaml, quality job name/completion marker and trusted component result
identities stable. Add pull-request.yaml and a shared Kubernetes verification reusable
workflow; classify before quality/deployment so neither waits for the other's tests.
Applicable standards: constitution, formatting, testing and tooling. Existing provider,
timeout, private-output and cleanup behavior is retained without new dependencies.
Public metadata/classification outputs contain only paths/mode/reason; existing
operational commands keep their audited output handling and bounded budgets.

Test design: adapt existing parsed-workflow checks for trigger/permission/gate
contracts, not every step; keep existing real Bash dispatch tests scoped to dispatch.
Exercise the actual summary CLI with success/failure/cancelled/skipped/missing results
to prove fail-closed decisions and the manifest-only exception. YAML parsing and CLI
logic stay real; supplied GitHub needs results are boundary fixtures, not evidence of
GitHub scheduling. Preserve baseline/provenance tests. Required evidence: intended
red, focused/full tooling, format/lint, workflow syntax validation where available,
and author inspection. Hosted Actions and real Kubernetes execution remain separate
qualification; no merge/publication or feature approval is implied.

Main's manifest-only baseline now also requires the same run/attempt's successful
`Kubernetes verification / Kubernetes verification` job. Historical quality-only or
suspended-deployment runs cannot qualify; discovery conservatively falls back to full
validation until a new qualifying ancestor exists. Component publication failures
still do not invalidate successful quality/Kubernetes proof. Selection explicitly
accepts only full+successful deployment or manifest+skipped deployment; component
calls use explicit cancellation/success guards so intentional skipped ancestors do
not suppress eligible publication backlog. No extra publication serialization is added.

Local verification on Windows, Node 24.15.0:

- Intended red: missing PR workflow; summary accepted failed deployment; ancestor
  discovery accepted absent/failed Kubernetes proof. Each failed for the intended reason.
- Focused workflow/manifest/deployment-validation suite: 83 passed, 4 platform/tool
  skips before pinned kubectl was installed. Full tooling with checksum-verified
  kubectl 1.35.8 subsequently passed 127 tests with 2 platform skips, including both
  actual Kustomize tests. Unix shell-lane/POSIX signal checks remain for Linux.
- Additional deployment CI/validation/promotion/smoke tooling suite: 126 passed,
  1 POSIX-symlink skip, 1 failure in the existing kubeconfig mode assertion at
  deployment-ci.test.mjs:630 (Windows reports 0666 rather than Unix 0600). Cluster
  creation is unchanged; this result is not claimed as passing qualification.
- format-check and lint passed; lint built with zero warnings/errors. actionlint
  1.7.12 (official checksum-verified temporary tool, shellcheck/pyflakes disabled)
  accepted all three changed workflows. Diff whitespace and matching shared job
  definitions were checked. Documentation links, immutable checkouts, readonly PR
  permissions, explicit skip/failure handling and unchanged release provenance were
  inspected. No application sources or dependency lockfiles changed.

Hosted scheduling, actual Kubernetes runtime/provider checks, main/manual release and
revision-matched independent review/full-feature acceptance remain pending under T108
and earlier tasks. This batch does not waive the Windows mode failure or prior runtime
failures, and does not claim complete feature qualification.
