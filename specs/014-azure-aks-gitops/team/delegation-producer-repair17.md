# SEC-DELEGATION001 repair17 design record

The approved flat descriptor cannot faithfully represent arbitrary multi-block Azure
permissions. Require exactly one actual data-source permission block before output;
read fields from that block rather than merge permissions. No grant or condition changes.

Test first: native mocked zero-block and two-block role responses must hit the data-source
cardinality postcondition. A faithful synthetic one-block fixture supplies nonempty,
distinct actions/notActions/dataActions/notDataActions and scopes so producer preservation
and hashes are observable. These are synthetic response mechanics, not evidence about
Azure's current built-in role or enforcement. Public output contracts remain real.

Independent reviewer closure and current whole-repository gates belong to the coordinator.

## Repair and checks

Read the original full `delegation-t089-security.md` SEC-DELEGATION001 report. The
data source now has the exact-one postcondition with a fixed unsupported-cardinality
diagnostic. Each flat field derives from permissions[0], not an arbitrary-block union.
No flat schema, grant, role, condition, JS cache or guard helper changed.

Before the fix, native mocked zero/two responses produced two `Missing expected failure`
diagnostics: the prior producer accepted unsupported cardinality. This is the intended
red, not provider authorization evidence. The faithful baseline mock now has one block
with four distinct nonempty grant/exclusion arrays, unsorted action input and two scopes.
The positive contract checks an independently literal complete canonical role hash,
alongside the existing source/assignment/condition/rule closure checks.

Terraform fixture staging required correction: expected data postcondition failures can
occur only in the selected phase. Fresh workload-RG creation deferred the read, while
apply expectations encountered the planning-failure boundary. The final tests first apply
the valid synthetic baseline, then use plan against unchanged mock RG state with zero
and two permission-block overrides. This exercises the actual exact-one data check;
unknown or missing expected failures were never counted as passing. No production retry,
condition weakening or permissive fallback was introduced.

Final command `node scripts/azure-quality.mjs test --directory infra/azure/foundation`
passed33 native mocked contracts, exit0, with backend-free initialization/validation.
Sandbox registry access was unavailable; the same authorized backend-free command ran
with escalated access, without Azure calls or provisioning. Scoped pinned Terraform
fmt-check passed all four listed files. No provider or lockfile changed.

Removing only the added data/local producer block, including its new postcondition, in
memory reconstructs the unchanged prior delegation.tf hash:
`A51373DEC9360F944BE7B35E90D4E7234574A4E6B20279B5E08764700717028A`.
It exactly matches the reviewed prior snapshot, preserving all old grant/condition bytes.

| Frozen file | SHA256 |
|---|---|
| infra/azure/foundation/delegation.tf | 3474F88C98AD08FA35A187FB1A0D238159ECF3ED91739547308BA3C27577213F |
| infra/azure/foundation/vault-guard.tf (unchanged this repair) | 3E6BB8ECC56F403CDD01852CFAE32C24257C868171CCB2139C23BA3F496AA36D |
| infra/azure/foundation/tests/foundation.tftest.hcl | 418D2F8DF5A88B44415AB23FE12E8B9C7C746571E0793D710F7E8890A8B15A3A |
| infra/azure/foundation/tests/mocks/azurerm.tfmock.hcl | D54075B0EBAA0D2F23B6C70BCFCE079ADF2A583D1326850767EF20172BFA8781 |

The mock permissions are explicitly synthetic, not claimed current Azure built-in role
contents. Actual role lookup/semantics/cardinality and inherited authorization remain
live gates. Cache migration and source-authenticated expectedDescriptor remain unfinished.
No global quality check, provider cluster, Azure action, spending or external publication
occurred. SEC-DELEGATION001 closure is requested from its original reviewer, not asserted.
