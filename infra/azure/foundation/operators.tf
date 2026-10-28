locals {
  operator_redirects = {
    argocd    = "https://argocd.${var.config.domain}/auth/callback"
    dashboard = "https://dashboard.${var.config.domain}/"
  }
}

resource "azuread_application" "operator" {
  for_each = local.operator_redirects

  display_name                   = "${local.prefix}-${each.key}"
  sign_in_audience               = "AzureADMyOrg"
  owners                         = [var.bootstrap_operator_object_id]
  prevent_duplicate_names        = true
  fallback_public_client_enabled = false

  app_role {
    allowed_member_types = ["User"]
    description          = "Assigned equipment lab operators only."
    display_name         = "Equipment Operator"
    enabled              = true
    id                   = uuidv5("dns", "${var.config.domain}/${var.config.environment}/${each.key}/operator")
    value                = "Equipment.Operator"
  }

  web {
    redirect_uris = [each.value]

    implicit_grant {
      access_token_issuance_enabled = false
      id_token_issuance_enabled     = false
    }
  }
}

resource "azuread_service_principal" "operator" {
  for_each = local.operator_redirects

  client_id                    = azuread_application.operator[each.key].client_id
  owners                       = [var.bootstrap_operator_object_id]
  app_role_assignment_required = true
}

resource "azuread_app_role_assignment" "operator" {
  for_each = local.operator_redirects

  app_role_id         = uuidv5("dns", "${var.config.domain}/${var.config.environment}/${each.key}/operator")
  principal_object_id = var.config.operatorGroupObjectId
  resource_object_id  = azuread_service_principal.operator[each.key].object_id
}

resource "azurerm_role_assignment" "bootstrap_operator_credentials" {
  scope                = azurerm_key_vault.recovery.id
  role_definition_name = "Key Vault Secrets Officer"
  principal_id         = var.bootstrap_operator_object_id
  principal_type       = "User"
}

resource "azurerm_role_assignment" "operator_source_read" {
  for_each = var.operator_secret_names

  scope                = "${azurerm_key_vault.recovery.id}/secrets/${each.value}"
  role_definition_name = "Key Vault Secrets User"
  principal_id         = azurerm_user_assigned_identity.github["apply"].principal_id
  principal_type       = "ServicePrincipal"
}

output "operator_client_ids" {
  description = "Tenant-scoped Argo/Dashboard OIDC app IDs; confidential credentials are created privately outside Terraform."
  value       = { for name, application in azuread_application.operator : name => application.client_id }
}

output "operator_application_object_ids" {
  description = "Application object IDs for explicit human-only credential bootstrap/rotation; no Graph authority is granted to recurring apply."
  value       = { for name, application in azuread_application.operator : name => application.object_id }
}
