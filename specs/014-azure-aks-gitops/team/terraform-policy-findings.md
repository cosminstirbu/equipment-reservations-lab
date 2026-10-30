# Terraform policy findings for independent review

Feature 014; implementation batch T010-T012. No exception has been approved and
no rule has been suppressed. These findings block a clean infrastructure quality gate.
Pinned tools: Terraform1.17.0, TFLint0.65.0/AzureRM rules0.33.0, Trivy0.76.1;
policy digest sha256:b591e9190cff4aa4e385b1a25bccfd9ecf178d3c77fd194e1410b7ce7e1df058.

## Foundation findings

Every row applies separately to `azurerm_storage_account.state` and
`azurerm_storage_account.recovery` in `infra/azure/foundation/storage.tf`.

| Rule | Severity | Observed choice and proposed review rationale | Mitigation / alternative |
| --- | --- | --- | --- |
| AVD-AZU-0010 | HIGH | Trusted-service bypass is None, deliberately retaining deny-default access. Enabling blanket AzureServices bypass would weaken the approved network boundary. | Entra-only Blob authentication, private containers, operator allowlist and leased narrow runner rules. Assess exact-resource exception or redesign a narrow secure diagnostic path. |
| AVD-AZU-0057 | MEDIUM | Blob data auditing is not configured. Pinned Rego describes any service but only examines queueproperties.enablelogging; the accounts serve Blob, not Queue. Enabling unrelated Queue logging would not protect these workloads. | Real Blob diagnostic settings require a reachable authenticated sink. A firewall-protected Azure Storage sink normally needs trusted-service bypass or another approved collection path; select this explicitly before implementing. Safe operational phase records are not equivalent to Blob request auditing. |
| AVD-AZU-0058 | LOW | LRS follows the cost-constrained single-region design; no geo-replication is requested. | Managed local redundancy, Blob versioning and seven-day soft deletion. This does not protect against regional loss; GRS is an explicit cost/design alternative. |
| AVD-AZU-0060 | MEDIUM | Storage uses Microsoft-managed encryption plus infrastructure encryption instead of account-level customer-managed keys. | Shared-key authentication is disabled; recovery payloads additionally use application envelope encryption with a separately retained Key Vault RSA key. Private state still requires Blob RBAC and must remain protected. Account-level CMK introduces another state/backend key availability dependency. |

### Expiration finding resolved without suppression

Unresolved source scanning reported AVD-AZU-0014 because the required
`recovery_key_expiration_date` input was unknown. Re-running actual Trivy with
`--tf-vars .cache/azure-source-scan.tfvars` containing a synthetic explicit future
expiry removes that finding. Production input has no default and a Terraform
precondition rejects past expiry. The source fixture is not live-key evidence;
resolved-plan scanning must use the actual reviewed expiry and remains required.

## Environment findings

| Rule | Severity | Exact resource / path | Proposed review rationale and limits |
| --- | --- | --- | --- |
| AVD-AZU-0040 | MEDIUM | azurerm_kubernetes_cluster.application, infra/azure/environment/main.tf | Managed Azure Monitor was deliberately deferred in favor of bounded in-cluster Collector/Prometheus/Loki/Tempo/Grafana. That stack is a later task, not yet runtime evidence. |
| AVD-AZU-0065 | MEDIUM | azurerm_kubernetes_cluster.application, infra/azure/environment/main.tf | Public API is deliberately retained for local/hosted administration, with explicit narrow authorized ranges, Entra/RBAC, local accounts and run-command disabled, bounded temporary admissions and independent cleanup. Public reachability is not private-cluster equivalence. |
| AVD-AZU-0066 | LOW | azurerm_kubernetes_cluster.application, infra/azure/environment/main.tf | Azure Policy add-on is deferred; source-policy gates and reviewed GitOps manifests provide a different enforcement boundary. They do not prove runtime admission-policy equivalence. |
| AVD-AZU-0067 | LOW | azurerm_kubernetes_cluster.application, infra/azure/environment/main.tf | Managed disks use platform encryption; a customer-managed disk-encryption set is not in the approved minimum-service baseline. No claim of customer key custody for node/PVC disks. |
| azurerm_resources_missing_prevent_destroy | TFLint warning | azurerm_container_registry.application, infra/azure/environment/main.tf | ACR is intentionally workload-owned and deleted during approved full workload-loss rehearsal; a permanent Terraform prevent_destroy guard would block that acceptance. Reviewed confirmed destroy and recovery from verified GHCR release are the intended controls. These later workflow/promotion controls still need implementation/runtime qualification. |

No blanket suppression, severity exclusion, scanner bypass or automatic risk acceptance
is proposed. Reviewer should assess each exact resource finding and identify whether
to fix, change the design, or seek explicit scoped human acceptance.
