resource "azurerm_role_assignment" "guard_workload_permissions" {
  for_each           = toset(["plan", "apply", "destroy", "backup", "restore", "reaper"])
  scope              = azurerm_key_vault.workload.id
  role_definition_id = var.foundation.operation_role_ids["guard_permissions_read"]
  principal_id       = var.foundation.github_principal_ids[each.key]
  principal_type     = "ServicePrincipal"
}

output "vault_guard_generation" {
  description = "Current environment generation locator and actual workload-vault inspection bindings; merged with retained foundation vault_guard by the verified publisher."
  value = {
    current_activation_reference = "current/${var.config.environment}/${var.config.generation}.json"
    inspection_bindings = [
      for actor in sort(keys(azurerm_role_assignment.guard_workload_permissions)) : {
        roleKey      = "permissions"
        principalId  = azurerm_role_assignment.guard_workload_permissions[actor].principal_id
        assignmentId = azurerm_role_assignment.guard_workload_permissions[actor].id
        scope        = azurerm_role_assignment.guard_workload_permissions[actor].scope
        queryScopes  = [azurerm_role_assignment.guard_workload_permissions[actor].scope]
      }
    ]
  }
}
