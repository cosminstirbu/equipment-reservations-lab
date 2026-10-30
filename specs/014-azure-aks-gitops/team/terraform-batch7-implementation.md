# Terraform batch7 implementation evidence

Scope: T085 Terraform descriptors and exact inspection reads; T086 fixed pointer
locators only. Baseline: approved batch7 B8B2E68E, plan9B725B48,
contract557E22F7, tasks7CF6DDF2, data-modelD4313B27. Other source authors are active.

Applicable standards: constitution II–IV test-first observable native contracts;
formatting guide pinned HCL formatter and infra checks; tooling private provider
output, safe count/error projections. Existing fourteen scanner scopes remain exact.

Test design: extend native Terraform mocked-provider runs through module outputs and
planned role grants. Real Terraform evaluates expressions, dependencies, semantic
hashes and actual assignment tuples; mocks replace only Azure/Entra resource APIs.
These tests do not establish actual Azure extension-object RBAC support, inherited
assignment completeness or effective conditional authorization. Such unknowns block
live G3 rather than justify broader read access. Source-derived canary descriptors
do not create human-owned fixtures or approve their provisioning.

Checklist gate: requirements16/16 and azure-operations20/20 checked. No hooks file.
Shared feature points at specs/014-azure-aks-gitops. Installed PowerShell prerequisite
script absent; Git Bash prerequisite succeeded with explicit feature environment:
`SPECIFY_FEATURE_DIRECTORY=specs/014-azure-aks-gitops bash .specify/scripts/bash/check-prerequisites.sh --json --require-tasks --include-tasks`.
It returned the assigned absolute feature directory and research/data-model/contracts/
quickstart/tasks. No shared task/checklist verdict edited.

## Evidence

RED: added two foundation native contracts before source fields. Pinned
`npm.cmd run infra:test` failed; privately parsed native diagnostics reported
Unsupported attribute in tests/foundation.tftest.hcl lines470,471,476–478,
covering missing five-role descriptors, actual bindings and fixed family locator.
An initial sandbox invocation could not initialize providers; the registry-enabled
retry reached the intended native failure. No raw provider report was retained.

RED: added current-generation environment native output contract before output.
Pinned native environment test failed with Reference to undeclared output value
at tests/environment.tftest.hcl lines343–345. The original native exit was privately
captured and safe diagnostic summary/range projected; shell projection exited0,
which is not a native passing claim.

GREEN: final `npm.cmd run infra:test` exited0: foundation30, environment16, no
skips/errors. Final `npm.cmd run infra:check` exited0: pinned fmt/validate/TFLint/
offline Trivy with the existing fourteen exact exception scopes unchanged.

Implemented five source-derived complete role semantics and hashes,120 actual
foundation inspection tuples,54 new metadata-only active-target assignments
(two roles ×five exact targets ×six actors, minus existing six workload authority
assignments), and six actual current workload-vault permission tuples. Hashes bind
ordered actual actions/notActions/dataActions/notDataActions/assignableScopes.
Current family locator comes from retained foundation; current activation locator
comes from environment generation, avoiding stale retained generation selection.
The verified publisher must merge those two root observations into strict vault_guard.

Fixed canary descriptors include pinned API/body semantics, inert Audit predicate,
reviewed UUIDv5 namespace, redundant-read role and literal six role-assignment targets.
No canary fixture resource or probe role assignment is instantiated.

## Pending design dependency

Exact canary definition/assignment read grants require their human-owned fixtures to
exist before assignment. The approved source contract does not specify an executable
staging mechanism for that prerequisite. Per coordinator instruction, no new bootstrap
flag or conditional grant mechanism was invented. Canary read grants are deferred
pending targeted architecture/independent preparation review of that sequence. Actual
G3 must fail closed without those reads. No actual human fixture provisioning,
operational write expansion, Azure action, GitHub action or spending occurred.

Actual extension-object assignable-scope/API support, inherited authority enumeration,
delegation interpretation and policy denial are unproved by mocked native contracts.
No subscription-level assignment, broader Reader fallback or new scanner exception
was introduced. Feature acceptance and independent source review remain pending.

## Frozen source snapshot

| Path | SHA256 |
| --- | --- |
| infra/azure/foundation/guard-inspection.tf | 491939DCD672736432A5BFCDEDA3AEE3B71F77B3D6F8C5642D5A762E9DBC7B25 |
| infra/azure/foundation/guard-canary.tf | 33E7E2C66432A9005A2025C88BC17408BA4ECF5A3606250B728969695CF48EE9 |
| infra/azure/foundation/vault-guard.tf | 9B9FCCE05C6EFED11FF0A5CA32961696F95FD8908E2BF8F29FB9A9D021618291 |
| infra/azure/foundation/tests/foundation.tftest.hcl | A5165A6C461B715A9061B1BE54DAA42410518B9C555EEBDE511C176E44B98766 |
| infra/azure/environment/guard-inspection.tf | F8CB004D08F3A06E0ABC057B982308B95714D3C23A1418BF0E48BCD14AA1A27E |
| infra/azure/environment/tests/environment.tftest.hcl | A8315086FD8C916E5B243E4D2C09A1B91A6BA4BA72290F476DA00AC642716319 |

Required root `npm.cmd run format-check` exited1 on concurrently authored
scripts/azure-vault-guard.test.mjs formatting; `npm.cmd run lint` exited1 on that same
file's structuredClone no-undef at734:35. The owning guard coder and coordinator were
notified; no other worker's file was edited. Those required global gates must be rerun
after concurrent source authoring freezes. HCL formatting and infrastructure checks
passed at this exact frozen source. No application behavior was changed, so application
check evidence is not claimed for this Terraform-only author scope. Combined native
provider test failures are outside this assignment and are not cleared by these
Terraform passes.
