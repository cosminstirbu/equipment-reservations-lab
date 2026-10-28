locals {
  vault_network_actions = ["Microsoft.KeyVault/vaults/read", "Microsoft.KeyVault/vaults/write", "Microsoft.Resources/tags/read", "Microsoft.Resources/tags/write"]
  network_actors        = toset(["plan", "apply", "destroy", "lifecycle", "stop", "reaper", "backup", "restore", "images"])
  network_gate_id       = "${azurerm_dns_zone.application.id}/TXT/_azure-network-lease"
}

resource "azurerm_role_definition" "network_gate" {
  name              = "${local.prefix}-network-gate"
  scope             = azurerm_resource_group.foundation.id
  assignable_scopes = [azurerm_resource_group.foundation.id]
  description       = "Read/write only the operational DNS TXT gate; assignments are exact-record scoped."

  permissions {
    actions = ["Microsoft.Network/dnsZones/TXT/read", "Microsoft.Network/dnsZones/TXT/write"]
  }
}

resource "azurerm_role_assignment" "network_gate" {
  for_each = var.network_gate_ready ? local.network_actors : toset([])

  scope              = local.network_gate_id
  role_definition_id = azurerm_role_definition.network_gate.role_definition_resource_id
  principal_id       = azurerm_user_assigned_identity.github[each.key].principal_id
  principal_type     = "ServicePrincipal"
}

resource "azurerm_role_definition" "storage_network" {
  name              = "${local.prefix}-storage-network"
  scope             = azurerm_resource_group.foundation.id
  assignable_scopes = [azurerm_resource_group.foundation.id]
  description       = "Control-plane storage network admission; Azure write capability is broader than a firewall property."

  permissions {
    actions = ["Microsoft.Storage/storageAccounts/read", "Microsoft.Storage/storageAccounts/write", "Microsoft.Resources/tags/read", "Microsoft.Resources/tags/write"]
  }
}

resource "azurerm_role_definition" "vault_network" {
  name              = "${local.prefix}-recovery-vault-network"
  scope             = azurerm_resource_group.foundation.id
  assignable_scopes = [azurerm_resource_group.foundation.id]
  description       = "Control-plane recovery-vault admission without secret/key data permissions."

  permissions {
    actions = local.vault_network_actions
  }
}

resource "azurerm_role_assignment" "state_network" {
  for_each = toset(["plan", "apply", "destroy", "reaper"])

  scope              = azurerm_storage_account.state.id
  role_definition_id = azurerm_role_definition.storage_network.role_definition_resource_id
  principal_id       = azurerm_user_assigned_identity.github[each.key].principal_id
  principal_type     = "ServicePrincipal"
}

resource "azurerm_role_assignment" "recovery_storage_network" {
  for_each = local.network_actors

  scope              = azurerm_storage_account.recovery.id
  role_definition_id = azurerm_role_definition.storage_network.role_definition_resource_id
  principal_id       = azurerm_user_assigned_identity.github[each.key].principal_id
  principal_type     = "ServicePrincipal"
}

resource "azurerm_role_assignment" "recovery_vault_network" {
  for_each = var.vault_guard_family_qualification == null ? toset([]) : toset(["backup", "restore", "reaper", "apply"])

  scope              = azurerm_key_vault.recovery.id
  role_definition_id = azurerm_role_definition.vault_network.role_definition_resource_id
  principal_id       = azurerm_user_assigned_identity.github[each.key].principal_id
  principal_type     = "ServicePrincipal"
  depends_on         = [terraform_data.vault_guard_family_stage, azurerm_resource_group_policy_assignment.vault_guard]
}

resource "azurerm_role_assignment" "operations" {
  for_each = setsubtract(local.network_actors, toset(["reaper"]))

  scope                = "${azurerm_storage_account.recovery.id}/blobServices/default/containers/${azurerm_storage_container.operations.name}"
  role_definition_name = "Storage Blob Data Contributor"
  principal_id         = azurerm_user_assigned_identity.github[each.key].principal_id
  principal_type       = "ServicePrincipal"
}


