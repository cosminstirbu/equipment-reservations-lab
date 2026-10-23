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

The main-tracking live Argo application was not retargeted, suspended or overwritten.
It still uses the old Dashboard until the branch is merged and updated platform
storage is applied by setup. Existing ephemeral telemetry is not migrated. This
verification establishes persistence and correct tmp placement, not sustained disk
capacity, VM restart durability or macOS runtime acceptance.
