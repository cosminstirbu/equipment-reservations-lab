resource "azurerm_role_definition" "continuity" {
  for_each = {
    backup  = ["Microsoft.KeyVault/vaults/secrets/getSecret/action", "Microsoft.KeyVault/vaults/secrets/readMetadata/action"]
    restore = ["Microsoft.KeyVault/vaults/secrets/setSecret/action", "Microsoft.KeyVault/vaults/secrets/readMetadata/action"]
  }

  name              = "${local.prefix}-continuity-${each.key}"
  scope             = azurerm_resource_group.workload.id
  assignable_scopes = [azurerm_resource_group.workload.id]
  description       = "Exact-object continuity ${each.key}; no vault list, PostgreSQL credentials, delete, purge or unrelated object authority. Restore uses atomic PUT with permitted attributes."

  permissions {
    data_actions = each.value
  }
}
