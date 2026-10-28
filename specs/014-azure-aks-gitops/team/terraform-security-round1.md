# Bounded Terraform security review

Reviewer: security_reviewer. Report preserved verbatim.

**Verdict: changes_requested.** One confirmed high-severity code finding blocks approval. Thirteen resource-level scanner/linter findings also remain blocking until fixed or explicitly accepted by the owner. No exceptions are approved.

Scope: frozen `infra/azure/foundation/**`, `infra/azure/environment/**`, the two Terraform evidence reports, and tool/policy references. Other implementation sources were not assessed. No paid provisioning, intrusive probes, or file changes.

## Confirmed code finding

### SEC-TF001 — Saved plan grants secret authority to the planning identity

**Severity:** high  
**Blocking:** yes  
**Evidence:** `infra/azure/environment/main.tf:282–288`, `azurerm_role_assignment.secret_populate`.

The resource grants **Key Vault Secrets Officer** to both the configured apply principal and `data.azurerm_client_config.current.object_id`.

**Scenario:** The infrastructure workflow creates a saved plan under its narrow planning identity. The client-config data source resolves that identity during planning. Applying the saved plan subsequently grants the planning identity secret-management authority. The grant is therefore determined by the planner, rather than an explicitly authorized secret-population identity.

**Preconditions:** Separate plan/apply identities, saved-plan deployment, and successful role-assignment application. This follows the designed workflow; malicious input is not required.

**Impact:** The planning identity can gain access to and modify workload credentials, exceeding the intended read/planning boundary.

**Fix:** Remove the ambient caller from deployment resource grants. Use explicit reviewed population principals: the apply identity and, if required, an explicitly identified operator. Keep human bootstrap authorization separate.

**Verification:** Plan with distinct planner, apply, and operator IDs. Assert that the planner receives no Secrets Officer grant; only the approved principals do. Preserve the saved-plan boundary in the regression.

This needs a code fix, not scanner suppression or risk acceptance.

## Policy decisions requiring owner review

`S` below means **both** exact resources in `infra/azure/foundation/storage.tf`: `azurerm_storage_account.state` and `azurerm_storage_account.recovery`. Each proposed exception must explicitly enumerate both resources.

| Rule / severity | Scope | Recommendation and consequences |
| --- | --- | --- |
| **AVD-AZU-0010 / HIGH** | S | **Scoped exception candidate.** Retain `bypass=None`; enabling blanket trusted-service bypass merely to clear the scanner would weaken the selected boundary. Retain Entra authentication, private containers, default-deny ACLs and bounded runner admissions. Validate any future diagnostic delivery path separately. |
| **AVD-AZU-0057 / MEDIUM** | S | **Prefer an actual Blob auditing fix; otherwise explicit audit-gap acceptance.** The pinned rule checks `queueproperties.enablelogging`, although these accounts serve Blob. Enabling Queue logging would not establish Blob auditing. Missing Blob request auditing limits investigation of state or recovery-data access. Safe command-phase logs are not equivalent. Select an appropriate protected diagnostic sink or describe this limitation honestly in the exception. |
| **AVD-AZU-0058 / LOW** | S | **Scoped exception candidate.** LRS preserves the low-cost single-region design but cannot recover these accounts after regional loss. Versioning and soft deletion mitigate different failures. Accepting this must explicitly include the retained state/recovery regional-loss limitation. |
| **AVD-AZU-0060 / MEDIUM** | S | **Scoped exception candidate.** Platform/infrastructure encryption remains enabled. Recovery objects additionally receive application envelope encryption, but Terraform state does not thereby acquire customer-managed-key protection. Account-level CMK would add key availability and lifecycle dependencies. |
| **AVD-AZU-0040 / MEDIUM** | `azurerm_kubernetes_cluster.application` | **Scoped exception candidate.** Managed Azure monitoring is replaced by the planned in-cluster telemetry stack. That stack is not yet deployed evidence and does not automatically provide equivalent managed control-plane auditing. |
| **AVD-AZU-0065 / MEDIUM** | Same AKS resource | **Scoped exception candidate.** Public API access matches the approved learning design. Require narrow effective ranges, Entra/RBAC, disabled local accounts/run-command, tested temporary admission removal and independent reaping. It remains publicly reachable from admitted addresses. |
| **AVD-AZU-0066 / LOW** | Same AKS resource | **Scoped exception candidate.** Azure Policy add-on is absent. Source checks and reviewed GitOps cannot establish equivalent runtime admission enforcement. Preserve planned runtime security/network controls and state this distinction. |
| **AVD-AZU-0067 / LOW** | Same AKS resource | **Scoped exception candidate.** Platform-managed disk encryption remains; no customer-managed disk-encryption set is provided. Backup envelope encryption does not cover node/PVC disks. |
| **`azurerm_resources_missing_prevent_destroy` / warning** | `azurerm_container_registry.application`, environment `main.tf` | **Scoped exception candidate.** Permanent `prevent_destroy` conflicts with intentional workload-loss recreation. Require reviewed confirmed destruction and verified GHCR digest recovery before depending on this exception. |

These are **13 resource-level findings**: eight storage, four AKS and one ACR. Scanner severity is reported faithfully; it is not a claim that retaining stricter no-bypass ACLs creates a high-severity vulnerability.

AVD-AZU-0014 needs **no exception**: retain the required concrete expiry, future-expiry validation, deterministic source fixture and actual resolved-plan scan. A synthetic source fixture is not evidence about a live key.

## Other inspected boundaries

The roots retain separate foundation/environment state containers, private Blob containers, disabled shared-key authentication, deny-default Storage/vault ACLs, scoped workload secret objects, exact ServiceAccount federation subjects, purge protection, explicit expiry, and non-secret output projections. I found no application passwords, client-secret values, backup plaintext, or private recovery keys in these roots.

Workload role delegation constrains role IDs and ServicePrincipal type. DNS delegation is zone-scoped and limited to DNS Zone Contributor; it does **not** constrain an individual cert-manager principal ID. That is a broader capability than the specific resulting cert-manager grant and should remain accurately documented and provider-tested.

Storage/vault network roles carry whole-resource management write capabilities, not firewall-property-only authority. The design acknowledges that distinction. This review does not establish the safety of operational adapters outside the frozen scope.

Later lifecycle/recovery/Entra grants remain explicitly pending in the supplied evidence. Their absence is not passed as completed implementation.

## Checks and limitations

I inspected HCL, native tests, outputs, lock references and the actual two relevant pinned Rego rules. The AVD-AZU-0057 Queue-only check and AVD-AZU-0010 AzureServices requirement are confirmed by policy source.

The reported native-test, formatting, validation and scanner runs were **not independently rerun** in this review. No live Azure permissions or deployment behavior were tested.

Before closure, request:

- The distinct-planner regression and fix for SEC-TF001.
- Exact-resource exception records for owner-selected rows, with rationale, owner, approver/date and limitations.
- Actual clean source and resolved-plan gates after fixes/approved exceptions.
- Provider verification of conditioned grants, identity denial and network boundaries.

## SHA-256 scope manifest

Paths below are relative to `infra/azure/`.

```text
foundation/.terraform.lock.hcl
BCBB02BC48972B3CF6A397F325D1347A9070074853313780B42D39903A98D8F2
foundation/bootstrap-variables.tf
252729E8F81A678D0C9DD275946267689A1F9ECC307FEDBBCA460350DFEC5E93
foundation/delegation.tf
EF8F65E0B8E1F03CC648279FDA73A2FEB0958E099EF8067C451A86C1965CB5F5
foundation/main.tf
494A9E8E7550781A11F72AC71370240FD39F6854FBF118BB89977DCBBF0F6357
foundation/network-access.tf
DF6A08670E875A73B089E558F6106AA1BC7369610A306749CF2F9301A53A0BA9
foundation/outputs.tf
A1D6BF0D69723A22F67063FFECDA08CCA5A2B34D0578CA2B553EBA36B070955B
foundation/storage.tf
2DA5296470E3123918F5E515E334D08026FA567D0107B61725FEBDC1AE0A360A
foundation/variables.tf
0AA601C629E53414CA637DC3BF911EA7C1B86F72A1FE31F6BC0668590CE8F208
foundation/versions.tf
82B74D70204F8C3BE369DA2DBC7FBD1E949941C9B39F5BF8FCC53BA0354EF8A7
foundation/tests/foundation.tftest.hcl
8036B10FC6EF888DD7C64F944B431630BC0B25DDBDFC896841C0FF4F77E5978B
foundation/tests/mocks/azurerm.tfmock.hcl
A03D396BCE4833EEFDC50BE4A6F276A6F3B09F9B1AD116C33BCBD8496281E40B
environment/.terraform.lock.hcl
BCBB02BC48972B3CF6A397F325D1347A9070074853313780B42D39903A98D8F2
environment/foundation-variables.tf
37D21437549D4638CE3A14F9759853ECA66B1B6BB8CC8150CA3C87B21365FB06
environment/main.tf
DED408D2C1F0F06FAF4C2414BD03F5B851297D9E17BA9B2112CC910CAACA0E1F
environment/outputs.tf
BAE90D21FF89198151BF15E9CA6CDBF361E8A9F0A770B5AFADFC2042FAC74D30
environment/variables.tf
0AA601C629E53414CA637DC3BF911EA7C1B86F72A1FE31F6BC0668590CE8F208
environment/versions.tf
82B74D70204F8C3BE369DA2DBC7FBD1E949941C9B39F5BF8FCC53BA0354EF8A7
environment/tests/environment.tftest.hcl
2D8B449FEE4A3D10E34F0396B9C5B7E023D2F412C8D3E5059E6E5DB4B5E8F27B
environment/tests/secret-scopes.json
73A95303690C7F5BA6F71B082EEA02CA84E9BE401FDDCA7938A0FF002DB87D7C
environment/tests/mocks/azurerm.tfmock.hcl
EF6A49DA9D93AD2CD48E1AE5AC142E292A8B0EFDF03696458F17F85E2DFAD7F4
```

Additional reviewed references:

```text
team/terraform-evidence.md
D692AF3A53E05816547AB964E5B6EEF8AF5F0F785A1C59AFA9B772F66E4ECB7D
team/terraform-policy-findings.md
B7DC5546CF2EEAE3C93B125BE2D3247C11CDB8B638D4A62CF5F61D613D854A2C
infra/azure/tools.lock.json
BA4813E3B07629E88D5FD8FB2271B731556CEFA30B3729B94B4074B3A74B7051
```

Pinned scanner policy digest:
`sha256:b591e9190cff4aa4e385b1a25bccfd9ecf178d3c77fd194e1410b7ce7e1df058`.
