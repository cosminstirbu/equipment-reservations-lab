**CHANGES REQUESTED — bounded strict-cache/handoff source review.**

Matched evidence report SHA256 `417A156D9BF05C4F977C13725DC978AEF1FBAE36131726C7011D97C1A9BDA225` and the seven frozen files:

| File | SHA256 |
|---|---|
| azure-infrastructure.mjs | `EB95A4AE74CA96AC6CF1919937C9CAC193FAA1D90815C237434D398F9B86A855` |
| azure-infrastructure.test.mjs | `74AAEED6AC323A2E8DAA4294C42DBA3B14C5FB4E5EFD348C50B1CB94A5F3967B` |
| azure-handoff.mjs | `47CBDEA4A7174FD1BE4D4897904262CA384E5921382C9BF8ECE258C4A3848660` |
| azure-handoff.test.mjs | `B10A223A1739CDBF0A99885D4E5A4BF2FBCCFB019050D08A5A7A14CD92A3B73E` |
| azure-guard-activation.test.mjs | `167F2CA9F071611FF0C67713D68E9C8A796CC987F7AD7CEAD61728191F177AA4` |
| azure-guard-test-fixture.mjs | `AF79E43409ED40E746FB2212CB25C7E74ED2F4A32F8BA4EE614BD3AC0CF34E1D` |
| qualification-definition.json | `BA403D70FE968B9C8E47BD55942B8179C148C9F4C594E4341FB226DA9FBAFAA9` |

**SEC-CACHE001 — Medium, blocking: network-role descriptor validation rejects the approved producer and accepts unreviewed authority.**

Evidence: `validateVaultGuardOutput` validates network-role actions using a `Microsoft.KeyVault/*` string pattern and checks only hash syntax. Actual Terraform descriptors contain the reviewed four actions, including `Microsoft.Resources/tags/read` and `Microsoft.Resources/tags/write`. The authored test fixture instead supplies one read action and an arbitrary hash.

Read-only in-memory execution of the public validator established:

```json
{
  "reviewedTerraformNetworkActionsAccepted": false,
  "unreviewedDeleteAccepted": true
}
```

Scenario/preconditions: a real Terraform-shaped projection fails handoff. A modified network descriptor containing `Microsoft.KeyVault/vaults/delete` passes this schema boundary, contrary to its exact-authority contract. This does **not** establish a granted delete permission or a bypass of later live checks.

Remediation: validate exactly the reviewed network-action set and recompute its canonical semantic hash. Use actual producer-shaped descriptors in positive fixtures.

Verification: both real network descriptors pass; added/deleted actions, unreviewed delete, malformed semantics and changed hashes fail before caching/handoff.

The new five-role inspection schemas, exact binding inventories, principal/vault/generation context checks, merged-only actor cache and explicit literal closure assets otherwise show appropriate constraints. No automatic closure maintenance was introduced.

Author reports 52 focused and six launcher tests passed. Those results do not resolve the demonstrated producer mismatch. I performed no heavy/provider tests.

The G3 barrier, F0–F3 staging, complete same-lease activation path and previously reported native failures remain pending. No files/state changed or cloud actions performed. No full-feature approval.
