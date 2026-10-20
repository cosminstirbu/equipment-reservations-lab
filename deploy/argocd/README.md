# Local Argo CD platform

`install.yaml` is the unchanged upstream Argo CD v3.5.5 non-HA manifest from
https://raw.githubusercontent.com/argoproj/argo-cd/v3.5.5/manifests/install.yaml.
Its SHA256 is `90dc9094bf4c5964afd9c0e35d735e1c2fcbbda4f8e36799c092d9864ed65f50`.
Exclude this vendor file from automatic formatting. Kustomize applies pinned
multiarchitecture image indexes and finite CPU/memory limits without altering
upstream bytes. Dex, ApplicationSet and notifications controllers have zero replicas;
this local application uses the built-in authenticated admin account and one Application.

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
