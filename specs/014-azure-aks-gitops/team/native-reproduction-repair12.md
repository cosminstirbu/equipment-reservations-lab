# Repair12 native reproduction

Date: 2026-10-27. Frozen files are hashed in native-diagnostics-checkpoint.json.
Both original source findings and the diagnostic wrapping finding have independent
closure reports. This execution does not establish a causal repair of the native gate.

## Command and environment

Pinned tools were resolved and verified through qualityContext/verifiedTool. The
driver spawned the same Node process with this command and inherited audited test
output; KUBECTL, KIND and MANIFEST_KUBECTL used the verified workspace executables.
CONTAINER_RUNTIME=podman and AZURE_PROVIDER_CONTRACTS=1. No test-concurrency override,
timeout inflation, changed provider profile or parallel background quality checks.

```sh
node --test --test-name-pattern="pinned cert-manager|pinned native admission|native recovery bundle|native loki query API" scripts/azure-acme.test.mjs scripts/azure-admission.test.mjs scripts/azure-recovery-bundle.native.test.mjs scripts/azure-observability.test.mjs
```

Local provider: Podman 6.1.4, 12 CPUs, 8,103,874,560 bytes RAM. Elevated local runtime
access was required; no cloud action was performed. Formatting and lint finished
successfully before this run. Lint's build had zero warnings/errors.

## Results

Exit 1: four tests, three passed, one failed, zero skipped/cancelled; 357.826 seconds.

| Fixture | Result | Duration |
| --- | --- | --- |
| Certificate account recovery | Pass | 231.499s |
| Native admission | Pass | 356.965s |
| Loki authenticated TLS query | Pass | 31.948s |
| Recovery bundle | Fail | 179.776s |

The failed bundle now reports assessed process metadata:

```text
Native fixture prerequisites-install (kubectl) failed: exit; status=1; signal=unavailable; duration=1747ms
```

No cleanup failure was reported. An independent read-only Podman query after exit
found exactly one preexisting container and zero admission/ACME/bundle fixture
candidates. No unrelated identity or raw provider output was persisted.

## Limits and next evidence

The phase contains multiple namespace, CRD and RBAC installation calls; it does not
identify the exact request or a Kubernetes failure reason. Exit1 in 1747ms is not a
kind-create timeout or proof of OOM. Resource pressure remains a hypothesis, not a
proven sole cause. Earlier full-gate failures remain open execution evidence.

The original full command was not rerun after this smaller reproduction remained
red: a larger passing gate cannot be established while its affected fixture fails.
No causal code repair, readiness retry, timeout or scheduling change was made.
Further implementation needs a concrete next diagnostic proposal and process budget
beyond the now-used repair12 limit; read-only diagnosis can continue.
