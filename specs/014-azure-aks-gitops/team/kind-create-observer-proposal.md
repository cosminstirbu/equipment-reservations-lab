# Temporary kind-create observer proposal (read-only diagnosis)

No executable source, native cluster, VM/kernel setting, default kubeconfig or provider
resource was changed by this owner. Coordinator owns any next temporary observer run.
All round13 source remains frozen. This record does not select a causal repair.

## Current evidence and changed failure location

Coordinator reports plain round13:3PASS/1bundleFAIL,0skip,243.596s. Bundle's exact
ClusterIssuer Established wait exited1 in518ms after CRD apply succeeded, with
unclassified providerCategory. Subsequent temporary CRD observers produced:

- probe1: all4 passed248.455s, including wait exit0;
- probe2: ACME/admission kind-create exited1 at approximately104.75/104.92s;
  bundle passed134.728s with wait0; Loki passed25.016s. Total2PASS/2FAIL,0skip,135.009s.

Neither temporary-observer pass nor changed failure location is an original-gate pass.
No CRD-null-condition, inotify, OOM, emulation or generic resource cause is established.
Root independently verified host/image are arm64/linux-compatible and cleanup leaves
zero owned fixtures/one preexisting container.

## Pinned source distinguishes stages

[Kind v0.33 Podman provisioning](https://github.com/kubernetes-sigs/kind/blob/v0.33.0/pkg/cluster/internal/providers/podman/provision.go#L404)
starts a30s context for the boot-log follower only after container creation. Its
[common cgroup readiness matcher](https://github.com/kubernetes-sigs/kind/blob/v0.33.0/pkg/cluster/internal/providers/common/cgroups.go#L37)
accepts either the systemd multi-user marker or the cgroup-v1 marker; failure distinguishes
missing marker versus failure reading logs. A104s overall exit can include earlier
container work plus this30s stage; duration alone does not identify the branch.

[Kind kubeadm initialization](https://github.com/kubernetes-sigs/kind/blob/v0.33.0/pkg/cluster/internal/create/actions/kubeadminit/init.go#L84)
wraps unsuccessful kubeadm init separately. Nested
[Kubernetes v1.35.8 control-plane initialization](https://github.com/kubernetes/kubernetes/blob/v1.35.8/cmd/kubeadm/app/cmd/phases/init/waitcontrolplane.go#L65)
distinguishes kubelet startup from control-plane component startup failures.

Crucially, kind's later [waitforready action](https://github.com/kubernetes-sigs/kind/blob/v0.33.0/pkg/cluster/internal/create/actions/waitforready/waitforready.go#L80)
prints a Ready-timeout warning and returns nil. A warning flag must remain separate;
it cannot alone explain kind exit1. Existing --wait120s is not the early30s boot-log
bound, and neither is the outer180s subprocess deadline.

Provider stages additionally distinguish image pulling, prerequisite network setup,
node enumeration and API-port lookup in pinned
[images.go](https://github.com/kubernetes-sigs/kind/blob/v0.33.0/pkg/cluster/internal/providers/podman/images.go#L59)
and [provider.go](https://github.com/kubernetes-sigs/kind/blob/v0.33.0/pkg/cluster/internal/providers/podman/provider.go#L60).
Kind's [create flow](https://github.com/kubernetes-sigs/kind/blob/v0.33.0/pkg/cluster/internal/create/create.go#L92)
automatically deletes nodes on provisioning/action failure unless retain is requested;
absence afterward therefore does not locate the failed stage. No retain flag change
or raw-log export is proposed.

## One bounded temporary observer

Use the existing temporary --import mechanism, without checked-in source/API changes.
Match only the exact checksum-verified kind executable, create cluster argv shape,
existing pinned node digest, explicit owned private kubeconfig and source-specific
acme/admission/bundle UUID name format. Preserve args, env, flags, exit status, child
control flow, listener delivery, deadlines and concurrent test load. Never intercept
arbitrary user kind commands or delete resources from observed names.

Keep at most64KiB of private stderr in memory; emit overflow/truncation and total-byte
metadata only, not text, lines, captured matches, paths, ports, URLs or payloads. On
overflow, a false predicate is inconclusive. No file/raw artifact, callback API,
verbosity increase, cluster rerun, sysctl change or different cleanup strategy follows
from this proposal. A bounded temporary observer is instrumentation, not the gate.

Emit one safe result per matched process: fixture family (fixed enum), exit status/
signal, elapsed duration, overflow and these fixed booleans:

| Flag | Pinned-source selection and interpretation |
| --- | --- |
| systemdBootLogMiss | Require the complete missing-log-line branch plus BOTH documented cgroup readiness alternatives; not a loose generic timeout match. |
| logReadFailure | The distinct common log-follower error branch; do not infer node boot state from this alone. |
| kubeadmInitFailure | The exact kind initialization wrapper, not its progress banner. |
| kubeletStartFailure | The nested pinned kubeadm kubelet-start error, when actually exposed. |
| controlPlaneStartFailure | The nested pinned kubeadm component-start error, when actually exposed. |
| readyWaitWarning | The final readiness warning only; never classify it as a fatal error by itself. |
| imagePullFailure | The pinned image-pull failure wrapper, not the normal ensuring-image progress banner. |
| ensureNetworkFailure | The pinned network setup failure wrapper. |
| nodeListFailure | The pinned node-enumeration failure wrapper. |
| apiPortLookupFailure | The pinned API endpoint/port lookup failure wrapper. |
| tooManyOpenFiles / noSpaceLeft / allocationFailure / resourceUnavailable | Independent standard OS wording flags only; observation is not proof of an exhausted specific resource. |
| portBindConflict | Independent address-in-use wording; do not merge it into an OOM/inotify category. |
| unclassified | No assessed fatal branch matched, or output incomplete/ambiguous. |

Exact predicates were supplied to the coordinator from the linked pinned code; these
booleans convey evidence, not permission to retry/relax TLS/serialize/change timeouts.
Multiple true flags may represent nested wrappers; report them without selecting an
unsupported single cause. False flags do not rule out hidden or truncated output.

## Read-only limit observations and their limits

Direct numeric procfs read via Podman VM returned:

- fs.inotify.max_user_instances=524288;
- fs.inotify.max_user_watches=524288;
- fs.inotify.max_queued_events=16384;
- fs.file-max=9223372036854775807;
- fs.file-nr allocated3871,unused0,maximum9223372036854775807.

An initial incomplete remote-shell projection was discarded; the above direct cat
returned all five expected fields. Coordinator independently confirms the two high
inotify limits and rootless=false. No setting was changed. These observations do not
support the low-default128-instance explanation. They also do not measure concurrent
per-UID inotify usage, queued-event saturation or each kind systemd process's RLIMIT;
therefore they cannot rule out every resource limit. Global file allocation is not a
substitute for per-process descriptor headroom.

Kind's official [known-issues guidance](https://kind.sigs.k8s.io/docs/user/known-issues/#pod-errors-due-to-too-many-open-files)
documents inotify as a possible explanation for open-file errors, not a universal
cause. Here actual failure text/flags must precede any proposed resource intervention.
No generic sysctl escalation, VM resizing, timeout inflation, blanket serialization,
provider skip or emulation change is justified by this read-only snapshot.

## Next decision boundary

Root executes at most the specifically requested next concurrent temporary observation
and retains safe flags, unchanged source hashes and exact cleanup outcome. A boot-log
failure narrows the next hypothesis to node boot/log delivery; kubeadm nested flags
narrow a different stage; provider image/network flags redirect investigation there.
If output stays unclassified, report that limitation rather than inventing a cause.
Any permanent code or environment intervention needs its own concrete reviewed scope.
The original complete CI gate remains required after an evidenced causal repair.
