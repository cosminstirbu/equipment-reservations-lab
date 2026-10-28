Bounded T089 security review: **producer changes_requested; pure helper pass**.

Reviewed frozen snapshot:

| File | SHA256 |
|---|---|
| infra/azure/foundation/delegation.tf | 9EC8A8A78FC3C987F0754B5BAEDF1C522CFF571C3ADE5444B7F9AEFE70DE9685 |
| infra/azure/foundation/vault-guard.tf | 3E6BB8ECC56F403CDD01852CFAE32C24257C868171CCB2139C23BA3F496AA36D |
| infra/azure/foundation/tests/foundation.tftest.hcl | C2AFE7377F051B18AE67963167233FD42F350E228CCFBF4D27F9242EE1D6F985 |
| scripts/azure-vault-guard.mjs | 12CAD87C67A29794374FBF2D853C3C72EC5F6965CF829452C27700D06D3546C5 |
| scripts/azure-vault-guard.test.mjs | B0A250F0BEC2BD0EE68200131724157C1D4C4ECB4C2E8B9360B384F7D0044BBD |

Producer evidence report independently matched SHA256 `5DED54A8014C0A8A55E67E19FC24B97F036A94C0634BA4B8D8097F17FF3726EC`.

**SEC-DELEGATION001 — medium, blocking: unsupported permission-block structure is silently flattened**

Evidence: `infra/azure/foundation/delegation.tf:45–48` independently flattens and deduplicates every permission block’s `actions`, `not_actions`, `data_actions` and `not_data_actions`. Neither the new data source nor the output boundary requires exactly one block.

The approved contract requires the hash to bind the actual complete role semantics. Flattening loses permission-block boundaries. For example, separate blocks granting `*` except `X/write`, and independently granting `X/write`, collapse into the same flat tuple as a single block excluding `X/write`. Consequently, different source permission structures can produce the same descriptor and hash. Azure defines NotActions as subtraction from allowed actions, rather than a universal deny; exclusions must not be detached from their associated grant structure. [Microsoft role-definition documentation](https://learn.microsoft.com/en-us/azure/role-based-access-control/role-definitions)

Preconditions: the role-definition response contains multiple permission blocks. No such actual Azure response, altered live grant or exploitable current deployment was demonstrated. This is confirmed producer information loss on unsupported input, violating the promised complete semantic binding.

The mocked contracts do not establish actual cardinality: the existing mock supplies role IDs, and the new assertions primarily compare the emitted tuple and its self-consistent hashes.

Remediation: retain the approved flat schema and fail closed unless the fetched role has exactly one permission block; derive the tuple from that block. An explicit multi-block schema would require a separate reviewed contract change and is unnecessary here.

Required verification:

- A native mocked two-block response fails for the intended unsupported-cardinality reason.
- A zero-block response also fails.
- A faithful single-block response preserves every action/exclusion array and the expected canonical hash.
- Existing grant and condition bytes remain unchanged.

This requires a scoped code repair, not an owner permission exception.

**Producer remainder**

The six normalized rules preserve the existing ANY-ServicePrincipal base rule and the exact actor restrictions for continuity, network, inspection and installer cases. Assignment descriptors bind actual resource attributes, raw condition bytes and canonical hashes.

I independently removed only the added data/local block in memory and reconstructed the previous `delegation.tf` hash:

`A51373DEC9360F944BE7B35E90D4E7234574A4E6B20279B5E08764700717028A`

This confirms the existing grants, conditions and earlier locals retain their previous bytes. The new output remains rejected by the old strict JavaScript schema pending the separate migration.

**Pure helper verdict: pass for this initial subset**

No blocking security finding identified in the reviewed parser, equivalence checker or evaluator.

The implementation:

- Requires an independently supplied `expectedDescriptor`, with no self-derived fallback.
- Checks exact schemas, raw-condition hashes and canonical role/assignment/descriptor closure.
- Parses a bounded literal grammar without code execution or substring-based authorization.
- Proves normalized structural equivalence for both apply and destroy conditions.
- Preserves ANY-ServicePrincipal truth while enforcing the specific actor rules.
- Separates write `@Request` from delete `@Resource` inputs.
- Uses ARM segment containment, rejecting prefix siblings and malformed scopes.
- Rejects unsupported syntax and ambiguous input rather than guessing a permission decision.

Independent check:

`node --test --test-name-pattern='pure workload delegation' scripts/azure-vault-guard.test.mjs`

Result: exit0, **8 pass, 0 fail, 0 skip**.

This pass establishes the pure algorithm under its stated trusted-expectation precondition. It does not authenticate caller-supplied expectations, establish current actor identity, prove effective inherited Azure authority, or replace provider authorization.

No files changed. No provider clusters, Azure requests, global checks or state mutations performed. Source-authenticated reconstruction, actual role/assignment inspection, cache migration, operational callers and mandatory G3 integration remain unfinished and unapproved by this bounded review.
