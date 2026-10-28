# Proposed scoped policy exceptions

Date: 2026-10-26. Owner: human environment owner. **Status: the original eleven findings, two separately scoped Queue-rule false positives and one workload-vault lifecycle warning were explicitly approved on 2026-10-26.** Activation requires exact-resource filtering and verification; no blanket rule suppression is authorized.

Independent assessment: security_reviewer, bounded Terraform review. These records
do not waive implementation bugs, live acceptance, or other findings. Application
passwords/client secrets remain outside Terraform. Changes outside these exact rule,
root and resource addresses remain blocking.

## Eleven approved findings

`S` explicitly means BOTH of these addresses in `infra/azure/foundation/storage.tf`:

- `azurerm_storage_account.state`
- `azurerm_storage_account.recovery`

`K` means `azurerm_kubernetes_cluster.application` in
`infra/azure/environment/main.tf`.

| Rule | Severity | Exact scope | Rationale and retained limitation |
| --- | --- | --- | --- |
| AVD-AZU-0010 | High | S, both addresses | Retain the stricter `bypass=None` instead of blanket Azure trusted-service bypass. Entra-only access, private containers, deny-default firewalls and bounded runner admissions remain required. |
| AVD-AZU-0058 | Low | S, both addresses | Use LRS for cost. Versioning/soft deletion do not provide regional disaster recovery; loss of the region can lose retained state and recovery objects. |
| AVD-AZU-0060 | Medium | S, both addresses | Use platform/infrastructure storage encryption instead of account-level customer-managed keys. Recovery objects additionally use application envelope encryption; Terraform state does not gain that extra envelope protection. |
| AVD-AZU-0040 | Medium | K | Keep application telemetry in the specified in-cluster stack instead of managed Azure monitoring. This is not automatically equivalent to managed control-plane auditing. |
| AVD-AZU-0065 | Medium | K | Keep the public API restricted to approved source ranges, Entra/RBAC, disabled local accounts/run command, and tested admission cleanup/reaping. It is reachable from admitted public addresses. |
| AVD-AZU-0066 | Low | K | Omit Azure Policy add-on. Source checks/GitOps are not equivalent to runtime policy admission; configured pod and network security controls remain required. |
| AVD-AZU-0067 | Low | K | Use platform-managed node/PVC disk encryption rather than a customer-managed disk encryption set. Backup envelope encryption does not cover these disks. |
| azurerm_resources_missing_prevent_destroy | Warning | `azurerm_container_registry.application` in `infra/azure/environment/main.tf` | Permit the explicitly approved destructive workload rehearsal. Require confirmed/reviewed destruction and verified recovery of identical images from GHCR. No permanent prevent_destroy on this disposable registry. |

The first three rows cover six resource findings; the remaining five cover five,
for eleven total. No permission is requested to disable any rule globally.

## Blob auditing decision remains separate

AVD-AZU-0057 (Medium) affects both S addresses. The pinned policy actually checks
Queue logging, while these accounts serve Blob. Enabling unused Queue logging would
not provide Blob auditing. The owner explicitly selected **add protected Blob audit
logging** on 2026-10-26, with privacy controls, bounded retention/usage and its cost
included in the EUR120 tax-inclusive target. No audit gap was accepted. The subsequent
separate approval below covers only the two Queue-rule false positives after Blob
auditing source implementation and independent assessment; actual audit readiness
and privacy remain mandatory.

## Approval record

Approver: human environment owner. Date: 2026-10-26. Exact response:
"Approve those eleven scoped exceptions". Scope and rationale: the eleven findings
enumerated above only. Separate exact response: "Add protected Blob audit logging".
The planning-identity privilege bug SEC-TF001 must be fixed; it is never an exception
candidate. Approval does not establish passing implementation or live checks.

## Additional approved processing scope — SEC-D002

Owner: human environment owner. Date: 2026-10-26. Exact response:
"Approve this scoped processing". This approval is separate from the eleven
scanner/linter exceptions and does not suppress another scanner rule.

The scope is only Azure Storage diagnostics and Azure Monitor processing native
Blob audit metadata for `azurerm_storage_account.state` and `.recovery`, their
`blobServices/default` diagnostics and StorageRead/Write/Delete categories before
the configured workspace transformation. Native metadata may contain caller IP/port,
human user principal names, object/URI metadata and derived authentication hashes
or authorization-policy metadata. Provider intermediate buffering duration is not
documented; no maximum or zero intermediate persistence is promised.

This does not authorize logging passwords, raw tokens, request/response bodies,
plaintext backups or application personal data. The reviewed safe-column allowlist
must run before workspace storage, with no raw secondary sink/export/archive;
transformed workspace records have 30-day retention. Implementation and actual
stored-row privacy/access/gap checks remain required. See the independent finding
and exact review scope in [audit-recovery-delta-security.md](audit-recovery-delta-security.md).

## Approved — two Queue-rule false positives

Status: explicitly approved by the human environment owner on 2026-10-26.
Exact response: "Approve these two false positives". Independent reviewer:
security_reviewer, frozen foundation scope
`622A50948B24C096D2AB350F569484D67171D1237ECDBBAA9437D7540B1703D0`.

| Rule | Severity | Exact root and resource addresses | Limited rationale |
| --- | --- | --- | --- |
| AVD-AZU-0057 | Medium | `infra/azure/foundation/storage.tf`: `azurerm_storage_account.state`, `azurerm_storage_account.recovery` | The pinned policy checks `queueproperties.enablelogging`, ignoring the implemented Blob diagnostic settings. Exclude only these two scanner false positives. |

This is not an audit-gap exception and does not waive FR-026/SC-012. Actual Blob
read/write/delete auditing, apply-time transformation qualification, stored-row
privacy, authorized/denied-operation evidence, operator access restrictions and
visible gap checks remain mandatory before active audit-dependent use. Staged
creation can precede qualification, but cannot report audit readiness or permit
audit-dependent sensitive operations without actual evidence. No Queue-only
substitute, global suppression or additional resource address is proposed.

## Approved — workload vault deletion protection

Status: explicitly approved by the human environment owner on 2026-10-26.
Exact response: "Approve this exact vault exception". Rule:
`azurerm_resources_missing_prevent_destroy`, TFLint warning. Exact resource:
`azurerm_key_vault.workload` in `infra/azure/environment/main.tf`.

The coordinator independently reproduced this exact warning with pinned TFLint
0.65.0, AzureRM plugin 0.33.0 and the committed configuration: one issue, no scanner
errors, resource at line 231. Earlier reporting incorrectly called this the ACR
finding; that classification and the subsequent "not reproduced" assessment are
superseded. The original ACR approval does not cover the vault.

Permanent `prevent_destroy` conflicts with the approved workload-vault teardown and
generation-based recreation. Deletion removes active secrets and can cause downtime
or failed recovery. The proposed exception therefore requires explicit reviewed and
confirmed workload destruction, a fresh verified compatible backup, usable retained
recovery key, purge protection, ninety-day soft deletion, generation-based names and
tested secret restoration. It does not cover the retained recovery vault, permit
purging, waive backup verification or suppress the rule globally.

## Separate guarded vault-admission authority decision

The owner approved Candidate A's guarded operational authority on 2026-10-26.
The exact scope, residual network/availability authority, mandatory enforcement
qualification and limitations are recorded in
[vault-admission-authority-decision.md](vault-admission-authority-decision.md).
This discovery link does not add a scanner suppression or waive guard tests;
the fourteen approved scanner/linter exception scopes remain unchanged.
