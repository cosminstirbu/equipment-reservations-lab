Verdict: **pass — bounded Terraform batch7 source quality**, with no blocking findings in the six frozen HCL files. This does not approve completed G3 integration or actual Azure permissions.

Verified evidence report SHA256: `E0091E62B9F3C16EF06300E0886BE637DB92C1C6B58EF286F3B3F92993C6D268`.

Verified source hashes:

| File | SHA256 |
| --- | --- |
| foundation/guard-inspection.tf | `491939DCD672736432A5BFCDEDA3AEE3B71F77B3D6F8C5642D5A762E9DBC7B25` |
| foundation/guard-canary.tf | `33E7E2C66432A9005A2025C88BC17408BA4ECF5A3606250B728969695CF48EE9` |
| foundation/vault-guard.tf | `9B9FCCE05C6EFED11FF0A5CA32961696F95FD8908E2BF8F29FB9A9D021618291` |
| foundation/tests/foundation.tftest.hcl | `A5165A6C461B715A9061B1BE54DAA42410518B9C555EEBDE511C176E44B98766` |
| environment/guard-inspection.tf | `F8CB004D08F3A06E0ABC057B982308B95714D3C23A1418BF0E48BCD14AA1A27E` |
| environment/tests/environment.tftest.hcl | `A8315086FD8C916E5B243E4D2C09A1B91A6BA4BA72290F476DA00AC642716319` |

Paths are relative to `infra/azure/`.

The five inspection-role descriptors bind complete sorted semantic permissions and assignable scopes. Binding descriptors derive IDs, principals and scopes from actual Terraform resources. Foundation’s 120 bindings reconcile as 24 container inspections, six recovery-vault permission reads, six workload-RG authority reads, 30 policy inspections and 54 additional active-target inspections. Environment supplies six current workload-vault permission bindings.

The additional 54 grants are metadata reads at the five approved active targets for six actors and two inspection roles, excluding the already-existing six workload authority grants. No write/data action, subscription assignment or broader Reader fallback appears in this scope.

Canary descriptors preserve fixed inert bodies, API versions, namespace UUID and actor-specific deterministic targets. They instantiate no human fixture, canary role or probe assignment. Deferred canary read bindings remain an explicit integration dependency; this source pass does not mark the staging proposal implemented.

The retained foundation emits the family locator; the environment emits its current generation’s activation locator and actual bindings. This avoids selecting a generation from stale foundation outputs. Verified publisher merging and strict consumer validation remain separate integration work.

Tests exercise real Terraform expressions, resource plans and outputs with mocked external providers. Recorded evidence includes intended missing-output RED failures, **30 foundation + 16 environment PASS, zero skips**, and passing infrastructure checks with fourteen unchanged exceptions. I inspected the contracts and evidence without rerunning provider tests.

Actual extension-object scope support, effective/inherited authorization, delegation interpretation, fixture provisioning and end-to-end G3 remain pending. Recorded concurrent-file lint/format failures and the four native integration failures are not cleared by this review.

Changed files: none. No source-canonical aggregate snapshot was assessed because its update is outside this frozen scope.
