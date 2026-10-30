# Bounded Terraform security review — repair and audit checkpoint

**Source verdict: pass for the reviewed implemented subset. SEC-TF002 is closed.**

**Infrastructure gate remains blocked** by the two unapproved AVD-AZU-0057 findings and pending live audit qualification. This is not full-feature or live-deployment approval.

Frozen scope identifiers supplied by the coordinator:

- Foundation: `622A50948B24C096D2AB350F569484D67171D1237ECDBBAA9437D7540B1703D0`
- Environment: `352DC029E7FF40CB29330742A2C6BBBB7A006D672EF7A1AE1FC71137E120ED92`

## Finding closure and authority review

**SEC-TF002 — closed.** Foundation explicitly grants the configured human `User` Secrets Officer at the retained workload RG. Environment grants secret-population authority only to the configured apply ServicePrincipal. Human assignment no longer passes through ServicePrincipal-only delegation.

**SEC-TF001 remains closed:** the ambient planner is not a grant recipient.

**Installer grant:** the actual environment assignment targets the exact AKS resource and apply principal. Foundation removes Cluster Admin from the general delegated-role branch and separately constrains its grant/revoke to that apply principal. Other operational actors receive no corresponding broad Kubernetes role.

**Retained OIDC credentials:** the two source names are validated exactly. Apply receives object-scoped Secrets User assignments for those objects, not whole-vault access. Operator applications are tenant-scoped and assignment-required; no credential-value resource was introduced.

No new confirmed security vulnerability was found in this bounded source checkpoint.

## Audit staging assessment

The source implements:

- Disabled-by-default transformation/diagnostic stages.
- Exact environment, generation, revision, resource and transformation binding.
- Bounded observation timestamps and existing-DCR configuration checks.
- StorageRead/Write/Delete on both Blob services.
- Only the dedicated workspace destination.
- Safe-column projection, thirty-day retention, disabled local authentication, explicit operator query access and protective usage quota.
- Destruction/backslide guards for retained audit resources.

Native tests cover rejected stale/cross-generation observations, wrong DCR/linkage, staged binding and protected destinations. Reported foundation 17/environment 8 results and format/validation passes were not independently rerun.

### Required integration gate: apply-time freshness

`audit.tf:62–64` evaluates freshness using `plantimestamp()`. That is plan-time evidence; it does not itself establish observation freshness when a saved plan is applied later.

The assigned primary adapter must revalidate actual Azure configuration and expiry immediately before binding/enabling, or otherwise reject a saved plan whose audit observation has expired. The generic sixty-minute review lifetime must not override the shorter qualification lifetime.

This remains a **blocking activation dependency**, not a claim that the pending qualifier exists or that live privacy passed. Test delayed apply across observation expiry.

## AVD-AZU-0057: exact exception candidate

The pinned policy still determines logging from `queueproperties.enablelogging`; it does not inspect these Blob diagnostic settings. I rechecked that policy source.

A reviewable exception candidate is:

| Rule | Severity | Exact resources | Required conditions |
|---|---|---|---|
| AVD-AZU-0057 | Medium | `azurerm_storage_account.state` and `azurerm_storage_account.recovery`, `infra/azure/foundation/storage.tf` | Waive only the Queue-based scanner false positives. Actual Blob auditing, transformation qualification, stored-row privacy, authorized/denied-operation evidence and access/gap checks remain mandatory before active use. |

This would **not** accept an audit gap, authorize Queue-only logging, or waive FR-026/SC-012. Staged creation may precede qualification, but the feature must not report audit readiness or permit audit-dependent sensitive operations before actual evidence.

**No approval for these two exceptions is recorded by this review.** The previous eleven approvals do not cover them.

The workload-vault `prevent_destroy` warning is not currently reproduced in the supplied checkpoint. Do not request or activate an exception for an absent finding.

## Remaining boundaries

T063 proof containers are explicitly pending and were not treated as implemented. Actual Azure ABAC, native Kubernetes named-resource authorization, stored-row privacy and source/destination credential behavior remain provider qualification obligations.

SEC-SRC001/SEC-SRC002 belong to the separate script review and are unaffected by this Terraform verdict.

## Independently captured file hashes

```text
foundation/audit.tf
5E54D03E9B3516D940D31E133896AF984E4416F0AFD6F96C756CBA4FB0DAB5CD
foundation/delegation.tf
155749B2A8F84FBC6421351955027B3564786E18C60EB2C8176748F50BE02B15
foundation/operators.tf
B9ADE98A85CBDE9F188AB632DAEDE792757D1C411F523321B40CFF7F41B4F3C1
foundation/operation-authorities.tf
9C67A59E2D4F8F964B3651BB2D13CE800E39324843405213F93AC3E50FC4927F
foundation/bootstrap-variables.tf
BBB0DBA185AACFF4172B48AB1A13102C5A185ED6A02122DFB26B3A99C360E632
foundation/tests/audit.tftest.hcl
CBFDC99C8A5D8E3B76694AE972E1041E92ED333CD7230979B2B27ED54161A9C3
foundation/tests/foundation.tftest.hcl
BAADD4EE7A6F1C26EF30228D26022B38344D6FE4B54D0012925A17BCB64FE1C3
environment/operation-authorities.tf
581F36EE8B862753F1F5496095FE5E87A2B4BE6BC95F80A98A09EC9782A03441
environment/main.tf
005DEC7F8969D0A0C1208BBA22EB48C8A94268BBC2377FAE9858A0CD7E9A1F92
environment/tests/environment.tftest.hcl
B8B75F2978C744772DE63607B80976E06376B376E1044EB1AAA8909E0CDDE82D
```

No files changed, intrusive probes, paid actions or new risk acceptance.
