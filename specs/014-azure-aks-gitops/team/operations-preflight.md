# Operations implementation preparation

2026-10-26. Scope: T008–T009, T023–T026, T030–T032, T042–T046 and operations documentation. Preparation only until coordinator releases the T007 shared configuration contract. No Azure or GitHub mutations performed.

## Required reading and gates

Read repository instructions, constitution, team protocol, coder role, installed speckit-implement skill, engineering formatting/testing/tooling/resilience/observability guides, feature spec, plan, tasks, research, data model, quickstart and operations contract. Active feature is explicitly specs/014-azure-aks-gitops. Requirements checklist 16 checked/0 unchecked; custom operations checklist 20 checked/0 unchecked. Checklist checks are preparation evidence only.

The requested bash prerequisite invocation could not start the system bash.exe (ResourceUnavailable). Coordinator must use an available Git Bash executable or the repository PowerShell equivalent; this is not a successful invocation.

## Provider contracts inspected

- [Blob lease REST](https://learn.microsoft.com/en-us/rest/api/storageservices/lease-blob): PUT blob?comp=lease, x-ms-lease-action, proposed GUID, finite duration 15–60 seconds; renew/release require exact lease ID. Use 60-second renewable provider lease with bounded heartbeat; operation/admission records are separate from native lease duration. An admission expiry does not remove an AKS authorized address.
- [AKS GET](https://learn.microsoft.com/en-us/rest/api/aks/managed-clusters/get?view=rest-aks-2025-07-01): actual cluster is ARM properties.provisioningState and properties.powerState.code. CLI projections flatten properties; fixture must match the chosen boundary, never mix REST and CLI shapes.
- [AKS start](https://learn.microsoft.com/en-us/rest/api/aks/managed-clusters/start?view=rest-aks-2025-07-01): POST cluster/start, success 202 Accepted or 204 No Content. Accepted is not running/readiness success; subsequently observe provider truth.
- [AKS create/update](https://learn.microsoft.com/en-us/rest/api/aks/managed-clusters/create-or-update?view=rest-aks-2025-07-01): PUT supports If-Match and properties.apiServerAccessProfile.authorizedIPRanges. Do not invent a property PATCH contract; use assessed Azure CLI update or validated conditional resource update.
- [AKS stop/start guidance](https://learn.microsoft.com/en-us/azure/aks/start-stop-cluster): preserve state, observe required settling period, handle restart capacity failure, refresh credentials and readiness after start.
- [Key Vault wrap](https://learn.microsoft.com/en-us/rest/api/keyvault/keys/wrap-key/wrap-key?view=rest-keyvault-keys-2025-07-01) and [unwrap](https://learn.microsoft.com/en-us/rest/api/keyvault/keys/unwrap-key/unwrap-key?view=rest-keyvault-keys-2025-07-01): version-pinned key URL, POST wrapkey/unwrapkey, body alg RSA-OAEP-256 and base64url value, response kid/value. Wrap and unwrap permissions differ; RSA private key is not exported. Node crypto owns per-object AES-256-GCM with random 32-byte key, unique 12-byte nonce and authentication tag.

## Test design and output classification

Public Node CLI/process tests retain actual argument validation, filesystem, process execution, crypto, lease policy and cleanup. Faithful local Azure executable/HTTP fixtures replace only external ARM/Blob/Key Vault service boundaries; tests validate their real request/response schemas. These do not establish actual Azure success. Pure seasonal scheduling/override/schema/retention policy tests justify isolation because their public contract is deterministic data transformation.

All cloud responses, command stderr, authenticated HTTP data, dumps, crypto material and Kubernetes output are private capture. Allowlisted diagnostics: phase, category, validated status, duration, SHA and recovery point ID. Existing process.mjs OperationalFailure/executeProcess/cleanupAll contracts must be reused. No command arguments carry secret values. All calls, polling, lease renewal and cleanup require finite budgets; mutation retry is prohibited without repeat-safety evidence. Cleanup attempts every exact owned resource and preserves simultaneous primary and cleanup failure.

Initial red command after configuration release: node --test scripts/azure-operations.test.mjs. Subsequent batches: node --test scripts/azure-workflows.test.mjs; node --test scripts/azure-recovery.test.mjs. Retain actual red/green commands/results and inspect emitted stdout/stderr and private marker absence. Actual Azure, GitHub hosted, browser, PostgreSQL restore and messaging drain qualification remain independent pending gates.

## Shared seams needed before dependent edits

Coordinator/primary coder supplies validated private config loader and outputs projection; Terraform owner supplies retained lease storage/container and recovery key outputs. Agree on reusable withOperationLease and API admission entry points before infrastructure consumer integration. No worker should create an alternative config schema or generated committed inventory. README/package/shared infrastructure edits remain other owners' responsibility.
