# Images and production routing author evidence

Scope: T011–T012; worktree `/private/tmp/equipment-reservations-local-kubernetes`,
feature `specs/012-local-kubernetes`, baseline main `4dd685c`; 2026-10-20.
This is implementation evidence, not an independent approval or deployment acceptance.

## Design and standards

Read AGENTS, team protocol/coder role, constitution, engineering index, formatting,
testing, Angular, resilience, observability, frozen spec/plan/research/data model,
quickstart/tasks and runtime contract. Applied scoped speckit-implement:
prerequisites resolved exact feature; no extension hooks file exists; requirements
checklists had no unchecked markers. Parent supplied preparation PASS prep-design-012-03.

Stable public boundary: raw HTTP to the actual researched nginx image using the exact
production configuration. Real nginx path selection, rewrite, static handling and header
behavior remain intact. Three isolated Node HTTP upstreams are faithful HTTP transport
boundary doubles; their observable responses identify service/path/query/headers, so
routing to a different service fails. No API authorization/database/login claim is made.
No solitary application tests or YAML snapshot substitutes are introduced. Existing
service HTTP and provider suites establish the downstream contracts; real deployed
smoke remains required. Temporary fixture files contain only public synthetic data.

New behavior coverage includes Angular navigation/static asset missing-file handling,
service business/docs/callback allowlists and prefix stripping, query preservation,
wrong-service denial, operational-path denial, raw percent/traversal/double-slash
rejection, exact Host enforcement and replacement of forged forwarded headers while
preserving Origin. Final nginx runs UID 101, read-only root and ephemeral tmpfs.
No retries are enabled; connect timeout 5s, send/read 15s. Logs omit access requests and
restrict nginx error output to critical events to avoid callback query leakage.

## Test-first and checks

- `node --test scripts/deployment-routing.test.mjs`: initial red exit 1, assertion
  `production nginx configuration exists`, before production configuration existed.
- A deny-all initial nginx configuration was created and the real-container test ran;
  exit 1 `production nginx becomes ready` after187678ms. Fixture directory permission
  and raw-request handling were corrected before green; this intermediate result alone
  does not isolate every cause of initial readiness failure.
- After implementing the allowlist: same command exit 0,1/1 in36356ms.
- Strengthened distinct-upstream and exact-host tests: same command exit 0,1/1 in48186ms.
- Final runtime-selector revision: `node --test scripts/deployment-routing.test.mjs`
  exit 0,1/1 in50058ms; exact file hashes below match this execution.
- After every source/config edit, exact-file `npm run format -- FILE...` invoked and
  files re-read. Dockerfile/conf/dockerignore/Markdown fall outside configured formatter
  extension set and were inspected manually.
- `npm run format-check -- scripts/deployment-routing.test.mjs`: exit 0.
- `node node_modules/eslint/bin/eslint.js scripts/deployment-routing.test.mjs --max-warnings 0`:
  exit 0.
- `git diff --check`: exit 0.
- `npm --prefix src/Web run build -- --optimization --output-hashing=all`: exit 134 after
  `Building...`, no diagnostic. Root cause unestablished; no successful build claim.
- Full repository format-check/lint/check and actual container builds deferred to
  coordinator freeze so concurrent foundation work/provider tests are preserved.

Podman access first encountered sandbox socket denial; isolated runtime verification
used approved escalated execution. Intermittent runtime operations were slow; no VM,
trust, DNS, existing workload or host configuration changes were made. Owned test
containers/networks are removed through bounded cleanup; one stale initial frontend
and its exact network were explicitly removed. No publication or cluster image load.

## Image integration contract

`deploy/images/api.Dockerfile`: PROJECT=Inventory|Reservations|Notifications.
`deploy/images/bootstrap.Dockerfile`: PROJECT=DatabaseBootstrap|IdentityBootstrap|BrokerBootstrap.
`deploy/images/web.Dockerfile`: optimized Angular static files plus production nginx.
All final users numeric nonroot; build/runtime references use exact researched indexes.
The bootstrap base retains ASP.NET because the real shared project references it.
Entrypoint passes arguments unchanged. Broker executable creation is foundation-owned
under coordinator-approved design amendment; its final build remains pending.

Each Dockerfile has a specific adjacent `.dockerignore`; Docker Buildx uses it.
Podman builds must explicitly pass matching `--ignorefile` (documented in image README).
Context excludes credentials/private local state by allowlist plus source artifacts,
.env/key/cert files, generated auth config, dependencies, bin/obj and build output.
Only public fixed identity values enter frontend assets. No secret build arguments.

CI command: `CONTAINER_RUNTIME=docker node --test scripts/deployment-routing.test.mjs`.
Default is Podman; allowed runtime values restricted to docker|podman. This is separate
from normal tooling/application tests and does not create or inspect an AppHost.

## Original bounded handoff file SHA256 (before Scalar asset repair)

| File | SHA256 |
| --- | --- |
| deploy/images/README.md | 7a19641fed6bbe961fbcac2d974ab46672d6552fe499908c8b9498800dc31d14 |
| deploy/images/api.Dockerfile | 80031226ba7c0cc0b45df8a4b85c956abea640aceaeec720b6227a8041ab131b |
| deploy/images/bootstrap.Dockerfile | 85ed6303114c2061c631d1414cb4eba34e797015d563b79d3fd74296a31de096 |
| deploy/images/nginx.conf | 7f6196e275bace9fba10e7de042a42847ef5bdde0106b4aa41f7941fa9dcb9ef |
| deploy/images/web.Dockerfile | 07bf3d5410035cbc5b0c948ef7ca9d59c548d9f960b557b41d0a3f265041f811 |
| each of three deploy/images/*.Dockerfile.dockerignore | e84e43571f2c8fd263908e4f3c3784d7324279e56dcdf482df3c97b8b2f43a52 |
| scripts/deployment-routing.test.mjs | 3d5c7a47403f149c8e9a53daadfc504bda7fa81ac5bf00879480513a7de9056c |

At this original bounded handoff, pending: all seven image builds on both architectures;
real published indexes; real deployed
routing/authorization/TLS/bootstrap/browser smoke; independent quality/security verdicts.
No task checkbox or feature completion metadata changed by this worker.

## Scalar asset regression and resumed build validation

Foundation found Scalar2.18 emits service-local scalar.js, scalar.aspnetcore.js and
favicon.svg. Extended the same production HTTP boundary before changing nginx:
`node --test scripts/deployment-routing.test.mjs` exit 1, inventory/scalar/scalar.js
expected200 actual404 (49872ms). Added only those three exact assets under each
fixed service prefix; same command exit 0,1/1 (48146ms). Other service/operational
path denials remain intact. Focused format-check and ESLint exit 0 afterward.

Re-ran exact optimized Angular command `npm --prefix src/Web run build --
--optimization --output-hashing=all`: exit 0, build1.578sec on Node24.15.0/npm11.12.1,
no code fix. Earlier134 root cause remains unestablished; preserve that failure.
Inspection identified actual browser AuthSession's loopback-only issuer validator;
reported to foundation owner for test-first source repair, invalidating affected
source freeze. No out-of-scope source changes by this worker.

Coordinator resumed T012 native image validation serially; hold heavy builds until
foundation confirms exact isolated Aspire stopped. No VM or unrelated workload
mutation authorized or attempted. Actual image builds still pending at this point.

Current Scalar-repair SHA256 (matching48146ms green): nginx.conf
`8ac67a9291f9ba0734e1c128221a498101199356cd3a6dcd02d3a8ba75efc177`;
deployment-routing.test.mjs
`8ba5adf4506b2b49f490e3b821eb864f60fd49d41b02c513bd202f086d4df570`.
Other image definitions retain hashes in original table.

## Native serial production build batch1

Foundation confirmed exact isolated Aspire stop exit 0 before this batch. Existing VM
read-only resource inspect:6 CPU,11444 MiB,93 GiB disk allocation; no capacity changes.
Each following actual command completed exit 0, serially (no publication/cluster load):

```sh
podman build --platform linux/arm64 --ignorefile deploy/images/api.Dockerfile.dockerignore -f deploy/images/api.Dockerfile --build-arg PROJECT=Inventory -t localhost/equipment-validation-012/inventory:validation .
podman build --platform linux/arm64 --ignorefile deploy/images/api.Dockerfile.dockerignore -f deploy/images/api.Dockerfile --build-arg PROJECT=Reservations -t localhost/equipment-validation-012/reservations:validation .
podman build --platform linux/arm64 --ignorefile deploy/images/api.Dockerfile.dockerignore -f deploy/images/api.Dockerfile --build-arg PROJECT=Notifications -t localhost/equipment-validation-012/notifications:validation .
podman build --platform linux/arm64 --ignorefile deploy/images/bootstrap.Dockerfile.dockerignore -f deploy/images/bootstrap.Dockerfile --build-arg PROJECT=BrokerBootstrap -t localhost/equipment-validation-012/broker-bootstrap:validation .
```

| Native local image | Actual image ID |
| --- | --- |
| inventory | e9689f4acd0b8b87cbf9725b29270829b58f2b0797b665dd58121d45fb1d43c8 |
| reservations | 71d1a9a6cab7c397e951eb2c740e9dd2b40c970199cd2b3090ad32091a1ddc98 |
| notifications | e58edd84408d4d58af815bb3ec2717b65aeaf0fc8be588da836025780782d02e |
| broker-bootstrap | 3699f100388d2540c0443a1d5ad3847bcdb4b174074d13e0824b91e0ee4ed123 |

Inventory image metadata confirmed arm64,1654:1654,ENTRYPOINT/app/run. Its actual
entrypoint with network none and no configuration reached production startup validation
and rejected missing identity authority; this is not healthy API acceptance evidence.

Pinned exact ASP.NET runtime image `/usr/bin/timeout --version` exit 0, GNUcoreutils9.4.
Real broker image launched as UID 999:GID 999, network none, private 0600 random envfile,
isolated owned named volume with matching ownership, and explicit command
`/usr/bin/timeout --signal=TERM 30s /app/run --output /definitions/definitions.json`:
exit 0. A separate readonly stat against same private volume returned mode 600 uid 999
gid 999. No credentials or definitions contents printed. Temp private file and exact
owned volume removed. First fixture attempt used short4-byte salt material and received
sanitized exit 1 as expected from production validation; corrected fixture uses32 bytes
per existing production contract. No source change required.

Capacity released to foundation's required real-broker contract and second isolated
Aspire check before remaining DB/identity/web builds. Both-architecture image builds,
healthy deployed API startup, genuine published indexes and integrated smoke remain
pending. No checked task/acceptance claims derive from this local validation-only tag.

The no-config Inventory startup probe emitted its expected validation exception but
remained running; bounded read-only ancestor inspection found only owned container
4ea7c02ac01a, explicitly removed with `podman rm -f 4ea7c02ac01a` exit 0.
Probe exit reflects forced cleanup, not healthy startup or a normal clean rejection.
Future negative startup probes should use explicit timeout/ulimit to bound abort behavior.

## Final frozen native image build batch2 (supersedes batch1 API source)

Foundation confirmed final source freeze after absent-origin guard, frontend HTTPS
validator tests25/25 and real broker CLI-import3/3. All seven native arm64 image builds
then ran serially and completed exit 0. Exact command template:

```sh
podman build --platform linux/arm64 --ignorefile deploy/images/TYPE.Dockerfile.dockerignore -f deploy/images/TYPE.Dockerfile --build-arg PROJECT=PROJECT -t localhost/equipment-validation-012/NAME:validation .
```

TYPE/PROJECT/NAME: api/Inventory/inventory, api/Reservations/reservations,
api/Notifications/notifications, bootstrap/DatabaseBootstrap/database-bootstrap,
bootstrap/IdentityBootstrap/identity-bootstrap, bootstrap/BrokerBootstrap/broker-bootstrap.
Web uses TYPE web, NAME web and omits the build-arg. Raw exact command/output/exit log:
`/private/tmp/equipment-native-images-final-012.log` mode 0600 (private temporary evidence).
Expanded ignore files additionally exclude .npmrc,secrets.json,pem,pfx,p12 files;
all three current ignore SHA256 `5bee85fc98ab883840c8f655f906bf9911dbc9c8fedc01e2230f2c2db635b222`.
Final build-context source fingerprint `28ae7f97ca19cacd203fabd24c48259c32dcc664e32ce3e1805836d98f810835`
134 files: sorted relative filename,NUL,bytes,NUL over Directory.Build.props,global.json,
nginx.conf and all src files respecting ignore directory/filename exclusions.

| Final native arm64 local image | Actual image ID |
| --- | --- |
| inventory | 661ea2dbdfcab3ae8f0fe1dbfe3a143619c53558cffe8e5769f2cee8bb31b016 |
| reservations | 8ae8ade9aaffd42dd424ec8968c39411d8ca30db9f66ec5173aac7ba168409fb |
| notifications | 1dc72484101067da964e314ed5472a8dee0e1cda698773d4ad3a374a9714a7a2 |
| database-bootstrap | aa565b7aff549a955c25c2fe3b4a5ff47f19a197b40512b591fe7fcbaa5c4fd9 |
| identity-bootstrap | 311a489225ad4e55217848de6506982eaa59855832d2f69f9d10820b7016327a |
| broker-bootstrap | 3699f100388d2540c0443a1d5ad3847bcdb4b174074d13e0824b91e0ee4ed123 |
| web | bf9f97be7369942d4651622c4a73a51eda88949ec64c5675ca96bffb1fd8c923 |

Actual final Web image runtime probe (`node --input-type=module` orchestration invoking
`podman run`): user 101:101, memory 128 Mi,CPU 0.25,read-only root,tmpfs /tmp 16 Mi,
capabilities dropped,no privilege escalation,loopback-only ephemeral 8080 mapping.
Only container-local upstream aliases were supplied to satisfy nginx DNS startup;
no provider/upstream request was made. Production actual built root/navigation,
/auth-config.json and optimized script referenced by generated index all returned200.
Public config contained exactly issuer=https://identity.equipment.test/realms/equipment,
realm=equipment,clientId=equipment-web. No fixture static file/config was mounted.
Owned container removed; probe exit 0. This proves actual nonroot production static
startup, not login or healthy business dependencies.

## Exact pinned standalone Dashboard runtime proof

Command `node /private/tmp/equipment-dashboard-validation-012.mjs`, exit 0.
Image `mcr.microsoft.com/dotnet/aspire-dashboard:13.6.1@sha256:03099004e132a7ca2feb66c5fa24715ffeaaf2fffab6f8b2cda23de3abd3ea45`.
Manifest tested `deploy/base/dashboard.yaml` SHA256
`f1dc9d53b79ce8b9b96b086d1ec1099d684bc242ba160156974d95ae899680cb`.
Script read exact manifest env entries rather than independently renaming options:
ASPNETCORE_URLS 18888, DOTNET_DASHBOARD_OTLP_ENDPOINT_URL 18889,
DOTNET_DASHBOARD_OTLP_HTTP_ENDPOINT_URL 18890;
Dashboard__Frontend__AuthMode BrowserToken and private BrowserToken;
Dashboard__Otlp__AuthMode ApiKey and private PrimaryApiKey;
Dashboard__Api__AuthMode ApiKey and distinct private PrimaryApiKey;
TelemetryLimits MaxTraceCount 10000,MaxLogCount 10000,MaxMetricsCount 1000;
Frontend MaxConsoleLogCount 10000; Data PersistenceMode None,Directory /data;
Logging__LogLevel__Default Warning.

Each credential independently generated with32 random bytes into mode 0600 envfile in
private temporary directory. Values never passed in command args or printed. Podman
run used nonroot 1654:1654,cap-dropALL,no-new-privileges,memory 512 Mi,memory-swap512Mi,
CPU 0.5,tmpfs /data 128 Mi,/tmp 16 Mi and127.0.0.1-only ephemeral published ports.
`--log-driver=none` suppressed startup token URLs altogether. Fixture tmpfs permissions
use Podman defaults; Kubernetes fsGroup ownership is not proven by this standalone run.
Initial fixture used unsupported Podman tmpfs uid/gid flags and failed before startup
exit 125; removed only fixture flags, retaining exact env/resource limits, then passed.

| Actual public request | Observed result |
| --- | --- |
| Frontend GET / without credential, redirects manual | 302 login challenge |
| GET /api/telemetry/traces without key | 401 |
| Same API with distinct valid x-api-key | 200 |
| POST /v1/traces empty JSON without key | 401 |
| Same HTTP OTLP with valid x-otlp-api-key | 200 |
| gRPC TraceService/Export empty protobuf without key | HTTP 401 |
| Same gRPC with valid x-otlp-api-key | HTTP 200,grpc-status 0 |

HTTP deadlines 5 seconds; readiness poll at most90 attempts with500 ms interval and2 second
request timeout. Exact overall elapsed was not retained; no timing/SLO acceptance claim.
All owned Dashboard container/private credential files removed in finally. No startup
logs, secret values, token URLs or telemetry payloads printed. No changes to manifest
required. Data.Directory/PersistenceMode and telemetry/console option spellings also
checked against exact [official 13.6.1 DashboardOptions source](https://raw.githubusercontent.com/microsoft/aspire/v13.6.1/src/Aspire.Dashboard/Configuration/DashboardOptions.cs).

This proves actual option startup/authentication on the pinned image under selected
resource caps. It does not prove retention pressure behavior, complete-system budgets,
real application telemetry/privacy, cluster fsGroup/storage or authenticated browser UI.
Those remain integrated acceptance checks. Likewise native image success does not
establish actual amd64 image builds or any published multiarchitecture GHCR release.
Source/team-wide checks and independent verdicts remain coordinator-owned.

Current bounded scope: production routing including Scalar assets verified; all seven
final native arm64 images build successfully; built frontend static startup and broker
nonroot CLI output verified; exact pinned standalone Dashboard authentication verified.
Actual amd64 images were not built in this batch. Both-architecture GHCR publication,
healthy integrated application startup/login/business/telemetry, complete-system resource
measurement, full required checks and independent reviews remain pending. No publication,
cluster image loading, VM/trust change or task checkbox edit was performed.

## Final broker telemetry-only rebuild (supersedes broker ID above)

Source owner added required broker production telemetry after batch2 and supplied exact
final source freeze. Read-back SHA256 matched:

- `src/BrokerBootstrap/Program.cs`: `3a0773cfdb6a6cf41eaa3f8b207cdfaa37a7559c1cb067ba1615292ffe19d41e`.
- `src/BrokerBootstrap/BrokerBootstrapLog.cs`: `714683dceba8260a9745071205c23a8cdd841e711a23a49e16bca6355566aff3`.

Owner reported real production CLI OTLP success/failure 2/2 and private-file/refusal
1/1 passing. This worker did not repeat those source tests or approve them. Read the
ASP.NET Core/OpenAPI/Aspire guides and required references during final packaging
assessment; no additional owned-source change was required. No extension hooks file exists.

Exact owned isolated Aspire stop confirmed exit 0 before heavy image work resumed.
Command:

```sh
podman build --platform linux/arm64 --ignorefile deploy/images/bootstrap.Dockerfile.dockerignore -f deploy/images/bootstrap.Dockerfile --build-arg PROJECT=BrokerBootstrap -t localhost/equipment-validation-012/broker-bootstrap:validation .
```

Result exit 0; final native broker image ID
`b9ce4fa6d030d16128d74ea50c6b09690287ef376eb1cd5286025eb0f5efc537`.
Image metadata: arm64, default user 1654:1654. Dockerfile/ignore unchanged at
`85ed6303114c2061c631d1414cb4eba34e797015d563b79d3fd74296a31de096` /
`5bee85fc98ab883840c8f655f906bf9911dbc9c8fedc01e2230f2c2db635b222`.
Other six image IDs and Dashboard evidence remain unchanged within their source scope.

Repeated actual production entrypoint probe using private randomly generated envfile
mode 0600 and exact owned ephemeral volume, network none, UID999:GID999:
`/usr/bin/timeout --signal=TERM 30s /app/run --output /definitions/definitions.json`.
Result exit 0. Separate readonly stat returned `600 999 999`. Host lifecycle/telemetry
startup output was captured privately by the wrapper and not printed. No credentials,
definitions contents or paths from configuration failure were printed. Both private
credential directory and owned volume removed in finally. Overall probe command exit 0.
This verifies the current telemetry-enabled image's entrypoint/file contract; it does
not independently establish OTLP collection (covered by owner's real CLI tests).

No task checkbox, independent verdict or feature status changed. Runtime capacity
returned to coordinator for the final full checks/freeze.

## Repair round1: SEC-IMPL-001 ingress test design (before source repair)

Coordinator transferred ownership of deploy/platform/traefik.yaml,
deploy/environments/local/ingress.yaml and new scripts/deployment-ingress.test.mjs.
Scoped speckit-implement remediation of platform/local-ingress behavior (T014/T016);
requirements/design remain frozen. No reviewer verdict or finding status changed.

Stable boundary: real HTTP/TLS requests through the exact pinned production Traefik
manifest and production Ingress manifest, deployed to an isolated kind cluster, with
real production nginx configuration behind the application route. Kubernetes routing,
TLS certificate selection, trust/name checks, nginx path policy and forwarded headers
remain real. A pinned Node HTTP server replaces only downstream application/identity
transport; it responds200 on any path and echoes public path/host/scheme. This makes
accidental administrative routing observable, while making no Keycloak login, provider
contract, business API, database or full-application acceptance claim. No YAML snapshot
or private controller implementation assertion substitutes for requests.

Planned intended RED: existing production manifests deliver application content over
clear HTTP200; test requires404 denial on each canonical host. Source repair remains
unapplied until the actual request failure is captured. Fixture/prerequisite failures
will not count as intended behavior RED. Green also requires trusted HTTPS on both
hosts, rejection of a different CA and wrong TLS name, exact HTTPS forwarding, and
application/identity administrative/operational path denial.

Test uses only researched pinned kind node, Traefik, Node and nginx third-party images;
no application GHCR images, local deployment override, publication or host trust/DNS/VM
change. Private temporary CA key remains outside pods; only leaf TLS key/certificate
enter the fixture Secret. Private kubeconfig confines every kubectl call to exact
kind-equipment-compat-012. It refuses a pre-existing cluster with unknown fixture
ownership, creates only the explicitly authorized disposable equipment-compat-012,
forwards127.0.0.1 only and finally deletes only that successfully created cluster.
Coordinator approved runtime capacity after deployment's brief broker retention check.
Initial focused ESLint passed; no heavy operation started before capacity handoff.

### SEC-IMPL-001 actual controller RED and standalone GREEN

After deployment's real broker retention check released capacity, ran
`node --test scripts/deployment-ingress.test.mjs` against unchanged platform/Ingress
source. Result exit 1 in 61454 ms: `app.equipment.test must deny clear HTTP`, actual
200 versus required404. This was a real served-application request, not missing-module,
manifest text or setup failure. Fixture created the authorized equipment-compat-012
and its finally cleanup successfully deleted that exact owned cluster/private files.

Only then changed authoritative source:

- Traefik websecure becomes the default entrypoint and enables its HTTP TLS default.
- Ingress explicitly selects websecure and activates router TLS for both host rules.
- Web entrypoint remains route-free, returning404 instead of application content.

Same real-controller command then exit 0, standalone 1/1 in 61083 ms. Trusted HTTPS
returned200 for app and identity; clear HTTP404 for both; different CA and wrong TLS
name failed validation; app upstream saw canonical Host and HTTPS after an attempted
forged scheme; identity upstream saw HTTPS; app admin/health/alive and identity
admin/master/health/metrics remained404. No TLS verification bypass, host trust/DNS
change, VM change, app images, publication or local-image deployment override.
Exact pinned Traefik accepted all selected entrypoint options in its actual deployment.
Source rationale also checked against official [entrypoint documentation](https://doc.traefik.io/traefik/reference/install-configuration/entrypoints/)
and [Ingress routing documentation](https://doc.traefik.io/traefik/reference/routing-configuration/kubernetes/ingress/).
No security-review verdict or finding status changed by the author.

### Approved Q-I002 same-fixture extension (in progress)

After standalone SEC green, integrated deployment-owned
`verifyConfigRollout` from scripts/deployment-config-rollout-live.mjs as a nested test.
One fixture lifecycle retains exact cluster ownership and guaranteed cleanup; helper
receives only confined kubectl/apply and trusted-HTTPS request interfaces.
First combined command exited1 in56926 ms: TLS assertions completed, but helper setup
failed `DataCloneError` on structuredClone(Spectral parsed YAML data). This is a fixture
failure before rollover behavior, not intended-behavior RED or an application finding.
Owned cluster/private files cleaned successfully. Routed helper repair to its owner;
no out-of-scope edits by this worker. Combined runtime verification remains pending.

### Combined SEC-IMPL-001 / Q-I002 actual mechanism GREEN

Deployment owner corrected only the helper's YAML proxy cloning setup and froze it
with focused lint/format passing. Re-ran `node --test scripts/deployment-ingress.test.mjs`:
exit0,2/2 tests, total102002 ms; nested public ConfigMap rollout/PVC scenario41533 ms.
TLS assertions all still pass before the helper modifies its disposable services.
Actual rendered native ConfigMapGenerator references feed real nginx subPath and Node
envFrom consumers. Both consuming Pod UIDs changed on public configuration updates;
trusted HTTPS served the changed issuer and proxy generation; same PVC UID/bound volume
and its sentinel remained. This is a third-party compatibility/storage-mechanism test,
not Equipment Reservations business persistence or full deployment acceptance.
Kind's standard fixture storage provisioner backs the simple PVC. No application images
or local deployment override were applied. Exact owned cluster and private CA/kubeconfig
files removed successfully after every invocation; no approval review rejection occurred.

Current tested hashes:

- platform/traefik.yaml `45df359ca2ae3b650605b41875f4ab33880e94f778a6ba5426e5fa5da328d5fa`.
- local/ingress.yaml `bf28af590ac89ac847a06cc8752d5604171d257b21994447b1bb7d8d8d5f02bc`.
- deployment-ingress.test.mjs `28a05bbc84dbcd08ff688817b30c06bdd52f75e262043b6f21b60555d8c8bdd7`.
- deployment-owned live helper `8660167e974e47d42a6589d584008669846ac6f88cec7de6aff1f2c287735fd6`.

Focused exact-file format-check (both YAML files and ingress test), ESLint on ingress
test and git diff --check exit0. Kubernetes apply/rollout exercised real API schema and
selected controller options. Host endpoint uses private loopback port-forwards, not
production host80/443 publication; global DNS/trust and complete GHCR application
integration remain separate pending acceptance. Original independent reviewers own
closure/verdicts; this evidence is the author's check only.

## Repair round1 broker Linux repeat/refusal proof (Q-I003)

Source owner froze reusable private output implementation. Initial native build exit0,
image `e4511937e4efad7249fffd6cbde9084417f0773d9e067bbeb608c5aed3aa7412`.
Actual Linux ARM64 CLI first/repeat succeeded with identical bytes/mode/mtime/inode;
changed authority, malformed file and mode0644 refused unchanged. A valid relative
symlink unexpectedly returned0 instead of required1; probe stopped and cleaned its
owned volume/private files. This was an actual public CLI behavior RED. Post-attempt
symlink metadata was not retained in that initial run; no mutation conclusion drawn.

Primary kernel [ARM64 flags](https://raw.githubusercontent.com/torvalds/linux/master/arch/arm64/include/uapi/asm/fcntl.h)
define O_NOFOLLOW as0x8000, versus generic/x64's0x20000. Source had used the generic
value on ARM64, allowing target following. Source owner applied the approved minimal
architecture-specific correction, without changing File.Move or private-file policy.
Final frozen source SHA256:

- Program.cs `35de58704940026810c88c57985fa464da31a6484874344acadee89bd3098abd`.
- PrivateDefinitionsFile.cs `6091fd516fc8906e3d93f05bf2969ab06475eed6207bffcb34bd2f2ac7296925`.
- BrokerBootstrap.csproj `d458049cbb23a9822e49177bb39c2d04593f2a2e9ac223dc9110c3e77fbe56b6`.
- BrokerBootstrapLog.cs `714683dceba8260a9745071205c23a8cdd841e711a23a49e16bca6355566aff3`.

Exact final native build command, exit0:

```sh
podman build --platform linux/arm64 --ignorefile deploy/images/bootstrap.Dockerfile.dockerignore -f deploy/images/bootstrap.Dockerfile --build-arg PROJECT=BrokerBootstrap -t localhost/equipment-validation-012/broker-bootstrap:validation .
```

Final native ARM64 image ID (supersedes earlier broker IDs):
`44dd75db1dbec746853b4de3838cf3124933feff0bcea4018dbb5764392a5f25`.
Actual image diagnostic matched `PrivateDefinitionsFile` metadata, excluding stale
pre-repair binary. Command `node /private/tmp/equipment-broker-linux-verification-012.mjs`
completed exit0. Probe script SHA256 at preserved-file creation was
`edfba00e1fc3eab4a4ca75ed3bfefec9a6ded9f110ecbae817561e321aca135f`;
a local duplicate-variable syntax error was corrected before any fixture resource
could be created, then `node --check` passed and the real matrix ran. Current script
hash is recorded separately below; this syntax-only fixture failure is not RED evidence.

| Actual native public CLI scenario | Exit and observed effects |
| --- | --- |
| First UID999 generation and identical UID999 repeat | 0; bytes, mode0600, uid999, mtime and inode unchanged on repeat |
| Changed publisher credential | 1; output and backup unchanged |
| Malformed existing output | 1; output and backup unchanged |
| Unsafe mode0644 | 1; output and backup unchanged |
| Symlink to same-directory valid original.private | 1; before/after type symbolic link, target original.private, target/output unchanged |
| Hardlink | 1; output and backup unchanged |
| FIFO | 1 within bounded CLI deadline; FIFO and backup unchanged |
| Directory | 1; directory and backup unchanged |
| Root UID0, with proven read access to999-owned0600 file | 1; output unchanged despite readability |
| Correct UID999 repeat after wrong-owner refusal | 0; original bytes/mode/mtime/inode unchanged |

Every CLI uses `/usr/bin/timeout --signal=TERM 30s /app/run --output /definitions/definitions.json`,
network none, at most192Mi and0.5CPU. Fixture helpers at most64Mi manipulate only the
exact owned temporary volume. Valid and changed credentials independently generated
into private0600 envfiles, never command arguments/stdout. Snapshots compare file
metadata and content hashes privately; only public types/link-target names and equality
booleans printed. Sensitive output contents were never printed.
Owned volume/private files cleanup completed **2026-10-20T09:51:02.499Z**; no owned
provider/container remained. Parent was notified immediately for no-overlap full retry.
This is actual Linux ARM64 file/ABI/runtime evidence, not amd64 build or publication,
not an independent reviewer approval. Other six image IDs and prior receiver/controller
evidence remain unchanged in scope.

Current corrected preserved Linux probe script SHA256 is recorded by the following
read-back command in this run; no repository production source was changed by the probe.
`4075283d9de99848eb0bcd854b0953cc97b07effdf3778072404a0d4112df9f3`.

## Pinned Dashboard public transport contract test design (T041 support)

Coordinator assigned exclusive new scripts/deployment-dashboard.test.mjs. Deployment
owns production diagnostics/smoke modules; this worker does not alter them. Test directly
uses the researched exact Dashboard13.6.1 image and actual manifest environment/resource
limits with private credentials, loopback-only ports and disabled container logging.
Public boundary is real OTLP HTTP ingestion and authenticated telemetry HTTP queries.
No internal repository/storage APIs, behavior doubles or application services participate.

The synthetic fixture is explicitly named equipment-dashboard-contract. It injects one
parent/child trace (Unset success and Error child), one correlated error log, one ordinary
untraced lifecycle log and one bounded sum metric. Assertions verify actual resources
array fields/flags, nested spans/logs wrapper.data shape, count completeness, hex IDs,
parent/log correlation, error status/message and resource/trace filters. This backs the
DTO fidelity of diagnostics boundary doubles; it does not establish any real Equipment
Reservations business/export/privacy behavior or application acceptance. Existing normal
application tests remain independent of Kubernetes and this separate provider lane.

Pinned public contract was checked against exact [TelemetryApiService13.6.1](https://raw.githubusercontent.com/microsoft/aspire/v13.6.1/src/Aspire.Dashboard/Api/TelemetryApiService.cs).
This verifies existing third-party behavior rather than implementing a changed provider;
no artificial failing stub/RED is claimed. New test exact-file format/read and focused
ESLint exit0. Actual provider invocation is held until coordinator's full application
check completes to avoid resource overlap; runtime contract result still pending here.

## Pinned Dashboard public transport contract actual result

After coordinator confirmed the full application retry had finished, the isolated
provider command `node --test scripts/deployment-dashboard.test.mjs` passed **1/1,
exit0**, test duration8965.486ms (total9096ms). The exact production-manifest Dashboard
13.6.1 image accepted the bounded synthetic OTLP traces, logs and metric. Actual
authenticated HTTP responses verified the resources array and exact hyphenated
service.name, hasTraces/hasLogs/hasMetrics true, nested wrapper.data and complete counts,
hex trace/span/parent/log IDs, Unset parent success, Error child status/message,
trace/resource filtering, and preservation of an ordinary untraced log with null or
absent IDs. Wrong API key returned401. No source/API normalizer correction was needed.

Test SHA256: `e83a9c176784b3e55c816f5789105ada9867293e5bda004dc5b1290da08761a8`.
Exact-file formatting/read-back, focused ESLint, format-check and git diff --check
passed before this invocation. Container logging was disabled; private random distinct
keys stayed in0600 envfiles. The owned container and private directory were removed
before the successful test completed. Provider capacity release was confirmed by
**2026-10-20T09:57:58Z** and handed directly to the implementation worker's separately
authorized bounded PostgreSQL diagnostic harness. No owned runtime/build/Kind task
remains active; no further provider work will overlap that harness.

This supersedes the preceding pending-runtime statement. It verifies the pinned public
transport/DTO contract using explicitly synthetic telemetry only, not production
business telemetry, privacy acceptance, GHCR deployment or independent review approval.
