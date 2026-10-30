locals {
  guard_inspection_actors = toset(["plan", "apply", "destroy", "backup", "restore", "reaper"])
  guard_inspection_container_bindings = {
    for entry in setproduct(["human", "apply"], ["permissions", "authority"], local.guard_inspection_actors) :
    "${entry[0]}/${entry[1]}/${entry[2]}" => { family = entry[0], role = entry[1], actor = entry[2] }
  }
}

resource "azurerm_role_definition" "guard_inspection" {
  for_each = {
    permissions = ["Microsoft.Authorization/permissions/read"]
    authority   = ["Microsoft.Authorization/roleAssignments/read", "Microsoft.Authorization/roleDefinitions/read"]
  }
  name              = "${local.prefix}-guard-${each.key}-read"
  scope             = "/subscriptions/${var.config.subscriptionId}"
  assignable_scopes = sort([azurerm_resource_group.foundation.id, azurerm_resource_group.workload.id, azurerm_policy_definition.vault_guard.id])
  description       = "Guard inspection at exact approved resource/RG assignment scopes only; no subscription assignment or read fallback. Actual narrow-scope provider resolution remains required."
  permissions {
    actions = each.value
  }
}

resource "azurerm_role_assignment" "guard_container_inspection" {
  for_each           = local.guard_inspection_container_bindings
  scope              = "${azurerm_storage_account.recovery.id}/blobServices/default/containers/${azurerm_storage_container.guard_evidence[each.value.family].name}"
  role_definition_id = azurerm_role_definition.guard_inspection[each.value.role].role_definition_resource_id
  principal_id       = azurerm_user_assigned_identity.github[each.value.actor].principal_id
  principal_type     = "ServicePrincipal"
}

resource "azurerm_role_assignment" "guard_recovery_permissions" {
  for_each           = local.guard_inspection_actors
  scope              = azurerm_key_vault.recovery.id
  role_definition_id = azurerm_role_definition.guard_inspection["permissions"].role_definition_resource_id
  principal_id       = azurerm_user_assigned_identity.github[each.key].principal_id
  principal_type     = "ServicePrincipal"
}

resource "azurerm_role_assignment" "guard_workload_authority" {
  for_each           = local.guard_inspection_actors
  scope              = azurerm_resource_group.workload.id
  role_definition_id = azurerm_role_definition.guard_inspection["authority"].role_definition_resource_id
  principal_id       = azurerm_user_assigned_identity.github[each.key].principal_id
  principal_type     = "ServicePrincipal"
}

locals {
  guard_policy_inspection_scopes = merge(
    { definition = { role = "definition", scope = azurerm_policy_definition.vault_guard.id } },
    { for family, assignment in azurerm_resource_group_policy_assignment.vault_guard : "assignment-${family}" => { role = "assignment", scope = assignment.id } },
    { for family, scope in local.vault_guard_scopes : "exemptions-${family}" => { role = "exemptions", scope = scope } }
  )
  guard_policy_inspection_bindings = {
    for entry in setproduct(keys(local.guard_policy_inspection_scopes), local.guard_inspection_actors) :
    "${local.guard_policy_inspection_scopes[entry[0]].role}/${entry[0]}/${entry[1]}" => {
      actor = entry[1]
      role  = local.guard_policy_inspection_scopes[entry[0]].role
      scope = local.guard_policy_inspection_scopes[entry[0]].scope
    }
  }
}

resource "azurerm_role_definition" "guard_policy_inspection" {
  for_each = {
    definition = { action = "Microsoft.Authorization/policyDefinitions/read", scopes = [azurerm_policy_definition.vault_guard.id] }
    assignment = { action = "Microsoft.Authorization/policyAssignments/read", scopes = values(local.vault_guard_scopes) }
    exemptions = { action = "Microsoft.Authorization/policyExemptions/read", scopes = values(local.vault_guard_scopes) }
  }
  name              = "${local.prefix}-guard-policy-${each.key}-read"
  scope             = "/subscriptions/${var.config.subscriptionId}"
  assignable_scopes = each.value.scopes
  description       = "Exact guard policy integrity read only; no subscription assignment, policy mutation, exemption creation or wider Reader fallback. Exact extension-object RBAC support requires actual qualification."
  permissions {
    actions = [each.value.action]
  }
}

resource "azurerm_role_assignment" "guard_policy_inspection" {
  for_each           = local.guard_policy_inspection_bindings
  scope              = each.value.scope
  role_definition_id = azurerm_role_definition.guard_policy_inspection[each.value.role].role_definition_resource_id
  principal_id       = azurerm_user_assigned_identity.github[each.value.actor].principal_id
  principal_type     = "ServicePrincipal"
}

locals {
  guard_active_targets = merge(
    { definition = azurerm_policy_definition.vault_guard.id },
    { for family, assignment in azurerm_resource_group_policy_assignment.vault_guard : "assignment-${family}" => assignment.id },
    local.vault_guard_scopes
  )
  guard_active_inspection_bindings = {
    for entry in setproduct(keys(local.guard_active_targets), ["permissions", "authority"], local.guard_inspection_actors) :
    "${entry[0]}/${entry[1]}/${entry[2]}" => { scope = local.guard_active_targets[entry[0]], role = entry[1], actor = entry[2] }
    if !(entry[0] == "workload" && entry[1] == "authority")
  }
  guard_inspection_role_resources = merge(
    azurerm_role_definition.guard_inspection,
    { for key, role in azurerm_role_definition.guard_policy_inspection : "policy_${key}" => role }
  )
  guard_inspection_role_semantics = {
    for key, role in local.guard_inspection_role_resources : key => {
      actions          = sort(role.permissions[0].actions)
      notActions       = sort(coalesce(role.permissions[0].not_actions, []))
      dataActions      = sort(coalesce(role.permissions[0].data_actions, []))
      notDataActions   = sort(coalesce(role.permissions[0].not_data_actions, []))
      assignableScopes = sort(tolist(role.assignable_scopes))
    }
  }
  guard_inspection_role_descriptors = {
    for key, semantic in local.guard_inspection_role_semantics : key => merge(semantic, {
      id     = local.guard_inspection_role_resources[key].role_definition_resource_id
      sha256 = sha256(jsonencode(semantic))
    })
  }
  guard_inspection_assignment_resources = merge(
    { for key, grant in azurerm_role_assignment.guard_container_inspection : "container/${key}" => { grant = grant, role = local.guard_inspection_container_bindings[key].role } },
    { for key, grant in azurerm_role_assignment.guard_recovery_permissions : "recovery/${key}" => { grant = grant, role = "permissions" } },
    { for key, grant in azurerm_role_assignment.guard_workload_authority : "workload/${key}" => { grant = grant, role = "authority" } },
    { for key, grant in azurerm_role_assignment.guard_policy_inspection : "policy/${key}" => { grant = grant, role = "policy_${local.guard_policy_inspection_bindings[key].role}" } },
    { for key, grant in azurerm_role_assignment.guard_active_inspection : "active/${key}" => { grant = grant, role = local.guard_active_inspection_bindings[key].role } }
  )
  guard_inspection_binding_descriptors = [
    for key in sort(keys(local.guard_inspection_assignment_resources)) : {
      roleKey      = local.guard_inspection_assignment_resources[key].role
      principalId  = local.guard_inspection_assignment_resources[key].grant.principal_id
      assignmentId = local.guard_inspection_assignment_resources[key].grant.id
      scope        = local.guard_inspection_assignment_resources[key].grant.scope
      queryScopes  = [local.guard_inspection_assignment_resources[key].grant.scope]
    }
  ]
}

resource "azurerm_role_assignment" "guard_active_inspection" {
  for_each           = local.guard_active_inspection_bindings
  scope              = each.value.scope
  role_definition_id = azurerm_role_definition.guard_inspection[each.value.role].role_definition_resource_id
  principal_id       = azurerm_user_assigned_identity.github[each.value.actor].principal_id
  principal_type     = "ServicePrincipal"
}
