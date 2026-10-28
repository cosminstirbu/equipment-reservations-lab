# GitOps implementation evidence

Feature 014; baseline d1c7238345136340ddbf3a9454807cefffc43c32; working-tree implementation.
Only assigned paths edited. Runtime-dependent manifests await reviewed projection
contract release; no permissive placeholder/runtime defaults introduced.

## Preparation

Applied speckit-implement. Explicit Git Bash command succeeded:
`SPECIFY_FEATURE_DIRECTORY=specs/014-azure-aks-gitops bash .specify/scripts/bash/check-prerequisites.sh --json --require-tasks --include-tasks`.
Resolved feature 014. Checklists: azure-operations 20 checked/0 open;
requirements 16 checked/0 open. `.specify/extensions.yml` absent; no hooks.
Default Windows bash shim was inaccessible; explicit C:/Program Files/Git/bin/bash.exe
worked. npm.ps1 execution-policy blocked; npm.cmd used successfully thereafter.

## Test design and RED/GREEN

Public boundary: actual kubectl 1.35.8 Kustomize rendering and parsed Kubernetes
objects. Real base/local overlays retained, no renderer double. Tests verify
rendered deployment authority/storage/network contracts, not Azure runtime outcomes.
KUBECTL explicitly overrides tool path; Linux defaults PATH kubectl.

`node --test scripts/azure-deployment.test.mjs` initially failed two Azure entry
points while unchanged local rendering passed. Added storage implementation:
StandardSSD_LRS CSI, Retain, WaitForFirstConsumer and expansion rendered/passed.
Added network test failed missing entry point, then rendered deny-default and
explicit protocol/port/peer policies passed. Added Argo project authority test
failed missing entry point, then explicit projects passed.

Latest focused result: 4 passed, 1 failed (expected missing Azure application
entry point while runtime-dependent work held). This is partial work, not a task
completion or passing feature claim. No task checkboxes modified.

## Files

- scripts/azure-deployment.test.mjs
- deploy/platform/azure/storage/{kustomization.yaml,storage.yaml}
- deploy/platform/azure/network/{kustomization.yaml,policies.yaml}
- deploy/argocd/azure/projects/{kustomization.yaml,projects.yaml}
- team/gitops-preflight.md and this evidence record

Exact source files formatted after each edit via npm.cmd run format -- FILES,
then reread. Full format-check/lint and vendor schemas/runtime tests pending final
implementation. Static network policy checks do not prove live packet denial.

## Integration requirements

Azure Job pod templates must add app.kubernetes.io/name labels (base Job metadata
alone has them) for explicit network peers. Namespace contract accepted:
equipment, equipment-platform, argocd, cert-manager. Private diagnostic forwards
must use pod port-forward for management endpoints; no management ingress allowed.

Runtime projection now chosen as reviewed committed nonsecret Git configuration.
Dependent source waits targeted architecture review. Need canonical workload
secret map and generated/runtime projection schema, including per-client OTLP
bearer/TLS, OIDC role/claim and bootstrap order. No source value invents these.

## Canonical Key Vault object inventory

Published to Terraform and secret-generator owners. Keys are per-workload synced
Secret keys; object names are vault names. No aggregate Secret is mounted.

| Workload | key:object-name |
| --- | --- |
| postgres | postgresAdmin:postgres-admin |
| database-bootstrap | postgresAdmin:postgres-admin, inventoryDb:inventory-db, reservationsDb:reservations-db, notificationsDb:notifications-db, keycloakDb:keycloak-db, otlpToken:database-bootstrap-otlp |
| keycloak | keycloakDb:keycloak-db, identityAdmin:identity-admin |
| identity-bootstrap | identityAdmin:identity-admin, alice:alice, bob:bob, manager:manager, staff:staff, reservationsClient:reservations-client, otlpToken:identity-bootstrap-otlp |
| inventory | inventoryDb:inventory-db, otlpToken:inventory-otlp |
| reservations | reservationsDb:reservations-db, reservationsClient:reservations-client, rabbitPublisher:rabbit-publisher, otlpToken:reservations-otlp |
| notifications | notificationsDb:notifications-db, rabbitConsumer:rabbit-consumer, otlpToken:notifications-otlp |
| rabbitmq | rabbitAdmin:rabbit-admin, rabbitPublisher:rabbit-publisher, rabbitConsumer:rabbit-consumer, brokerAdminSalt:broker-admin-salt, brokerPublisherSalt:broker-publisher-salt, brokerConsumerSalt:broker-consumer-salt, otlpToken:broker-bootstrap-otlp |
| dashboard | dashboardApi:dashboard-api, dashboardOtlp:dashboard-otlp, oidcClientSecret:dashboard-oidc-client-secret |
| argocd | oidcClientSecret:argocd-oidc-client-secret |
| otel-collector | inventoryToken:inventory-otlp, reservationsToken:reservations-otlp, notificationsToken:notifications-otlp, databaseBootstrapToken:database-bootstrap-otlp, identityBootstrapToken:identity-bootstrap-otlp, brokerBootstrapToken:broker-bootstrap-otlp, dashboardOtlp:dashboard-otlp, prometheusToken:prometheus-api-token, lokiToken:loki-api-token, tempoToken:tempo-api-token |
| prometheus | apiToken:prometheus-api-token |
| loki | apiToken:loki-api-token |
| tempo | apiToken:tempo-api-token |
| grafana | adminPassword:grafana-admin-password, prometheusToken:prometheus-api-token, lokiToken:loki-api-token, tempoToken:tempo-api-token |

Tokens are base64url random unreserved ASCII. Application OTLP header contract:
`authorization=Bearer%20$(OTLP_TOKEN)`; .NET exporter explicitly unescapes encoded
headers before parsing ([official implementation](https://github.com/open-telemetry/opentelemetry-dotnet/blob/main/src/OpenTelemetry.Exporter.OpenTelemetryProtocol/OtlpExporterOptionsExtensions.cs)).
Collector Dashboard export remains `x-otlp-api-key`. Internal TLS cert/key issuance
uses cert-manager private CA, not generated Key Vault application secret objects.
Loki/Tempo require supported TLS authentication proxies: they do not natively enforce
these reserved bearer-token objects. Actual provider/config qualification pending.

## Implementation and native-provider evidence (2026-10-26)

The earlier pending configuration notes above record the initial RED stage. The
current bounded source implements Azure overlays, retained StorageClass, scoped
workload identities/CSI, deny-default network policies, pinned Traefik/cert-manager,
four public certificates, internal encrypted telemetry, Entra operator routes and
separate Argo platform/application projects. Local/base manifests remain unchanged.
Runtime projection writes only reviewed allowlisted nonsecret outputs. Image
patches and provenance envelopes belong to promotion and are independently checked;
routine image releases never alter the runtime configuration hash. Source without
runtime or any immutable image is deliberately unconfigured and fails rendering.
Offline tests stage a complete explicitly fake projection instead of accepting a
partial production tree. Installer-only Argo SPC/OIDC files are excluded from
GitOps ownership to avoid a bootstrap dependency cycle.

`AZURE_PROVIDER_CONTRACTS=1 node --test scripts/azure-runtime.test.mjs
scripts/azure-deployment.test.mjs scripts/azure-observability.test.mjs` passed
25/25, zero skipped, on Windows/Podman (50.17s). Actual pinned vendor binaries
accepted collector/Prometheus/Loki/Tempo production configuration. Actual
Prometheus/Loki/Tempo query APIs through production TLS Nginx proxies returned
401 for absent/wrong credentials and 200 for correctly authenticated queries,
with normal trusted localhost/IP certificate verification. Provider contracts
caught and repaired unsupported Tempo v2 compactor syntax, readonly-root live
store paths, and Nginx readonly-root temporary directory defaults. These tests
establish startup and query authentication, not elapsed 72-hour retention or
actual application three-signal correlation/privacy.

Dashboard Azure startup probe was separately RED (missing field), then GREEN
through actual kubectl rendering after adding a bounded startup TCP18888 probe.
Its diagnostic HTTP port remains private behind authenticated encrypted kubectl
tunnels; OTLP18889/18890 and history proxies use HTTPS. Azure removes inherited
equipment-ca volumes; public HTTPS uses operating-system roots. Exporter trust
uses equipment/collector-trust Secret ca.crt issued before platform health. Private
forward clients trust only public tls.crt from cert-manager/equipment-internal-root,
never the root private key. Each internal server certificate includes localhost
and 127.0.0.1 SANs as well as service DNS.

### Recovery SQL and HBA boundary

T062 first failed because database-bootstrap.sql did not exist. The standalone
reviewed SQL and Azure-only pg_hba.conf are now authored but deliberately not
wired to an active Application pending staged qualification architecture.
`AZURE_PROVIDER_CONTRACTS=1 node --test scripts/azure-database.test.mjs` passed
2/2, zero skipped (38.43s), against the exact existing pinned PostgreSQL image.
It executes SQL twice and proves no global role flags, read-only complete dumps
of all four databases, no-owner/no-privileges restore through exact SET-role
memberships, schema reset and trusted btree_gist restoration, normal application
authentication, unrelated and newly created PUBLIC-CONNECT database rejection,
and fail-closed dumping under RLS rather than omitted rows. Credentials/provider
outputs stay in private capture, ephemeral fixture container is removed finally.

The explicit HBA allow-four-then-reject rules implement the approved future-DB
denial constraint: role REVOKE alone cannot override PostgreSQL PUBLIC CONNECT on
new databases. Rules cover IPv4, IPv6 and local recovery connections before normal
application scram authentication, without changing local/base behavior or adding
trust. Native local-socket rejection, actual AKS resourceNames exec/scale probes,
and admission allow/deny/cleanup qualification remain pending before authority
activation. Recovery real credentials, SQL role creation and production bindings
must remain absent until hosted backup/restore identity qualification passes.

The optional recovery Application source is reserved at
deploy/platform/azure/recovery and excluded from platform root. Initial app
readiness must not depend on recovery credentials or database roles. The exact
third projection/activation seam is being finalized by the architect and primary
implementation owner. Independent renderVerificationResources(pointHash) provides
one bounded pinned isolated PostgreSQL Job and matching per-point ClusterIP
Service; pointHash accepts only sixteen lowercase hex characters. Full strict
admission enforcement and native qualification are still pending; this helper
alone grants no resource-creation authority.

### Final bounded source seam and checks

The architect finalized three reviewed projection maps: applicationFiles (three
files), platformFiles (six files), recoveryFiles (four files), sharing generation
and canonical nonsecret outputHash. The additional platform file
recovery-qualification-bindings.json is installer-only and excluded from every
Kustomization. Its two exact bindings authorize only harmless named qualification
probes. Ordinary bootstrap after recovery activation must never reapply them.
Reviewed activation first removes static qualification Pod references, waits for
platform Synced at that exact reviewed commit, then checks UID/ownership and
deletes retained probe Pods and bindings before starting the optional recovery App.
Credential-free qualification uses a distinct no-WI ServiceAccount; production
workload identity ServiceAccounts and all real CSI clients/bindings/SQL Job exist
only in the optional recovery source. recoveryWorkloadSecrets is a separate export,
so initial application secret population cannot create recovery credentials.

The optional source now independently renders two fixed authenticated-psql client
Pods, scoped CSI, production RoleBindings, bounded SQL hook and narrow database/
verification NetworkPolicies. Verification Job/Service creation rights depend on
Fail/Deny policies equipment-verification-jobs and equipment-verification-services.
These policies restrict names, selectors, one pinned server, exact credentials,
nonroot/readonly security, bounded ephemeral volumes, commands and port5432;
Service policies reject external routing. Actual CEL type checking, permitted
creation, mutated-template denial, point-owned cleanup and Azure SP native RBAC
qualification remain activation gates. Static schemas are not this evidence.

Recovery SQL and native HBA tests expanded to positive PostgreSQL OS-user socket
and IPv6 controls followed by actual backup/restore socket and future-DB IPv6
denials. The isolated verification template itself starts as uid999 with readonly
root/capability drop and authenticated readiness using the exact pinned provider.
The operations owner's exported fingerprint SQL runs under the actual backup role
before dump and after restore across all four databases, including JSON unicode/
null content and sequence state. An intended native RED demonstrated silent RLS
row omission by the original fingerprint query; the owner added row_security=off
and quiet psql output. Native recheck passed 3/3, zero skipped (88.76s). This proves
logical equality and fail-closed RLS, not cryptographic backup integrity; AES-GCM
and SHA256 remain the separate integrity controls.

Scoped format-check and ESLint (six owned .mjs files, max-warnings0) pass. Source
snapshot before final combined tests comprises65 files across the three owned
Azure deployment directories and six scripts, SHA256
bc24570c5c4a0950682d4fc8785b0a6a22da79617ef242011a69cf7a0475e7ce
(sorted relative path + NUL + bytes concatenation). Full repository checks,
independent verdicts and live Azure/browser/hosted/recovery acceptance belong to
the coordinator and remain pending. Broker-monitor/drain is a newly proposed
design delta and was not silently implemented in this batch.

## Approved T067 monitor and standalone Dashboard provider qualification

After the separately reviewed monitor design delta was released, Azure-only RabbitMQ
configuration imports the existing private initialization definitions together with
one private salted-hash monitoring definitions object. The existing RabbitMQ workload
identity alone reads broker-monitor-definitions; the protected paired monitor password
is supplied separately to bootstrap and backup. It is never projected into Terraform,
Git, the monitor Pod or backup Key Vault permissions. The fixed optional recovery
monitor forwards only the exact raw queue GET through normally verified RabbitMQ TLS;
backup alone can forward that named Pod. Restore has no monitor forwarding authority.

Native RED exposed unsupported management.tcp.port=none. The corrected reviewed
configuration uses RABBITMQ_CONFIG_FILES to exclude Docker defaults and enables the
TLS management listener. Actual pinned RabbitMQ plus the pinned repository
RabbitMQ.Client7.2.2 fixture verifies ready/unacked/acked transitions, monitoring HTTP
mutation denials and AMQP publish/read/delete denials. Production nginx proxy denies
alternate methods, encoded paths and queries; wrong passwords and wrong upstream CA
fail closed. Captured logs remain private and are checked for fixture credential
absence. Fixture cleanup attempts every owned resource and validates temporary paths.

Standalone Dashboard qualification follows aspire-monitoring and the official
Dashboard provider configuration. Actual pinned Dashboard starts under the source
readonly/nonroot and CPU/memory constraints. Correct API and HTTPS OTLP keys work;
missing/wrong keys fail. A faithful HTTPS Discovery/JWKS double supplies only the
OpenID discovery boundary. The actual authorization challenge proves redirect_uri
https://dashboard.codingfunlab.com/ (root); an unsolicited invalid callback never
creates an authenticated session. This is not Entra login, group/role or browser
acceptance. The Terraform callback mismatch was sent to its assigned repair owner.

Final owned provider regression command, with AZURE_PROVIDER_CONTRACTS=1:
node --test scripts/azure-runtime.test.mjs scripts/azure-deployment.test.mjs
scripts/azure-observability.test.mjs scripts/azure-database.test.mjs
scripts/azure-broker.test.mjs scripts/azure-dashboard.test.mjs.
Result: PASS36/36, zero skips, 84.24s. Includes actual pinned telemetry, PostgreSQL,
RabbitMQ and Dashboard providers. Scoped Prettier verification and ESLint across nine
owned scripts pass, zero warnings. Native C# fixture build -warnaserror and
suggestion-level dotnet format style --severity info --verify-no-changes pass.
These native provider tests require Podman explicitly; Docker parity is not claimed.
An earlier message incorrectly claimed runtime selection support and was corrected.
Hosted workflow owner received the explicit Podman prerequisite.

## Round5 SEC-GO001 and SEC-GO003 repairs

SEC-GO001: actual isolated Kubernetes1.35.8 API initially reported CEL quantity-map
schema warnings; dyn() only around resource/emptyDir quantity objects retains exact
comparisons and eliminates warnings. The resulting native RED admitted an extra
request resource. Added exact resource-map cardinality, CSI fsType/secret/attribute
exclusions, no dnsConfig, and exact default termination message path/policy. The
actual native API admits reviewed defaulted CREATE/UPDATE and denies eight independent
mutations on both CREATE and UPDATE (PASS1/1, zero skips,79.25s). Unsafe Jobs are seeded
before binding behind a zero-Pod quota; no-op UPDATE tests admission rather than
immutable-template rejection. The exact named temporary cluster was deleted.

SEC-GO003: public rendered Role test first failed because exact Deployment GET was
absent, then passed after adding only GET on web/inventory/reservations/notifications/
keycloak alongside the existing exact scale GET. No restore mutations were added.
Expanded native Service admission and Role authorization checks are recorded below
when complete. SEC-GO002 was independently retracted after source context review:
recovery SQL Job is in equipment, outside the recovery-namespace policy. SQL Job,
AppProject and runtime source were preserved during this repair.

Native tool provenance: kind0.33.0 Windowsamd64 executable SHA256
4b22adaa135368c5a465d56bbd8e520cbea87272a06ca00b6078e7b81515c9fc matches
the official release checksum. Linuxamd64 checksum supplied to workflow owner:
aee6151561422756b764a4ae28e7f44cda5af5a9eead3cc9985112b1de8d8e0d.
Node image is pinned to kindest/node:v1.35.8@sha256:
07b2536e30b803ed61d1677a79df6115f798ce64c80f9e22f6ed45afd09323c0.
Native fixture uses a fresh exact name, private explicit kubeconfig/context and bounded
cleanup; it does not access an existing cluster or Azure. Actual AKS CEL and hosted
Entra service-principal qualifications remain required before recovery activation.

Final expanded native command: AZURE_PROVIDER_CONTRACTS=1 with KIND set to the
verified kind0.33.0 executable, node --test scripts/azure-admission.test.mjs.
Result PASS1/1, zero skips,93.95s. In addition to all eight independent Job mutations
on CREATE/UPDATE, exact defaulted Service CREATE/UPDATE pass and external-routing
Service CREATE/UPDATE are denied by policy. Impersonating a distinct fixture native
user bound only to the authored restore-scale Role, actual GET succeeds for each
of the five named Deployments and scale subresources; unrelated GET fails. Native
self-access reviews deny create/patch/update/delete/list/watch on Deployments and
scales. Fixture impersonation is not a claim about Entra username mapping. All
resources stayed in the exact temporary cluster, and cleanup completed successfully.
One intermediate fixture run failed on unsupported kubectl can-i --resource-name
syntax; the corrected TYPE/NAME and --subresource syntax gives the final evidence.

Bounded handoff pending items: independent review closure for SEC-GO001/003; actual
AKS/Entra/hosted admission and authorization qualification; browser/DNS/live TLS and
recovery acceptance. Operations identified additional exact Argo Application/
AppProject and bootstrap Job readiness read roles; coordinator assignment is pending
and those permissions were not silently added in this finding repair. No user
acceptance or feature completion is asserted by this author evidence.

## Approved T070/T071/T073 bounded source and native ACME snapshot

The coordinator released reviewed observation/continuity and exact binding ownership
before edits. The public rendered Role regression first failed on missing namespace
Pod-list authority, then passed with explicit equipment-only pods/list; no resourceNames
label-filter claim, get/watch/exec grant or other namespace list was added. Backup
receives exact five Deployment GET; restore receives exact database-bootstrap and
identity-bootstrap Job GET. Exact equipment TLS Secret access joins the existing
actor scale Roles: backup GET, restore GET/PATCH/UPDATE existing named objects.

Unbound platform Roles equipment-recovery-ACTOR-continuity in cert-manager and argocd
name only the two account Secrets and argocd-public-tls respectively; argocd also names
only Application/AppProject equipment-azure GET. The same Roles allow GET of their own
exact Role/RoleBinding for drift observation, following the existing native model.
Unbound ClusterRoles equipment-recovery-ACTOR-issuers grant GET only to the two named
production/staging ClusterIssuers, for both actors after reviewed clarification.
No ClusterRole/Binding read or mutation was silently added. The required per-operation
cluster RBAC drift-read authority remains unresolved/proposed; architecture/coordinator
were notified before adding such rights.

The generator first failed its new exact-inventory test, then emits exactly six
installer-only objects in platformFiles[recovery-continuity-bindings.json], excluded
all Kustomizations. Subjects are only the corresponding reviewed actor principal IDs;
there are two namespace RoleBindings and one ClusterRoleBinding per actor. Optional
recovery still owns its existing four equipment/recovery bindings. AppProject
cluster authority and destinations remain unchanged. This new reviewed file requires
primary installer/closure and central quality-gate integration before activation;
fixture rendering does not grant live authority or establish that integration.

Final source command node --test scripts/azure-runtime.test.mjs
scripts/azure-deployment.test.mjs: PASS24/24, zero skips,3.49s. Scoped Prettier and
ESLint max-warnings0 pass for the four edited scripts and roles JSON. VAP source is
unchanged from independently closed SEC-GO001. Newly expanded authorization grants
still need actual native allow/deny and hosted identity qualification; prior native
SEC003 tests do not automatically qualify these later grants.

### Native account/key restoration boundary

NEW scripts/azure-acme.test.mjs uses the verified kind0.33.0/kubectl toolchain and
pinned Kubernetes node, actual rendered cert-manager1.21.3 controller+CRDs/RBAC, and
Pebble2.10.1 at immutable multiarchitecture digest
sha256:ddf230642b1a584f519f32e347de1b05a6e4c1f6c35c1863b33effeab5f78199.
Official Pebble release source is commit b1e1ca4f3c30abb64111adaca4544bc5374cc306.
It creates a normally trusted ephemeral HTTPS CA/certificate and a separate Pebble Pod;
no public ACME server, Azure, DNS challenge or certificate issuance is involved.
Only controller-relevant vendor prerequisites are installed; webhook/cainjector and
certificate challenge/renewal paths are outside this account-registration contract.

For BOTH exact issuer names, the real controller registers an original account/key,
then a replaced RSA key and different cached account URI. It is stopped while Pebble
continues retaining both registrations. Guarded Secret replacement restores old keys
with new resourceVersions. Actual stale Ready=True remains, but the shared operations
assertAcmeReconciliation rejects it repeatedly while reconciliation is unavailable.
After controller restart, the actual status returns the original account URI and
lastPrivateKeyHash matching BASE64(SHA256(PKCS1 DER)), and the current Secret version
matches the guarded replacement result. The shared validator rejects the real new-key
account against original expectations and an expected-directory mismatch. This does
not claim an actual malformed ACME directory request, real operator CLI timeout,
certificate renewal or production browser trust test.

Pinned checksum implementation source:
https://github.com/cert-manager/cert-manager/blob/v1.21.3/pkg/issuer/acme/setup.go#L440.
Its nearby TODO confirms no observed-Secret-resourceVersion status field exists;
the test does not invent one. Account/key/status responses and process output are
private, and only safe phase/status metadata can escape. Exact temporary cluster and
validated private fixture directory cleanup succeeded on the final run.

First native fixture attempt failed during kind digest-image loading; the final
fixture lets kubelet pull the exact immutable image references. Native command
AZURE_PROVIDER_CONTRACTS=1 node --test scripts/azure-acme.test.mjs: PASS1/1,
zero skips,100.89s. The coordinator's process-budget hold arrived during this run;
no further source repair was performed after the hold. Independent review and actual
AKS identity/recovery/ACME certificate acceptance remain pending.

Frozen SHA256:

- scripts/azure-runtime.mjs A9C938D2C446013726C32FECC90C69776962DD28C589F099D42551796816B26B
- scripts/azure-runtime.test.mjs B39DA19C0A6A90A0172D30137915252422028A3B726F052EE0499562E6FCD8BD
- scripts/azure-deployment.test.mjs AFCD187BB8ACE68EEFE15C79D2220A99E5CF9F55A14EE6673E77D04A84700ED2
- scripts/azure-acme.test.mjs 15C7770E7B5BE5C8132CB965B4F361A6211AE78F169A0C6B583CB7EAE2133A2E
- deploy/platform/azure/recovery-controls/roles.json 20EC8707149ECCB3EB33413AEBBF34E5895414C262084740E75C4A023F09E2F4
- deploy/platform/azure/recovery-controls/admission.json 037480D6263FCD6A92249388E51BFF937BE092BEF6531ADF6A7C6570ABC1F3AF

## Approved own-authority drift metadata completion

Coordinator released authoritative contract60FC1D4F2D7E335E07CA2F85A9B3C9412BD801E5F46F0346A311DAF97400CFBF
before this bounded batch. The prior unresolved cluster metadata authority is now
explicitly approved. No Azure ARM permission follows from this Kubernetes change.

The rendered source test first failed on the missing own ClusterRole/Binding GET
rule. Both equipment-recovery-ACTOR-issuers ClusterRoles now add only GET of
clusterroles and clusterrolebindings with resourceNames containing their own exact
same name. The existing GET of the two named ClusterIssuers remains unchanged.
The four namespace Roles already name only their own Role/Binding GET and were
preserved. No other actor, list/watch/write, arbitrary name or namespace grant was
added. Runtime generator maps and six installer-only binding output bytes are
unchanged from the previous frozen14-path inventory; no AppProject expansion.

Expanded scripts/azure-admission.test.mjs retains all actual VAP Job CREATE/UPDATE,
Service default/negative and restore scale controls. It additionally installs the
authored Roles and real generated six installer-only plus four optional bindings in
its own isolated cluster, using DISTINCT backup/restore fixture principal IDs.
Actual official CRDs make issuer and Argo GET requests real API operations.
All seeded Jobs are suspended and the observed Pod is scheduling-gated; no workload
runs or connects to a real application. Public test inputs contain synthetic Secrets
only. Private output capture is retained, including every Secret response.

Native boundary checks:

- Each actor GETs its own four namespace Roles/Bindings and own ClusterRole/Binding;
  the other actor's existing objects are actually denied. Self-access reviews reject
  wrong namespaces, unrelated names and list/watch/create/patch/update/delete.
- Both actors actually GET exactly the two issuers and equipment-azure Application/
  AppProject; unrelated existing objects and mutation/list/watch permissions fail.
- Both actors actually GET the five exact Secrets. Existing resourceVersion-guarded
  server-dry-run UPDATE and PATCH are permitted to restore and denied to backup.
  All other Secret/internal-CA reads and create/delete/list/watch authority are denied.
- equipment-only Pod LIST succeeds, while GET/watch/writes and other-namespace LIST
  fail. Restore alone GETs the two exact seed Jobs; both cannot GET an unrelated Job.
  Both actors GET the exact five Deployment objects. Existing restore scale GET and
  scale/main-resource write denials remain covered.

An intermediate run reached restore PATCH and failed on test transport, not RBAC.
An independent --local=true probe with an explicit EMPTY kubeconfig proved kubectl
opens literal '-' for --patch-file=-. The fixture now uses an owned mode0600 patch
file inside its validated temporary directory; it does not broaden grants or put
Secret data in command arguments. The real patch tests guard the current
resourceVersion. Both intermediate and final exact clusters were cleaned up.

Final command AZURE_PROVIDER_CONTRACTS=1 node --test scripts/azure-admission.test.mjs:
PASS1/1, zero skips,206.90s. kind/kubectl are now selected through the existing
checksum-verified quality toolchain. Required-profile absent prerequisites fail;
the native test is skipped only when that profile was not requested.
node --test scripts/azure-runtime.test.mjs scripts/azure-deployment.test.mjs:
PASS24/24, zero skips,4.23s. Scoped format-check and ESLint max-warnings0 pass.

This qualifies native Kubernetes authorization behavior using fixture impersonation,
NOT actual Entra service-principal mapping, AKS authorizer ordering, live CSI reload,
installer operation sequencing, hosted qualification or restored browser acceptance.
Those remain mandatory gates. No task/checklist/reviewer verdict was changed by this
author. The previous frozen VAP, broker proxy and ACME provider test are unchanged.

Current bounded frozen SHA256:

- deploy/platform/azure/recovery-controls/roles.json 670DEE14403FADA6628AEBF0FF30398103AA96355236F5221CCCFB6C9AAA9310
- scripts/azure-deployment.test.mjs 67DDCB09691352C78D750886F619FB696EF93E482C9FAAE42CAB5B58C6DF1C6A
- scripts/azure-admission.test.mjs A50311AF73CB0E002F4951570E436AE2904DD984AC4DEE6D31B37EF7DBAD44B7
- scripts/azure-runtime.mjs A9C938D2C446013726C32FECC90C69776962DD28C589F099D42551796816B26B
- deploy/platform/azure/recovery-controls/admission.json 037480D6263FCD6A92249388E51BFF937BE092BEF6531ADF6A7C6570ABC1F3AF
- deploy/platform/azure/recovery/monitor/nginx.conf 87C2E31A6531A2C076CB76288B0F61B7B9892078FE89AD8DB49DCA6984D6F2E2
- scripts/azure-acme.test.mjs 15C7770E7B5BE5C8132CB965B4F361A6211AE78F169A0C6B583CB7EAE2133A2E

## T073 actual runtime inventory gate integration

New bounded ownership from coordinator: scripts/manifest-quality.mjs and its existing
tests. Intended public RED2/2 showed the complete synthetic14-file installation was
rejected because the platform allowlist still named6 rather than7 outputs; the same
partial-runtime failure also prevented the new installer-reference negatives reaching
their required failure phase.

The exact platform list now includes recovery-continuity-bindings.json. Complete
absence remains explicitly unconfigured, mixed/missing/extra files still fail, and
no directory/glob exclusion was introduced. Four literal installer-only paths are
denied after local reference resolution in every inspected Kustomization reference:
continuity bindings, qualification bindings, Argo bootstrap patches and Argo bootstrap
resources. Windows filesystem case semantics are respected. These files are never
ordinary Kustomize resources. Both binding inventories are independently included in
native schema validation; malformed private fields remain suppressed in diagnostics.
Other Argo installer patch/resource byte contracts remain the primary generator/
installer validator's responsibility; this gate does not install them.

New public regressions cover complete seven-file platform acceptance, missing and
unknown output denial, all four installer references, and malformed continuity and
qualification schemas. Existing remote input, Pod policy, admission, release metadata,
local Kustomize and quality-selection tests remain intact. New fixture cleanup uses
the existing resolved-exact-temporary-path guard.

First full run:19 passed,1 failed,2 preexisting profile skips. The failure compared
GLOBAL temporary-directory snapshots while another agent concurrently invoked the
same public gate: one unrelated equipment-azure-quality directory disappeared while
another appeared. This was diagnosed as shared-state test interference, not accepted
as a pass or used to relax cleanup assertions. Coordinator approved one isolated rerun;
primary temporarily paused central-gate calls. No permanent sequential exclusion or
production logic change follows from that diagnostic window.

Final command with MANIFEST_KUBECTL set to the checksum-verified kubectl executable:
node --test scripts/manifest-quality.test.mjs — PASS22/22, zero skips,84.35s.
The profile exercises both existing real local Kustomize/CLI cases. Scoped Prettier
and ESLint max-warnings0 pass. Primary actual-Git/source+target native full-tree
integration also reported PASS36.1s against this corrected gate. The temporary window
has ended; other agents may call the gate again. Independent review remains pending.

Frozen gate source SHA2562762722B8E0F5F35A376F3B90AE3875085474068C365487169D940D1E4AA3B6E;
frozen test SHA256C63F87CBB763D3D3373C966AC3673914070ED3D54A61E6C6788F397A87B5D400.
No previously frozen RBAC, VAP, proxy, ACME or runtime generator source was changed
by this gate batch.

## T082–T084 strict generator and private contact omission

Coordinator-released B23C/ACME59AF preparation gates authorize one shared canonical
input module, schema version2, and omission of ACME email. Primary owns
azure-generator-input.mjs; the runtime renderer imports its validator/hash/version
without a duplicate schema. Publisher roots require the explicit projector; strict
renderer input contains config8/foundation4/environment4, with exact nested maps.
The fourteen synthetic outputs share the same canonical hash and version2 metadata.
No actual runtime configuration was fabricated or committed.

Test design: public renderer assertions exercise strict-wrapper rejection, canonical
hash equality, unused private-root independence, consumed IP changes, and private
contact absence from both ClusterIssuers and every generated file. The intended
RED showed the old emitted issuer email. A second intended RED showed the old gate
rejecting current version2 metadata. The public native-schema gate now accepts v2
and rejects coherent old v1 metadata in all three projection roots; there is no
compatibility downgrade. Existing pinned certificate CRDs validate omitted email.
The first consumed-IP assertion accidentally reused the fixture IP; corrected to a
distinct valid IP before the final pass, without changing implementation.

Focused renderer tests PASS12/12 zero skips2.64s. Runtime+deployment combined prior
to the additional canonical integration assertion PASS25/25 zero skips3.21s.
Versioned public gate focused test PASS1/1 zero skips7.68s. Scoped Prettier and
ESLint max-warnings0 pass. Initial command used nonexistent format:check alias;
correct required format-check command passed. Native no-email account recovery
and unchanged authorization fixture runs are recorded below when complete.

Final strict-generator combined command:
node --test scripts/azure-generator-input.test.mjs scripts/azure-runtime.test.mjs scripts/azure-deployment.test.mjs
PASS28/28, zero skips,3.81s. The expected authored Azure source remains unconfigured;
its existing fail-closed render-negative assertion emits the missing-runtime diagnostic.

Authorized native integration command with AZURE_PROVIDER_CONTRACTS=1:
node --test scripts/azure-acme.test.mjs scripts/azure-admission.test.mjs
PASS2/2, zero skips,236.46s. Native no-email ACME case144.31s; unchanged expanded
admission/authorization case236.22s. Only constructor import/call changed in admission;
only synthetic account email omission changed in ACME. Prior provider controls and
assertions remain. Pinned local providers establish these behavior boundaries;
actual hosted Entra/AKS authorization and real public issuance remain pending.

Final full public manifest suite with MANIFEST_KUBECTL set to verified kubectl:
node --test scripts/manifest-quality.test.mjs — PASS23/23, zero skips,104.34s.
Primary held concurrent central-gate calls for the diagnostic shared-temp assertion
window; this window has ended. All complete synthetic app/platform/recovery roots
passed pinned schemas and structural policies, including no-email ClusterIssuers.
No policy exemptions or new skip/serialization rules were introduced.

Frozen source SHA256:
- azure-runtime.mjs: 09C486999D61D7D2B520CEF9EEB84B10EBAD5C077F4F944C32DC1A8A2DF76AEF
- azure-runtime.test.mjs: 47DC3F86A3FE7126DFFA075C808BB9EF10122043B32093E3EB3669BEDB8B2A95
- azure-runtime-fixture.mjs: A0A49A549B3B64E5CCB269C456B602B25A2C5B52443DC5BEA32798D640EFE9FF
- azure-admission.test.mjs: EC089A405B717E84D189BA8D7757A3E4227B3563EA4EC41328BD65B1F872F0C8
- azure-acme.test.mjs: CB35EC78E10684AF09A6973EED8E5706A320CBA20A59D8DAD955971CD5BDC2B8
- manifest-quality.mjs: C3E1F9B2A799EBB017319D3CA28CF0A6FD458CBEFEDC0388E62A5CC0992A9F8F
- manifest-quality.test.mjs: 52E6CB437FD94F23AB7C2F7168E0280D8E048E7CD3532CCA055BC0DD40649997

Independent review remains pending. RBAC/VAP/proxy source was preserved frozen;
no actual deployment or hosted qualification was performed by this batch.

## Native continuity bundle composition, bounded phase1

Coordinator assigned only new scripts/azure-recovery-bundle.native.test.mjs;
operations owns production public createRecoveryBundle and base test (initial
missing-module RED recorded by that owner). API agreement precedes implementation.
Root explicitly chose minimal native API/TLS scope; no frozen ACME fixture extraction
or policy changes. Private fixture uses verified kind/kubectl and pinned Kubernetes
node image, new exact-owned cluster/private kubeconfig, current authored Roles and
generated installer/optional bindings. Backup/restore impersonated users correspond
to the generated subjects; this proves native authorization, not hosted Entra mapping.

Test design: production capture/restore crosses the actual K8 API with five existing
Secret objects/two official pinned-CRD ClusterIssuers, trusted native SNI TLS via an
explicit fixture CA, guarded PUTs preserving destination UID/annotations and changed
resourceVersion. A native stale-version replacement must fail without overwrite;
base HTTP test separately covers deterministic production retry409. Both native actors
must fail Secret creation, missing required object must fail production restore without
creating it, untrusted TLS must fail capture, and seeded Ready=True with stale account
URI must time out production restore. No status advancement is fabricated to produce
success. Six Key Vault objects use an explicit external Response double, not Azure.

Scope excludes real controller reconciliation in this fixture; the independently
passed no-email cert-manager/Pebble recovery proof remains unchanged and separate.
Full composed live restore/public trusted endpoints remain acceptance work. Test is
required under AZURE_PROVIDER_CONTRACTS=1, honestly skipped outside that provider
profile. No skips count as native evidence. Scoped ESLint passes before native launch.

Initial native run failed86.87s before production capture: fixture expected .stdout
from runPrivateProcess, whose default result is a private string. Corrected fixture
parsing; exact-owned cluster/private cleanup completed. Author inspection additionally
replaced shared default actor UUIDs with distinct backup/restore subjects and added
an actual backup existing-Secret PUT denial; final evidence must use that revision.
Private data equality uses a boolean assertion to avoid printing secret material.
Stale Ready timeout15s now asserts an actual account-key PUT occurred and public TLS
resourceVersion stayed unchanged, distinguishing reconciliation block from preflight
failure. Intermediate in-flight snapshots are diagnostic only, not final authority.

The strengthened post-PUT assertion exposed a fixture assumption: an actual no-op
Kubernetes PUT can retain resourceVersion (diagnostic run100.44s). Changed the
fixture's destination account key first so successful original-key PUT must change
stored data/RV before stale URI blocks. Distinct-actor snapshot PASS1/1 zero skips
101.21s. Further strengthened the positive path by replacing destination public TLS
data before production restore, requiring actual original-data restoration plus new
RV while preserving current UID/annotations; this snapshot PASS1/1 zero skips101.37s.
No production repair followed these fixture findings.

Final privacy setup additionally calls existing createPrivateDirectory before keys or
kubeconfig are created, enforcing private ACL on Windows as well as POSIX permissions.
Scoped format-check and ESLint max-warnings0 pass. Final native source SHA256:
5A70B15E4CD83670221F9C208681EEBCAA7E0153C9E4CA185DE2A89F16D45654.
Exact final revision native rerun is recorded below when complete. No source outside
the new test and this author evidence changed in this bounded batch.

Final exact frozen revision command (AZURE_PROVIDER_CONTRACTS=1):
node --test scripts/azure-recovery-bundle.native.test.mjs
PASS1/1, zero skips,100.14s (native case99.93s), including private ACL setup,
distinct actor permissions, changed-data guarded restoration, native stale-version
rejection, explicit stale-Ready block before TLS mutation, untrusted TLS refusal and
missing existing-object/no-create behavior. Exact cluster and private-directory
cleanup completed. Independent review remains pending; no Azure, actual hosted
identity, public certificate issuance or composed live controller-recovery claim.

## SEC-BUNDLE001 native source-context regression, implementation repair8

Coordinator released only necessary native publicAPI changes after operations' intended
foreign-source RED and final API agreement. Restore now requires independently selected
sourceIdentity {vaultUri,vaultId,tenantId,generation} plus exact6 sourceSecrets
{name,version,valueHash}; the fixture captures these once from its original selected
point before any payload mutation. No future wrapper or self-asserted payload identity
is assumed. Operations owns production/base repair and reports15 focused tests GREEN.

Test design adds missing/empty context, missing vault ARM ID, coherent foreign vault
context, wrong selected valueHash and foreign bundle source failures. Every case asserts
zero external Key Vault PUTs AND unchanged actual resourceVersions for all five native
Secret objects. Prior successful changed-data restore, actor permissions, real stale-RV
conflict, staleReady block, trusted/untrusted TLS, missing-object and private ACL cases
are preserved. Only the owned native test changed; frozen policies/provider helpers do
not change. Scoped format-check/ESLint pass. Frozen native file SHA256:
53EFCAEC3869314E3CC93AD952361C3D686031484EFDDAB0DEE25C2A6584DE55.
Actual native command/result follows when complete; no skipped run is native evidence.

Final repair8 native command with AZURE_PROVIDER_CONTRACTS=1:
node --test scripts/azure-recovery-bundle.native.test.mjs
PASS1/1, zero skips,110.30s (native case110.06s) at frozen SHA53EFCAEC3869314E3CC93AD952361C3D686031484EFDDAB0DEE25C2A6584DE55.
All six source-context failures performed zero Key Vault PUTs and left actual five
Kubernetes Secret resourceVersions unchanged; successful trusted-context restoration
and all prior provider negatives passed. Exact-owned cluster/private cleanup passed.
Author checks establish this native regression; independent SEC-BUNDLE001 review
closure belongs to the reviewer. Azure/hosted mapping/full controller composition
and real public issuance remain outside this fixture's evidence.
