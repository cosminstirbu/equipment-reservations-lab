# Local Argo CD platform

The Kustomization references the upstream Argo CD v3.5.5 non-HA manifest at commit
`a5038b0e2bbac1715754380ae0084df8e3d5b48c`. `source.json` records the same immutable
URL and SHA256 `90dc9094bf4c5964afd9c0e35d735e1c2fcbbda4f8e36799c092d9864ed65f50`.
Setup fetches it once, verifies its original bytes, and renders a temporary local
overlay with kubectl 1.35.8 before any cluster mutation. It applies exactly that
render through stdin. Downloaded files are removed afterward. Kustomize applies pinned
multiarchitecture image indexes and finite CPU/memory limits without altering
upstream bytes. Dex, ApplicationSet and notifications controllers have zero replicas;
this local application uses the built-in authenticated admin account and one Application.

Use `node scripts/local-kubernetes.mjs setup` for installation. To deliberately emit
only the verified public rendered YAML, run `node scripts/argocd-installation.mjs`
with pinned kubectl on PATH. Direct `kubectl apply -k deploy/argocd` bypasses checksum
verification and is not the supported installation path. Network access is required
on every render: one HTTPS request has a 30-second budget and a 4 MiB body limit;
redirects, checksum mismatch and unavailable upstream fail before installation changes.
There is no retry, persistent cache or unverified fallback. Source identity and hash
are reviewed repository configuration; no command-line or environment override exists.

Platform setup owns namespaces, retained PVs, controllers and private Secrets.
The AppProject permits only the application namespace and reviewed public repository;
Argo owns application workloads and protected PVCs. Application deletion has no
cascading finalizer. Namespace/PV ownership never passes to the Application.

Stop/reset/teardown first stop the application controller and wait for its pods to
exit, then remove the Application without cascading. Setup provisions private
resources before creating the Application and resuming the controller. Controller
replicas are intentionally omitted from the rendered installation so platform
reapplication cannot race the explicit lifecycle scale operation.

Do not apply `local.yaml` until genuine GHCR references are promoted, private
Secrets exist and the local overlay is ready. Applying these files is not evidence
that the application's runtime, release or local persistence criteria pass.
