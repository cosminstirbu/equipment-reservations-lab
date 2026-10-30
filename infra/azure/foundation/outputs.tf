output "foundation_resource_group_name" {
  description = "Non-secret foundation resource group name for validated operational projection."
  value       = azurerm_resource_group.foundation.name
}

output "workload_resource_group_name" {
  description = "Non-secret workload resource group name for validated operational projection."
  value       = azurerm_resource_group.workload.name
}

output "tenant_id" {
  description = "Non-secret tenant id for validated operational projection."
  value       = var.config.tenantId
}

output "operator_group_object_id" {
  description = "Non-secret operator group object id for validated operational projection."
  value       = var.config.operatorGroupObjectId
}

output "dns_zone_name" {
  description = "Non-secret dns zone name for validated operational projection."
  value       = azurerm_dns_zone.application.name
}

output "dns_zone_resource_group_name" {
  description = "Non-secret dns zone resource group name for validated operational projection."
  value       = azurerm_resource_group.foundation.name
}

output "dns_nameservers" {
  description = "Non-secret dns nameservers for validated operational projection."
  value       = azurerm_dns_zone.application.name_servers
}

output "state_storage_account_name" {
  description = "Non-secret state storage account name for validated operational projection."
  value       = azurerm_storage_account.state.name
}

output "state_container_name" {
  description = "Non-secret state container name for validated operational projection."
  value       = azurerm_storage_container.state.name
}

output "recovery_storage_account_name" {
  description = "Non-secret recovery storage account name for validated operational projection."
  value       = azurerm_storage_account.recovery.name
}

output "recovery_container_name" {
  description = "Non-secret recovery container name for validated operational projection."
  value       = azurerm_storage_container.recovery.name
}

output "operation_storage_account_name" {
  description = "Non-secret operation storage account name for validated operational projection."
  value       = azurerm_storage_account.recovery.name
}

output "operation_container_name" {
  description = "Non-secret operation container name for validated operational projection."
  value       = azurerm_storage_container.operations.name
}

output "plan_container_name" {
  description = "Non-secret plan container name for validated operational projection."
  value       = azurerm_storage_container.plans.name
}

output "recovery_key_id" {
  description = "Non-secret recovery key id for validated operational projection."
  value       = azurerm_key_vault_key.recovery.id
}

output "recovery_key_version" {
  description = "Non-secret recovery key version for validated operational projection."
  value       = azurerm_key_vault_key.recovery.version
}

output "github_client_ids" {
  description = "Non-secret github client ids for validated operational projection."
  value       = { for name, identity in azurerm_user_assigned_identity.github : name => identity.client_id }
}

output "github_principal_ids" {
  description = "Non-secret github principal ids for validated operational projection."
  value       = { for name, identity in azurerm_user_assigned_identity.github : name => identity.principal_id }
}

output "environment_state_container_name" {
  description = "Separate environment state container; workflows have no foundation state data grant."
  value       = azurerm_storage_container.environment_state.name
}



output "approved_operator_object_ids" {
  description = "Reviewed human operator IDs allowed to populate workload secrets, independent of the current planner identity."
  value       = [var.bootstrap_operator_object_id]
}
