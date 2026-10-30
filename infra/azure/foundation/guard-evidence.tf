resource "azurerm_storage_container" "guard_evidence" {
  for_each              = { human = "guard-evidence", apply = "guard-apply-evidence" }
  name                  = each.value
  storage_account_id    = azurerm_storage_account.recovery.id
  container_access_type = "private"
  lifecycle {
    prevent_destroy = true
  }
}

resource "azurerm_role_assignment" "guard_evidence_writer" {
  for_each = { human = var.bootstrap_operator_object_id, apply = azurerm_user_assigned_identity.github["apply"].principal_id }

  scope                = "${azurerm_storage_account.recovery.id}/blobServices/default/containers/${azurerm_storage_container.guard_evidence[each.key].name}"
  role_definition_name = "Storage Blob Data Contributor"
  principal_id         = each.value
  principal_type       = each.key == "human" ? "User" : "ServicePrincipal"
}

locals {
  guard_evidence_readers = merge(
    { for actor in ["plan", "apply", "destroy", "backup", "restore", "reaper"] : "human/${actor}" => { family = "human", actor = actor } },
    { for actor in ["plan", "destroy", "backup", "restore", "reaper"] : "apply/${actor}" => { family = "apply", actor = actor } }
  )
}

resource "azurerm_role_assignment" "guard_evidence_reader" {
  for_each = local.guard_evidence_readers

  scope                = "${azurerm_storage_account.recovery.id}/blobServices/default/containers/${azurerm_storage_container.guard_evidence[each.value.family].name}"
  role_definition_name = "Storage Blob Data Reader"
  principal_id         = azurerm_user_assigned_identity.github[each.value.actor].principal_id
  principal_type       = "ServicePrincipal"
}

output "guard_evidence_container_name" {
  value = azurerm_storage_container.guard_evidence["human"].name
}

output "guard_apply_evidence_container_name" {
  value = azurerm_storage_container.guard_evidence["apply"].name
}
