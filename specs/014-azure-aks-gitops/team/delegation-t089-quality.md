Terraform producer verdict: **pass — bounded T089 producer subset**.

Verified report SHA256: `5DED54A8014C0A8A55E67E19FC24B97F036A94C0634BA4B8D8097F17FF3726EC`.

Verified source hashes:

- `foundation/delegation.tf`: `9EC8A8A78FC3C987F0754B5BAEDF1C522CFF571C3ADE5444B7F9AEFE70DE9685`
- `foundation/vault-guard.tf`: `3E6BB8ECC56F403CDD01852CFAE32C24257C868171CCB2139C23BA3F496AA36D`
- `foundation/tests/foundation.tftest.hcl`: `C2AFE7377F051B18AE67963167233FD42F350E228CCFBF4D27F9242EE1D6F985`

Paths are under `infra/azure/`.

The nested output derives role attributes, existing assignment identities and exact condition bytes from Terraform resources/data. Assignment hashes bind the condition-byte hash; the overall hash binds role semantics, assignments and six normalized source-derived rules. Sorted unique arrays and `principalIds=null` preserve the existing ANY-ServicePrincipal base rule. Grant resources and condition bodies are unchanged in this producer addition.

Native contracts inspect actual output/resource relationships, raw condition hashes, canonical hashes and all six rules. Recorded intended RED and **31 mocked native contracts PASS** were reviewed, not rerun.

The existing strict JS consumer intentionally rejects the new output until coordinated migration. This producer pass does not approve publication, current ARM provenance or T089 completion.

Pure guard verdict: **pass — bounded T089 parser/equivalence/evaluator subset**.

Verified hashes:

- `scripts/azure-vault-guard.mjs`: `12CAD87C67A29794374FBF2D853C3C72EC5F6965CF829452C27700D06D3546C5`
- `scripts/azure-vault-guard.test.mjs`: `B0A250F0BEC2BD0EE68200131724157C1D4C4ECB4C2E8B9360B384F7D0044BBD`

The implementation requires an independently trusted expected descriptor, verifies strict schemas and hashes, and compares the parsed conditions structurally against expected rule semantics. It does not use evaluation or sampled tuples to establish equivalence. Grammar, input size, tokens, nesting and sets are bounded; unsupported syntax fails closed.

Evaluation preserves ANY ServicePrincipal, request-only write inputs and actual-resource delete inputs. Scope containment compares validated ARM segments, preventing sibling-prefix or traversal matches. Results describe the supported condition decision only; they do not assert effective Azure permission.

Tests render the actual Terraform heredoc independently of the AST builder and exercise every source rule, denies, mutations, unsupported grammar, bounds, normalization and request/resource separation. Recorded missing-API RED and **60 focused PASS, zero skips**, plus scoped checks were inspected without rerunning.

No blocking findings in either bounded subset. Changed files: none. Trusted-source reconstruction, cache migration, current/inherited authority audit, operational integration and G3 barrier removal remain pending. No provider authorization, native-gate or full-feature approval.
