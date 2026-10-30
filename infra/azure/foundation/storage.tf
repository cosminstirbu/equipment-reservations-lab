resource "azurerm_storage_account" "state" {
  name                              = var.config.foundationBackend.storageAccountName
  resource_group_name               = azurerm_resource_group.foundation.name
  location                          = var.config.region
  account_tier                      = "Standard"
  account_replication_type          = "LRS"
  account_kind                      = "StorageV2"
  min_tls_version                   = "TLS1_2"
  https_traffic_only_enabled        = true
  shared_access_key_enabled         = false
  default_to_oauth_authentication   = true
  allow_nested_items_to_be_public   = false
  cross_tenant_replication_enabled  = false
  infrastructure_encryption_enabled = true
  local_user_enabled                = false
  tags                              = local.tags

  network_rules {
    default_action = "Deny"
    bypass         = ["None"]
    ip_rules       = [for cidr in var.config.operatorCidrs : trimsuffix(cidr, "/32")]
  }

  blob_properties {
    versioning_enabled = true
    delete_retention_policy {
      days = 7
    }
    container_delete_retention_policy {
      days = 7
    }
  }

  lifecycle {
    prevent_destroy = true
  }
}

resource "azurerm_storage_account" "recovery" {
  name                              = "errec${local.suffix}"
  resource_group_name               = azurerm_resource_group.foundation.name
  location                          = var.config.region
  account_tier                      = "Standard"
  account_replication_type          = "LRS"
  account_kind                      = "StorageV2"
  min_tls_version                   = "TLS1_2"
  https_traffic_only_enabled        = true
  shared_access_key_enabled         = false
  default_to_oauth_authentication   = true
  allow_nested_items_to_be_public   = false
  cross_tenant_replication_enabled  = false
  infrastructure_encryption_enabled = true
  local_user_enabled                = false
  tags                              = local.tags

  network_rules {
    default_action = "Deny"
    bypass         = ["None"]
    ip_rules       = [for cidr in var.config.operatorCidrs : trimsuffix(cidr, "/32")]
  }

  blob_properties {
    versioning_enabled = true
    delete_retention_policy {
      days = 7
    }
    container_delete_retention_policy {
      days = 7
    }
  }

  lifecycle {
    prevent_destroy = true
  }
}

resource "azurerm_storage_container" "state" {
  name                  = var.config.foundationBackend.containerName
  storage_account_id    = azurerm_storage_account.state.id
  container_access_type = "private"

  lifecycle {
    prevent_destroy = true
  }
}

resource "azurerm_storage_container" "operations" {
  name                  = "operations"
  storage_account_id    = azurerm_storage_account.recovery.id
  container_access_type = "private"

  lifecycle {
    prevent_destroy = true
  }
}

resource "azurerm_storage_container" "plans" {
  name                  = "plans"
  storage_account_id    = azurerm_storage_account.state.id
  container_access_type = "private"

  lifecycle {
    prevent_destroy = true
  }
}

resource "azurerm_storage_container" "recovery" {
  name                  = "recovery"
  storage_account_id    = azurerm_storage_account.recovery.id
  container_access_type = "private"

  lifecycle {
    prevent_destroy = true
  }
}

resource "azurerm_key_vault" "recovery" {
  depends_on                 = [azurerm_resource_group_policy_assignment.vault_guard]
  name                       = "errec${local.suffix}"
  resource_group_name        = azurerm_resource_group.foundation.name
  location                   = var.config.region
  tenant_id                  = var.config.tenantId
  sku_name                   = "standard"
  rbac_authorization_enabled = true
  purge_protection_enabled   = true
  soft_delete_retention_days = 90
  tags                       = local.tags

  network_acls {
    bypass         = "None"
    default_action = "Deny"
    ip_rules       = var.config.operatorCidrs
  }

  lifecycle {
    prevent_destroy = true
  }
}

resource "azurerm_role_assignment" "bootstrap_key" {
  scope                = azurerm_key_vault.recovery.id
  role_definition_name = "Key Vault Crypto Officer"
  principal_id         = var.bootstrap_operator_object_id
}

resource "azurerm_key_vault_key" "recovery" {
  name            = "recovery-wrap"
  key_vault_id    = azurerm_key_vault.recovery.id
  key_type        = "RSA"
  key_size        = 3072
  key_opts        = ["wrapKey", "unwrapKey"]
  expiration_date = var.recovery_key_expiration_date
  depends_on      = [azurerm_role_assignment.bootstrap_key]

  lifecycle {
    prevent_destroy = true
    precondition {
      condition     = timecmp(var.recovery_key_expiration_date, plantimestamp()) > 0
      error_message = "Recovery key expiry must remain in the future; review retained backup compatibility before key maintenance."
    }
  }
}

resource "azurerm_role_assignment" "state" {
  for_each = toset(["plan", "apply", "destroy"])

  scope                = "${azurerm_storage_account.state.id}/blobServices/default/containers/${azurerm_storage_container.environment_state.name}"
  role_definition_name = "Storage Blob Data Contributor"
  principal_id         = azurerm_user_assigned_identity.github[each.key].principal_id
  principal_type       = "ServicePrincipal"
}

resource "azurerm_role_assignment" "plans" {
  for_each = toset(["plan", "apply", "destroy"])

  scope                = "${azurerm_storage_account.state.id}/blobServices/default/containers/${azurerm_storage_container.plans.name}"
  role_definition_name = "Storage Blob Data Contributor"
  principal_id         = azurerm_user_assigned_identity.github[each.key].principal_id
  principal_type       = "ServicePrincipal"
}

resource "azurerm_storage_container" "environment_state" {
  name                  = var.config.environmentBackend.containerName
  storage_account_id    = azurerm_storage_account.state.id
  container_access_type = "private"

  lifecycle {
    prevent_destroy = true
  }
}

resource "azurerm_role_assignment" "bootstrap_storage" {
  for_each = {
    foundation  = azurerm_storage_container.state.name
    environment = azurerm_storage_container.environment_state.name
    plans       = azurerm_storage_container.plans.name
  }

  scope                = "${azurerm_storage_account.state.id}/blobServices/default/containers/${each.value}"
  role_definition_name = "Storage Blob Data Contributor"
  principal_id         = var.bootstrap_operator_object_id
}



resource "azurerm_role_assignment" "bootstrap_operations" {
  scope                = "${azurerm_storage_account.recovery.id}/blobServices/default/containers/${azurerm_storage_container.operations.name}"
  role_definition_name = "Storage Blob Data Contributor"
  principal_id         = var.bootstrap_operator_object_id
}

