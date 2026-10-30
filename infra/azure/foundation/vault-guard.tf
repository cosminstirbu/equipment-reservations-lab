locals {
  vault_guard_parameters = {
    expectedTenantId = { type = "String" }
    exactVaultName   = { type = "String" }
  }
  vault_guard_rule = {
    if = {
      anyOf = [
        {
          allOf = [
            { field = "type", equals = "Microsoft.KeyVault/vaults" },
            { anyOf = [{ value = "[parameters('exactVaultName')]", equals = "" }, { field = "name", equals = "[parameters('exactVaultName')]" }] },
            { anyOf = concat(
              [for field, expected in {
                "Microsoft.KeyVault/vaults/enableRbacAuthorization"      = true
                "Microsoft.KeyVault/vaults/enablePurgeProtection"        = true
                "Microsoft.KeyVault/vaults/enableSoftDelete"             = true
                "Microsoft.KeyVault/vaults/enabledForDeployment"         = false
                "Microsoft.KeyVault/vaults/enabledForDiskEncryption"     = false
                "Microsoft.KeyVault/vaults/enabledForTemplateDeployment" = false
                "Microsoft.KeyVault/vaults/networkAcls.defaultAction"    = "Deny"
                "Microsoft.Keyvault/vaults/networkAcls.bypass"           = "None"
                "Microsoft.KeyVault/vaults/publicNetworkAccess"          = "Enabled"
                "Microsoft.Keyvault/vaults/tenantId"                     = "[parameters('expectedTenantId')]"
              } : { anyOf = [{ field = field, exists = "false" }, { field = field, notEquals = expected }] }],
              [{ count = { field = "Microsoft.Keyvault/vaults/accessPolicies[*]" }, greater = 0 }]
            ) }
          ]
        },
        {
          allOf = [
            { field = "type", equals = "Microsoft.KeyVault/vaults/accessPolicies" },
            { anyOf = [{ value = "[parameters('exactVaultName')]", equals = "" }, { field = "fullName", like = "[concat(parameters('exactVaultName'), '/*')]" }] }
          ]
        }
      ]
    }
    then = { effect = "Deny" }
  }
  vault_guard_scopes = {
    recovery = azurerm_resource_group.foundation.id
    workload = azurerm_resource_group.workload.id
  }
  vault_guard_assignment_parameters = {
    recovery = { expectedTenantId = { value = var.config.tenantId }, exactVaultName = { value = "errec${local.suffix}" } }
    workload = { expectedTenantId = { value = var.config.tenantId }, exactVaultName = { value = "" } }
  }
  vault_guard_definition_sha256 = sha256(jsonencode({ mode = "All", parameters = local.vault_guard_parameters, policyRule = local.vault_guard_rule }))
}

resource "azurerm_policy_definition" "vault_guard" {
  name         = "${local.prefix}-vault-security-guard"
  policy_type  = "Custom"
  mode         = "All"
  display_name = "${local.prefix} retained vault security guard"
  description  = "Strict parent and legacy-child denial for reviewed vault families; no recover exemption."
  parameters   = jsonencode(local.vault_guard_parameters)
  policy_rule  = jsonencode(local.vault_guard_rule)

  lifecycle {
    prevent_destroy = true
  }
}

resource "azurerm_resource_group_policy_assignment" "vault_guard" {
  for_each             = local.vault_guard_scopes
  name                 = "${local.prefix}-${each.key}-vault-guard"
  resource_group_id    = each.value
  policy_definition_id = azurerm_policy_definition.vault_guard.id
  enforce              = true
  not_scopes           = []
  parameters           = jsonencode(local.vault_guard_assignment_parameters[each.key])

  lifecycle {
    prevent_destroy = true
  }
}

output "vault_guard" {
  description = "Nonsecret expected guard source closure; actual ARM/evidence validation remains mandatory before grants and use."
  value = {
    definition_id                 = azurerm_policy_definition.vault_guard.id
    definition_sha256             = local.vault_guard_definition_sha256
    assignment_ids                = { for family, assignment in azurerm_resource_group_policy_assignment.vault_guard : family => assignment.id }
    scope_ids                     = local.vault_guard_scopes
    parameters                    = local.vault_guard_assignment_parameters
    recovery_vault_id             = azurerm_key_vault.recovery.id
    workload_vault_name_prefix    = "erw"
    producer_principal_ids        = { human = var.bootstrap_operator_object_id, apply = azurerm_user_assigned_identity.github["apply"].principal_id }
    evidence_storage_account_name = azurerm_storage_account.recovery.name
    evidence_container_names      = { for family, container in azurerm_storage_container.guard_evidence : family => container.name }
    inspection_roles              = local.guard_inspection_role_descriptors
    inspection_bindings           = local.guard_inspection_binding_descriptors
    current_family_reference      = "current/${var.config.environment}.json"
    canary                        = local.guard_canary_descriptor
    workload_delegation           = local.workload_delegation_descriptor
    role_definitions = {
      recovery_network = { id = azurerm_role_definition.vault_network.role_definition_resource_id, actions = local.vault_network_actions, sha256 = sha256(jsonencode({ actions = local.vault_network_actions, dataActions = [] })) }
      workload_network = { id = azurerm_role_definition.workload_vault_network.role_definition_resource_id, actions = local.vault_network_actions, sha256 = sha256(jsonencode({ actions = local.vault_network_actions, dataActions = [] })) }
    }
  }
}
