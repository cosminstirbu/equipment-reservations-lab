Repair17 bounded security verdict: **pass; SEC-DELEGATION001 closed**.

Independently matched frozen hashes:

| File | SHA256 |
|---|---|
| foundation/delegation.tf | 3474F88C98AD08FA35A187FB1A0D238159ECF3ED91739547308BA3C27577213F |
| tests/foundation.tftest.hcl | 418D2F8DF5A88B44415AB23FE12E8B9C7C746571E0793D710F7E8890A8B15A3A |
| tests/mocks/azurerm.tfmock.hcl | D54075B0EBAA0D2F23B6C70BCFCE079ADF2A583D1326850767EF20172BFA8781 |
| foundation/vault-guard.tf | 3E6BB8ECC56F403CDD01852CFAE32C24257C868171CCB2139C23BA3F496AA36D |
| team/delegation-producer-repair17.md | 3F399442FC618425715A9C1E1A852349F7A7CB389EC3F82B29E51B9EEF8EC13E |

Paths are relative to `infra/azure/` for Terraform files and the feature directory for the report.

The data source now requires `length(self.permissions) == 1` through a blocking postcondition. All four descriptor arrays derive exclusively from that single block. Unsupported cardinality can no longer be silently merged into a misleading semantic hash.

The regression tests exercise zero-block and two-block responses against the actual data-source postcondition. Their preceding successful mocked apply establishes the unchanged RG state needed for those reads during planning. The positive contract independently specifies all four distinct nonempty arrays and both scopes when checking the canonical role hash. These are appropriately identified as synthetic fixtures.

I independently reconstructed the previous delegation source hash after removing only the added producer block:

`A51373DEC9360F944BE7B35E90D4E7234574A4E6B20279B5E08764700717028A`

Existing grant and condition bytes remain unchanged. No new finding identified in this repair.

Evidence limits: author reports **33 native mocked contracts passed**; I reviewed source, tests, report and hashes without rerunning provider or global checks. Actual Azure role contents/cardinality remain unproved. A future unsupported response must block publication; this review does not authorize accommodating it by flattening.

No files changed or Azure actions performed. Cache migration, trusted expected-descriptor reconstruction, current authority inspection and complete T089/G3 integration remain pending.
