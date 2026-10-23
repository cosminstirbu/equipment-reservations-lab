# Compatibility and design research

Checked 2026-10-20 against baseline `4dd685c4e34288f94e932dcd49beb22eea965075`.
Evidence below distinguishes selected configuration from executed compatibility proof.

## Environment proof

Escalated read-only host inspection: macOS 26.4.1 arm64; Podman client/server
6.0.2; existing rootful libkrun VM, user-mode networking, 6 CPU, 11444 MiB,
93 GiB disk. `/var` had 66 GiB available. Five preexisting application containers
were retained. Ports 80/443 had no listener. No VM setting or trust store changed.

Downloaded official kind v0.33.0 to `/private/tmp/equipment-k8s-tools`, SHA256
`0c8c7dbe5e23594a198b786c4bc13dacc101fa6196b0cb0b23a1ca44e61f4b4f`
matched upstream checksum. Matching kubectl v1.35.8 checksum verified.
Executed `KIND_EXPERIMENTAL_PROVIDER=podman kind create cluster --name
equipment-compat-012 --image kindest/node:v1.35.8@sha256:07b2536e30b803ed61d1677a79df6115f798ce64c80f9e22f6ed45afd09323c0
--kubeconfig /private/tmp/equipment-k8s-tools/kubeconfig --wait 120s` successfully.
`kubectl get nodes -o wide` showed Ready v1.35.8, containerd 2.3.4,
Debian 13 on VM kernel 7.1.3-200.fc44.aarch64. OCI index inspection showed
linux/amd64 and linux/arm64. Default local-path StorageClass has Delete reclaim,
therefore it must NOT own durable application claims without a Retain adaptation.
Memory after cluster startup: 7890 MiB available; kind container approximately
482 MB. This establishes minimal cluster compatibility, not complete-system capacity.
Full-system measurement and VM-restart durability remain acceptance gates.

## Selected matrix

| Component | Exact choice | Evidence / reason / alternative |
| --- | --- | --- |
| SDK / C# | 10.0.301 / 14 | Preserve `global.json`; no framework upgrade |
| Aspire / Dashboard | 13.6.1 | Preserve AppHost release family; standalone Dashboard image |
| PostgreSQL | 18.6 | Preserve current AppHost pin; dedicated Keycloak database/account |
| RabbitMQ | 4.3.6-management | Preserve current broker family and scoped topology |
| Keycloak | 26.8.1 | Preserve current AppHost pin; PostgreSQL instead of dev-file |
| kind | 0.33.0 | Official current stable, checksum verified, executed |
| Kubernetes / kubectl | 1.35.8 | kind release-supported node, measured ready; avoid unnecessary latest minor |
| node index | sha256:07b2536e30b803ed61d1677a79df6115f798ce64c80f9e22f6ed45afd09323c0 | Both Linux architectures inspected |
| Traefik | 3.7.15 | Maintained standard Ingress controller, official current release |
| Argo CD | 3.5.5 non-HA | Official current stable release; vendor exact install manifest and verify hash |
| certificate tooling | mkcert 1.4.4 | Existing maintained minimal local CA workflow; explicit owner trust installation |
| manifests | kubectl 1.35.8 built-in Kustomize | No Helm dependency or application chart needed |
| frontend | existing Angular/Node lockfiles | Production build, no dependency update needed |
| runtime images/actions | exact verified index digests / commit SHAs in lock below | Registry architecture/index proof and official action references recorded |

Third-party architecture checks use `podman manifest inspect IMAGE:VERSION` and
must fail if either Linux architecture is absent. Tags select versions; committed
runtime references must resolve and pin immutable indexes. Argo ancillary Redis,
Dex and helper images in the vendored manifest also require architecture evidence.
No fabricated GHCR digest is allowed: first publication is a separately authorized
release prerequisite; setup must fail clearly until actual digests exist.

## Decisions and alternatives

Use standard networking.k8s.io/v1 Ingress with Traefik, rather than Gateway API:
one controller and no additional route CRDs suffice for two hostnames. Avoid
retired ingress-nginx. Keep controller/platform definitions outside application
base; a future AKS environment can choose different networking without source edits.
Production frontend is a static Angular build behind a narrowly configured reverse
proxy, not Angular CLI. API business paths retain `/api/...`. Documentation uses
`/services/inventory`, `/services/reservations`, `/services/notifications` prefixes.
Reverse proxy strips only those fixed prefixes; generated document Servers point
at matching prefixes, Scalar document URLs and callbacks match the contract.

Use app.equipment.test and identity.equipment.test on HTTPS 443. Host resolution
requires explicit `/etc/hosts` entries. Cluster CoreDNS maps identity hostname to
internal ingress Service address (not host loopback); ingress TLS certificate retains
the public issuer hostname. Mount the public local CA certificate into clients and
Keycloak trust configuration as required; never mount CA private key into pods.
Host trust installation is an owner action. Prove browser/CLI and pod TLS separately.

Use local-platform static PVs with Retain reclaim, node affinity and node-local paths;
claims/base use abstract names, local overlay binds storage. Node container disk
survives stop/start and VM restart, but kind deletion erases data. Dynamic provisioner
Delete default rejected for durable data. PVC/PV carry Argo Prune=false,Delete=false;
Application has no cascade finalizer. Platform owns namespace/PVs, private setup owns
Secrets, Argo owns application workloads and claims. Stop removes/suspends application
reconciliation before scaling workloads; reset deletes only named application data
after explicit flag, teardown deletes only the named cluster. Neither resumes GitOps
mid-operation. No automatic reversible schema rollback claim.

Keycloak advertises external HTTPS issuer but provisioning uses a separately validated
internal admin endpoint; public ingress permits only `/realms/equipment/` and required
static `/resources/` paths, never `/admin`, master realm or management port. Internal
admin HTTP is a cluster transport decision, not a token/TLS validation bypass. Frontend
proxy preserves configured Host/Origin and overwrites forwarded headers. APIs trust
only explicitly configured proxy addresses/hops; no wildcard forward-header trust.

## Official sources

- [kind quickstart](https://kind.sigs.k8s.io/docs/user/quick-start/)
- [kind v0.33.0 release](https://github.com/kubernetes-sigs/kind/releases/tag/v0.33.0)
- [Podman considerations](https://kind.sigs.k8s.io/docs/user/rootless/)
- [Traefik release](https://github.com/traefik/traefik/releases/tag/v3.7.15)
- [Ingress provider](https://doc.traefik.io/traefik/reference/install-configuration/providers/kubernetes/kubernetes-ingress/)
- [Argo CD release](https://github.com/argoproj/argo-cd/releases/tag/v3.5.5)
- [Argo application deletion](https://argo-cd.readthedocs.io/en/stable/user-guide/app_deletion/)
- [Argo sync options](https://argo-cd.readthedocs.io/en/stable/user-guide/sync-options/)
- [Keycloak hostname](https://www.keycloak.org/server/hostname)
- [Keycloak reverse proxy](https://www.keycloak.org/server/reverseproxy)
- [Dashboard configuration](https://aspire.dev/dashboard/configuration/)
- [mkcert](https://github.com/FiloSottile/mkcert/releases/tag/v1.4.4)

## Remaining executed-proof gates

Actual published-port/CoreDNS and Keycloak issuer TLS integration; complete
system resource measurement; real image production/publication; local CA/DNS owner
actions; runtime bootstrap and persistence, controlled VM restart; actual GitOps update;
Dashboard export privacy and finite retention. These are pending evidence, not approvals.

## Immutable compatibility lock (registry-verified 2026-10-20)

Registry HTTPS manifest-index responses were inspected directly. Each index below
contains both linux/amd64 and linux/arm64; unknown-platform attestations do not count.

| Exact selected image | Verified index digest |
| --- | --- |
| `docker.io/library/postgres:18.6` | `sha256:74935e72241653ca55e0414067e6d8763aceb8a810eb51b452253ec3dcfc4336` |
| `docker.io/library/rabbitmq:4.3.6-management` | `sha256:54cb013d76cd1fd6c0a0708f34062ad61c452bb6f016b434c6c33f1a765d2b58` |
| `quay.io/keycloak/keycloak:26.8.1` | `sha256:79c623a22abacf3fe6c00a5fb30f5b7843d717b234033b80995891c06116d244` |
| `mcr.microsoft.com/dotnet/aspire-dashboard:13.6.1` | `sha256:03099004e132a7ca2feb66c5fa24715ffeaaf2fffab6f8b2cda23de3abd3ea45` |
| `docker.io/library/traefik:v3.7.15` | `sha256:0f6150202bc1fed72a7bd2107460eaa510e5b8a905f3fdb5b84f2c8619c33368` |
| `quay.io/argoproj/argocd:v3.5.5` | `sha256:13db7b10db23283b1b36f855046602e18539a8a8204c9f6f039e8896c8897518` |
| `mcr.microsoft.com/dotnet/sdk:10.0.301` | `sha256:ea8bde36c11b6e7eec2656d0e59101d4462f6bd630730f2c8201ed0572b295d5` |
| `mcr.microsoft.com/dotnet/aspnet:10.0.9` | `sha256:7644f992230d35cf230017189d4038c0ae0f7388b13f4f7ae1900a155bafb597` |
| `mcr.microsoft.com/dotnet/runtime:10.0.9` | `sha256:6a40d375e9c8432fcf4adebae05d7e0a276e9a90dd01174df6709a090771bebc` |
| `docker.io/library/node:24.15.0-bookworm-slim` | `sha256:4e6b70dd6cbfc88c8157ba19aa3d9f9cce6ba4703576d55459e45efcbc9c5f5d` |
| `docker.io/library/nginx:1.28.0-alpine` | `sha256:30f1c0d78e0ad60901648be663a710bdadf19e4c10ac6782c235200619158284` |
| `ghcr.io/dexidp/dex:v2.45.1` | `sha256:8499afd690c437f52301efd2b05b2455da5bd2dfc20332cd697dc9937f808462` |
| `public.ecr.aws/docker/library/redis:8.2.3-alpine` | `sha256:08ad0b1d280850169a790dba1393ff7a90aef951fc19632cf4d3ce4f78e679ba` |

Official action tag references resolved with `git ls-remote` on 2026-10-20:

| Action release family | Exact commit |
| --- | --- |
| actions/checkout v5 | fbc6f3992d24b796d5a048ff273f7fcc4a7b6c09 |
| actions/setup-node v5 | a0853c24544627f65ddf259abe73b1d18a591444 |
| actions/setup-dotnet v5 | 26b0ec14cb23fa6904739307f278c14f94c95bf1 |
| docker/setup-buildx-action v3 | 8d2750c68a42422c14e847fe6c8ac0403b4cbd6f |
| docker/build-push-action v6 | 10e90e3645eae34f1e60eeb005ba3a3d33f178e8 |
| docker/login-action v3 | c94ce9fb468520275223c153574b00df6fe4bcc9 |
| docker/setup-qemu-action v3 | c7c53464625b32c7a7e944ae62b3e17d2b600130 |

Vendored upstream Argo CD v3.5.5 `manifests/install.yaml` SHA256: `90dc9094bf4c5964afd9c0e35d735e1c2fcbbda4f8e36799c092d9864ed65f50`.
Its auxiliary Dex v2.45.1 and Redis 8.2.3-alpine indexes are included above.
No Helm chart is selected; kubectl v1.35.8 reports bundled Kustomize v5.7.1.
The selected runtime/build versions are available with both architectures; no claim
that app images have already been built or published follows from this lock.

## Pre-code ingress and TLS substrate proof

Executed Traefik v3.7.15 standard Kubernetes Ingress in namespace `compatibility`
of isolated cluster equipment-compat-012. Generated a one-day temporary CA and
identity.equipment.test certificate in private temporary storage; CA private key
was never mounted in a pod and host trust/DNS were unchanged. Host loopback-bound
port-forward 18443 -> ingress TLS served `/ping`: `curl --cacert ca.crt --resolve
identity.equipment.test:18443:127.0.0.1 https://identity.equipment.test:18443/ping`
returned OK (exit 0). Omitting CA rejected with exit 60. Wrong hostname/SNI
rejected exit 60. A real curlimages/curl:8.16.0 pod mounted only public CA,
resolved canonical identity.equipment.test to ingress ClusterIP 10.96.238.17 and
received OK over HTTPS 443; no-CA attempt rejected, pod Succeeded (exit 0).

This proves selected Ingress/Podman host and pod TLS routing substrate. The host
proof uses loopback port-forward, not eventual published 443; actual kind port
mapping/CoreDNS and actual Keycloak discovery/token validation must still be
verified before deployment acceptance. `/ping` is a probe, not a substitute issuer.

Pinned Dashboard option names were checked against official v13.6.1
`src/Aspire.Dashboard/Configuration/DashboardOptions.cs`: TelemetryLimits
MaxLogCount/MaxTraceCount/MaxMetricsCount, Frontend.MaxConsoleLogCount and
Data.PersistenceMode exist. MaxMetricsCount applies per dimension; bound incoming
metric cardinality separately. Standalone temporary data is SQLite, not an
in-memory repository. The original None/emptyDir decision is superseded by the
owner-approved 2026-10-23 [retained Dashboard repair](team/dashboard-persistence.md):
Resume, a stable application name and a dedicated retained PV/PVC. None ignores the
persistent data-directory option and created SQLite/WAL under the 16 MiB tmp mount,
causing repeated evictions. The real provider and actual branch Pod-replacement
checks passed with the revised configuration. Local PV capacity is not a hard quota;
long-running retention and macOS/VM-restart qualification remain pending.


## Required-check dependency remediation — MessagePack (2026-10-20)

The required warning-as-error restore/build reports NU1902 for AppHost's transitive
MessagePack 2.5.302, GHSA-qhrr-8q5h-9q3h (CVE-2026-92707). This is an upstream
nested-object-array allocation denial-of-service issue, not evidence that this
application's particular AppHost endpoint is exploitable. Suppressing audit or warnings
would not remediate it and is not proposed.

Decision: propose an AppHost-scoped direct MessagePack 2.5.303 PackageReference,
retaining `ExcludeAssets="build;analyzers"` to preserve the existing transitive asset
scope. Foundation coder owns the project/lock change; no application source or package
lock was edited during this research. Keep all Aspire SDK/Hosting packages at 13.6.1
(and the already selected matching Keycloak preview). Do not add MessagePack to service
projects, change the general stack, or migrate to MessagePack 3.x.

Evidence: local `src/AppHost/obj/project.assets.json` net10.0 target shows dependencies
from Aspire.Hosting/AppHost/JavaScript/PostgreSQL/RabbitMQ 13.6.1,
Aspire.Hosting.Keycloak 13.6.1-preview.1.26506.6 and StreamJsonRpc 2.25.29 onto
MessagePack 2.5.302. Cached AppHost and StreamJsonRpc nuspec dependencies specify
version `2.5.302` (minimum version semantics), excluding Build/Analyzers. Official
NuGet AppHost metadata confirms >=2.5.302; there is no exact upper constraint.
NuGet's documented direct-dependency-wins rule permits the direct patch to satisfy
these lower bounds. MessagePack 2.5.303 retains .NET6/.NET Standard2.0 support and
requires MessagePack.Annotations >=2.5.303, so the lock should also resolve Annotations
to 2.5.303. Existing unrelated transitive pins should remain unchanged unless restore
proves a required dependency consequence.

The maintainer advisory identifies affected versions <2.5.303 and >=3.0.0,<3.1.9,
and fixed versions 2.5.303/3.1.9. The official v2.5.303 release is the security patch
for this advisory; same-line patch is the least disruptive remedy. An Aspire release
upgrade would change a much broader tested dependency family and is unnecessary when
its declared minimum already admits the fixed patch. A 3.x override adds avoidable
major-version compatibility risk. Workarounds/rate limits do not replace this fix.

Sources checked 2026-10-20:

- [Maintainer advisory and fixed ranges](https://github.com/MessagePack-CSharp/MessagePack-CSharp/security/advisories/GHSA-qhrr-8q5h-9q3h)
- [Official 2.5.303 security release](https://github.com/MessagePack-CSharp/MessagePack-CSharp/releases/tag/v2.5.303)
- [Official patch commit](https://github.com/MessagePack-CSharp/MessagePack-CSharp/commit/7fd78bb)
- [NuGet MessagePack 2.5.303 framework/dependency metadata](https://www.nuget.org/packages/MessagePack/2.5.303)
- [NuGet Aspire.Hosting.AppHost 13.6.1 dependency metadata](https://www.nuget.org/packages/Aspire.Hosting.AppHost/13.6.1)
- [NuGet direct dependency resolution](https://learn.microsoft.com/en-us/nuget/concepts/dependency-resolution#direct-dependency-wins)

Compatibility remains to be verified on the concrete proposed revision: locked restore
with warnings as errors/audit enabled, inspect resolved MessagePack/Annotations graph,
AppHost build, required lint/check gates, and manual isolated Aspire startup/login/docs
regression under the existing workflow. Maintainer regression coverage supports the
upstream fix; no local reproduction exploit or synthetic private-method test is needed
to duplicate the serializer's own tests. Security reviewer must assess the exact
project/lock diff and audit result; this recommendation is not an approval or risk
acceptance. Existing failing NU1902 command is pre-fix required-check evidence.


## Argo loopback browser TLS (2026-10-20)

Author inspection found that trusting Argo's generated self-signed certificate does
not establish the advertised https://127.0.0.1:18443 endpoint's IP identity. The minimal
supported adaptation uses the existing owner-trusted local CA and leaf certificate:
include IP SAN 127.0.0.1 alongside app.equipment.test and identity.equipment.test.
Local prerequisites must verify the leaf chain and that IP SAN before any mutation.
Private setup additionally provisions `argocd-server-tls` in namespace `argocd`, type
kubernetes.io/tls, with existing private tls.crt/tls.key. Create namespaces first and
provision this Secret before installing Argo. Secret values travel through captured
stdin/server-side apply, never command arguments, rendered public files or logs.

The [official Argo CD 3.5 TLS documentation](https://argo-cd.readthedocs.io/en/release-3.5/operator-manual/tls/)
specifies this dedicated Secret's precedence and automatic reload. Keep user-facing
server TLS enabled, browser authentication required and forwarding restricted to
127.0.0.1. Root CA private material is never distributed. Reusing the existing leaf/key
adds one private Secret in the platform namespace for this single-instance demo; no
additional CA, hostname, controller or public management route is introduced.

CI already applies the platform namespace file including argocd and may provision this
unused platform Secret without installing Argo; alternatively an explicit namespace
filter may omit it. This does not prove Argo browser access. Required evidence: real
certificate IP-positive/wrong-IP-negative verification, process-boundary Secret contract,
and eventual actual pinned Argo endpoint/browser trust/authentication. No certificate
was generated, trust installed or real local setup performed by this research.
