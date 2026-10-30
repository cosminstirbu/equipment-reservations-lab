output "workload_resource_group_name" {
  description = "Non-secret workload resource group name for validated runtime projection."
  value       = data.azurerm_resource_group.workload.name
}

output "aks_cluster_name" {
  description = "Non-secret aks cluster name for validated runtime projection."
  value       = azurerm_kubernetes_cluster.application.name
}

output "aks_resource_id" {
  description = "Non-secret aks resource id for validated runtime projection."
  value       = azurerm_kubernetes_cluster.application.id
}

output "aks_oidc_issuer_url" {
  description = "Non-secret aks oidc issuer url for validated runtime projection."
  value       = azurerm_kubernetes_cluster.application.oidc_issuer_url
}

output "acr_login_server" {
  description = "Non-secret acr login server for validated runtime projection."
  value       = azurerm_container_registry.application.login_server
}

output "workload_key_vault_name" {
  description = "Non-secret workload key vault name for validated runtime projection."
  value       = azurerm_key_vault.workload.name
}

output "workload_key_vault_uri" {
  description = "Non-secret workload key vault uri for validated runtime projection."
  value       = azurerm_key_vault.workload.vault_uri
}

output "ingress_public_ip" {
  description = "Non-secret ingress public ip for validated runtime projection."
  value       = azurerm_public_ip.ingress.ip_address
}

output "ingress_public_ip_resource_group_name" {
  description = "Non-secret ingress public ip resource group name for validated runtime projection."
  value       = data.azurerm_resource_group.workload.name
}

output "persistent_api_cidrs" {
  description = "Non-secret persistent api cidrs for validated runtime projection."
  value       = sort(tolist(azurerm_kubernetes_cluster.application.api_server_access_profile[0].authorized_ip_ranges))
}

output "workload_client_ids" {
  description = "Non-secret workload client ids for validated runtime projection."
  value       = { for name, identity in azurerm_user_assigned_identity.workload : name => identity.client_id }
}

output "tenant_id" {
  description = "Non-secret tenant id for validated runtime projection."
  value       = var.config.tenantId
}

