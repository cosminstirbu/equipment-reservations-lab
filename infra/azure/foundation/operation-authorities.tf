resource "azurerm_role_definition" "stop" {
  name              = "${local.prefix}-stop-only"
  scope             = azurerm_resource_group.workload.id
  assignable_scopes = [azurerm_resource_group.workload.id]
  description       = "Exact-cluster read/stop only; no start, credentials or configuration mutation."

  permissions {
    actions = ["Microsoft.ContainerService/managedClusters/read", "Microsoft.ContainerService/managedClusters/stop/action"]
  }
}

resource "azurerm_role_definition" "admission" {
  name              = "${local.prefix}-cluster-admission"
  scope             = azurerm_resource_group.workload.id
  assignable_scopes = [azurerm_resource_group.workload.id]
  description       = "Exact-cluster ARM admission; write is broader than API-authorized-range properties and requires trusted fixed commands."

  permissions {
    actions = ["Microsoft.ContainerService/managedClusters/read", "Microsoft.ContainerService/managedClusters/write"]
  }
}

resource "azurerm_role_definition" "lifecycle" {
  name              = "${local.prefix}-lifecycle"
  scope             = azurerm_resource_group.workload.id
  assignable_scopes = [azurerm_resource_group.workload.id]
  description       = "Exact-cluster lifecycle with user-credential retrieval; no cluster deletion or admin credentials."

  permissions {
    actions = [
      "Microsoft.ContainerService/managedClusters/read",
      "Microsoft.ContainerService/managedClusters/start/action",
      "Microsoft.ContainerService/managedClusters/stop/action",
      "Microsoft.ContainerService/managedClusters/listClusterUserCredential/action"
    ]
  }
}

resource "azurerm_role_definition" "backup_crypto" {
  name              = "${local.prefix}-backup-wrap"
  scope             = azurerm_resource_group.foundation.id
  assignable_scopes = [azurerm_resource_group.foundation.id]
  description       = "Read public key metadata and wrap data keys; no unwrap, decrypt or key export."

  permissions {
    data_actions = ["Microsoft.KeyVault/vaults/keys/read", "Microsoft.KeyVault/vaults/keys/wrap/action"]
  }
}

resource "azurerm_role_definition" "restore_crypto" {
  name              = "${local.prefix}-restore-unwrap"
  scope             = azurerm_resource_group.foundation.id
  assignable_scopes = [azurerm_resource_group.foundation.id]
  description       = "Protected restore may unwrap with retained key versions; no wrap or key export."

  permissions {
    data_actions = ["Microsoft.KeyVault/vaults/keys/read", "Microsoft.KeyVault/vaults/keys/unwrap/action"]
  }
}

resource "azurerm_role_assignment" "backup_crypto" {
  scope              = "${azurerm_key_vault.recovery.id}/keys/${azurerm_key_vault_key.recovery.name}"
  role_definition_id = azurerm_role_definition.backup_crypto.role_definition_resource_id
  principal_id       = azurerm_user_assigned_identity.github["backup"].principal_id
  principal_type     = "ServicePrincipal"
}

resource "azurerm_role_assignment" "restore_crypto" {
  scope              = "${azurerm_key_vault.recovery.id}/keys/${azurerm_key_vault_key.recovery.name}"
  role_definition_id = azurerm_role_definition.restore_crypto.role_definition_resource_id
  principal_id       = azurerm_user_assigned_identity.github["restore"].principal_id
  principal_type     = "ServicePrincipal"
}

resource "azurerm_role_assignment" "backup_storage" {
  scope                = "${azurerm_storage_account.recovery.id}/blobServices/default/containers/${azurerm_storage_container.recovery.name}"
  role_definition_name = "Storage Blob Data Contributor"
  principal_id         = azurerm_user_assigned_identity.github["backup"].principal_id
  principal_type       = "ServicePrincipal"
}

resource "azurerm_role_assignment" "restore_storage" {
  scope                = "${azurerm_storage_account.recovery.id}/blobServices/default/containers/${azurerm_storage_container.recovery.name}"
  role_definition_name = "Storage Blob Data Reader"
  principal_id         = azurerm_user_assigned_identity.github["restore"].principal_id
  principal_type       = "ServicePrincipal"
}

output "operation_role_ids" {
  description = "Reviewed custom roles for exact environment-owned cluster and identity-continuity secret bindings."
  value = {
    stop                   = azurerm_role_definition.stop.role_definition_resource_id
    admission              = azurerm_role_definition.admission.role_definition_resource_id
    lifecycle              = azurerm_role_definition.lifecycle.role_definition_resource_id
    continuity_backup      = azurerm_role_definition.continuity["backup"].role_definition_resource_id
    continuity_restore     = azurerm_role_definition.continuity["restore"].role_definition_resource_id
    workload_network       = azurerm_role_definition.workload_vault_network.role_definition_resource_id
    guard_permissions_read = azurerm_role_definition.guard_inspection["permissions"].role_definition_resource_id
    guard_authority_read   = azurerm_role_definition.guard_inspection["authority"].role_definition_resource_id
  }
}
