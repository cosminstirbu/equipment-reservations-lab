provider "azurerm" {
  subscription_id                 = var.config.subscriptionId
  tenant_id                       = var.config.tenantId
  storage_use_azuread             = true
  resource_provider_registrations = "none"

  features {
    key_vault {
      purge_soft_delete_on_destroy       = false
      recover_soft_deleted_key_vaults    = false
      purge_soft_deleted_keys_on_destroy = false
    }
  }
}

provider "azuread" {
  tenant_id = var.config.tenantId
}



locals {
  prefix = "er-${var.config.environment}"
  suffix = substr(sha256("${var.config.subscriptionId}/${var.config.environment}"), 0, 12)
  tags = {
    application = "equipment-reservations"
    environment = var.config.environment
    owner       = "terraform-foundation"
  }
  github_environments = {
    plan      = "azure-plan"
    apply     = "azure-apply"
    destroy   = "azure-destroy"
    lifecycle = "azure-lifecycle"
    stop      = "azure-safety-stop"
    reaper    = "azure-admission-reaper"
    backup    = "azure-backup"
    restore   = "azure-restore"
    images    = "azure-images"
  }
}

resource "azurerm_resource_group" "foundation" {
  name     = var.config.foundationBackend.resourceGroupName
  location = var.config.region
  tags     = local.tags

  lifecycle {
    prevent_destroy = true
  }
}

resource "azurerm_resource_group" "workload" {
  name     = "${local.prefix}-workload"
  location = var.config.region
  tags     = merge(local.tags, { owner = "terraform-foundation-workload-shell" })

  lifecycle {
    prevent_destroy = true
  }
}

resource "azurerm_dns_zone" "application" {
  name                = var.config.domain
  resource_group_name = azurerm_resource_group.foundation.name
  tags                = local.tags

  lifecycle {
    prevent_destroy = true
  }
}

resource "azurerm_user_assigned_identity" "github" {
  for_each = local.github_environments

  name                = "${local.prefix}-github-${each.key}"
  location            = var.config.region
  resource_group_name = azurerm_resource_group.foundation.name
  tags                = local.tags
}

resource "azurerm_federated_identity_credential" "github" {
  for_each = local.github_environments

  name                      = "github-${each.key}"
  user_assigned_identity_id = azurerm_user_assigned_identity.github[each.key].id
  issuer                    = "https://token.actions.githubusercontent.com"
  audience                  = ["api://AzureADTokenExchange"]
  subject                   = "repo:${var.config.githubRepository}:environment:${each.value}"
}

resource "azurerm_role_assignment" "deployment" {
  count                = var.vault_guard_family_qualification == null ? 0 : 1
  scope                = azurerm_resource_group.workload.id
  role_definition_name = "Contributor"
  principal_id         = azurerm_user_assigned_identity.github["apply"].principal_id
  principal_type       = "ServicePrincipal"
  depends_on           = [terraform_data.vault_guard_family_stage, azurerm_resource_group_policy_assignment.vault_guard]
}

resource "azurerm_role_assignment" "destroy" {
  scope                = azurerm_resource_group.workload.id
  role_definition_name = "Contributor"
  principal_id         = azurerm_user_assigned_identity.github["destroy"].principal_id
  principal_type       = "ServicePrincipal"
}

resource "azurerm_role_assignment" "plan" {
  scope                = azurerm_resource_group.workload.id
  role_definition_name = "Reader"
  principal_id         = azurerm_user_assigned_identity.github["plan"].principal_id
  principal_type       = "ServicePrincipal"
}

