locals {
  continuity_secret_names = toset(["identity-admin", "reservations-client", "alice", "bob", "manager", "staff"])
}

resource "azurerm_role_assignment" "continuity_backup" {
  for_each = local.continuity_secret_names

  scope              = "${azurerm_key_vault.workload.id}/secrets/${each.key}"
  role_definition_id = var.foundation.operation_role_ids["continuity_backup"]
  principal_id       = var.foundation.github_principal_ids["backup"]
  principal_type     = "ServicePrincipal"
}

resource "azurerm_role_assignment" "continuity_restore" {
  for_each = local.continuity_secret_names

  scope              = "${azurerm_key_vault.workload.id}/secrets/${each.key}"
  role_definition_id = var.foundation.operation_role_ids["continuity_restore"]
  principal_id       = var.foundation.github_principal_ids["restore"]
  principal_type     = "ServicePrincipal"
}
