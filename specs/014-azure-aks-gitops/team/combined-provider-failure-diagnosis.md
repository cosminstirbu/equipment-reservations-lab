# Combined native-provider gate diagnosis

Status: unresolved execution gate; no source repair has been performed. Implementation
repair limit 9 is exhausted. Further code repairs require an explicit process extension.

## Observed feedback loop

The coordinator ran the frozen source with checksum-verified kubectl/kind,
AZURE_PROVIDER_CONTRACTS=1, CONTAINER_RUNTIME=podman, and the verified KUBECTL,
KIND and MANIFEST_KUBECTL paths:

```sh
node --test scripts/azure-*.test.mjs scripts/manifest-quality.test.mjs
```

Result: 258 cases, 254 passed, four failed, zero skipped, 228.37 seconds. Failures:

- ACME kind setup: timeout, 180234ms.
- Bundle kind setup: timeout, 180361ms.
- Admission kind cleanup: exit 1, 17561ms; original failure may be masked.
- Loki HTTPS fixture: connection failure, no established HTTP status.

The fast-loop criterion is constrained by the real Kubernetes bootstrap boundary and
its existing 180-second limit. Shortening that limit would change the failure under
study. No simulated bootstrap or passing isolated rerun replaces this actual gate.

The minimized concurrent reproduction retained the four affected files and used:

```sh
node --test --test-name-pattern="pinned cert-manager|pinned native admission|native recovery bundle|native loki query API" scripts/azure-acme.test.mjs scripts/azure-admission.test.mjs scripts/azure-recovery-bundle.native.test.mjs scripts/azure-observability.test.mjs
```

Result: three passed, one failed, zero skipped, 288.50 seconds. ACME passed in 185.47s,
admission in 288.11s, Loki in 25.79s. Bundle failed on kubectl exit 1 at 155.36s.
Its generic operation label did not identify the exact phase. This differs from the
original kind timeout and is not automatically assigned the same root cause.

## Assessed observations and ownership cleanup

Bounded private probes found no kernel OOM events in the matching window. The failed
container OOM flag was false. A passing ACME fixture also exited 137 during normal
cleanup: exit 137 is not evidence of an OOM here.

Measured PSI during reproduction: memory some/full 36.69%/18.39%, CPU some 32.99%,
I/O some/full 52.12%/25.18%. Seven engine observations failed; successful engine
latency reached 4.97s during overlap and fell after fixtures left. This supports
stall/overlap sensitivity, not a proven single cause. MemFree alone is insufficient:
a separate snapshot had 3.25GiB MemAvailable including reclaimable cache. The sampler's
aggregate CPU-zero values used the wrong field and are explicitly discarded.

The exact old admission fixture equipment-admission-81c62942 was verified against its
full container ID, labels, pinned image and this coordinator run's creation window.
Deletion used its exact name and a separate owned private kubeconfig, never the user
default. Its absence was verified. All three minimized-run clusters were removed.
The preexisting unrelated container was untouched. Raw container/kernel logs and
credential-bearing output were not retained in the repository.

## Ranked hypotheses and next bounded repair

1. Concurrent bootstrap creates CPU/I/O/engine pressure; fewer unrelated providers or
   measured resource-aware boundaries should change latency/failure rates.
2. Podman network/exec contention causes transport delays; exact phase and assessed
   provider categories should distinguish it from application assertions.
3. Admission cleanup replaces its original error; simultaneous-failure regression
   must retain both safe outcomes.
4. Loki has a separate readiness race; a focused real HTTPS boundary must distinguish
   startup readiness from authentication behavior.

The first proposed source repair is diagnostics only: fixed per-phase operation
labels in the affected native fixtures and primary-plus-cleanup failure preservation.
Tests must use actual subprocess failure outcomes and assert safe phase/status evidence,
with private sentinels absent. No raw provider tails, credentials or arbitrary messages.

Only after that evidence identifies the failure should a resource-aware scheduling
or readiness repair be selected. No blanket serialization, timeout inflation, skipped
provider profile or policy weakening is approved. The original complete command must
ultimately pass; a narrowed reproduction passing is insufficient.

This proposes additional implementation repair rounds only. It authorizes no Azure
resources, spending, permission expansion, scanner exception or unreviewed source fix.

## Additional confirmed repair awaiting the same process extension

Independent security review subsequently confirmed SEC-CACHE001 in the frozen primary
cache validator. The complete original report is `primary-batch7-security.md`. Actual
Terraform network-role descriptors contain the reviewed tag read/write actions, which
the validator rejects, while it accepts an unreviewed vault-delete action and a hash
with valid syntax but unverified semantics. This is a source-validation defect, not
evidence of an Azure delete grant or a bypass of later live checks.

The concrete repair must start with actual producer-shaped positive descriptors and
negative tests for extra/missing/delete actions and changed semantic hashes, then enforce
the exact reviewed action set and recomputed canonical hash. The original security
reviewer must validate closure. No repair has been released while implementation9/9
is exhausted. The pending process-only extension also enables this confirmed repair;
it grants no new permission or policy exception.

Both reviewers also confirmed Q-GUARD014-001 (security alias SEC-GUARD001): the
family-pointer publisher requires the superseded record to match the new current
source/authority tuple, preventing legitimate requalification from replacing stale
evidence. Original reports are `guard-batch7-quality.md` and
`guard-batch7-security.md`. A regression must demonstrate valid A, changed tuple,
fresh valid B, rejection of stale A for operations and successful publication/resolution
of B. Historical record integrity/producer/digest checks, rollback protection and actual
lease/ETag concurrency checks must remain. This repair is also held pending the same
process-only extension; reviewers retain closure ownership.
