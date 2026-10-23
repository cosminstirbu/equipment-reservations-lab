# Windows local setup qualification

## Application child-resource policy amendment — 2026-10-23

The owner approved adding core Pods and apps ReplicaSets to the local AppProject's
namespaced resource allowlist so the Application tree includes Deployment children.
This also permits Applications in the project to directly manage those kinds;
it is not a visibility-only setting. Repository, destination, Secret exclusions
and cluster-scoped restrictions retain their existing scope.

Regression design: parse the actual public AppProject manifest and verify the
requested child kinds are admitted while Secrets, wildcards and cluster-scoped
resources stay outside the allowlist. No doubles are needed for this declarative
policy boundary. Apply only the AppProject to the owned local cluster, then verify
the effective allowlist and resource-tree visibility without printing credentials.

The regression failed on the missing core Pod permission, then all four Argo policy/
ordering tests passed. Applied only the AppProject and requested a normal comparison
refresh. Authenticated resource-tree API verification changed from zero Pods/zero
ReplicaSets to 36 Pods/10 ReplicaSets; counts include retained completed Pods.
Application health remained Healthy/Synced. No credentials or token values were
printed, and no workload manifests were reapplied.

## Interactive Argo access amendment — 2026-10-23

The owner requested that `access argocd` remain open until manually interrupted.
Only that interactive loopback forward has no overall process deadline. Ownership,
authentication, fixed endpoints and individual Kubernetes API request timeouts stay
intact; setup/smoke and the Dashboard forward retain their finite budgets.

Regression design: exercise the public lifecycle `execute` boundary with the existing
external provider double, asserting the Argo forward's zero (disabled) process timer
and truthful Ctrl+C guidance. Retain the Dashboard timer assertion. Verify that exact
selected timer with a real Node child through the production process executor; no
cluster or credential double replaces application-owned lifetime policy.

The regression failed with the former 180000ms timer, then both access tests passed
with Argo's timer disabled and Dashboard's timer retained. The selected zero timer
also passed through the production executor to a real child process successfully.

Owner request (2026-10-22): run the existing kind/Argo setup on Windows while
preserving macOS behavior. The owner also approved an explicit experimental
8 GiB Windows trial; the normal 11000 MiB minimum remains unchanged. This does
not establish capacity acceptance or authorize changing the VM, DNS or host trust.

Applicable standards: constitution, formatting, tooling, testing, resilience and
observability. Private provider output remains captured. Trust must be checked,
never installed by setup. Existing credentials, TLS keys and storage must survive.

Test design: exercise real private filesystem paths through a shared platform
boundary used by lifecycle and smoke. Windows tests use real NTFS ACLs and reject
broad grants and links; Unix tests retain exact 0700/0600 checks. Trust tests use
real certificates and the system-root reader boundary; macOS retains its real
`security verify-cert` command contract. Platform-command doubles represent only
the external OS/provider and assert successful/refused public outcomes. Existing
lifecycle tests continue covering ordered setup, ownership, retained credentials,
cleanup and Argo synchronization. Run actual Windows prerequisites/setup/smoke;
Linux tests do not establish macOS runtime acceptance.

WSL capacity must be read from the running guest because Podman's machine-memory
metadata is stale on this host. The opt-in trial accepts at least 7680 MiB of guest
memory (8 GiB minus WSL/kernel overhead); normal setup still requires 11000 MiB.
All workload requests/limits, authentication, TLS and data-safety gates stay intact.

Initial actual setup reproduced a cross-platform Argo ordering defect: dependency
Services were in default wave 0 while database bootstrap ran in wave -20. PostgreSQL
was healthy but its Service did not exist, and bootstrap reported NpgsqlException.
The new ordering regression failed on that exact dependency, then passed after
moving postgres/dashboard/rabbitmq/keycloak Services to wave -40. During diagnosis,
the four corrected Services were applied only to the owned local cluster; a retry
successfully completed database bootstrap without changing credentials or storage.
This temporary local repair does not establish adoption of corrected GitOps source.

The next health gate reproduced missing ingress status: Traefik did not publish
the local endpoint, leaving Argo Progressing despite a successful sync. A separate
regression failed before adding the supported ingress endpoint IP 127.0.0.1; the
installed binary's help confirmed support. Applying it made Argo Healthy/Synced and
allowed setup to finish. Source: [Traefik ingress endpoint configuration](https://doc.traefik.io/traefik/providers/kubernetes-ingress/).

The pinned Dashboard redirects `/` through `/structuredlogs` to `/login`. A real
HTTP regression reproduced the old smoke probe incorrectly rejecting this normal
navigation. The bounded repair follows at most three same-origin redirects through
known paths and still rejects anonymous content access, foreign origins and token
URLs, including encoded tokens in return URLs. All eleven HTTP smoke tests passed.

Windows affected lifecycle/platform/ordering tests initially passed 49 tests with
zero failures and two explicit Unix-only skips. Subsequent fixes and their final
verification are recorded below. No macOS runtime execution is claimed; its external
security command, mode checks and 11000 MiB default retain regression coverage.

Broker replacement reproduced another shared lifecycle defect: the kubelet's
default recursive fsGroup update changed the retained Erlang cookie to 0660.
The broker refused startup in its Erlang authentication module. Only file mode,
UID and GID were inspected; cookie contents were never printed or regenerated.
The correction uses fsGroupChangePolicy OnRootMismatch and setup prepares the
volume root as 2770 owned by UID/GID 999. This grants no access to other users;
private files keep their individual modes. Repairing the existing cookie to 0600
and applying that policy recovered the broker. New setup and manifest regressions
failed before their fixes and passed afterward. See [Kubernetes volume ownership](https://kubernetes.io/docs/tasks/configure-pod-container/security-context/#configure-volume-permission-and-ownership-change-policy-for-pods).

## Actual local results

On 2026-10-22, with the owner's existing Windows WSL rootful Podman machine,
6 CPUs and 7728 MiB guest RAM:

- Complete kind/Argo setup passed after the documented local corrections.
- Argo reported Healthy and Synced at main revision
  `898aa04da8739d4ecfe9f2ca72eed740361a0486`; the dependency Service, ingress
  status and broker-policy source fixes remain local and are not yet in that main.
- Full deployed HTTP smoke passed, including genuine business writes/cancellation,
  authorization, notification effects, public service documentation, authenticated
  diagnostic/OTLP access and required correlated workflow/dependency/bootstrap
  telemetry. The persistence checkpoint was created privately.
- Repeat setup passed, retained byte-for-byte original credentials, and verification
  of that same reservation/identity/notification checkpoint passed. Cookie mode
  remained 0600 and retained PVCs stayed Bound. No data or credential reset occurred.
- Observed kind-node memory was approximately 3.5 GB; the guest reported 4644 MiB
  available and zero swap use. This is a startup/smoke observation, not pressure,
  long-running retention or VM-restart acceptance evidence.
- The owner explicitly approved a disposable official Node 24.15.0 Linux container
  with a read-only checkout and network access to install OpenSSL. The affected
  Unix lifecycle/platform/HTTP/telemetry/Argo suite passed 59 tests, zero failures,
  with only the Windows-specific ACL test skipped. Real Unix mode checks ran.
- The final Windows ACL suite passed all five tests, including rejection of broad
  grants, missing owner access, and links. Earlier Windows lifecycle execution
  passed 49 tests with two Unix-only skips; the added retained-root regression and
  final HTTP/telemetry regressions were verified separately.
- Final format-check and lint passed, including zero-warning/zero-error .NET build
  and suggestion-level style verification. Candidate rendering, committed release
  validation, documentation local links and diff whitespace checks passed. A final
  persistence verification also passed under the strengthened Windows ACL checks.

Private state, certificates, credentials and checkpoint are ignored and remain
outside Git. No host DNS/trust or VM setting was changed by setup. Browser-driven
manual acceptance, macOS integrated execution, pressure and VM-restart experiments,
fresh corrected-main adoption, independent feature reviews and human feature
acceptance remain pending. The optional Unix check's initial automatic approval
rejection was resolved by the owner's explicit approval before execution.
