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
reuses private ignored `.local/kubernetes` state mode 0700/files 0600, creates no
secrets if durable state survives missing bundle, and provisions Secret resources
before Argo sync. Never print secret values or dashboard token URLs. Access forwards
127.0.0.1 only. Destructive commands disable/remove reconciliation first and explicitly
scope their data loss. Certificate trust/DNS/VM changes are documented owner actions.

Image contract: application references are GHCR OCI index digests with linux/arm64
and linux/amd64 manifests. Source provenance belongs beside references. Missing genuine
first release is an actionable prerequisite failure, never a placeholder working image.


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

Each component promotion changes only its release record and overlay image entry;
database-bootstrap and identity-bootstrap may additionally update their own exact
Job wrapper nameSuffix. Other component records/image entries and unrelated wrapper
fields remain outside its mutation allowlist. A nonbootstrap component never changes
either bootstrap suffix. Missing bootstrap records keep their wrappers unreleased.
Reject symlinks, unexpected fields/files, stale suffixes, human edits or changed remote
heads. Validate the full proposal before one atomic commit/non-force branch compare-and-swap.
Candidate source is independent of current target main: manual branch publication can
propose an update, but Argo adopts only after reviewed merge. Reread main/proposal refs
immediately before mutation and preserve unrelated current-main blobs. Updating an old
managed proposal may use a merge commit preserving its ancestry for non-force CAS.
There is no provider-atomic compare-and-swap across both main and proposal refs: main
can move after the final read. A proposal never writes main directly; subsequent merge
review/revalidation must handle that residual race instead of claiming atomic freshness.
The explicit config-only refresh command changes those suffix fields without image
publication or promotion creation. Independent validation recomputes freshness.
Successful old Job cleanup is bounded and ownership-scoped; current-suffix failures and
failure evidence are retained until explicit controlled retry/reset. Service DNS and
runtime dependency endpoints never incorporate Job suffixes.


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
mutation; atomic CAS alone is insufficient to protect stale transformations. PR checks
independently validate committed release/derived Job suffixes with a narrow explicit
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
