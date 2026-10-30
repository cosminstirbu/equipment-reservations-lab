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
    object_id       = "99999999-9999-4999-8999-999999999999"
    tenant_id       = "22222222-2222-4222-8222-222222222222"
    subscription_id = "11111111-1111-4111-8111-111111111111"
  }
}

mock_data "azurerm_role_definition" {
  defaults = {
    role_definition_id = "88888888-8888-4888-8888-888888888888"
    id                 = "/subscriptions/11111111-1111-4111-8111-111111111111/providers/Microsoft.Authorization/roleDefinitions/88888888-8888-4888-8888-888888888888"
  }
}

mock_data "azurerm_resource_group" {
  defaults = {
    id       = "/subscriptions/11111111-1111-4111-8111-111111111111/resourceGroups/er-contract-workload"
    location = "westeurope"
  }
}

mock_data "azurerm_dns_zone" {
  defaults = { id = "/subscriptions/11111111-1111-4111-8111-111111111111/resourceGroups/er-contract-foundation/providers/Microsoft.Network/dnsZones/codingfunlab.com" }
}

mock_resource "azurerm_virtual_network" {
  defaults = { id = "/subscriptions/11111111-1111-4111-8111-111111111111/resourceGroups/er-contract-workload/providers/Microsoft.Network/virtualNetworks/contract" }
}

mock_resource "azurerm_subnet" {
  defaults = { id = "/subscriptions/11111111-1111-4111-8111-111111111111/resourceGroups/er-contract-workload/providers/Microsoft.Network/virtualNetworks/contract/subnets/aks" }
}

mock_resource "azurerm_public_ip" {
  defaults = {
    id         = "/subscriptions/11111111-1111-4111-8111-111111111111/resourceGroups/er-contract-workload/providers/Microsoft.Network/publicIPAddresses/contract"
    ip_address = "203.0.113.20"
  }
}

mock_resource "azurerm_container_registry" {
  defaults = {
    id           = "/subscriptions/11111111-1111-4111-8111-111111111111/resourceGroups/er-contract-workload/providers/Microsoft.ContainerRegistry/registries/ercontract"
    login_server = "ercontract.azurecr.io"
  }
}

mock_resource "azurerm_kubernetes_cluster" {
  defaults = {
    id               = "/subscriptions/11111111-1111-4111-8111-111111111111/resourceGroups/er-contract-workload/providers/Microsoft.ContainerService/managedClusters/er-contract-aks"
    oidc_issuer_url  = "https://westeurope.oic.prod-aks.azure.com/22222222-2222-4222-8222-222222222222/contract/"
    kubelet_identity = [{ client_id = "66666666-6666-4666-8666-666666666666", object_id = "77777777-7777-4777-8777-777777777777", user_assigned_identity_id = "/subscriptions/11111111-1111-4111-8111-111111111111/resourceGroups/er-contract-nodes/providers/Microsoft.ManagedIdentity/userAssignedIdentities/kubelet" }]
  }
}

