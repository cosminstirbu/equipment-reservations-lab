resource "azurerm_role_assignment" "operation_cluster" {
  for_each = { stop = "stop", lifecycle = "lifecycle" }

  scope              = azurerm_kubernetes_cluster.application.id
  role_definition_id = var.foundation.operation_role_ids[each.value]
  principal_id       = var.foundation.github_principal_ids[each.key]
  principal_type     = "ServicePrincipal"
}

resource "azurerm_role_assignment" "admission" {
  for_each = toset(["reaper", "lifecycle", "backup", "restore"])

  scope              = azurerm_kubernetes_cluster.application.id
  role_definition_id = var.foundation.operation_role_ids["admission"]
  principal_id       = var.foundation.github_principal_ids[each.key]
  principal_type     = "ServicePrincipal"
}

resource "azurerm_role_assignment" "cluster_user" {
  for_each = toset(["backup", "restore"])

  scope                = azurerm_kubernetes_cluster.application.id
  role_definition_name = "Azure Kubernetes Service Cluster User Role"
  principal_id         = var.foundation.github_principal_ids[each.key]
  principal_type       = "ServicePrincipal"
}

resource "azurerm_role_assignment" "installer" {
  scope                = azurerm_kubernetes_cluster.application.id
  role_definition_name = "Azure Kubernetes Service RBAC Cluster Admin"
  principal_id         = var.foundation.github_principal_ids["apply"]
  principal_type       = "ServicePrincipal"
}

resource "azurerm_role_assignment" "images" {
  scope                = azurerm_container_registry.application.id
  role_definition_name = "AcrPush"
  principal_id         = var.foundation.github_principal_ids["images"]
  principal_type       = "ServicePrincipal"
}

resource "azurerm_role_assignment" "recovery_acr_pull" {
  for_each = toset(["backup", "restore"])

  scope                = azurerm_container_registry.application.id
  role_definition_name = "AcrPull"
  principal_id         = var.foundation.github_principal_ids[each.key]
  principal_type       = "ServicePrincipal"
}
