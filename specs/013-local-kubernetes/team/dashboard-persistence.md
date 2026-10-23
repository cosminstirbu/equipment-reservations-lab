# Dashboard retained telemetry repair

Owner approved dedicated persistent storage and Resume mode on 2026-10-23.
This supersedes the plan's temporary Dashboard SQLite storage decision; feature
acceptance and macOS integrated verification remain pending.

## Decision and test design

Use the pinned Dashboard 13.6.1 with Resume, stable application name
`equipment-local`, and `/home/app/dashboard-data` on a dedicated 1 GiB retained
local PV/PVC. Mount the non-root home directory following the official
[container persistence example](https://aspire.dev/dashboard/standalone/#persist-data-between-container-runs).
Keep one replica with Recreate: SQLite Resume supports one writer. Preserve
BrowserToken, separate API/OTLP keys, telemetry count limits and resource limits.
Capacity is an allocation, not a hard filesystem quota for a local PV; long-running
disk growth still needs observation. Explicit application reset deletes this data;
ordinary setup, stop and Pod replacement retain it. Cluster teardown deletes it.

Applicable standards: constitution II–VI; engineering formatting, testing, tooling,
observability and resilience guides. No new application instrumentation or remote
retry policy is introduced. Setup volume operations have audited public output;
provider operations capture private output, with only fixture cleanup streamed.

Extend the existing real pinned-provider OTLP/API test, retaining its real image,
auth and serialization. A disposable named volume replaces ephemeral data storage.
Send synthetic traces/logs/metrics through public OTLP, remove/recreate the actual
container against the same volume, and assert the original spans through the public
authenticated API. No doubles or private database inspection. Bounded startup and
HTTP deadlines remain; cleanup attempts container, volume and private fixture.
The policy test separately checks manifest admission, ordering and one-writer
configuration; it does not claim runtime persistence. Lifecycle fixture tests cover
setup ownership and explicit reset scope at the existing command boundary.

Red evidence: provider test failed with zero recovered spans versus two expected;
Argo configuration regression failed with `None` versus `Resume`, before changing
deployment manifests. Live diagnosis found SQLite/WAL in the 16 MiB tmp volume,
an empty data volume and repeated kubelet tmp-limit evictions.

## Verification

- Pinned-provider regression passed after Resume configuration: two synthetic spans
  survived forced container removal/recreation using the same disposable volume.
- Isolated kind verification passed using the candidate Deployment, PVC and local PV
  contracts with separate names, storage path and generated fixture keys. A synthetic
  OTLP span remained available through the authenticated public API after actual Pod
  deletion/replacement. The new Pod's tmp volume used 4 KiB. All probe resources,
  forwards and owned storage were removed; no real telemetry was read or reset.
- Argo admission/ordering policy: five tests passed. Windows affected suites: 120
  passed, three platform skips, one existing POSIX-only mode assertion failed
  (`0666` versus `0600`) in CI orchestration. The same CI/manifest suites passed
  all 88 tests on Linux, including that mode assertion, using the official Node
  24.15.0 container with a read-only checkout and network disabled. An initial
  128 MiB/no-exec tmpfs was insufficient for copied Node executable fixtures;
  rerunning with 1 GiB executable temporary space resolved that harness constraint.
- Candidate Kustomize rendering, manifest policy and committed deployment validation
  passed. Format-check and lint passed, including zero-warning/zero-error solution
  build and suggestion-level style verification.

Initially the main-tracking Argo application was unchanged during isolated checks.
The owner then authorized a temporary branch deployment on 2026-10-23. Commit
`831031852ef4fb6ce613c971e3458da4fd4769e7` was pushed, Dashboard's retained root
was prepared with UID/GID 1654 and mode 0700, and platform storage was applied.
The live Application now tracks `fix/cross-platform-local-kubernetes`; its sync
completed Succeeded, Healthy and Synced at that commit. The actual Dashboard PVC
is Bound to `equipment-dashboard`. A synthetic span sent through authenticated OTLP
survived deletion and replacement of the actual Dashboard Pod, verified through
its authenticated public API; the replacement's tmp volume used 4 KiB. Temporary
diagnostic forwards were removed. The tracked Application manifest remains on
`main`: existing setup resets that live branch override, and after merge it should
be deliberately restored to main and refreshed.

The deployed end-to-end smoke stopped at `Documentation reservation write` with
HTTP 409. Read-only aggregate database inspection found one existing confirmed
reservation covering the entire randomized one-to-two-days-ahead smoke window
(longest confirmed interval: 1500 minutes). The create endpoint's matching error
is `booking_conflict`. No reservation was cancelled or changed to make smoke pass;
the complete end-to-end result remains failed due to this fixture assumption.

Existing ephemeral telemetry was not migrated. This verification establishes
persistence and correct tmp placement, not sustained disk capacity, VM restart
durability or macOS runtime acceptance.

Subsequent owner-authorized cleanup removed 29 terminal Pods belonging to the old
Dashboard ReplicaSet. All eight current application Pods remained Running/Ready and
Argo remained Healthy/Synced. No retained volume, current workload or bootstrap Job
was deleted. Historical ReplicaSets with zero replicas remain ordinary rollout
history; successful bootstrap Sync-hook cleanup policy has not been changed.

Current specification and remaining qualification work are reconciled in
[FR-015/AC-4.7](../spec.md), [runtime contract](../contracts/runtime.md) and
[tasks Phase 18](../tasks.md#phase-18-cross-platform-local-qualification-and-dashboard-retention).
