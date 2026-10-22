# Static manifest policy implementation

2026-10-22. Owner B, T074. Assigned baseline
`9f5e592ab89faa299740ae693a6de3af8fcac942` plus approved T072 preparation.
Allowed writes: deployment-validation.mjs, its test, and this evidence file.
Other workers own manifest helper/provider contracts, generator and workflows.
No acceptance or independent-review verdict is asserted here.

## Applied rules and interface

Reused current AGENTS/protocol/constitution and formatting/testing/tooling/privacy
guides already read in this session. Read manifest-quality-design and T071–T077.
Speckit-implement prerequisite resolved exact feature 013 with explicit environment;
all five checklists had zero unchecked items. No extension hooks exist.
No historical exception applies to this work.

Public seam: `validateStaticManifests(text,state)`, consuming readComponentState.
State now additionally exposes `jobSuffixes:{database,identity}`. Coordinator
explicitly approved that narrow addition because records alone omit configuration
and Job templates required by the canonical identity hash. Values are taken from
actual wrappers only after committed-state/schema/suffix validation; no extra root
read or recursive state validation occurs. Existing records/missing/status consumers
remain compatible. Architect recorded the amendment in plan/design.

The new policy validates state consistency before admitting aliases, then requires
seven unique exact equipment-namespace slots. These include apps/v1 Deployments
inventory/reservations/notifications/web with corresponding regular containers,
batch/v1 database/identity Jobs with validated current suffixes and corresponding
regular containers, and apps/v1 rabbitmq Deployment's definitions initContainer.
Present records require the exact rendered image@digest. Missing records require
the exact unresolved component alias in that component's slot. A pinned replacement
without a record is not evidence of a released component.

Default validateManifests remains strict. Parsing and existing Secret, immutable
third-party image, CPU/memory, Retain, prune/delete protection and Application
deletion checks share a private policy function. There is no public loose-mode
flag, global bare-image allowlist, rendered-text rewrite, invented digest, network
check or provider/readiness assertion. The static public function returns validated
documents without mutating source/state.

## Test design and red/green evidence

Tests exercise the public policy with actual component record/schema/committed
state, parser, canonical hashing and promotion transformations. Temporary filesystem
fixtures contain real public base/local configuration and Job templates. Workload
documents derive from actual base YAML, represented as JSON documents at this pure
policy seam; this does not claim real Kustomize rendering. Owner A/coordinator own
the actual pinned-kubectl rendering/generator contract coverage and full CLI.

Solitary policy cases are justified because deterministic validation and rejection
are the behavior under test. No internal function or subprocess result is mocked
to prove policy. Existing real subprocess/privacy/symlink tests remain intact.

Each command used
`node --test --test-name-pattern=FILTER scripts/deployment-validation.test.mjs`.
For new contracts the indicated intended failure was observed before dependent
implementation, followed by exit 0 on the same command:

| Filter | Intended red |
| --- | --- |
| static policy accepts initial | Strict existing delegate rejected known unresolved aliases with Container requires immutable digest. The new export initially delegated unchanged strict behavior, avoiding a missing-export/setup failure. |
| component state exposes validated | Bootstrap identity context was absent, undefined rather than the actual validated -unreleased suffixes. |
| static policy rejects inconsistent | Six independently executed context cases were accepted or reached image checks without context rejection: missing-list/status/unknown/mismatched/invalid record and invented bootstrap identity. |
| static policy requires seven unique | Eight independent structural mutations passed: missing/duplicate workload, wrong namespace/workload/container/API, stale Job identity and broker moved to a regular container. |
| static policy checks rendered | Pinned wrong repository/digest and unrecorded pinned substitutes were accepted; published bare/tagged inputs failed only generic pin validation instead of exact component provenance checks. |
| static policy rejects a primitive | records:42 was incorrectly accepted as an empty record map. |

An initial slot-mutation fixture attempt used structuredClone on parser proxies and
failed DataCloneError. That was corrected to plain JSON before capturing the eight
actual Missing expected exception reds; setup failure was not counted as red proof.
Configured ESLint does not declare structuredClone globally; plain JSON fixture
cloning also resolved that diagnostic without configuration changes/suppression.

Added green preservation cases exercise every successive component publication,
including each bootstrap's own current hash, partial runtime completeness rejection
and final complete runtime-policy success. Nine security/resource preservation
cases cover private Secrets, floating third-party images, unrelated bare aliases,
missing CPU/memory, destructive PV, unprotected PVC, cascading Application,
malformed identity and duplicate container. These retain existing policy behavior;
no new production behavior was added to make them pass.

## Checks and limits

Per-edit exact-file formatting and reread performed throughout. Final owned ESLint
with --max-warnings=0 and scoped git diff --check: exit 0.

Linux verification used existing cached Node 24.15.0 arm64 image
`sha256:401f10ae1c59171eb76a1d1f8ae62bdaad111a078c31fa7626acc4dc439cc288`,
network disabled, read-only container/checkout, temporary /tmp only:

```text
podman run --rm --pull=never --network=none --read-only --tmpfs /tmp:rw --mount type=bind,source=/mnt/c/Repos/equipment-reservations-lab,target=/workspace,readonly --workdir /workspace IMAGE node --test scripts/deployment-validation.test.mjs
```

Result: **55/55 passed, zero skips, exit 0**, 6.39 seconds. Windows targeted
policy tests also passed; Linux covers the retained actual POSIX symlink case.
Coordinator owns final combined snapshot, full format/lint/application checks,
actual pinned renderer evidence and independent quality/security/convergence.
No runtime/cluster, publication, remote workflow, commit or push was performed.
Source frozen pending coordinator integration/review.

## MQ-S001 repair round 1

Coordinator assigned the independent security finding: supported top-level policy
inspection did not traverse CronJob jobTemplate or List children. Valid seven-slot
documents plus an unrelated CronJob could therefore hide a bare application alias,
floating image or missing container resources; a List could hide a Secret or Pod.

Before production changes, command
`node --test --test-name-pattern='MQ-S001 static policy' scripts/deployment-validation.test.mjs`
exited 1. Seven independent subtests reported Missing expected exception: CronJob
bare alias, CronJob floating image, CronJob pinned image without resources, List
hidden Secret, List hidden Pod, PodTemplate and typed PodList. The existing seven
valid component slots were retained in every fixture.

Repair is a narrow static-only rejection of CronJob, PodTemplate and list resource
kinds (List and typed *List). PodTemplate is the comparable standard core resource
whose template.spec is outside the shared Pod/spec.template shapes. No recursive
schema subsystem or broader runtime-policy behavior was introduced. Existing Pod,
Deployment, StatefulSet/DaemonSet/ReplicaSet/Job spec.template handling is unchanged;
unsupported nested shapes are not represented as validated. The public static
command now fails clearly for these forms instead of silently skipping children.

The same targeted command passed all seven cases after the repair; initial,
successive partial bootstrap and complete positive cases remained green. Final
owned Linux deployment-validation suite: **63/63 passed, zero skips, exit 0**,
6.28 seconds, same cached read-only/network-disabled environment above. Per-edit
format/reread, scoped ESLint and diff-check passed. Only the assigned validator,
its test and this report changed. Source refrozen for original reviewer closure;
the implementer does not mark the security finding closed.
