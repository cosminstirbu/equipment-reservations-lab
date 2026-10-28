resource "azurerm_storage_container" "bootstrap" {
  name                  = "bootstrap"
  storage_account_id    = azurerm_storage_account.recovery.id
  container_access_type = "private"

  lifecycle {
    prevent_destroy = true
  }
}

resource "azurerm_storage_container" "qualification" {
  for_each              = toset(["backup", "restore"])
  name                  = "qualification-${each.key}"
  storage_account_id    = azurerm_storage_account.recovery.id
  container_access_type = "private"

  lifecycle {
    prevent_destroy = true
  }
}

resource "azurerm_storage_container" "qualification_challenges" {
  name                  = "qualification-challenges"
  storage_account_id    = azurerm_storage_account.recovery.id
  container_access_type = "private"

  lifecycle {
    prevent_destroy = true
  }
}

resource "azurerm_role_definition" "proof_writer" {
  name              = "${local.prefix}-proof-writer"
  scope             = azurerm_resource_group.foundation.id
  assignable_scopes = [azurerm_resource_group.foundation.id]
  description       = "Named-container Blob read/write without delete. Write does permit overwrite; trusted adapters MUST enforce If-None-Match:* for proofs."

  permissions {
    data_actions = [
      "Microsoft.Storage/storageAccounts/blobServices/containers/blobs/read",
      "Microsoft.Storage/storageAccounts/blobServices/containers/blobs/write"
    ]
  }
}

locals {
  bootstrap_scope = "${azurerm_storage_account.recovery.id}/blobServices/default/containers/${azurerm_storage_container.bootstrap.name}"
}

resource "azurerm_role_assignment" "bootstrap_human" {
  scope              = local.bootstrap_scope
  role_definition_id = azurerm_role_definition.proof_writer.role_definition_resource_id
  principal_id       = var.bootstrap_operator_object_id
  principal_type     = "User"
  condition_version  = "2.0"
  condition          = <<-CONDITION
    ((ActionMatches{'Microsoft.Storage/storageAccounts/blobServices/containers/blobs/read'} AND NOT SubOperationMatches{'Blob.List'}) OR
     ActionMatches{'Microsoft.Storage/storageAccounts/blobServices/containers/blobs/write'}) AND
    (@Resource[Microsoft.Storage/storageAccounts/blobServices/containers/blobs:path] StringEquals 'foundation/${var.config.environment}.json')
  CONDITION
}

resource "azurerm_role_assignment" "bootstrap_apply" {
  scope              = local.bootstrap_scope
  role_definition_id = azurerm_role_definition.proof_writer.role_definition_resource_id
  principal_id       = azurerm_user_assigned_identity.github["apply"].principal_id
  principal_type     = "ServicePrincipal"
  condition_version  = "2.0"
  condition          = <<-CONDITION
    ((ActionMatches{'Microsoft.Storage/storageAccounts/blobServices/containers/blobs/read'} AND NOT SubOperationMatches{'Blob.List'}) AND
      ((@Resource[Microsoft.Storage/storageAccounts/blobServices/containers/blobs:path] StringEquals 'foundation/${var.config.environment}.json') OR
       (@Resource[Microsoft.Storage/storageAccounts/blobServices/containers/blobs:path] StringLike 'environment/${var.config.environment}/*'))) OR
    (ActionMatches{'Microsoft.Storage/storageAccounts/blobServices/containers/blobs/write'} AND
      (@Resource[Microsoft.Storage/storageAccounts/blobServices/containers/blobs:path] StringLike 'environment/${var.config.environment}/*'))
  CONDITION
}

resource "azurerm_role_assignment" "bootstrap_reader" {
  for_each             = toset(["plan", "destroy", "backup", "restore", "lifecycle", "stop", "images"])
  scope                = local.bootstrap_scope
  role_definition_name = "Storage Blob Data Reader"
  principal_id         = azurerm_user_assigned_identity.github[each.key].principal_id
  principal_type       = "ServicePrincipal"
  condition_version    = "2.0"
  condition            = <<-CONDITION
    (ActionMatches{'Microsoft.Storage/storageAccounts/blobServices/containers/blobs/read'} AND NOT SubOperationMatches{'Blob.List'}) AND
    ((@Resource[Microsoft.Storage/storageAccounts/blobServices/containers/blobs:path] StringLike 'environment/${var.config.environment}/*')${contains(["plan", "destroy"], each.key) ? " OR (@Resource[Microsoft.Storage/storageAccounts/blobServices/containers/blobs:path] StringEquals 'foundation/${var.config.environment}.json')" : ""})
  CONDITION
}

resource "azurerm_role_assignment" "qualification_writer" {
  for_each           = azurerm_storage_container.qualification
  scope              = "${azurerm_storage_account.recovery.id}/blobServices/default/containers/${each.value.name}"
  role_definition_id = azurerm_role_definition.proof_writer.role_definition_resource_id
  principal_id       = azurerm_user_assigned_identity.github[each.key].principal_id
  principal_type     = "ServicePrincipal"
}

resource "azurerm_role_assignment" "qualification_reader" {
  for_each             = azurerm_storage_container.qualification
  scope                = "${azurerm_storage_account.recovery.id}/blobServices/default/containers/${each.value.name}"
  role_definition_name = "Storage Blob Data Reader"
  principal_id         = azurerm_user_assigned_identity.github["apply"].principal_id
  principal_type       = "ServicePrincipal"
}

resource "azurerm_role_assignment" "qualification_challenge" {
  scope              = "${azurerm_storage_account.recovery.id}/blobServices/default/containers/${azurerm_storage_container.qualification_challenges.name}"
  role_definition_id = azurerm_role_definition.proof_writer.role_definition_resource_id
  principal_id       = azurerm_user_assigned_identity.github["apply"].principal_id
  principal_type     = "ServicePrincipal"
}

resource "azurerm_role_assignment" "qualification_challenge_reader" {
  for_each             = toset(["backup", "restore"])
  scope                = "${azurerm_storage_account.recovery.id}/blobServices/default/containers/${azurerm_storage_container.qualification_challenges.name}"
  role_definition_name = "Storage Blob Data Reader"
  principal_id         = azurerm_user_assigned_identity.github[each.key].principal_id
  principal_type       = "ServicePrincipal"
  condition_version    = "2.0"
  condition            = "(ActionMatches{'Microsoft.Storage/storageAccounts/blobServices/containers/blobs/read'} AND NOT SubOperationMatches{'Blob.List'}) AND (@Resource[Microsoft.Storage/storageAccounts/blobServices/containers/blobs:path] StringLike 'activation/${var.config.environment}/*/*.json')"
}

output "bootstrap_container_name" {
  description = "Private retained allowlisted foundation/environment projection container in recovery storage."
  value       = azurerm_storage_container.bootstrap.name
}

output "qualification_container_names" {
  description = "Separate retained private actor-owned qualification proof containers in recovery storage."
  value       = { for actor, container in azurerm_storage_container.qualification : actor => container.name }
}

output "qualification_challenge_container_name" {
  description = "Apply-owned challenge and consumption container; backup/restore may GET activation/ENV/*/*.json and consumption/ENV/*/*.json for their own environment across generations, without list or write access."
  value       = azurerm_storage_container.qualification_challenges.name
}

resource "azurerm_role_assignment" "qualification_peer_reader" {
  for_each = { backup = "restore", restore = "backup" }

  scope                = "${azurerm_storage_account.recovery.id}/blobServices/default/containers/${azurerm_storage_container.qualification[each.value].name}"
  role_definition_name = "Storage Blob Data Reader"
  principal_id         = azurerm_user_assigned_identity.github[each.key].principal_id
  principal_type       = "ServicePrincipal"
  condition_version    = "2.0"
  condition            = "(ActionMatches{'Microsoft.Storage/storageAccounts/blobServices/containers/blobs/read'} AND NOT SubOperationMatches{'Blob.List'}) AND (@Resource[Microsoft.Storage/storageAccounts/blobServices/containers/blobs:path] StringLike 'activation/${var.config.environment}/*/*/${each.value}.json')"
}

resource "azurerm_role_assignment" "qualification_consumption_reader" {
  for_each = toset(["backup", "restore"])

  scope                = "${azurerm_storage_account.recovery.id}/blobServices/default/containers/${azurerm_storage_container.qualification_challenges.name}"
  role_definition_name = "Storage Blob Data Reader"
  principal_id         = azurerm_user_assigned_identity.github[each.key].principal_id
  principal_type       = "ServicePrincipal"
  condition_version    = "2.0"
  condition            = "(ActionMatches{'Microsoft.Storage/storageAccounts/blobServices/containers/blobs/read'} AND NOT SubOperationMatches{'Blob.List'}) AND (@Resource[Microsoft.Storage/storageAccounts/blobServices/containers/blobs:path] StringLike 'consumption/${var.config.environment}/*/*.json')"
}
