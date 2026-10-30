locals {
  delegated_workload_role_ids = concat(
    [for name, role in data.azurerm_role_definition.delegated : role.role_definition_id if name != "cluster_installer"],
    [
      azurerm_role_definition.stop.role_definition_id,
      azurerm_role_definition.admission.role_definition_id,
      azurerm_role_definition.lifecycle.role_definition_id
    ]
  )
  delegated_roles = {
    identity_operator = "Managed Identity Operator"
    acr_push          = "AcrPush"
    cluster_user      = "Azure Kubernetes Service Cluster User Role"
    cluster_installer = "Azure Kubernetes Service RBAC Cluster Admin"
    acr_pull          = "AcrPull"
    network           = "Network Contributor"
    secret_read       = "Key Vault Secrets User"
    secret_populate   = "Key Vault Secrets Officer"
  }
}

data "azurerm_role_definition" "delegated" {
  for_each = local.delegated_roles

  name  = each.value
  scope = azurerm_resource_group.workload.id
}

data "azurerm_role_definition" "dns" {
  name  = "DNS Zone Contributor"
  scope = azurerm_dns_zone.application.id
}

data "azurerm_role_definition" "workload_delegation_admin" {
  name  = "Role Based Access Control Administrator"
  scope = azurerm_resource_group.workload.id

  lifecycle {
    postcondition {
      condition     = length(self.permissions) == 1
      error_message = "Workload delegation requires exactly one permission block; unsupported cardinality blocks descriptor publication."
    }
  }
}

locals {
  workload_delegation_role_semantic = {
    id               = data.azurerm_role_definition.workload_delegation_admin.id
    name             = data.azurerm_role_definition.workload_delegation_admin.name
    roleType         = data.azurerm_role_definition.workload_delegation_admin.type
    actions          = sort(distinct(data.azurerm_role_definition.workload_delegation_admin.permissions[0].actions))
    notActions       = sort(distinct(data.azurerm_role_definition.workload_delegation_admin.permissions[0].not_actions))
    dataActions      = sort(distinct(data.azurerm_role_definition.workload_delegation_admin.permissions[0].data_actions))
    notDataActions   = sort(distinct(data.azurerm_role_definition.workload_delegation_admin.permissions[0].not_data_actions))
    assignableScopes = sort(tolist(data.azurerm_role_definition.workload_delegation_admin.assignable_scopes))
  }
  workload_delegation_assignment_semantics = {
    for actor, assignment in azurerm_role_assignment.delegated_workload : actor => {
      id               = assignment.id
      scope            = assignment.scope
      principalId      = assignment.principal_id
      principalType    = assignment.principal_type
      roleDefinitionId = assignment.role_definition_id
      conditionVersion = assignment.condition_version
      conditionSha256  = sha256(assignment.condition)
    }
  }
  workload_delegation_allowed_rules = concat(
    [{ roleDefinitionIds = sort(distinct(local.delegated_workload_role_ids)), principalIds = null, principalType = "ServicePrincipal" }],
    [for actor in sort(keys(azurerm_role_definition.continuity)) : {
      roleDefinitionIds = [azurerm_role_definition.continuity[actor].role_definition_id]
      principalIds      = [azurerm_user_assigned_identity.github[actor].principal_id]
      principalType     = "ServicePrincipal"
    }],
    [
      {
        roleDefinitionIds = [azurerm_role_definition.workload_vault_network.role_definition_id]
        principalIds      = sort(distinct([for actor in ["backup", "restore", "reaper"] : azurerm_user_assigned_identity.github[actor].principal_id]))
        principalType     = "ServicePrincipal"
      },
      {
        roleDefinitionIds = [azurerm_role_definition.guard_inspection["permissions"].role_definition_id]
        principalIds      = sort(distinct([for actor in sort(tolist(local.guard_inspection_actors)) : azurerm_user_assigned_identity.github[actor].principal_id]))
        principalType     = "ServicePrincipal"
      },
      {
        roleDefinitionIds = [data.azurerm_role_definition.delegated["cluster_installer"].role_definition_id]
        principalIds      = [azurerm_user_assigned_identity.github["apply"].principal_id]
        principalType     = "ServicePrincipal"
      }
    ]
  )
  workload_delegation_semantic = {
    version                   = 1
    scope                     = azurerm_resource_group.workload.id
    roleDefinitionSha256      = sha256(jsonencode(local.workload_delegation_role_semantic))
    assignmentsSemanticHashes = { for actor, semantic in local.workload_delegation_assignment_semantics : actor => sha256(jsonencode(semantic)) }
    allowedRules              = local.workload_delegation_allowed_rules
  }
  workload_delegation_descriptor = {
    version        = local.workload_delegation_semantic.version
    scope          = local.workload_delegation_semantic.scope
    roleDefinition = merge(local.workload_delegation_role_semantic, { sha256 = local.workload_delegation_semantic.roleDefinitionSha256 })
    assignments = {
      for actor, semantic in local.workload_delegation_assignment_semantics : actor => merge(semantic, {
        condition      = azurerm_role_assignment.delegated_workload[actor].condition
        semanticSha256 = local.workload_delegation_semantic.assignmentsSemanticHashes[actor]
      })
    }
    allowedRules   = local.workload_delegation_allowed_rules
    semanticSha256 = sha256(jsonencode(local.workload_delegation_semantic))
  }
}

resource "azurerm_role_assignment" "delegated_workload" {
  for_each = toset(["apply", "destroy"])

  scope                = azurerm_resource_group.workload.id
  role_definition_name = "Role Based Access Control Administrator"
  principal_id         = azurerm_user_assigned_identity.github[each.key].principal_id
  principal_type       = "ServicePrincipal"
  condition_version    = "2.0"
  condition            = <<-CONDITION
    (
      !(ActionMatches{'Microsoft.Authorization/roleAssignments/write'})
      OR (
        (
          @Request[Microsoft.Authorization/roleAssignments:RoleDefinitionId] ForAnyOfAnyValues:GuidEquals {${join(", ", local.delegated_workload_role_ids)}}
          ${join("\n", [for actor, role in azurerm_role_definition.continuity : "OR (@Request[Microsoft.Authorization/roleAssignments:RoleDefinitionId] ForAnyOfAnyValues:GuidEquals {${role.role_definition_id}} AND @Request[Microsoft.Authorization/roleAssignments:PrincipalId] ForAnyOfAnyValues:GuidEquals {${azurerm_user_assigned_identity.github[actor].principal_id}})"])}
          OR (@Request[Microsoft.Authorization/roleAssignments:RoleDefinitionId] ForAnyOfAnyValues:GuidEquals {${azurerm_role_definition.workload_vault_network.role_definition_id}} AND @Request[Microsoft.Authorization/roleAssignments:PrincipalId] ForAnyOfAnyValues:GuidEquals {${join(", ", [for actor in ["backup", "restore", "reaper"] : azurerm_user_assigned_identity.github[actor].principal_id])}})
          OR (@Request[Microsoft.Authorization/roleAssignments:RoleDefinitionId] ForAnyOfAnyValues:GuidEquals {${azurerm_role_definition.guard_inspection["permissions"].role_definition_id}} AND @Request[Microsoft.Authorization/roleAssignments:PrincipalId] ForAnyOfAnyValues:GuidEquals {${join(", ", [for actor in sort(tolist(local.guard_inspection_actors)) : azurerm_user_assigned_identity.github[actor].principal_id])}})
          OR (
            @Request[Microsoft.Authorization/roleAssignments:RoleDefinitionId] ForAnyOfAnyValues:GuidEquals {${data.azurerm_role_definition.delegated["cluster_installer"].role_definition_id}}
            AND @Request[Microsoft.Authorization/roleAssignments:PrincipalId] ForAnyOfAnyValues:GuidEquals {${azurerm_user_assigned_identity.github["apply"].principal_id}}
          )
        )
        AND @Request[Microsoft.Authorization/roleAssignments:PrincipalType] ForAnyOfAnyValues:StringEqualsIgnoreCase {'ServicePrincipal'}
      )
    )
    AND (
      !(ActionMatches{'Microsoft.Authorization/roleAssignments/delete'})
      OR (
        (
          @Resource[Microsoft.Authorization/roleAssignments:RoleDefinitionId] ForAnyOfAnyValues:GuidEquals {${join(", ", local.delegated_workload_role_ids)}}
          ${join("\n", [for actor, role in azurerm_role_definition.continuity : "OR (@Resource[Microsoft.Authorization/roleAssignments:RoleDefinitionId] ForAnyOfAnyValues:GuidEquals {${role.role_definition_id}} AND @Resource[Microsoft.Authorization/roleAssignments:PrincipalId] ForAnyOfAnyValues:GuidEquals {${azurerm_user_assigned_identity.github[actor].principal_id}})"])}
          OR (@Resource[Microsoft.Authorization/roleAssignments:RoleDefinitionId] ForAnyOfAnyValues:GuidEquals {${azurerm_role_definition.workload_vault_network.role_definition_id}} AND @Resource[Microsoft.Authorization/roleAssignments:PrincipalId] ForAnyOfAnyValues:GuidEquals {${join(", ", [for actor in ["backup", "restore", "reaper"] : azurerm_user_assigned_identity.github[actor].principal_id])}})
          OR (@Resource[Microsoft.Authorization/roleAssignments:RoleDefinitionId] ForAnyOfAnyValues:GuidEquals {${azurerm_role_definition.guard_inspection["permissions"].role_definition_id}} AND @Resource[Microsoft.Authorization/roleAssignments:PrincipalId] ForAnyOfAnyValues:GuidEquals {${join(", ", [for actor in sort(tolist(local.guard_inspection_actors)) : azurerm_user_assigned_identity.github[actor].principal_id])}})
          OR (
            @Resource[Microsoft.Authorization/roleAssignments:RoleDefinitionId] ForAnyOfAnyValues:GuidEquals {${data.azurerm_role_definition.delegated["cluster_installer"].role_definition_id}}
            AND @Resource[Microsoft.Authorization/roleAssignments:PrincipalId] ForAnyOfAnyValues:GuidEquals {${azurerm_user_assigned_identity.github["apply"].principal_id}}
          )
        )
        AND @Resource[Microsoft.Authorization/roleAssignments:PrincipalType] ForAnyOfAnyValues:StringEqualsIgnoreCase {'ServicePrincipal'}
      )
    )
  CONDITION
}

resource "azurerm_role_assignment" "delegated_dns" {
  for_each = toset(["apply", "destroy"])

  scope                = azurerm_dns_zone.application.id
  role_definition_name = "Role Based Access Control Administrator"
  principal_id         = azurerm_user_assigned_identity.github[each.key].principal_id
  principal_type       = "ServicePrincipal"
  condition_version    = "2.0"
  condition            = <<-CONDITION
    (
      !(ActionMatches{'Microsoft.Authorization/roleAssignments/write'})
      OR (
        @Request[Microsoft.Authorization/roleAssignments:RoleDefinitionId] ForAnyOfAnyValues:GuidEquals {${data.azurerm_role_definition.dns.role_definition_id}}
        AND @Request[Microsoft.Authorization/roleAssignments:PrincipalType] ForAnyOfAnyValues:StringEqualsIgnoreCase {'ServicePrincipal'}
      )
    )
    AND (
      !(ActionMatches{'Microsoft.Authorization/roleAssignments/delete'})
      OR (
        @Resource[Microsoft.Authorization/roleAssignments:RoleDefinitionId] ForAnyOfAnyValues:GuidEquals {${data.azurerm_role_definition.dns.role_definition_id}}
        AND @Resource[Microsoft.Authorization/roleAssignments:PrincipalType] ForAnyOfAnyValues:StringEqualsIgnoreCase {'ServicePrincipal'}
      )
    )
  CONDITION
}

resource "azurerm_role_assignment" "dns_read" {
  for_each = toset(["plan", "apply", "destroy"])

  scope                = azurerm_dns_zone.application.id
  role_definition_name = "Reader"
  principal_id         = azurerm_user_assigned_identity.github[each.key].principal_id
  principal_type       = "ServicePrincipal"
}


resource "azurerm_role_assignment" "bootstrap_secret_populate" {
  scope                = azurerm_resource_group.workload.id
  role_definition_name = "Key Vault Secrets Officer"
  principal_id         = var.bootstrap_operator_object_id
  principal_type       = "User"
}



