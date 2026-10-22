# Manifest quality implementation security review

**Verdict: changes_requested.** One confirmed blocking static-policy finding.

**Snapshot:** `team/manifest-quality-snapshot-01.json`, baseline `9f5e592ab89faa299740ae693a6de3af8fcac942`. All nine recorded source/test hashes matched during review.

## MQ-S001 — Medium, blocking: nested workloads bypass static image/resource policy

**Evidence:** `scripts/deployment-validation.mjs`, `validateManifestPolicy`, inspects containers only through a Pod’s `spec` or a resource’s `spec.template.spec`. CronJob containers reside under `spec.jobTemplate.spec.template.spec`, so they are never inspected. `validateStaticManifests` verifies the seven expected slots but does not reject this additional workload.

The allowlisted root Kustomization can add resources; committed validation requires the existing base but does not prohibit additional resource references.

**Scenario/preconditions:** a manifest-only change adds a CronJob while preserving the seven required application slots. Its unrelated container can use bare `inventory`, a floating image or omit resource bounds, yet the lightweight static gate accepts it. This violates the approved slot-specific alias allowance and retained image/resource policies.

**Public reproduction:** invoked the real `validateStaticManifests` with valid initial-state records, all seven expected slots and an additional `batch/v1` CronJob whose nested container was:

```json
{"name":"outside","image":"inventory"}
```

It had no resource bounds. Actual result:

```json
{"acceptedResources":8,"unrelatedCronJobBareAliasAccepted":true}
```

This was an in-memory, read-only Node invocation; no files or providers were changed.

**Remediation:** either reject unsupported workload shapes in the explicit static context or inspect their containers correctly. A minimal static-only rejection is acceptable; no comprehensive Kubernetes schema subsystem is required. Preserve ordinary runtime validation and the seven exact alias slots.

**Verification:** add an intended-failing public regression for the extra CronJob with an unrelated bare alias and missing bounds, then verify rejection. Cover any other nested workload forms the repair explicitly supports or rejects. Retain valid initial/partial/complete rendering and strict runtime-completeness cases.

## Other reviewed boundaries

- Actual Git comparisons use the exact allowlist, supported NUL-delimited statuses and both rename/copy endpoints. Uncertain comparisons retain full quality.
- Main lookup verifies repository, exact main/push/workflow identity, successful quality job and successful full-quality marker, then proves Git ancestry. Static successes cannot supply that marker.
- API discovery has finite pagination, payload/deadline limits and bounded read retries; private API failures fall back to full quality without disclosing provider data.
- Actions outputs contain controlled modes/reasons and allowlisted paths. PR classification receives no lookup token; quality adds read-only Actions permission.
- Formatting receives exact validated paths as process arguments. Rendering uses the checksum-pinned executable, finite timeout and output bound.
- Existing seven slot checks enforce expected workload/container ownership and exact record digests. Generator formatting changes retain field scope, provenance and CAS behavior.
- Required quality identity/dependencies, manual full validation and downstream publication backlog remain.

Final aggregate checks remain coordinator-owned. Existing T070, queue-aware semantic validation, full provider/runtime qualification and human feature acceptance are not waived.

No files changed, external writes, risk acceptance or publication authorization performed.
