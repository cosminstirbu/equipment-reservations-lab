# Component state and promotion implementation

Date: 2026-10-22. Owner B. Assigned T061/T064 at baseline
`424a6701ac97206ecc0067e7ea41763fb3abc950` plus frozen
`component-preparation-01`; later coordinator-approved selected-intent amendment
consumed from owner A. This is implementation evidence, not independent approval
or feature acceptance.

## Scope and interfaces

Changed only `scripts/deployment-validation.mjs`, its test,
`scripts/promote-images.mjs`, its test, `scripts/local-kubernetes.mjs`, its test,
and this record. No committed release records were fabricated.

Applied constitution II/III/IV, formatting/testing/tooling/privacy/resilience guides,
the approved component design and the installed speckit-implement/TDD skills.
Prerequisite command resolved feature 013 explicitly using
SPECIFY_FEATURE_DIRECTORY and SPECIFY_FEATURE_NO_PERSIST; all four checklists
were complete (14/14 component, 10/10 diagnostics, 14/14 local, 16/16 requirements).
No extension file exists. Existing ignore/configuration files were inspected;
no publishing/package/ignore changes belong to this owner.

Frozen record schema shared with owners A/C and coordinator:
`{schemaVersion:1,component,repository:{id,name},sourceRevision,sourceRef,runId,runAttempt,workflow,image,digest}`.
IDs/attempt are positive safe integers; workflow is exactly
`.github/workflows/validate.yaml`, source revision is 40 lowercase hex, source ref
is a nonempty branch ref. Image must equal the lowercased repository's component
image name. OCI digest is immutable SHA256. `validateComponentRelease` validates
the record; `verifyComponentIndex(record,inspect)` validates both Linux platforms
and returns the inspected index. `readComponentState(root,{requireComplete})`
returns `{records,missing,status}` with explicit unreleased/partial/released status.

CLI contracts retained for documentation: `deployment-validation committed`,
`jobs ROOT`, `release COMPONENT_RECORD`; `promote-images refresh ROOT` changes
only present bootstrap records. New pipeline promotion invocation is
`promote-images COMPONENT_RESULT_JSON RUN_INTENT_JSON` where result is
`{record,index}` and original intent follows A's exact schema including selected.
Untrusted events are rejected before image inspection or authenticated operations.
Exported legacy full-image helpers remain for historical/ephemeral CI callers;
new publication CLI/promotion uses component records. No global publication
artifact is created by the new path.

## Test design

Pure record/OCI/canonical/hash validation uses solitary public algorithm tests:
deterministic rejection is the behavior, and no external collaborator exists there.
Committed-state/refresh tests retain real filesystem, parsing, hashing and
transformation. Promotion tests retain intent/schema checks, freshness, patch
generation and CAS policy; the external GitHub gateway is a narrow boundary
double. Transport tests retain production GitHub request/response handling with
Git refs/compare/tree/blob/commit/PR shapes from the existing provider contract.
Blob identities are actual Git SHA1 calculations, not invented filename authority.
Lifecycle tests retain production setup/smoke orchestration, private-file policy,
process execution and actual parent-child progress where claimed, replacing
only external cluster/Docker boundaries. Complete fixtures now contain seven
individual records and their own bootstrap hashes. No compatibility test gate
or live deployment is claimed.

## Intended failures captured before implementation

Each command below used `node --test --test-name-pattern=FILTER FILE` and exited 1
for the listed behavior, before dependent implementation; the same targeted
command then exited 0. EX-013-003 was not used. Lifecycle/symlink tests used the
Linux environment below. Initial Windows private-mode and missing-OpenSSL
prerequisite failures were not counted as red evidence.

| Filter / file | Intended red observation |
| --- | --- |
| genuine independently / deployment-validation.test.mjs | Existing validateRelease rejected a genuine single component as Unexpected release field. |
| committed partial / deployment-validation.test.mjs | Initial global-release guard rejected an available genuine component/overlay. |
| independent component promotion / promote-images.test.mjs | Existing transformation tried to enumerate absent global images. |
| manual divergent component / promote-images.test.mjs | Old source-equals-main guard rejected manual feature source. |
| unchanged deployed digest / promote-images.test.mjs | Returned a PR instead of noop and performed writes. |
| captured proposal record / promote-images.test.mjs | Changed proposal provenance and newer same-lineage candidate were accepted instead of rejecting. |
| component GitHub transport isolates / promote-images.test.mjs | Used the global managed branch instead of the inventory branch. |
| component snapshot accepts / promote-images.test.mjs | Snapshot omitted component records instead of representing initial empty records. |
| partial component publication names / local-kubernetes.test.mjs | Old generic missing-global-release message omitted explicit missing components. |
| configuration refresh updates only / promote-images.test.mjs | Tried reading missing global release.json instead of present bootstrap record. |
| jobs CLI validates / deployment-validation.test.mjs | CLI failed despite valid explicitly unreleased state. |
| single component release index / deployment-validation.test.mjs | Global index enumerator failed instead of verifying one component's platforms. |
| promotion CLI rejects untrusted / promote-images.test.mjs | Parsed old global format rather than rejecting untrusted event at the invocation boundary. |
| managed component proposal cannot / promote-images.test.mjs | Accepted proposal edits to a sibling component. |
| managed component branch remains / promote-images.test.mjs | Rejected a managed branch solely because unrelated main advanced. |
| movement during commit / promote-images.test.mjs | Updated remote ref after main moved during commit creation. |
| smoke refuses partial / local-kubernetes.test.mjs | Started forwarding/child smoke without rejecting missing web. |
| component metadata is bounded / deployment-validation.test.mjs | Accepted a valid record with over 64KiB of JSON input. |
| symlinked component metadata directory / deployment-validation.test.mjs | Committed validator treated linked records directory as initial unreleased state. |
| GitHub lineage inspection fails / promote-images.test.mjs | Malformed ancestry became false instead of failing closed. |
| unselected component cannot / promote-images.test.mjs | Selected-intent amendment still allowed an excluded component to promote. |

Existing superseded main-only/release-entrypoint workflow tests were replaced by
owner C's dedicated component-workflow tests. Kept prerequisite committed-state,
diagnostic retirement and checksum-pinned deployment-tool regression assertions.

## Operational and concurrency assessment

Ordinary existing process handling remains unchanged. OCI JSON, authenticated
GitHub bodies and transport exceptions remain private; malformed responses expose
safe fixed messages only. Existing 15-second request budget and no automatic write
retries are retained. Snapshot Git trees reject truncation, missing/symlinked files
and mismatched blob identities; record filesystem rejects symlinked metadata.

Each promotion validates original selected target/proposal intent, component
provenance and same-lineage freshness. It constructs its component patch from
fresh main blobs, preserving siblings; an existing managed proposal is validated
against its own merge base, then refreshed with a tree derived from fresh main and
non-force ancestry through the prior proposal parent. Target/proposal refs are
reread before commit and again immediately before ref mutation. Existing
expected-head GraphQL non-force CAS remains; no unsupported no-op main-ref
transaction was invented. A target-main race after the final read remains a
GitHub TOCTOU boundary: this updates only the proposal branch, never main, and
review/merge plus conflict detection and future intent validation remain required.
Coordinator explicitly directed retaining this reviewed boundary.

Setup and smoke reject incomplete records before create/apply/forwarding.
Bootstrap identity hashes use their own record plus public configuration/template;
other component publication does not modify a bootstrap suffix. Refresh retains
existing all-owned temporary cleanup and primary-failure preservation.

## Verification and remaining gates

Windows Node focused schema/transformation/CLI tests passed; Windows complete
promotion run had its existing symlink-creation EPERM applicability failure, so
Linux is authoritative for POSIX/private-state coverage. Owned ESLint with
`--max-warnings=0` and scoped `git diff --check` passed.

Linux tests use existing cached Node 24.15.0 arm64 image
`sha256:401f10ae1c59171eb76a1d1f8ae62bdaad111a078c31fa7626acc4dc439cc288`,
read-only checkout mount at /workspace, disposable container, and OpenSSL installed
only inside that container for existing certificate fixtures. No VM configuration,
cluster state or repository dependencies were changed. Command:

```text
podman run --rm --pull=never --mount type=bind,source=/mnt/c/Repos/equipment-reservations-lab,target=/workspace,readonly --workdir /workspace IMAGE sh -c 'apt-get update -qq && apt-get install -y -qq openssl >/dev/null && node --test scripts/local-kubernetes.test.mjs scripts/deployment-validation.test.mjs scripts/promote-images.test.mjs'
```

A pre-selected-schema run passed 77/77 with zero skips. A later run overlapped A's
selected-intent amendment and failed old fixtures; it is invalidated, not a pass.
Current final run results are appended below after completion. Coordinator owns
combined revision snapshot, format-check/lint/application checks and independent
quality/security/convergence gates. No commit, push, remote workflow, GHCR
publication or GitHub mutation was executed. Local runtime/human feature acceptance
remain pending.

Final owned run after selected-intent integration: **80/80 passed, zero skips,
exit 0**, Linux Node 24.15.0, 8.22 seconds test duration. Owned ESLint and scoped
diff-check repeated on the frozen source, both exit 0. Source frozen for coordinator
combined checks and independent review; no further worker edits without assignment.

## CP-S002 repair batch 1

Coordinator assigned security finding CP-S002 on frozen-01: branch-name equality
incorrectly gated the Git-ancestry rollback check. An older ancestor could bypass
freshness by appearing under a different branch name. No rollback authorization
exists; branch names are provenance, not proof of independent Git lineage.

Before production edits, command
`node --test --test-name-pattern='CP-S002 rejects ancestor rollback' scripts/promote-images.test.mjs`
exited 1 with two independent intended failures: target and managed-proposal
subtests both reported Missing expected rejection. Fixtures retain real intent,
record, patch and freshness logic; only the external GitHub ancestry response is
controlled. Both assert zero commit/ref/PR writes on rejection.

Removed only the sourceRef-equality guard from the ancestry decision. The same
command then passed. Added preservation coverage proving a truly divergent manual
candidate may still propose over its captured target. Existing same-digest no-op,
original intent, proposal ownership and CAS checks remain intact.

Final repair run using the exact Linux command above: **84/84 passed, zero skips,
exit 0**, 7.72 seconds. Targeted Windows cases, owned ESLint and scoped diff-check
also exited 0. Only promote-images.mjs, its test and this report changed for the
repair. Refrozen for independent reviewer closure; this is not self-approval.

Root's earlier five-file concurrent run timed out the untrusted-event CLI fixture
at its test-only 10-second child deadline. Read-only inspection found no external
provider work in that path: it only loads modules and rejects pull_request before
image/GitHub access. The repaired owned three-file Linux run passed that fixture
in 2.57 seconds. No timeout or production policy was weakened, and no timing
failure was suppressed. Root will reassess under the proper-Git combined run;
an aggregate reproduction remains required before diagnosing this as fixed.
