mock_resource "azurerm_resource_group" {
  defaults = { id = "/subscriptions/11111111-1111-4111-8111-111111111111/resourceGroups/er-contract-foundation" }
}

mock_resource "azurerm_dns_zone" {
  defaults = { id = "/subscriptions/11111111-1111-4111-8111-111111111111/resourceGroups/er-contract-foundation/providers/Microsoft.Network/dnsZones/codingfunlab.com" }
}

mock_resource "azurerm_storage_account" {
  defaults = { id = "/subscriptions/11111111-1111-4111-8111-111111111111/resourceGroups/er-contract-foundation/providers/Microsoft.Storage/storageAccounts/ercontractstate0001" }
}

mock_resource "azurerm_key_vault" {
  defaults = {
    id        = "/subscriptions/11111111-1111-4111-8111-111111111111/resourceGroups/er-contract-foundation/providers/Microsoft.KeyVault/vaults/ercontractrecovery"
    vault_uri = "https://ercontractrecovery.vault.azure.net/"
  }
}

mock_resource "azurerm_user_assigned_identity" {
  defaults = {
    id           = "/subscriptions/11111111-1111-4111-8111-111111111111/resourceGroups/er-contract-foundation/providers/Microsoft.ManagedIdentity/userAssignedIdentities/contract"
    principal_id = "44444444-4444-4444-8444-444444444444"
    client_id    = "55555555-5555-4555-8555-555555555555"
  }
}

mock_resource "azurerm_role_definition" {
  defaults = {
    role_definition_id          = "66666666-6666-4666-8666-666666666666"
    role_definition_resource_id = "/subscriptions/11111111-1111-4111-8111-111111111111/providers/Microsoft.Authorization/roleDefinitions/66666666-6666-4666-8666-666666666666"
  }
}

mock_data "azurerm_client_config" {
  defaults = {
    object_id       = "77777777-7777-4777-8777-777777777777"
    tenant_id       = "22222222-2222-4222-8222-222222222222"
    subscription_id = "11111111-1111-4111-8111-111111111111"
  }
}

mock_data "azurerm_role_definition" {
  defaults = {
    role_definition_id = "88888888-8888-4888-8888-888888888888"
    id                 = "/subscriptions/11111111-1111-4111-8111-111111111111/providers/Microsoft.Authorization/roleDefinitions/88888888-8888-4888-8888-888888888888"
    type               = "BuiltInRole"
    assignable_scopes  = ["/subscriptions/11111111-1111-4111-8111-111111111111/resourceGroups/er-contract-foundation", "/subscriptions/11111111-1111-4111-8111-111111111111/resourceGroups/er-contract-workload"]
    permissions = [{
      actions          = ["Microsoft.Authorization/roleAssignments/write", "Microsoft.Authorization/roleAssignments/read"]
      not_actions      = ["Microsoft.Authorization/roleAssignments/delete"]
      data_actions     = ["Microsoft.Storage/storageAccounts/blobServices/containers/blobs/read"]
      not_data_actions = ["Microsoft.Storage/storageAccounts/blobServices/containers/blobs/delete"]
    }]
  }
}

mock_resource "azurerm_log_analytics_workspace" {
  defaults = {
    id           = "/subscriptions/11111111-1111-4111-8111-111111111111/resourceGroups/er-contract-foundation/providers/Microsoft.OperationalInsights/workspaces/er-contract-audit"
    workspace_id = "dddddddd-dddd-4ddd-8ddd-dddddddddddd"
  }
}

mock_resource "azurerm_monitor_data_collection_rule" {
  defaults = {
    id = "/subscriptions/11111111-1111-4111-8111-111111111111/resourceGroups/er-contract-foundation/providers/Microsoft.Insights/dataCollectionRules/er-contract-blob-audit-transform"
  }
}

mock_data "azurerm_monitor_data_collection_rule" {
  defaults = {
    id   = "/subscriptions/11111111-1111-4111-8111-111111111111/resourceGroups/er-contract-foundation/providers/Microsoft.Insights/dataCollectionRules/er-contract-blob-audit-transform"
    kind = "WorkspaceTransforms"
    data_flow = [{
      streams            = ["Microsoft-Table-StorageBlobLogs"]
      destinations       = ["audit"]
      transform_kql      = "source | project TimeGenerated, _ResourceId, AccountName, Category, OperationName, StatusCode, DurationMs, ServerLatencyMs, AuthenticationType, RequesterObjectId, Protocol, TlsVersion"
      built_in_transform = null
      output_stream      = null
    }]
    destinations = [{
      log_analytics = [{
        name                  = "audit"
        workspace_resource_id = "/subscriptions/11111111-1111-4111-8111-111111111111/resourceGroups/er-contract-foundation/providers/Microsoft.OperationalInsights/workspaces/er-contract-audit"
      }]
    }]
  }
}

mock_resource "azurerm_policy_definition" {
  defaults = { id = "/subscriptions/11111111-1111-4111-8111-111111111111/providers/Microsoft.Authorization/policyDefinitions/er-contract-vault-security-guard" }
}

mock_resource "azurerm_resource_group_policy_assignment" {
  defaults = { id = "/subscriptions/11111111-1111-4111-8111-111111111111/resourceGroups/er-contract-foundation/providers/Microsoft.Authorization/policyAssignments/native-guard" }
}
