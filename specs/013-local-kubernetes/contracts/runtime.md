# Runtime and lifecycle contracts

Application origin `https://app.equipment.test`; exact issuer
`https://identity.equipment.test/realms/equipment`.

| External route | Upstream and rewrite |
| --- | --- |
| `/` and Angular navigation | production static frontend; fixed asset handling |
| `/api/equipment` and descendants | inventory, preserve path |
| `/api/availability`, `/api/reservations` and descendants | reservations, preserve path |
| `/api/notifications` and descendants | notifications, preserve path |
| `/services/inventory/{openapi/v1.json,scalar/v1,oauth/callback}` | inventory; strip only fixed service prefix |
| `/services/reservations/{openapi/v1.json,scalar/v1,oauth/callback}` | reservations; strip only fixed service prefix |
| `/services/notifications/{openapi/v1.json,scalar/v1,oauth/callback}` | notifications; strip only fixed service prefix |
| identity `/realms/equipment/`, `/resources/` | Keycloak login/protocol/static assets |

Unlisted API operational paths and identity administration/master realm are denied at
external proxy. Documentation generated Servers use corresponding `/services/SERVICE`;
these prefixes must also proxy documented `/api/...` requests to that service, preserving
business path after stripping prefix. Reject traversal/encoded prefix ambiguities.
Callback absolute URL must equal the configured application's canonical HTTPS origin
plus exactly the service prefix and `/oauth/callback`; defaults retain canonical loopback
Aspire callback. Browser writes require exact configured Host/Origin with existing token
and content-type/fetch checks. Proxy never accepts arbitrary upstream or forwarded host.

Configuration uses environment variables already accepted by application builders;
new portability options must validate once at startup. The configuration contract is:
`Documentation:Enabled` default false outside Development,
`Documentation:ExternalBasePath`, `Documentation:Callback`, `Application:ExternalOrigin` (canonical HTTPS origin), and
`Identity:AdministrationEndpoint` (explicit internal absolute URI, no userinfo, query
or fragment), separate from `Identity:Authority`. `Documentation:ExternalBasePath`
must be one of the three fixed service prefixes or empty for Aspire. Production
nonloopback authority/WebRoot/callback settings require canonical HTTPS and exact
approved origin; Development retains canonical loopback HTTP support.

CLI lifecycle: `prerequisites`, `setup`, `status`, `access argocd|dashboard`, `smoke`,
`stop`, `reset --confirm-delete-data`, `teardown --confirm-delete-cluster`.
All commands bind to named cluster/context and reject unexpected ownership. Setup
reuses private ignored `.local/kubernetes` state with Unix mode 0700/files 0600
or owner-restricted Windows NTFS ACLs (SYSTEM/Administrators may also have access), creates no
secrets if durable state survives missing bundle, and provisions Secret resources
before Argo sync. Never print secret values or dashboard token URLs. Access forwards
127.0.0.1 only. The interactive Argo forward has no overall process deadline and
stays open until interrupted or failed; Dashboard access retains its 180-second
limit and Kubernetes API request timeouts remain finite. Destructive commands
disable/remove reconciliation first and explicitly
scope their data loss. Certificate trust/DNS/VM changes are documented owner actions.
Windows validates the retained CA against the system trust store; macOS retains
`security verify-cert`. The normal 11000 MiB memory minimum is unchanged; the
owner-approved Windows-only 8 GiB trial is explicit and recorded in
[qualification](../team/windows-local-setup.md).

Image contract: application references are GHCR OCI index digests with linux/arm64
and linux/amd64 manifests. Source provenance belongs beside references. Missing genuine
first release is an actionable prerequisite failure, never a placeholder working image.

Dashboard storage uses one Resume writer with Recreate, stable application name
`equipment-local`, and `/home/app/dashboard-data` on the retained `dashboard-data`
claim bound locally to `equipment-dashboard`. Setup prepares the node-local root
for UID/GID 1654; stop, rerun and Pod replacement retain it. Explicit reset removes
all three application PVs and exact data paths; cluster teardown destroys them.
The 1 GiB local PV allocation is not a hard filesystem quota. See
[storage design and evidence](../team/dashboard-persistence.md).

The AppProject admits namespaced Pods and ReplicaSets for workload-child inspection,
alongside its existing workload kinds; Secrets, wildcard permissions and cluster
resources remain excluded. Successful database/identity Sync hooks are deleted by
HookSucceeded; their absence after success is expected. Broker bootstrap remains a
RabbitMQ init container, not a separate Job.

The live branch-tracking experiment is temporary operational state, recorded in the
storage evidence above. The tracked Application and setup still select main; rerunning
setup resets the override. Restore main after merging the branch.


Broker definitions generation: `BrokerBootstrap` has a production executable entrypoint
around existing `BrokerProvisioning.Build`. Credential configuration is private; output
file is explicit and atomically created with private permissions; existing output follows
the secure reconciliation conditions in the repair-round contract below. Stdout/stderr
expose only bounded sanitized status, never generated definitions,
password hashes or secret configuration. Kubernetes broker initContainer writes that
file into shared emptyDir; RabbitMQ mounts it read-only under the deliberate matching
nonroot UID. Failure prevents broker readiness and remains diagnosable within finite
startup/Job budgets. The application topology remains owned by the existing production
Build method.


## Component records and bootstrap identity

Known local promotion outputs may use the narrowly scoped static quality gate in
[the manifest quality design](../team/manifest-quality-design.md). It renders with real
Kustomize and validates component/Job consistency plus existing structural/security
policy. Only validated absent known component slots may remain unresolved in this
static context; runtime/setup completeness remains mandatory. Main quality uses a
verified full-quality ancestor, not merely the previous push, and mixed/unknown changes
or missing evidence remain full quality. This gate is not runtime or provider acceptance.

Public records live at `deploy/environments/local/releases/NAME.json`, one per known
component. Each schemaVersion=1 record contains component, repository `{id,name}`,
sourceRevision, sourceRef, runId, runAttempt, workflow, image and digest. Source SHA
is exact 40-character lowercase hexadecimal; sourceRef is a nonempty repository branch;
workflow is `.github/workflows/validate.yaml`. The image belongs to the exact repository
and component; digest identifies a verified Linux amd64/arm64 OCI index. Empty/partial
records are explicitly unreleased for missing components. Overlay references must match
exactly the genuine records; setup rejects incompleteness before cluster mutation.

Deterministic Job identity and promotion scope follow the current
[component design](../team/component-pipelines-design.md).
Database/identity wrappers are the only suffixed resources; broker initialization is
an initContainer. The public suffix is SHA256 truncated to 16 lowercase hex over four
ordered, unsigned-64-bit-big-endian-length-prefixed UTF-8 inputs: recursively
Unicode-codepoint-key-sorted canonical corresponding bootstrap component JSON, raw base configuration,
raw local configuration and the corresponding raw base Job template. Arrays retain
order. No secrets enter the hash. Wrapper nameSuffix is exactly a hyphen plus that hash.

Each component promotion changes only its release record and dedicated image patch
`deploy/environments/local/images/NAME.yaml`; database-bootstrap and identity-bootstrap
also update their own exact Job wrapper nameSuffix. Root Kustomization references
are stable. Other component files and unrelated wrapper fields remain outside the
mutation allowlist. Unpublished component patches retain exactly their known component alias;
missing bootstrap records keep their wrappers unreleased.

Manual repository-branch publication can commit directly to main after the quality
prerequisite, successful publication and exact-candidate formatting, committed-state
and pinned Kustomize/static policy validation. Preserve immutable provenance, reject
stale same-component targets and preserve other main blobs. An identical digest is a
no-op retaining deployed provenance; an exact already-applied result is idempotent.
No promotion PR or automation branch is created. Use one fresh main parent and an
atomic non-force expected-head main update, rereading main before mutation. A moved
main fails safely for rerun; a changed component target requires fresh intent. Never
bypass repository branch rules or substitute elevated credentials on rejection.
GITHUB_TOKEN updates do not create recursive push workflow runs; the promoting job
therefore owns validation before main mutation. Argo reconciles main normally.
Current design: [direct component promotion](../team/direct-component-promotion-design.md).
The explicit config-only refresh command changes suffix fields without image
publication. Independent validation recomputes freshness. Successful old Job cleanup
is bounded and ownership-scoped; current-suffix failures and failure evidence are
retained until explicit controlled retry/reset. Service DNS and runtime dependency
endpoints never incorporate Job suffixes.


Broker preparation exports correlated production telemetry before process exit: workflow
`broker.definitions.prepare` from `Equipment.BrokerBootstrap`, safe structured
success/failure logs and a bounded outcome-only metric. Its public CLI validates and
writes files offline; it does not claim a broker connection span. Activity disposal and
finite trace/log/metric exporter flush occur before exit. File/config failures retain
nonzero exit and safe diagnostics while exporting an Error workflow outcome; paths,
secret material, generated definitions and raw exception details never enter telemetry.


Argo bootstrap Jobs retain deterministic suffixes and wave ordering while using Sync
hooks with HookSucceeded,BeforeHookCreation cleanup. Successful hook objects may be
removed; failed objects have no failure-deletion policy or TTL. Same-name retry replaces
the previous failed object, after diagnostics are captured; bounded retry exhaustion
leaves the final failure inspectable. Full application sync is required because selective
sync omits hooks. Setup requires current-operation Succeeded, Healthy/Synced state and
required deployments Available, rather than waiting for a deleted successful Job or
accepting stale healthy workloads. The raw ephemeral CI deployment has no Argo hook
controller and waits for actual Job completion. Never blanket-delete failed history.


Argo browser TLS: https://127.0.0.1:18443 uses the owner-trusted local leaf with an
explicit IP SAN 127.0.0.1. Prerequisites reject a missing/wrong IP SAN. Private setup
creates `argocd/argocd-server-tls` (kubernetes.io/tls, tls.crt/tls.key) before Argo install;
its documented certificate precedence replaces generated self-signed fallback. Keep
TLS and browser authentication enabled, no verification bypass, and no public ingress.
Only the existing private leaf/key is copied; never the CA private key. CI may provision
the unused Secret into its existing argocd namespace without an Argo controller.


Repair-round contracts: RabbitMQ uses one stable resolvable node identity and exclusive
single-instance replacement; transient Pod hostname must not change its data identity.
Public runtime/web/proxy ConfigMaps are generated by native Kustomize built-ins from
the existing fixed public source paths. Content hashes rewrite pod-template envFrom/
volume references, causing public configuration rollout while Services/PVCs stay stable.
Private Secret/CA content is excluded; Job hash paths and promotion field scope are
unchanged. Existing broker output reconciles successfully only when complete identical
regular owned0600 data is safely verified; unsafe/mismatched output fails without write.
Broker init receives authenticated production OTLP configuration. Promotion operates
on exact remote-parent content/all public inputs or refuses stale local state before
mutation; atomic CAS alone is insufficient to protect stale transformations. Promotion candidate checks and applicable PR/main checks
validate committed release/derived Job suffixes with a narrow explicit
initial-unreleased state. Historical exception scope remains solely in
[EX-012-001](../team/exceptions.json).


Deployed telemetry smoke uses pinned Dashboard13.6.1 authenticated resources/spans/logs/
traces API and its data,totalCount,returnedCount OTLP wrapper. Real smoke success and
controlled invalid-reservation-id failure get fresh W3C trace IDs; workflow/dependency
spans and structured logs must correlate to those IDs, with safe attributes. Observe
identity/bootstrap records after fresh capture, reject missing/stale exports, and scan
all fetched fields for private known values/tokens without printing them. One60s poll
budget,5s request budgets,limit<=500 and2MiB response cap bound verification. Resources
hasMetrics establishes ingestion availability only: pinnedAPI has no metric datapoints.
Detailed dimensions/cardinality/retention pressure and actual provider-outage failures
remain explicit manual/runtime acceptance. See [the test design](../plan.md#t032-deployed-telemetry-verification-design)
for exact pinned sources, public HTTP doubles and real Dashboard contract probe.

## Argo installation source contract

FR-025/FR-026 installation uses verified immutable v3.5.5 upstream bytes, existing
local Kustomize configuration and digest overrides, without a committed full upstream
manifest. Supported setup fetches and verifies once, renders temporary staged content,
and applies that exact rendered artifact. Source unavailable or checksum-invalid fails
within the [design budgets](../team/remote-kustomize-design.md) before any setup mutation.
Direct kubectl remote rendering does not itself provide checksum enforcement. Temporary
resources are owned and cleaned; raw provider errors/content are not diagnostics.

Argo-only replacement preserves cluster/application namespaces, all retained state,
application credentials and existing trusted TLS material. It suspends reconciliation
and removes Application without cascading before controller replacement, then restores
existing desired Application/AppProject state. It never implies reset/teardown or
migration support. Local test harness may preserve the existing authorized source ref
without changing product main defaults; qualification identifies that boundary.
