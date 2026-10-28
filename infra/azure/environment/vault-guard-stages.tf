variable "vault_guard_generation_qualification" {
  description = "Private protected-wrapper projection after actual family/current ARM/role verification; durable consumption also requires independently verified completed activation and unchanged installed target. Hash presence is not proof."
  type = object({
    version                = number
    environment            = string
    generation             = string
    source_revision        = string
    qualification_id       = string
    evidence_sha256        = string
    family_evidence_sha256 = string
    definition_sha256      = string
    workload_vault_id      = string
    observed_at            = string
    expires_at             = string
    consumption_sha256     = string
  })
  default = null
}

locals {
  guard_generation_valid = var.vault_guard_generation_qualification == null ? true : (
    var.vault_guard_generation_qualification.version == 1 &&
    var.vault_guard_generation_qualification.environment == var.config.environment &&
    var.vault_guard_generation_qualification.generation == var.config.generation &&
    var.vault_guard_generation_qualification.workload_vault_id == "${data.azurerm_resource_group.workload.id}/providers/Microsoft.KeyVault/vaults/erw${local.suffix}" &&
    can(regex("^[a-f0-9]{40}$", var.vault_guard_generation_qualification.source_revision)) &&
    can(regex("^[a-f0-9]{64}$", var.vault_guard_generation_qualification.evidence_sha256)) &&
    can(regex("^[a-f0-9]{64}$", var.vault_guard_generation_qualification.family_evidence_sha256)) &&
    var.vault_guard_generation_qualification.definition_sha256 == var.foundation.vault_guard.definition_sha256 &&
    can(regex("^[A-Za-z0-9-]{1,128}$", var.vault_guard_generation_qualification.qualification_id)) &&
    try(timecmp(var.vault_guard_generation_qualification.observed_at, plantimestamp()) <= 0, false) &&
    try(timecmp(var.vault_guard_generation_qualification.expires_at, var.vault_guard_generation_qualification.observed_at) > 0 &&
    timecmp(var.vault_guard_generation_qualification.expires_at, timeadd(var.vault_guard_generation_qualification.observed_at, "24h")) <= 0, false) &&
    (var.vault_guard_generation_qualification.consumption_sha256 == null ? (
      try(timecmp(var.vault_guard_generation_qualification.expires_at, plantimestamp()) > 0 &&
      timecmp(var.vault_guard_generation_qualification.expires_at, timeadd(var.vault_guard_generation_qualification.observed_at, "24h")) <= 0, false)
    ) : can(regex("^[a-f0-9]{64}$", var.vault_guard_generation_qualification.consumption_sha256)))
  )
}

resource "terraform_data" "vault_guard_generation_stage" {
  input = var.vault_guard_generation_qualification
  lifecycle {
    precondition {
      condition     = local.guard_generation_valid
      error_message = "Operational vault grants require current-generation private evidence with fresh bounded qualification or verified durable completed consumption; caller hashes alone cannot establish qualification."
    }
  }
}

resource "azurerm_role_assignment" "workload_vault_network" {
  for_each = var.vault_guard_generation_qualification == null ? toset([]) : toset(["backup", "restore", "reaper"])

  scope              = azurerm_key_vault.workload.id
  role_definition_id = var.foundation.operation_role_ids["workload_network"]
  principal_id       = var.foundation.github_principal_ids[each.key]
  principal_type     = "ServicePrincipal"
  depends_on         = [terraform_data.vault_guard_generation_stage]
}
