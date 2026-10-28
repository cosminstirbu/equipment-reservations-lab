locals {
  guard_canary_namespace     = "6c80e97f-370c-5ca3-89bd-a0623f831280"
  guard_canary_name          = "equipment-g3-${var.config.environment}-canary"
  guard_canary_definition_id = "/subscriptions/${var.config.subscriptionId}/providers/Microsoft.Authorization/policyDefinitions/${local.guard_canary_name}"
  guard_canary_assignment_id = "${azurerm_resource_group.workload.id}/providers/Microsoft.Authorization/policyAssignments/${local.guard_canary_name}"
  guard_canary_exemption_id  = "${azurerm_resource_group.workload.id}/providers/Microsoft.Authorization/policyExemptions/${local.guard_canary_name}"
  guard_canary_role_id       = "/subscriptions/${var.config.subscriptionId}/providers/Microsoft.Authorization/roleDefinitions/${uuidv5(local.guard_canary_namespace, "${var.config.environment}/g3-read-canary")}"
  guard_canary_policy_properties = {
    definition = {
      policyType  = "Custom"
      mode        = "All"
      displayName = local.guard_canary_name
      parameters  = {}
      policyRule  = { if = { field = "type", equals = "EquipmentQualification.Never/resources" }, then = { effect = "audit" } }
    }
    assignment = {
      policyDefinitionId = local.guard_canary_definition_id
      enforcementMode    = "Default"
      parameters         = {}
      notScopes          = []
    }
    exemption = {
      policyAssignmentId = local.guard_canary_assignment_id
      exemptionCategory  = "Waiver"
      displayName        = local.guard_canary_name
    }
  }
  guard_canary_role_semantics = {
    actions          = ["Microsoft.Authorization/policyAssignments/read"]
    notActions       = []
    dataActions      = []
    notDataActions   = []
    assignableScopes = [azurerm_resource_group.workload.id]
  }
  guard_canary_assignment_properties = {
    for actor in local.guard_inspection_actors : actor => {
      roleDefinitionId = local.guard_canary_role_id
      principalId      = azurerm_user_assigned_identity.github[actor].principal_id
      principalType    = "ServicePrincipal"
    }
  }
  guard_canary_descriptor = {
    namespace_uuid = local.guard_canary_namespace
    definition = {
      id          = local.guard_canary_definition_id
      api_version = "2023-04-01"
      properties  = local.guard_canary_policy_properties.definition
      sha256      = sha256(jsonencode(local.guard_canary_policy_properties.definition))
    }
    assignment = {
      id          = local.guard_canary_assignment_id
      api_version = "2023-04-01"
      properties  = local.guard_canary_policy_properties.assignment
      sha256      = sha256(jsonencode(local.guard_canary_policy_properties.assignment))
    }
    exemption = {
      id          = local.guard_canary_exemption_id
      api_version = "2022-07-01-preview"
      properties  = local.guard_canary_policy_properties.exemption
      sha256      = sha256(jsonencode(local.guard_canary_policy_properties.exemption))
    }
    role = merge(local.guard_canary_role_semantics, {
      id     = local.guard_canary_role_id
      sha256 = sha256(jsonencode(local.guard_canary_role_semantics))
    })
    role_assignments = {
      for actor, properties in local.guard_canary_assignment_properties : actor => {
        id          = "${local.guard_canary_assignment_id}/providers/Microsoft.Authorization/roleAssignments/${uuidv5(local.guard_canary_namespace, "${var.config.environment}/${actor}/g3-deny")}"
        api_version = "2022-04-01"
        properties  = properties
        sha256      = sha256(jsonencode(properties))
      }
    }
  }
}
