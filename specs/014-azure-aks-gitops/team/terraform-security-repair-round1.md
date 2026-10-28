# Targeted Terraform repair review

**SEC-TF001: closed for the reviewed source revision.** The ambient planning identity no longer determines authority grants.

**Bounded review verdict: changes_requested**, because a separate authorization mismatch would prevent workflow recreation. This is not full-feature approval.

Reviewed coordinator scope identifiers:

- Foundation: `01FAF5A8E74216906934B9B5522CCAEC974E6D1907018E928B37D08865A57513`
- Environment: `0631E832D5F7E17C5D29F0B3E587E57CD67064067B4BA8D5C4C307A61B0D0ED0`

## SEC-TF001 closure evidence

Foundation grants now use required `bootstrap_operator_object_id`. Its explicit output feeds `approved_operator_object_ids`; environment secret-population grants use only that approved set plus the configured apply principal.

The regression uses distinct planner, apply and operator IDs and asserts the exact permitted grant recipients. The supplied evidence records intended RED, then environment 5/5 and foundation 6/6 GREEN. I inspected the regression and source but did not rerun those commands.

No risk acceptance was needed.

## SEC-TF002 — Delegation condition excludes the explicitly approved human grant

**Category:** code / authorization integration  
**Severity:** medium  
**Blocking:** yes, for workflow recreation.

**Evidence:**

- `environment/main.tf:282`: `secret_populate` includes approved human operator IDs.
- `foundation/delegation.tf:36,43`: workload delegation permits grant/revoke only where `PrincipalType` is `ServicePrincipal`.

**Scenario:** After destroying the workload vault and creating a new generation, the workflow apply identity must recreate the Secrets Officer assignment for the explicitly approved human. That principal is a User, so the delegated condition does not authorize the assignment.

**Consequence:** The protected workflow cannot complete the intended fresh-environment grant operation. Native provider mocks do not evaluate Azure’s authorization condition.

**Fix:** Reconcile the explicit human population path with delegation. For example, use a separate condition branch limited to the exact reviewed operator ID and exact Secrets Officer role. Do not permit arbitrary User assignments. Alternatively, design a population path that does not require this human role assignment during workload recreation.

**Verification:** Test the allowed human ID/role and denied unrelated user/role cases, then qualify actual workflow grant and revoke against Azure.

## New linter finding: workload vault deletion protection

| Finding | Exact scope | Assessment |
|---|---|---|
| `azurerm_resources_missing_prevent_destroy` | `azurerm_key_vault.workload`, `infra/azure/environment/main.tf` | Legitimate **separate scoped exception candidate**. Permanent `prevent_destroy` conflicts with the approved generation-vault teardown/recreation exercise. The previously approved exception covers ACR only. |

Deletion removes active workload secret availability and can cause downtime or recovery failure if the compatible recovery bundle is missing. Required mitigations are approved confirmed destruction, fresh verified compatible backup, retained recovery vault/key, working unwrap access, workload-vault purge protection and generation naming. Soft deletion is additional protection; it does not replace tested restoration.

No exception for this vault is approved. Batch this candidate with any other new findings before asking the owner. Do not broaden the existing ACR suppression.

The eleven previously approved findings remain narrowly scoped. The owner selected protected Blob auditing; **AVD-AZU-0057 has no audit-gap waiver**.

## Independently captured changed-file hashes

```text
foundation/bootstrap-variables.tf
E09844D27A799A953226516A2F25ED025C0C936E215FF82A5E18AEA75503495B
foundation/main.tf
FDC20AF3CAC716378D35E91A2A9CF068E0A9F5388F7A28F62C5440BA83F3DE59
foundation/storage.tf
524913258E9CEAEDB990C4637003A199E50245C0F5735C089234310E0E1ED71A
foundation/outputs.tf
A2D58A6745CE26BB21FEBB993A4AF3B051A62AE4816D00D7F39D24C09CE4247E
environment/foundation-variables.tf
D91C0611197C868E32A0AC38F1E3999A83588B70284D722E1D66D7EC7B992899
environment/main.tf
1CA263D6CCB229D75630FEEF63C45D97016FDB9CA8508077C8082A9540519825
environment/tests/environment.tftest.hcl
14E76315CEE0610DBFD5065E5D88979F306A59AE382470376D9F55F18BEC53C0
environment/tests/mocks/azurerm.tfmock.hcl
6335744E41EA46CA78F8E838D2BC5F3E62523C3E9F273C2E7DD23110F4D959EE
```

No files changed, no intrusive probes, no new approval or risk acceptance recorded.
