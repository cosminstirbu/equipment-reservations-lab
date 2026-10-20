# Lifecycle implementation evidence

Scope: T013/T014/T019–T023/T034 against preparation prep-design-012-03.

Test design: public lifecycle commands retain real filesystem, credential generation,
JSON serialization, command construction and validation. The process boundary double
models kind cluster enumeration, Podman inspection, kubectl JSON state and errors;
its fidelity must additionally be checked against the pinned disposable cluster.
No cluster runtime acceptance is inferred from process doubles or manifest checks.
Port/DNS/trust checks are external host boundaries. Tests assert outcome, scope,
preserved bytes/modes and failure-before-mutation, not private helper behavior.
All subprocesses have explicit deadlines; mutations are never automatically retried.
No circuit breaker: finite operator-invoked commands fail visibly.

## Test-first record

`node --test scripts/local-kubernetes.test.mjs` initially failed at module resolution,
then with a public scaffold all 8 initial behavior cases failed (exit 1). The final
suite retains those contracts plus targeted regressions: missing-bundle setup recovery
and concurrent mutation initially failed 2/15; partial-install teardown initially
failed 1/17. Implementations then passed the respective cases. Test command output
was inspected directly in the agent session; no runtime environment was substituted.

The final process double retains host validation, real private filesystem and real
release-schema/index validation. Only raw DNS addresses, port availability and
external process responses are replaced. Temporary test GHCR references/indexes are
boundary fixtures, never committed deployment references or runtime proof. Native
read-only Podman contract observation matched the double's machine JSON schema,
rootless=false and disk KiB result. The pinned kind binary returned an empty cluster
list after the separately authorized compatibility cleanup. Earlier real kubectl,
TLS and ingress compatibility evidence remains in research.md; a current live
kubectl contract check was unavailable because that disposable cluster was absent.

## Implementation decisions and author inspection

All subprocesses capture output privately with explicit deadlines; setup has an
overall 15 minute upper bound. Mutations are not retried. A private operation lock
rejects overlapping setup/stop/reset/teardown; stale locks require deliberate owner
inspection. Credentials are generated with exclusive-create semantics and reused
byte-for-byte. Invalid/missing private bundles fail without replacement or raw JSON
error fragments. Kubeconfig, TLS private key and credential files require 0600;
state requires 0700 and rejects symlinks. Host trust, DNS and VM settings are never
changed. TLS public CA alone is mounted into application resources.

Setup verifies actual remote GHCR indexes through Podman before mutation and refuses
an absent release. Secret resources travel through stdin/server-side apply, avoiding
credential arguments and last-applied annotations. The CI-only public helper returns
the same private resources for the independent ephemeral verification workflow.
Namespace/PVs remain platform-owned; Argo AppProject excludes Secrets and cluster
resources. PVs use static Retain, fixed claims and node affinity, protected from
ordinary Argo pruning/deletion. Traefik secret access is scoped to equipment namespace.
The exact upstream Argo bytes retain the research checksum; transformations pin all
images and bound all containers including init/disabled components. Running Argo
container memory caps total 1152MiB; even all optional controllers total 1536MiB.
No management listener is published by platform Services.

Stop halts reconciliation, preserves failed Jobs by suspending them and scales only
application workloads. Reset requires --confirm-delete-data and removes only equipment
namespace, two named PVs and two exact node-local paths after namespace termination.
Teardown requires --confirm-delete-cluster and targets equipment-local only. Tests
inspect these destructive command contracts; no reset/teardown was executed here.
Diagnostic forwarding binds 127.0.0.1, requires existing authentication and suppresses
provider output/token URLs. Argo uses its internally generated initial admin credential;
Dashboard uses the create-once dashboardBrowser bundle value.

## Remaining integration and acceptance

T021 local overlay PVC bindings remain deployment-coder owned; required claim names
postgres-data/rabbitmq-data with equipment-retain class, equipment-postgres/rabbitmq
volumeName and Prune=false,Delete=false annotations. Provider UID999 matches private
node-local directory ownership. Bootstrap Jobs must explicitly set suspend:false.
T034 private credential retrieval/access prose remains coordinator/deployment docs
ownership. Argo authentication is deliberately entered manually through loopback UI;
no credential-printing command is introduced.

Required repository-wide format-check/lint/check are coordinator-owned at the freeze;
focused ESLint/format checks and offline rendering cannot replace them. Complete
actual setup, repeat/pod/update/prune/reset/teardown state checks, resource measurement,
VM restart, trust/DNS/browser/telemetry and genuine reviewed publication remain pending.
No independent quality/security verdict or human acceptance is claimed by this author.

## Final focused check record (2026-10-20)

Baseline HEAD `4dd685c4e34288f94e932dcd49beb22eea965075`, uncommitted assigned files.
SHA256 local-kubernetes.mjs: `ec9a1b96c81e7c1468eb51ab418fd0d858225f4f5d61ff33c1f49ce0c284b48d`.
SHA256 local-kubernetes.test.mjs: `b933f2913350076b62b45ec18aadb8ecf7c02bae4c3dbeb214960cb83c5af1d7`.

- `node --test scripts/local-kubernetes.test.mjs`: exit 0, 17/17 pass.
- `node node_modules/eslint/bin/eslint.js scripts/local-kubernetes.mjs scripts/local-kubernetes.test.mjs --max-warnings 0`: exit 0.
- `npm run format-check -- scripts/local-kubernetes.mjs scripts/local-kubernetes.test.mjs`: exit 0.
- `node node_modules/prettier/bin/prettier.cjs --check deploy/platform/*.yaml deploy/argocd/kustomization.yaml deploy/argocd/resources.yaml deploy/argocd/local.yaml`: exit 0.
- `/private/tmp/equipment-k8s-tools/kubectl kustomize deploy/platform`: exit 0; rendered structural validator accepted 14 resources.
- `/private/tmp/equipment-k8s-tools/kubectl kustomize deploy/argocd`: exit 0.
- `shasum -a 256 deploy/argocd/install.yaml`: approved upstream SHA matches exactly.

No extension hooks are configured (.specify/extensions.yml absent). Both feature
checklists had all items checked; markers were read-only. Task checkbox serialization
was handed to the coordinator, not concurrently edited by this worker.

## Integration repair: smoke launch and strict release prerequisites

Coordinator-assigned repair before freeze. Changed only lifecycle CLI/tests plus
this evidence. Initial new smoke tests failed 3/20 because state/CA/forwarding were
absent; narrow persistence flag test then failed 1/21; duplicate-release/stale-Job
precondition regression failed 1/22 before the respective implementation fixes.

Smoke now writes validated private0600 smoke-state.json under existing0700 state,
uses absolute state/credential/CA paths and canonical origins/context, starts only
the owned Dashboard service forwarding18888/18890 on127.0.0.1 after verifying ports
are free, waits at most15s for both TCP listeners, then invokes Node with --state
and NODE_EXTRA_CA_CERTS supplied before child startup. processRun merges explicit
per-call environment into the actual execFileSync options. Forward output is ignored;
finally cleanup uses TERM with5s bound then KILL with1s bound. No system trust changes.
Smoke shares the operation lock with lifecycle mutations. Exact capture/verify
persistence flags pass through; verify skips diagnostic forwards because its provider
contract needs only public authentication/business endpoints.

Tests retain real state serialization/permissions and release parsing/hash validation;
process/child-process and raw TCP observations are external boundary doubles. A further
narrow adapter contract invokes the public lifecycle with its real subprocess adapter,
using executable kind/kubectl transport doubles and a real fresh Node smoke child;
that child's first statement observes the exact supplied CA environment and --state
arguments. This establishes actual child environment propagation, not only option
construction. No live cluster or network socket is used by that contract test.

Setup now uses parseRelease/readPublicFile and validateJobSuffixes(readJobInputs(root))
before any cluster mutation, then independently checks published multiarchitecture
indexes. This rejects duplicate release fields, unsafe public-file links and stale
immutable Job suffixes. Temporary test releases remain transport fixtures only.

Final focused checks: node --test scripts/local-kubernetes.test.mjs exit0,23/23;
owned ESLint --max-warnings0 exit0; exact owned npm run format-check exit0.
SHA256 CLI `1dac10b11f84c28349af71b361c936220618a0f5a86691380f773c430519303a`;
tests `08fa35c6c611474770d24f1bae39ee71e486d336a750f89bfd9124159e1084dd`.
Earlier hashes remain historical. No full checks or real deployment ran in this repair.
Historical successful bootstrap Job cleanup remains an explicit integration gap raised
to the coordinator; it is not claimed as implemented by this repair.

## Integration repair: require this full sync's successful hooks

Coordinator assignment follows architect's approved Sync-hook cleanup clarification.
Three new regression cases failed 3/26 before implementation: old Healthy/Synced
workloads with a failed new hook were accepted, no correlated full operation was
requested, and a mismatched resolved revision was accepted. After repair26/26 pass.

Provider contract checked against the pinned official
[Argo CD v3.5.5 Application types](https://raw.githubusercontent.com/argoproj/argo-cd/v3.5.5/pkg/apis/application/v1alpha1/types.go):
Application.operation accepts a Sync request and informational request identifier;
OperationState retains that original operation and its phase/result. A full request
omits the resource filter and apply-only strategy, preserving hook execution. Test
responses use these public fields, with old success followed by current failed/success
states and exact resolved revisions. This is process-boundary evidence, not a claim
that an actual Argo controller has run these paths.

Setup resolves the public repository's exact main SHA with read-only git ls-remote,
15s deadline and noninteractive credential prompting disabled. Git is an explicit
prerequisite. Before creating the Application request, setup stops the controller,
including on first install, and waits for controller pods to exit. It then requests
full sync at that SHA via JSONPatch with resourceVersion compare-and-swap and a fresh
128-bit operation.info identifier. Existing two-retry/backoff and sync ownership
options are validated and carried into the request. The controller resumes afterward.

The finite10-minute operation wait is capped by the existing overall15-minute setup
budget. It ignores stale operations, fails closed on the correlated operation's
Failed/Error/Terminating phase, and requires its Succeeded result plus matching
resolved main revision and same-revision Healthy/Synced state before deployment
availability can pass. No wait assumes a successful hook Job still exists. Failure
messages preserve diagnostics privately; no Job deletion, TTL or blanket history
pruning is introduced here. The earlier historical-cleanup gap is superseded by the
architect's hook cleanup design implemented by the deployment worker.

Final owned checks: node --test scripts/local-kubernetes.test.mjs exit0,26/26;
owned ESLint --max-warnings0 exit0; exact owned npm run format-check exit0.
CLI SHA256 `fe38ac6ad225201a48abf16ec497bb2ab3c3156615c2811f2192c1a396420d55`;
test SHA256 `4e8bf1aa094c4c1093a98435dfca1ac2db3564cfe6f1c96402063efc3bc96d3f`.
Actual full Argo sync/hook retry/deletion/runtime evidence remains pending genuine
GHCR releases and approved local setup. No publication or cluster mutation ran here.

## Final author correction: trusted Argo loopback certificate

Coordinator approved the architect's narrow TLS amendment before dependent edits.
Two new tests failed2/28 before implementation: actual TLS preflight lacked the
loopback identity requirement/native support, and the dedicated Argo Secret was absent.
The final suite passes28/28, including a real generated DNS-only leaf rejection and a
real generated IP127.0.0.1 leaf passing supported OpenSSL chain/key/expiry validation
and Node X509 SAN validation. Test CA/leaf material is ephemeral private temporary
state only; no host trust installation or VM/network change occurs.

Native macOS LibreSSL3.3.6 does not implement openssl verify -verify_hostname or
-verify_ip. Preflight now uses its supported verify -CAfile/-purpose sslserver chain
validation plus Node crypto X509Certificate.checkHost (exact DNS SANs, no CN fallback
or wildcard acceptance) and checkIP('127.0.0.1'). This covers both canonical DNS names
and the advertised Argo loopback IP while preserving existing key, expiry and macOS
trust checks. All baseline filesystem fixtures now contain actual generated leaves;
certificate validation is retained rather than replaced with fabricated certificate text.

buildPrivateResources additionally returns Secret argocd/argocd-server-tls with the
existing private tls.crt/tls.key. Setup creates platform namespaces first and provisions
that Secret via captured stdin/server-side apply before Argo installation. The new
contract asserts name, namespace, kubernetes.io/tls type, exact private payload reuse,
ordering and absence of key-bearing output. CI owner was notified to include the IP
SAN and assert the fourth captured resource. TLS remains enabled without a bypass or
additional CA/trust action. Actual Argo browser authentication/TLS acceptance is pending.

Final checks: node --test scripts/local-kubernetes.test.mjs exit0,28/28;
owned ESLint --max-warnings0 exit0; exact owned npm run format-check exit0.
CLI SHA256 `46aaedcb6631768553e1471d13becbc8a957791400171cd7abd66dd6c031d43c`;
test SHA256 `4e6c252576ce984b7f69d40395d5b312b9f51c54f9cdc2120be1be3d1ea98726`.
The final post-test edit removed only an unused test local reported by ESLint; focused
ESLint and formatting were rerun afterward. Prior hashes remain historical evidence.
