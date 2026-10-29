variables {
  operator_secret_names        = { argocd = "argocd-oidc-client-secret", dashboard = "dashboard-oidc-client-secret" }
  bootstrap_operator_object_id = "77777777-7777-4777-8777-777777777777"
  recovery_key_expiration_date = "2099-10-26T00:00:00Z"
  config = {
    version               = 1
    taxRate               = 0
    environment           = "contract"
    generation            = "test0001"
    subscriptionId        = "11111111-1111-4111-8111-111111111111"
    tenantId              = "22222222-2222-4222-8222-222222222222"
    operatorGroupObjectId = "33333333-3333-4333-8333-333333333333"
    region                = "westeurope"
    domain                = "codingfunlab.com"
    operatorCidrs         = ["203.0.113.10/32"]
    acmeEmail             = "operator@codingfunlab.com"
    acmeTermsAccepted     = true
    kubernetesVersion     = "1.35.8"
    nodeVmSize            = "Standard_D4s_v5"
    nodeCount             = 2
    githubRepository      = "contract/equipment-reservations"
    gitRevision           = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    foundationBackend = {
      resourceGroupName  = "er-contract-foundation"
      storageAccountName = "ercontractstate0001"
      containerName      = "foundation-state"
      key                = "foundation.tfstate"
    }
    environmentBackend = {
      resourceGroupName  = "er-contract-foundation"
      storageAccountName = "ercontractstate0001"
      containerName      = "environment-state"
      key                = "environment.tfstate"
    }
    recoveryKeyVersion = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
  }
}
mock_provider "azurerm" {
  source = "./tests/mocks"
}
mock_provider "azuread" {
  source = "./tests/mocks"
}

run "workload_delegation_output_binds_actual_existing_authority" {
  command = apply

  assert {
    condition = (
      output.vault_guard.workload_delegation.roleDefinition.sha256 == sha256(jsonencode({
        id               = data.azurerm_role_definition.workload_delegation_admin.id
        name             = "Role Based Access Control Administrator"
        roleType         = "BuiltInRole"
        actions          = ["Microsoft.Authorization/roleAssignments/read", "Microsoft.Authorization/roleAssignments/write"]
        notActions       = ["Microsoft.Authorization/roleAssignments/delete"]
        dataActions      = ["Microsoft.Storage/storageAccounts/blobServices/containers/blobs/read"]
        notDataActions   = ["Microsoft.Storage/storageAccounts/blobServices/containers/blobs/delete"]
        assignableScopes = ["/subscriptions/11111111-1111-4111-8111-111111111111/resourceGroups/er-contract-foundation", "/subscriptions/11111111-1111-4111-8111-111111111111/resourceGroups/er-contract-workload"]
      }))
    )
    error_message = "A synthetic single permission block must retain all four distinct nonempty arrays and scopes in the canonical role hash."
  }

  assert {
    condition = (
      output.vault_guard.workload_delegation.version == 1 &&
      output.vault_guard.workload_delegation.scope == azurerm_resource_group.workload.id &&
      toset(keys(output.vault_guard.workload_delegation.assignments)) == toset(["apply", "destroy"]) &&
      alltrue([for actor, descriptor in output.vault_guard.workload_delegation.assignments :
        descriptor.id == azurerm_role_assignment.delegated_workload[actor].id &&
        descriptor.condition == azurerm_role_assignment.delegated_workload[actor].condition &&
        descriptor.conditionSha256 == sha256(azurerm_role_assignment.delegated_workload[actor].condition) &&
        descriptor.principalId == azurerm_user_assigned_identity.github[actor].principal_id &&
        descriptor.principalType == "ServicePrincipal" && descriptor.conditionVersion == "2.0"
      ]) &&
      output.vault_guard.workload_delegation.allowedRules[0].principalIds == null &&
      output.vault_guard.workload_delegation.allowedRules[0].roleDefinitionIds == sort(distinct(local.delegated_workload_role_ids)) &&
      length(output.vault_guard.workload_delegation.allowedRules) == 6
    )
    error_message = "Delegation output must preserve actual apply/destroy conditions and ANY-ServicePrincipal base semantics without changing grants."
  }

  assert {
    condition = (
      output.vault_guard.workload_delegation.roleDefinition.id == data.azurerm_role_definition.workload_delegation_admin.id &&
      output.vault_guard.workload_delegation.roleDefinition.name == data.azurerm_role_definition.workload_delegation_admin.name &&
      output.vault_guard.workload_delegation.roleDefinition.roleType == data.azurerm_role_definition.workload_delegation_admin.type &&
      output.vault_guard.workload_delegation.roleDefinition.sha256 == sha256(jsonencode({ for key, value in output.vault_guard.workload_delegation.roleDefinition : key => value if key != "sha256" })) &&
      alltrue([for actor, descriptor in output.vault_guard.workload_delegation.assignments :
        descriptor.roleDefinitionId == azurerm_role_assignment.delegated_workload[actor].role_definition_id &&
        descriptor.semanticSha256 == sha256(jsonencode({ for key, value in descriptor : key => value if !contains(["condition", "semanticSha256"], key) }))
      ]) &&
      output.vault_guard.workload_delegation.semanticSha256 == sha256(jsonencode({
        version                   = 1
        scope                     = azurerm_resource_group.workload.id
        roleDefinitionSha256      = output.vault_guard.workload_delegation.roleDefinition.sha256
        assignmentsSemanticHashes = { for actor, descriptor in output.vault_guard.workload_delegation.assignments : actor => descriptor.semanticSha256 }
        allowedRules              = output.vault_guard.workload_delegation.allowedRules
      })) &&
      alltrue([for rule in output.vault_guard.workload_delegation.allowedRules :
        rule.principalType == "ServicePrincipal" &&
        jsonencode(rule.roleDefinitionIds) == jsonencode(sort(distinct(rule.roleDefinitionIds))) &&
        (rule.principalIds == null ? true : jsonencode(rule.principalIds) == jsonencode(sort(distinct(rule.principalIds))))
      ]) &&
      alltrue([for index, actor in sort(keys(azurerm_role_definition.continuity)) :
        output.vault_guard.workload_delegation.allowedRules[index + 1].roleDefinitionIds == [azurerm_role_definition.continuity[actor].role_definition_id] &&
        output.vault_guard.workload_delegation.allowedRules[index + 1].principalIds == [azurerm_user_assigned_identity.github[actor].principal_id]
      ]) &&
      output.vault_guard.workload_delegation.allowedRules[3].roleDefinitionIds == [azurerm_role_definition.workload_vault_network.role_definition_id] &&
      output.vault_guard.workload_delegation.allowedRules[3].principalIds == sort(distinct([for actor in ["backup", "restore", "reaper"] : azurerm_user_assigned_identity.github[actor].principal_id])) &&
      output.vault_guard.workload_delegation.allowedRules[4].roleDefinitionIds == [azurerm_role_definition.guard_inspection["permissions"].role_definition_id] &&
      output.vault_guard.workload_delegation.allowedRules[4].principalIds == sort(distinct([for actor in local.guard_inspection_actors : azurerm_user_assigned_identity.github[actor].principal_id])) &&
      output.vault_guard.workload_delegation.allowedRules[5].roleDefinitionIds == [data.azurerm_role_definition.delegated["cluster_installer"].role_definition_id] &&
      output.vault_guard.workload_delegation.allowedRules[5].principalIds == [azurerm_user_assigned_identity.github["apply"].principal_id]
    )
    error_message = "Delegation output must bind complete actual role/assignment hash semantics and all six source-derived normalized allow rules."
  }
}

run "workload_delegation_rejects_missing_permission_block" {
  command = plan
  override_data {
    target = data.azurerm_role_definition.workload_delegation_admin
    values = { permissions = [] }
  }
  expect_failures = [data.azurerm_role_definition.workload_delegation_admin]
}

run "workload_delegation_rejects_multiple_permission_blocks" {
  command = plan
  override_data {
    target = data.azurerm_role_definition.workload_delegation_admin
    values = { permissions = [
      { actions = ["Microsoft.Authorization/roleAssignments/read"], not_actions = ["Microsoft.Authorization/roleAssignments/delete"], data_actions = [], not_data_actions = [] },
      { actions = ["Microsoft.Authorization/roleAssignments/delete"], not_actions = [], data_actions = [], not_data_actions = [] }
    ] }
  }
  expect_failures = [data.azurerm_role_definition.workload_delegation_admin]
}

run "retained_boundaries_and_encryption" {
  command = apply

  assert {
    condition = (
      azurerm_storage_account.state.shared_access_key_enabled == false &&
      azurerm_storage_account.state.allow_nested_items_to_be_public == false &&
      azurerm_storage_account.state.blob_properties[0].versioning_enabled
    )
    error_message = "State requires Entra-only private blobs with versioning."
  }

  assert {
    condition = (
      azurerm_storage_container.state.container_access_type == "private" &&
      azurerm_storage_container.recovery.container_access_type == "private" &&
      azurerm_storage_container.operations.container_access_type == "private" &&
      azurerm_storage_container.plans.container_access_type == "private"
    )
    error_message = "State, recovery, plans and operations require separate private containers."
  }

  assert {
    condition = (
      azurerm_dns_zone.application.name == "codingfunlab.com" &&
      azurerm_resource_group.workload.name != azurerm_resource_group.foundation.name
    )
    error_message = "DNS and workload resource-group boundaries must be retained independently."
  }

  assert {
    condition = (
      azurerm_key_vault.recovery.purge_protection_enabled &&
      azurerm_key_vault.recovery.rbac_authorization_enabled &&
      azurerm_key_vault_key.recovery.key_type == "RSA" &&
      azurerm_key_vault_key.recovery.key_size == 3072 &&
      toset(azurerm_key_vault_key.recovery.key_opts) == toset(["wrapKey", "unwrapKey"])
    )
    error_message = "Recovery requires a purge-protected vault and non-exported wrap key."
  }
}

run "federation_and_deployment_scope" {
  command = apply

  assert {
    condition = (
      alltrue([for credential in azurerm_federated_identity_credential.github : startswith(credential.subject, "repo:${var.config.githubRepository}:environment:") &&
        credential.issuer == "https://token.actions.githubusercontent.com" &&
      toset(credential.audience) == toset(["api://AzureADTokenExchange"])])
    )
    error_message = "GitHub federation requires exact repository/environment subjects."
  }

  assert {
    condition = (
      length(azurerm_role_assignment.deployment) == 0
    )
    error_message = "Initial hosted Contributor waits for the verified human family projection."
  }
}

run "delegated_authority_is_constrained" {
  command = apply

  assert {
    condition = alltrue([
      for grant in azurerm_role_assignment.delegated_workload :
      grant.scope == azurerm_resource_group.workload.id &&
      grant.condition_version == "2.0" &&
      strcontains(grant.condition, "@Request[Microsoft.Authorization/roleAssignments:RoleDefinitionId]") &&
      strcontains(grant.condition, "@Resource[Microsoft.Authorization/roleAssignments:RoleDefinitionId]") &&
      strcontains(grant.condition, "'ServicePrincipal'")
    ])
    error_message = "Delegation must constrain both grant and revoke by approved role IDs and principal type."
  }

  assert {
    condition = alltrue([
      for grant in azurerm_role_assignment.delegated_dns :
      grant.scope == azurerm_dns_zone.application.id &&
      grant.condition_version == "2.0" &&
      strcontains(grant.condition, data.azurerm_role_definition.dns.role_definition_id)
    ])
    error_message = "DNS delegation must be zone-scoped and limited to the selected DNS role."
  }
}

run "network_and_state_authority_boundaries" {
  command = apply

  assert {
    condition = (
      azurerm_storage_account.state.network_rules[0].default_action == "Deny" &&
      azurerm_storage_account.recovery.network_rules[0].default_action == "Deny" &&
      azurerm_key_vault.recovery.network_acls[0].default_action == "Deny" &&
      azurerm_key_vault.recovery.network_acls[0].bypass == "None"
    )
    error_message = "Retained data endpoints must retain deny-default network access without trusted-service bypass."
  }

  assert {
    condition = (
      azurerm_storage_container.state.name != azurerm_storage_container.environment_state.name &&
      alltrue([for grant in azurerm_role_assignment.state : endswith(grant.scope, "/containers/${azurerm_storage_container.environment_state.name}")]) &&
      !contains(keys(azurerm_role_assignment.state), "stop") &&
      !contains(keys(azurerm_role_assignment.state_network), "stop") &&
      !contains(keys(azurerm_role_assignment.operations), "reaper") &&
      output.operation_storage_account_name == azurerm_storage_account.recovery.name
    )
    error_message = "Workflow state access excludes foundation; safety stop uses recovery leases only and reaper is ARM-only."
  }

  assert {
    condition     = length(azurerm_role_assignment.network_gate) == 0
    error_message = "Initial bootstrap must not bind permissions to a nonexistent DNS gate."
  }
}

run "gate_bindings_after_verified_bootstrap" {
  command = apply
  variables {
    operator_secret_names        = { argocd = "argocd-oidc-client-secret", dashboard = "dashboard-oidc-client-secret" }
    bootstrap_operator_object_id = "77777777-7777-4777-8777-777777777777"
    network_gate_ready           = true
  }

  assert {
    condition = (
      alltrue([for grant in azurerm_role_assignment.network_gate : endswith(grant.scope, "/TXT/_azure-network-lease")])
    )
    error_message = "Operational gate grants must target only the previously verified TXT record."
  }
}

run "reject_expired_recovery_key" {
  command = plan
  variables {
    operator_secret_names        = { argocd = "argocd-oidc-client-secret", dashboard = "dashboard-oidc-client-secret" }
    bootstrap_operator_object_id = "77777777-7777-4777-8777-777777777777"
    recovery_key_expiration_date = "2000-01-01T00:00:00Z"
  }
  expect_failures = [azurerm_key_vault_key.recovery]
}

run "bootstrap_human_and_operator_enrollment" {
  command = apply

  assert {
    condition = (
      azurerm_role_assignment.bootstrap_secret_populate.scope == azurerm_resource_group.workload.id &&
      azurerm_role_assignment.bootstrap_secret_populate.principal_id == var.bootstrap_operator_object_id &&
      azurerm_role_assignment.bootstrap_secret_populate.principal_type == "User"
    )
    error_message = "Only human foundation bootstrap grants the reviewed human workload secret-population authority."
  }

  assert {
    condition = (
      alltrue([for application in azuread_application.operator : application.sign_in_audience == "AzureADMyOrg" &&
      contains([for role in application.app_role : role.value], "Equipment.Operator")]) &&
      alltrue([for principal in azuread_service_principal.operator : principal.app_role_assignment_required]) &&
      alltrue([for assignment in azuread_app_role_assignment.operator : assignment.principal_object_id == var.bootstrap_operator_object_id])
    )
    error_message = "Operator apps require tenant-scoped explicit human app-role assignment."
  }
}

run "separate_crypto_and_operational_authorities" {
  command = apply

  assert {
    condition = (
      toset(azurerm_role_definition.stop.permissions[0].actions) == toset(["Microsoft.ContainerService/managedClusters/read", "Microsoft.ContainerService/managedClusters/stop/action"])
    )
    error_message = "Safety stop must have only exact-cluster read/stop permissions."
  }

  assert {
    condition = (
      contains(azurerm_role_definition.backup_crypto.permissions[0].data_actions, "Microsoft.KeyVault/vaults/keys/wrap/action") &&
      !contains(azurerm_role_definition.backup_crypto.permissions[0].data_actions, "Microsoft.KeyVault/vaults/keys/unwrap/action") &&
      contains(azurerm_role_definition.restore_crypto.permissions[0].data_actions, "Microsoft.KeyVault/vaults/keys/unwrap/action") &&
      !contains(azurerm_role_definition.restore_crypto.permissions[0].data_actions, "Microsoft.KeyVault/vaults/keys/wrap/action")
    )
    error_message = "Backup wrapping and protected restoration unwrapping must remain separate."
  }

  assert {
    condition = (
      length(azurerm_role_assignment.operator_source_read) == 2 &&
      alltrue([for assignment in azurerm_role_assignment.operator_source_read : startswith(assignment.scope, "${azurerm_key_vault.recovery.id}/secrets/") &&
      assignment.principal_id == azurerm_user_assigned_identity.github["apply"].principal_id])
    )
    error_message = "Recurring apply may read only the two retained named operator credentials, without vault-list or crypto authority."
  }

  assert {
    condition = (
      contains(keys(azurerm_role_assignment.operations), "images") &&
      contains(keys(azurerm_role_assignment.recovery_storage_network), "images") &&
      !contains(keys(azurerm_role_assignment.state), "images")
    )
    error_message = "Image publication shares recovery operation leases while retaining no Terraform state access."
  }
}

run "durable_handoff_and_actor_proof_isolation" {
  command = apply

  assert {
    condition = (
      azurerm_storage_container.bootstrap.container_access_type == "private" &&
      azurerm_storage_container.bootstrap.storage_account_id == azurerm_storage_account.recovery.id &&
      toset(keys(azurerm_storage_container.qualification)) == toset(["backup", "restore"]) &&
      alltrue([for actor, grant in azurerm_role_assignment.qualification_writer :
        grant.principal_id == azurerm_user_assigned_identity.github[actor].principal_id &&
      endswith(grant.scope, "/containers/qualification-${actor}")]) &&
      alltrue([for grant in azurerm_role_assignment.qualification_reader : grant.principal_id == azurerm_user_assigned_identity.github["apply"].principal_id])
    )
    error_message = "Handoff and proofs must be retained in private recovery storage, with separate own-actor proof writers and only apply readers."
  }

  assert {
    condition = (
      toset(azurerm_role_definition.proof_writer.permissions[0].data_actions) == toset([
        "Microsoft.Storage/storageAccounts/blobServices/containers/blobs/read",
        "Microsoft.Storage/storageAccounts/blobServices/containers/blobs/write"
      ]) &&
      azurerm_role_assignment.qualification_challenge.principal_id == azurerm_user_assigned_identity.github["apply"].principal_id &&
      endswith(azurerm_role_assignment.qualification_challenge.scope, "/containers/qualification-challenges") &&
      azurerm_role_assignment.bootstrap_apply.condition_version == "2.0" &&
      strcontains(azurerm_role_assignment.bootstrap_apply.condition, "environment/${var.config.environment}/*") &&
      strcontains(azurerm_role_assignment.bootstrap_human.condition, "foundation/${var.config.environment}.json") &&
      toset(keys(azurerm_role_assignment.bootstrap_reader)) == toset(["plan", "destroy", "backup", "restore", "lifecycle", "stop", "images"]) &&
      alltrue([for actor, grant in azurerm_role_assignment.bootstrap_reader :
        grant.principal_id == azurerm_user_assigned_identity.github[actor].principal_id &&
        grant.scope == local.bootstrap_scope && grant.condition_version == "2.0" &&
        strcontains(grant.condition, "NOT SubOperationMatches{'Blob.List'}") &&
      strcontains(grant.condition, "foundation/") == contains(["plan", "destroy"], actor)]) &&
      alltrue([for grant in azurerm_role_assignment.qualification_writer : startswith(grant.scope, "${azurerm_storage_account.recovery.id}/")]) &&
      output.bootstrap_container_name == "bootstrap" &&
      output.qualification_container_names == { backup = "qualification-backup", restore = "qualification-restore" }
    )
    error_message = "Proof roles exclude delete, challenge writes belong only to apply, and bootstrap writes are path constrained without foundation-state grants."
  }
}

run "challenge_reads_survive_recreation_without_foundation_apply" {
  command = apply

  assert {
    condition = (
      toset(keys(azurerm_role_assignment.qualification_challenge_reader)) == toset(["backup", "restore"]) &&
      alltrue([for actor, grant in azurerm_role_assignment.qualification_challenge_reader :
        grant.principal_id == azurerm_user_assigned_identity.github[actor].principal_id &&
        grant.scope == azurerm_role_assignment.qualification_challenge.scope &&
        grant.role_definition_name == "Storage Blob Data Reader" &&
        grant.condition_version == "2.0" &&
        grant.condition == "(ActionMatches{'Microsoft.Storage/storageAccounts/blobServices/containers/blobs/read'} AND NOT SubOperationMatches{'Blob.List'}) AND ((@Resource[Microsoft.Storage/storageAccounts/blobServices/containers/blobs:path] StringLike 'activation/${var.config.environment}/*/*.json') OR (@Resource[Microsoft.Storage/storageAccounts/blobServices/containers/blobs:path] StringLike 'consumption/${var.config.environment}/*/*.json'))" &&
        !strcontains(grant.condition, var.config.generation)
      ])
    )
    error_message = "Retained backup/restore permissions must admit own-environment activation and consumption metadata after generation-2 recreation without a foundation apply; no list, write, delete or other-environment reads."
  }
}

run "dashboard_native_oidc_redirect" {
  command = plan

  assert {
    condition     = toset(one(azuread_application.operator["dashboard"].web).redirect_uris) == toset(["https://dashboard.${var.config.domain}/"])
    error_message = "The pinned native Dashboard OIDC challenge returns to its HTTPS root origin."
  }

  assert {
    condition     = toset(one(azuread_application.operator["argocd"].web).redirect_uris) == toset(["https://argocd.${var.config.domain}/auth/callback"])
    error_message = "Argo retains its distinct native OIDC callback."
  }
}

run "continuity_roles_are_minimal_and_principal_bound" {
  command   = apply
  state_key = "continuity-isolation"

  override_resource {
    target = azurerm_role_definition.continuity["backup"]
    values = { role_definition_id = "11111111-aaaa-4111-8111-111111111111" }
  }
  override_resource {
    target = azurerm_role_definition.continuity["restore"]
    values = { role_definition_id = "22222222-aaaa-4111-8111-111111111111" }
  }
  override_resource {
    target = azurerm_user_assigned_identity.github["backup"]
    values = {
      principal_id = "33333333-aaaa-4111-8111-111111111111"
      id           = "/subscriptions/11111111-1111-4111-8111-111111111111/resourceGroups/er-contract-foundation/providers/Microsoft.ManagedIdentity/userAssignedIdentities/backup"
    }
  }
  override_resource {
    target = azurerm_user_assigned_identity.github["restore"]
    values = {
      principal_id = "44444444-aaaa-4111-8111-111111111111"
      id           = "/subscriptions/11111111-1111-4111-8111-111111111111/resourceGroups/er-contract-foundation/providers/Microsoft.ManagedIdentity/userAssignedIdentities/restore"
    }
  }

  assert {
    condition = (
      toset(azurerm_role_definition.continuity["backup"].permissions[0].data_actions) == toset(["Microsoft.KeyVault/vaults/secrets/getSecret/action", "Microsoft.KeyVault/vaults/secrets/readMetadata/action"]) &&
      toset(azurerm_role_definition.continuity["restore"].permissions[0].data_actions) == toset(["Microsoft.KeyVault/vaults/secrets/setSecret/action", "Microsoft.KeyVault/vaults/secrets/readMetadata/action"]) &&
      alltrue([for actor, role in azurerm_role_definition.continuity :
        !contains(local.delegated_workload_role_ids, role.role_definition_id) &&
        alltrue([for grant in azurerm_role_assignment.delegated_workload :
          strcontains(grant.condition, "OR (@Request[Microsoft.Authorization/roleAssignments:RoleDefinitionId] ForAnyOfAnyValues:GuidEquals {${role.role_definition_id}} AND @Request[Microsoft.Authorization/roleAssignments:PrincipalId] ForAnyOfAnyValues:GuidEquals {${azurerm_user_assigned_identity.github[actor].principal_id}})") &&
      strcontains(grant.condition, "OR (@Resource[Microsoft.Authorization/roleAssignments:RoleDefinitionId] ForAnyOfAnyValues:GuidEquals {${role.role_definition_id}} AND @Resource[Microsoft.Authorization/roleAssignments:PrincipalId] ForAnyOfAnyValues:GuidEquals {${azurerm_user_assigned_identity.github[actor].principal_id}})")])])
    )
    error_message = "Continuity roles must exclude wildcard/list/delete and be delegated only to their corresponding backup/restore principals."
  }
}

run "vault_guards_exist_before_operational_grants" {
  command = plan

  assert {
    condition = (
      azurerm_policy_definition.vault_guard.mode == "All" &&
      toset(keys(azurerm_resource_group_policy_assignment.vault_guard)) == toset(["recovery", "workload"]) &&
      alltrue([for assignment in azurerm_resource_group_policy_assignment.vault_guard : assignment.enforce && length(assignment.not_scopes) == 0]) &&
      length(azurerm_role_assignment.recovery_vault_network) == 0 &&
      strcontains(azurerm_policy_definition.vault_guard.policy_rule, "Microsoft.Keyvault/vaults/accessPolicies[*]") &&
      strcontains(azurerm_policy_definition.vault_guard.policy_rule, "Microsoft.KeyVault/vaults/accessPolicies") &&
      strcontains(azurerm_policy_definition.vault_guard.policy_rule, "\"notEquals\":true") &&
      strcontains(azurerm_policy_definition.vault_guard.policy_rule, "\"notEquals\":false") &&
      !strcontains(azurerm_policy_definition.vault_guard.policy_rule, "createMode")
    )
    error_message = "G0 must create strict enforcing guards for both vault families without network-writer grants or recover exemptions."
  }
}

run "guard_evidence_producers_are_separate" {
  command = apply
  assert {
    condition = (
      toset(keys(azurerm_storage_container.guard_evidence)) == toset(["human", "apply"]) &&
      alltrue([for container in azurerm_storage_container.guard_evidence : container.container_access_type == "private" && container.storage_account_id == azurerm_storage_account.recovery.id]) &&
      azurerm_role_assignment.guard_evidence_writer["human"].principal_id == var.bootstrap_operator_object_id &&
      azurerm_role_assignment.guard_evidence_writer["apply"].principal_id == azurerm_user_assigned_identity.github["apply"].principal_id &&
      toset(keys(azurerm_role_assignment.guard_evidence_reader)) == toset(["human/plan", "human/apply", "human/destroy", "human/backup", "human/restore", "human/reaper", "apply/plan", "apply/destroy", "apply/backup", "apply/restore", "apply/reaper"])
    )
    error_message = "Trusted human and apply guard evidence must have separate exact producer containers and only approved consumer readers."
  }
}

run "verified_family_projection_enables_exact_recovery_grants" {
  command = plan
  variables {
    vault_guard_family_qualification = {
      version                = 1
      environment            = "contract"
      source_revision        = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
      qualification_id       = "native-fixture"
      evidence_sha256        = sha256("private-human-fixture")
      definition_sha256      = run.guard_evidence_producers_are_separate.vault_guard.definition_sha256
      recovery_assignment_id = "${run.guard_evidence_producers_are_separate.vault_guard.scope_ids.recovery}/providers/Microsoft.Authorization/policyAssignments/er-contract-recovery-vault-guard"
      workload_assignment_id = "${run.guard_evidence_producers_are_separate.vault_guard.scope_ids.workload}/providers/Microsoft.Authorization/policyAssignments/er-contract-workload-vault-guard"
      recovery_vault_id      = "${run.guard_evidence_producers_are_separate.vault_guard.scope_ids.recovery}/providers/Microsoft.KeyVault/vaults/errec${substr(sha256("11111111-1111-4111-8111-111111111111/contract"), 0, 12)}"
      observed_at            = timestamp()
    }
  }
  assert {
    condition = (
      length(azurerm_role_assignment.deployment) == 1 &&
      toset(keys(azurerm_role_assignment.recovery_vault_network)) == toset(["backup", "restore", "reaper", "apply"]) &&
      alltrue([for grant in azurerm_role_assignment.recovery_vault_network : grant.scope == azurerm_key_vault.recovery.id])
    )
    error_message = "Only structurally valid private family projections may enable retained exact vault grants and existing workload Contributor; actual proof must be validated by the wrapper."
  }
}

run "reject_foreign_guard_family_projection" {
  command = plan
  variables {
    vault_guard_family_qualification = {
      version                = 1
      environment            = "foreign"
      source_revision        = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
      qualification_id       = "foreign"
      evidence_sha256        = sha256("foreign")
      definition_sha256      = sha256("wrong-source")
      recovery_assignment_id = "wrong"
      workload_assignment_id = "wrong"
      recovery_vault_id      = "wrong"
      observed_at            = timestamp()
    }
  }
  expect_failures = [terraform_data.vault_guard_family_stage]
}

run "peer_activation_and_consumption_reads_are_narrow" {
  command = apply
  assert {
    condition = (
      toset(keys(azurerm_role_assignment.qualification_peer_reader)) == toset(["backup", "restore"]) &&
      alltrue([for actor, grant in azurerm_role_assignment.qualification_peer_reader :
        grant.principal_id == azurerm_user_assigned_identity.github[actor].principal_id &&
        grant.role_definition_name == "Storage Blob Data Reader" &&
        grant.scope == "${azurerm_storage_account.recovery.id}/blobServices/default/containers/qualification-${actor == "backup" ? "restore" : "backup"}" &&
      grant.condition == "(ActionMatches{'Microsoft.Storage/storageAccounts/blobServices/containers/blobs/read'} AND NOT SubOperationMatches{'Blob.List'}) AND (@Resource[Microsoft.Storage/storageAccounts/blobServices/containers/blobs:path] StringLike 'activation/${var.config.environment}/*/*/${actor == "backup" ? "restore" : "backup"}.json')"]) &&
      alltrue([for actor, grant in azurerm_role_assignment.qualification_challenge_reader :
        grant.principal_id == azurerm_user_assigned_identity.github[actor].principal_id &&
        grant.role_definition_name == "Storage Blob Data Reader" &&
        grant.scope == azurerm_role_assignment.qualification_challenge.scope &&
        grant.condition_version == "2.0" &&
      grant.condition == "(ActionMatches{'Microsoft.Storage/storageAccounts/blobServices/containers/blobs/read'} AND NOT SubOperationMatches{'Blob.List'}) AND ((@Resource[Microsoft.Storage/storageAccounts/blobServices/containers/blobs:path] StringLike 'activation/${var.config.environment}/*/*.json') OR (@Resource[Microsoft.Storage/storageAccounts/blobServices/containers/blobs:path] StringLike 'consumption/${var.config.environment}/*/*.json'))"])
    )
    error_message = "Backup/restore may GET only literal peer activation proofs and own-environment recovery consumption, with no list/write/operational-peer-proof reads."
  }
}

run "guard_inspection_descriptors_bind_complete_semantics" {
  command = apply

  assert {
    condition = (
      toset(keys(output.vault_guard.inspection_roles)) == toset(["permissions", "authority", "policy_definition", "policy_assignment", "policy_exemptions"]) &&
      alltrue([for role in values(output.vault_guard.inspection_roles) :
        role.sha256 == sha256(jsonencode({ actions = role.actions, notActions = role.notActions, dataActions = role.dataActions, notDataActions = role.notDataActions, assignableScopes = role.assignableScopes })) &&
        role.actions == sort(role.actions) && role.assignableScopes == sort(role.assignableScopes) &&
        length(role.notActions) == 0 && length(role.dataActions) == 0 && length(role.notDataActions) == 0
      ]) &&
      length(output.vault_guard.inspection_bindings) == 120 &&
      length(azurerm_role_assignment.guard_active_inspection) == 54 &&
      alltrue([for key, binding in azurerm_role_assignment.guard_active_inspection :
        binding.scope == local.guard_active_targets[split("/", key)[0]] &&
        binding.principal_id == azurerm_user_assigned_identity.github[split("/", key)[2]].principal_id &&
        binding.role_definition_id == azurerm_role_definition.guard_inspection[split("/", key)[1]].role_definition_resource_id
      ]) &&
      alltrue([for binding in output.vault_guard.inspection_bindings : binding.queryScopes == [binding.scope] && contains(keys(output.vault_guard.inspection_roles), binding.roleKey)]) &&
      output.vault_guard.current_family_reference == "current/contract.json"
    )
    error_message = "Every exact inspection role must bind its complete ordered semantics and actual scoped assignment tuples."
  }
}

run "guard_canary_descriptors_are_fixed_inert_and_unprovisioned" {
  command = apply

  assert {
    condition = (
      output.vault_guard.canary.namespace_uuid == "6c80e97f-370c-5ca3-89bd-a0623f831280" &&
      output.vault_guard.canary.definition.properties.policyRule.if.equals == "EquipmentQualification.Never/resources" &&
      output.vault_guard.canary.definition.properties.policyRule.then.effect == "audit" &&
      output.vault_guard.canary.definition.api_version == "2023-04-01" &&
      output.vault_guard.canary.exemption.api_version == "2022-07-01-preview" &&
      output.vault_guard.canary.assignment.properties.policyDefinitionId == output.vault_guard.canary.definition.id &&
      output.vault_guard.canary.exemption.properties.policyAssignmentId == output.vault_guard.canary.assignment.id &&
      output.vault_guard.canary.role.actions == ["Microsoft.Authorization/policyAssignments/read"] &&
      toset(keys(output.vault_guard.canary.role_assignments)) == toset(["plan", "apply", "destroy", "backup", "restore", "reaper"]) &&
      alltrue([for actor, descriptor in output.vault_guard.canary.role_assignments :
        descriptor.id == "${output.vault_guard.canary.assignment.id}/providers/Microsoft.Authorization/roleAssignments/${uuidv5(output.vault_guard.canary.namespace_uuid, "contract/${actor}/g3-deny")}" &&
        descriptor.properties.roleDefinitionId == output.vault_guard.canary.role.id &&
        descriptor.sha256 == sha256(jsonencode(descriptor.properties))
      ])
    )
    error_message = "Canary descriptors must derive literal inert policy targets and redundant-read role probes without creating fixtures."
  }
}

run "guard_inspection_reads_have_exact_actions_and_scopes" {
  command = plan
  assert {
    condition = (
      toset(azurerm_role_definition.guard_inspection["permissions"].permissions[0].actions) == toset(["Microsoft.Authorization/permissions/read"]) &&
      toset(azurerm_role_definition.guard_inspection["authority"].permissions[0].actions) == toset(["Microsoft.Authorization/roleAssignments/read", "Microsoft.Authorization/roleDefinitions/read"]) &&
      length(azurerm_role_assignment.guard_container_inspection) == 24 &&
      toset(keys(azurerm_role_assignment.guard_container_inspection)) == toset(flatten([for family in ["human", "apply"] : [for role in ["permissions", "authority"] : [for actor in ["plan", "apply", "destroy", "backup", "restore", "reaper"] : "${family}/${role}/${actor}"]]])) &&
      length(azurerm_role_assignment.guard_recovery_permissions) == 6 &&
      length(azurerm_role_assignment.guard_workload_authority) == 6 &&
      alltrue([for grant in azurerm_role_assignment.guard_container_inspection : contains(["${azurerm_storage_account.recovery.id}/blobServices/default/containers/guard-evidence", "${azurerm_storage_account.recovery.id}/blobServices/default/containers/guard-apply-evidence"], grant.scope)]) &&
      alltrue([for grant in azurerm_role_assignment.guard_workload_authority : grant.scope == azurerm_resource_group.workload.id]) &&
      alltrue([for grant in azurerm_role_assignment.guard_recovery_permissions : grant.scope == azurerm_key_vault.recovery.id])
    )
    error_message = "Inspection must have only approved ARM reads at exact containers/vault/RG scopes, with no subscription Reader or write fallback."
  }
}

run "policy_inspection_reads_are_exact_and_nonmutating" {
  command = plan
  assert {
    condition = (
      toset(azurerm_role_definition.guard_policy_inspection["definition"].permissions[0].actions) == toset(["Microsoft.Authorization/policyDefinitions/read"]) &&
      toset(azurerm_role_definition.guard_policy_inspection["assignment"].permissions[0].actions) == toset(["Microsoft.Authorization/policyAssignments/read"]) &&
      toset(azurerm_role_definition.guard_policy_inspection["exemptions"].permissions[0].actions) == toset(["Microsoft.Authorization/policyExemptions/read"]) &&
      length(azurerm_role_assignment.guard_policy_inspection) == 30 &&
      toset(keys(azurerm_role_assignment.guard_policy_inspection)) == toset(flatten([for target in ["definition/definition", "assignment/assignment-recovery", "assignment/assignment-workload", "exemptions/exemptions-recovery", "exemptions/exemptions-workload"] : [for actor in ["plan", "apply", "destroy", "backup", "restore", "reaper"] : "${target}/${actor}"]])) &&
      alltrue([for name, grant in azurerm_role_assignment.guard_policy_inspection :
        startswith(name, "definition/") ? grant.scope == azurerm_policy_definition.vault_guard.id :
        (startswith(name, "assignment/") ? contains([for assignment in azurerm_resource_group_policy_assignment.vault_guard : assignment.id], grant.scope) :
      contains(values(local.vault_guard_scopes), grant.scope))])
    )
    error_message = "Policy integrity readers may inspect only the exact definition, two assignments and two RG exemption scopes, with no write or subscription scope assignment."
  }
}
