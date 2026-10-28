variable "vault_guard_family_qualification" {
  description = "Private human-family evidence projection supplied only after current ARM and immutable-record verification by the protected wrapper; never a caller assertion."
  type = object({
    version                = number
    environment            = string
    source_revision        = string
    qualification_id       = string
    evidence_sha256        = string
    definition_sha256      = string
    recovery_assignment_id = string
    workload_assignment_id = string
    recovery_vault_id      = string
    observed_at            = string
  })
  default = null
}

locals {
  guard_assignment_ids = { for family, scope in local.vault_guard_scopes : family => "${scope}/providers/Microsoft.Authorization/policyAssignments/${local.prefix}-${family}-vault-guard" }
  guard_family_valid = var.vault_guard_family_qualification == null ? true : (
    var.vault_guard_family_qualification.version == 1 &&
    var.vault_guard_family_qualification.environment == var.config.environment &&
    var.vault_guard_family_qualification.definition_sha256 == local.vault_guard_definition_sha256 &&
    var.vault_guard_family_qualification.recovery_assignment_id == local.guard_assignment_ids.recovery &&
    var.vault_guard_family_qualification.workload_assignment_id == local.guard_assignment_ids.workload &&
    var.vault_guard_family_qualification.recovery_vault_id == "${azurerm_resource_group.foundation.id}/providers/Microsoft.KeyVault/vaults/errec${local.suffix}" &&
    can(regex("^[a-f0-9]{64}$", var.vault_guard_family_qualification.evidence_sha256)) &&
    can(regex("^[a-f0-9]{40}$", var.vault_guard_family_qualification.source_revision)) &&
    can(regex("^[A-Za-z0-9-]{1,128}$", var.vault_guard_family_qualification.qualification_id)) &&
    try(timecmp(var.vault_guard_family_qualification.observed_at, plantimestamp()) <= 0, false)
  )
}

resource "terraform_data" "vault_guard_family_stage" {
  input = var.vault_guard_family_qualification
  lifecycle {
    precondition {
      condition     = local.guard_family_valid
      error_message = "Guard family projection must bind the current definition, exact both assignments/recovery vault, environment and valid private evidence digest. Actual proof/current ARM validation belongs to the protected wrapper."
    }
  }
}

resource "azurerm_role_definition" "workload_vault_network" {
  name              = "${local.prefix}-workload-vault-network"
  scope             = azurerm_resource_group.workload.id
  assignable_scopes = [azurerm_resource_group.workload.id]
  description       = "Exact workload-vault ARM admission; vault write is broader than ACL properties. Strict independent retained guards and actual qualified evidence are mandatory."
  permissions {
    actions = local.vault_network_actions
  }
}
