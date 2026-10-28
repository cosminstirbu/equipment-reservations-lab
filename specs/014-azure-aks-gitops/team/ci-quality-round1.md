Bounded CI quality verdict: **changes_requested**.

Verified frozen SHA256:

| File | SHA256 |
|---|---|
| `.github/workflows/pull-request.yaml` | `8E03D3020972F4E43F01996D240A3E9DF020228FEB5AF4771645E76D5A60C9BE` |
| `.github/workflows/validate.yaml` | `DD8C8CDB730A16FDECBF12620D78D70B409BF208EA089B238F838252DCD56E38` |
| `scripts/deployment-ci.mjs` | `72E0048743F88D64C56F657563342C1B96A7515E0D143F89821AFA323A0BB92F` |

### Blocking findings

**Q-CI014-001 — Mixed changes bypass infrastructure gates**  
Category: code; severity: high; blocking: yes. Owner: CI implementation.

Both workflows condition `infra:tools`, `infra:check`, `infra:test`, and Azure manifest validation on `mode == 'infrastructure'`. Mixed Azure/application changes classify as `full`. The full command invokes existing application quality without those infrastructure commands. Consequently Terraform changes in a mixed PR/main revision lack the agreed deterministic Terraform checks and native contracts.

Repair: preserve full application validation and additionally require infrastructure gates for affected mixed comparisons. Conservative execution for every full comparison is acceptable. Add workflow/dispatch regression evidence.

**Q-CI014-002 — Azure plus local metadata bypasses local validation**  
Category: code; severity: medium; blocking: yes. Owner: CI implementation.

`selectQuality` accepts local image/release/bootstrap metadata alongside Azure paths, then selects infrastructure mode when any Azure path exists. That mode skips both local static-manifest validation and full committed release/bootstrap validation. Azure rendering does not include the changed local overlay.

Repair: make gate coverage cumulative, or classify this combination as full while retaining Azure gates. A malformed local release/image patch combined with an Azure change must fail.

### Sound paths and limits

Infrastructure-only jobs explicitly run source checks, native Terraform contracts, tooling tests, and Azure manifest validation before emitting their completion marker. Summary logic rejects missing/failed infrastructure evidence and requires downstream component work to remain skipped.

The inspected central Azure gate renders application, platform, optional recovery, and Argo sources. It invokes strict native schema validation without missing-schema suppression; failure propagates through private diagnostics and cleanup. Native negative tests cover unknown kinds, malformed fields, recovery configuration, and security policy faults.

Observed supporting hashes:

- `manifest-quality.mjs`: `491DFCAF59977956424E7D8EAF3F50FD4ACA5A98B109FE9EAF1A26A1685D6011`
- `manifest-quality.test.mjs`: `7D96F1040E9CD5EDF07A6FE1A76D4A9FCE674A6471BAFD4DA33F4D148A49D062`
- `quality.mjs`: `1A532E3AE24722451FB8090DCF9FDB554107BB510FBDD2E7259F75499A054617`
- `package.json`: `59CAF0FD9EF62B480EF63E8195C71F26F077E31C6B48DBF23547F5A1A08669BF`

These supporting files were inspected as context; their complete frozen ownership assignment had not arrived.

No files changed or tests executed. Hosted scheduling, native tool execution, complete central-gate review, and broader feature acceptance remain pending.
