variables {
  foundation = {
    vault_guard                  = { definition_sha256 = sha256("reviewed-policy-fixture") }
    workload_resource_group_name = "er-contract-workload"
    dns_zone_name                = "codingfunlab.com"
    dns_zone_resource_group_name = "er-contract-foundation"
    github_client_ids            = { apply = "44444444-4444-4444-8444-444444444444" }
    github_principal_ids = {
      plan      = "99999999-2222-4333-8444-555555555555"
      destroy   = "aaaaaaaa-2222-4333-8444-555555555555"
      apply     = "55555555-5555-4555-8555-555555555555"
      stop      = "11111111-2222-4333-8444-555555555555"
      lifecycle = "22222222-2222-4333-8444-555555555555"
      reaper    = "33333333-2222-4333-8444-555555555555"
      backup    = "44444444-2222-4333-8444-555555555555"
      restore   = "66666666-2222-4333-8444-555555555555"
      images    = "88888888-2222-4333-8444-555555555555"
    }
    operation_role_ids = {
      guard_permissions_read = "/subscriptions/11111111-1111-4111-8111-111111111111/providers/Microsoft.Authorization/roleDefinitions/88888888-3333-4333-8333-333333333333"
      guard_authority_read   = "/subscriptions/11111111-1111-4111-8111-111111111111/providers/Microsoft.Authorization/roleDefinitions/99999999-3333-4333-8333-333333333333"
      continuity_backup      = "/subscriptions/11111111-1111-4111-8111-111111111111/providers/Microsoft.Authorization/roleDefinitions/44444444-3333-4333-8333-333333333333"
      continuity_restore     = "/subscriptions/11111111-1111-4111-8111-111111111111/providers/Microsoft.Authorization/roleDefinitions/55555555-3333-4333-8333-333333333333"
      stop                   = "/subscriptions/11111111-1111-4111-8111-111111111111/providers/Microsoft.Authorization/roleDefinitions/11111111-3333-4333-8333-333333333333"
      admission              = "/subscriptions/11111111-1111-4111-8111-111111111111/providers/Microsoft.Authorization/roleDefinitions/22222222-3333-4333-8333-333333333333"
      lifecycle              = "/subscriptions/11111111-1111-4111-8111-111111111111/providers/Microsoft.Authorization/roleDefinitions/33333333-3333-4333-8333-333333333333"
    }
    approved_operator_object_ids = ["77777777-7777-4777-8777-777777777777"]
  }
  workload_secret_scopes = jsondecode(file("./tests/secret-scopes.json"))
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

run "secure_workload_contract" {
  command = apply

  assert {
    condition = (
      azurerm_kubernetes_cluster.application.sku_tier == "Free" &&
      azurerm_kubernetes_cluster.application.local_account_disabled &&
      azurerm_kubernetes_cluster.application.workload_identity_enabled &&
      azurerm_kubernetes_cluster.application.oidc_issuer_enabled
    )
    error_message = "AKS requires Free tier, Entra-only access and workload federation."
  }

  assert {
    condition = (
      azurerm_kubernetes_cluster.application.default_node_pool[0].node_count == 2 &&
      azurerm_kubernetes_cluster.application.default_node_pool[0].vm_size == "Standard_D4s_v5" &&
      azurerm_kubernetes_cluster.application.default_node_pool[0].os_disk_size_gb == 64 &&
      azurerm_kubernetes_cluster.application.default_node_pool[0].os_disk_type == "Managed"
    )
    error_message = "Approved capacity is two D4s_v5 nodes with 64Gi managed OS disks."
  }

  assert {
    condition = (
      azurerm_kubernetes_cluster.application.network_profile[0].network_plugin == "azure" &&
      azurerm_kubernetes_cluster.application.network_profile[0].network_plugin_mode == "overlay" &&
      azurerm_kubernetes_cluster.application.network_profile[0].network_data_plane == "cilium"
    )
    error_message = "AKS requires Azure Overlay/Cilium networking."
  }

  assert {
    condition = (
      azurerm_container_registry.application.sku == "Basic" &&
      !azurerm_container_registry.application.admin_enabled &&
      azurerm_key_vault.workload.purge_protection_enabled
    )
    error_message = "Workload storage must use managed authentication and purge protection."
  }
}

run "object_scoped_workload_access" {
  command = apply

  assert {
    condition = (
      length(azurerm_role_assignment.workload_secret) == sum([for names in values(var.workload_secret_scopes) : length(names)]) &&
      alltrue([for key, grant in azurerm_role_assignment.workload_secret : grant.role_definition_name == "Key Vault Secrets User" && endswith(grant.scope, "/secrets/${split("/", key)[1]}")]) &&
      azurerm_federated_identity_credential.workload["argocd"].subject == "system:serviceaccount:argocd:argocd-server" &&
      azurerm_federated_identity_credential.workload["cert-manager"].subject == "system:serviceaccount:cert-manager:cert-manager" &&
      azurerm_role_assignment.cert_manager_dns.scope == data.azurerm_dns_zone.application.id
    )
    error_message = "Each workload must receive only its explicit secret objects, and federation must match the actual upstream ServiceAccounts."
  }
}

run "reject_unapproved_node_capacity" {
  command = plan
  variables {
    config = merge(var.config, { nodeCount = 1 })
  }
  expect_failures = [var.config]
}

run "reject_unrestricted_api_input" {
  command = plan
  variables {
    config = merge(var.config, { operatorCidrs = ["0.0.0.0/0"] })
  }
  expect_failures = [var.config]
}

run "saved_plan_never_grants_planner_secret_access" {
  command = plan

  assert {
    condition = (
      toset([for grant in azurerm_role_assignment.secret_populate : grant.principal_id]) ==
      toset(["55555555-5555-4555-8555-555555555555"])
    )
    error_message = "Only the configured apply principal receives recurring secret grants; the human inherits foundation authority and the distinct planner receives none."
  }
}

run "recurring_delegation_never_assigns_humans" {
  command = plan

  assert {
    condition = (
      toset([for grant in azurerm_role_assignment.secret_populate : grant.principal_id]) == toset([var.foundation.github_principal_ids["apply"]])
    )
    error_message = "Recurring environment must grant only configured apply SP; the human inherits its foundation-owned workload-RG grant."
  }
}

run "exact_operational_cluster_and_registry_bindings" {
  command = apply

  assert {
    condition = (
      alltrue([for assignment in azurerm_role_assignment.operation_cluster : assignment.scope == azurerm_kubernetes_cluster.application.id]) &&
      azurerm_role_assignment.operation_cluster["stop"].principal_id == var.foundation.github_principal_ids["stop"]
    )
    error_message = "Lifecycle/safety-stop authority must bind only to the current exact cluster and selected identities."
  }

  assert {
    condition = (
      azurerm_role_assignment.installer.scope == azurerm_kubernetes_cluster.application.id &&
      azurerm_role_assignment.installer.principal_id == var.foundation.github_principal_ids["apply"] &&
      azurerm_role_assignment.installer.role_definition_name == "Azure Kubernetes Service RBAC Cluster Admin" &&
      azurerm_role_assignment.images.scope == azurerm_container_registry.application.id &&
      azurerm_role_assignment.images.principal_id == var.foundation.github_principal_ids["images"] &&
      azurerm_role_assignment.images.role_definition_name == "AcrPush"
    )
    error_message = "Only apply receives exact-cluster bootstrap administration, and images receives exact-registry push only."
  }

  assert {
    condition = (
      alltrue([for actor in ["backup", "restore"] : azurerm_role_assignment.cluster_user[actor].role_definition_name == "Azure Kubernetes Service Cluster User Role"]) &&
      !contains(keys(azurerm_role_assignment.admission), "stop")
    )
    error_message = "Recovery gets user-credential ARM access, never built-in broad Kubernetes Writer/Admin; safety stop cannot mutate API configuration."
  }
}

run "recovery_clients_have_separate_named_credentials" {
  command = apply
  variables {
    workload_secret_scopes = merge(var.workload_secret_scopes, {
      database-bootstrap            = setunion(var.workload_secret_scopes["database-bootstrap"], toset(["backup-postgres-password", "restore-postgres-password"]))
      equipment-backup-client       = toset(["backup-postgres-password", "verification-postgres-password"])
      equipment-restore-client      = toset(["restore-postgres-password"])
      equipment-verification-server = toset(["verification-postgres-password"])
    })
  }

  assert {
    condition = (
      azurerm_federated_identity_credential.workload["equipment-backup-client"].subject == "system:serviceaccount:equipment-recovery:equipment-backup-client" &&
      azurerm_federated_identity_credential.workload["equipment-restore-client"].subject == "system:serviceaccount:equipment-recovery:equipment-restore-client" &&
      azurerm_federated_identity_credential.workload["equipment-verification-server"].subject == "system:serviceaccount:equipment-recovery:equipment-verification-server" &&
      contains(keys(azurerm_role_assignment.workload_secret), "equipment-backup-client/backup-postgres-password") &&
      !contains(keys(azurerm_role_assignment.workload_secret), "equipment-backup-client/restore-postgres-password") &&
      !contains(keys(azurerm_role_assignment.workload_secret), "equipment-verification-server/restore-postgres-password")
    )
    error_message = "Backup, restore and isolated verification identities must use their exact recovery namespace/credential boundaries."
  }
}

run "continuity_grants_cover_only_six_identity_objects" {
  command = apply

  assert {
    condition = (
      toset(keys(azurerm_role_assignment.continuity_backup)) == toset(["identity-admin", "reservations-client", "alice", "bob", "manager", "staff"]) &&
      toset(keys(azurerm_role_assignment.continuity_restore)) == toset(keys(azurerm_role_assignment.continuity_backup)) &&
      alltrue([for name, grant in azurerm_role_assignment.continuity_backup :
      grant.scope == "${azurerm_key_vault.workload.id}/secrets/${name}" && grant.principal_id == var.foundation.github_principal_ids["backup"] && grant.role_definition_id == var.foundation.operation_role_ids["continuity_backup"]]) &&
      alltrue([for name, grant in azurerm_role_assignment.continuity_restore :
      grant.scope == "${azurerm_key_vault.workload.id}/secrets/${name}" && grant.principal_id == var.foundation.github_principal_ids["restore"] && grant.role_definition_id == var.foundation.operation_role_ids["continuity_restore"]])
    )
    error_message = "Only the exact six identity-continuity objects may receive backup read and restore set bindings, never PostgreSQL, operator or unrelated credentials."
  }
}

run "vault_network_assignments_start_disabled" {
  command = plan
  assert {
    condition     = length(azurerm_role_assignment.workload_vault_network) == 0
    error_message = "No operational workload vault writer may be assigned without verified generation evidence."
  }
}

run "release_verification_has_exact_acr_read_only" {
  command = apply
  assert {
    condition = (
      toset(keys(azurerm_role_assignment.recovery_acr_pull)) == toset(["backup", "restore"]) &&
      alltrue([for actor, grant in azurerm_role_assignment.recovery_acr_pull :
        grant.scope == azurerm_container_registry.application.id &&
        grant.role_definition_name == "AcrPull" &&
      grant.principal_id == var.foundation.github_principal_ids[actor]])
    )
    error_message = "Recovery actors require only AcrPull at the exact current registry, never image publication or admin authority."
  }
}

run "qualified_generation_limits_network_grants_to_exact_vault" {
  command = apply
  variables {
    vault_guard_generation_qualification = {
      version                = 1
      environment            = "contract"
      generation             = "test0001"
      source_revision        = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
      qualification_id       = "native-generation"
      evidence_sha256        = sha256("private-generation-fixture")
      family_evidence_sha256 = sha256("private-family-fixture")
      definition_sha256      = sha256("reviewed-policy-fixture")
      workload_vault_id      = "/subscriptions/11111111-1111-4111-8111-111111111111/resourceGroups/er-contract-workload/providers/Microsoft.KeyVault/vaults/erw${substr(sha256("11111111-1111-4111-8111-111111111111/contract/test0001"), 0, 18)}"
      observed_at            = timestamp()
      expires_at             = timeadd(timestamp(), "1h")
      consumption_sha256     = null
    }
    foundation = merge(var.foundation, { operation_role_ids = merge(var.foundation.operation_role_ids, { workload_network = "/subscriptions/11111111-1111-4111-8111-111111111111/providers/Microsoft.Authorization/roleDefinitions/77777777-3333-4333-8333-333333333333" }) })
  }
  assert {
    condition = (
      toset(keys(azurerm_role_assignment.workload_vault_network)) == toset(["backup", "restore", "reaper"]) &&
      alltrue([for actor, grant in azurerm_role_assignment.workload_vault_network : grant.scope == azurerm_key_vault.workload.id && grant.principal_id == var.foundation.github_principal_ids[actor]])
    )
    error_message = "Verified current generation grants only the exact workload vault to backup/restore/reaper."
  }
}

run "reject_stale_generation_without_completed_consumption" {
  command = plan
  variables {
    vault_guard_generation_qualification = {
      version                = 1
      environment            = "contract"
      generation             = "test0001"
      source_revision        = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
      qualification_id       = "native-generation"
      evidence_sha256        = sha256("private-generation-fixture")
      family_evidence_sha256 = sha256("private-family-fixture")
      definition_sha256      = sha256("reviewed-policy-fixture")
      workload_vault_id      = "/subscriptions/11111111-1111-4111-8111-111111111111/resourceGroups/er-contract-workload/providers/Microsoft.KeyVault/vaults/erw${substr(sha256("11111111-1111-4111-8111-111111111111/contract/test0001"), 0, 18)}"
      observed_at            = timeadd(timestamp(), "-2h")
      expires_at             = timeadd(timestamp(), "-1h")
      consumption_sha256     = null
    }
    foundation = merge(var.foundation, { operation_role_ids = merge(var.foundation.operation_role_ids, { workload_network = "/subscriptions/11111111-1111-4111-8111-111111111111/providers/Microsoft.Authorization/roleDefinitions/77777777-3333-4333-8333-333333333333" }) })
  }
  expect_failures = [terraform_data.vault_guard_generation_stage]
}

run "completed_consumption_projection_preserves_structural_grants" {
  command = apply
  variables {
    vault_guard_generation_qualification = {
      version                = 1
      environment            = "contract"
      generation             = "test0001"
      source_revision        = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
      qualification_id       = "native-generation"
      evidence_sha256        = sha256("private-generation-fixture")
      family_evidence_sha256 = sha256("private-family-fixture")
      definition_sha256      = sha256("reviewed-policy-fixture")
      workload_vault_id      = "/subscriptions/11111111-1111-4111-8111-111111111111/resourceGroups/er-contract-workload/providers/Microsoft.KeyVault/vaults/erw${substr(sha256("11111111-1111-4111-8111-111111111111/contract/test0001"), 0, 18)}"
      observed_at            = timeadd(timestamp(), "-48h")
      expires_at             = timeadd(timestamp(), "-24h")
      consumption_sha256     = sha256("verified-completed-consumption-fixture")
    }
    foundation = merge(var.foundation, { operation_role_ids = merge(var.foundation.operation_role_ids, { workload_network = "/subscriptions/11111111-1111-4111-8111-111111111111/providers/Microsoft.Authorization/roleDefinitions/77777777-3333-4333-8333-333333333333" }) })
  }
  assert {
    condition = (
      toset(keys(azurerm_role_assignment.workload_vault_network)) == toset(["backup", "restore", "reaper"]) &&
      alltrue([for actor, grant in azurerm_role_assignment.workload_vault_network : grant.scope == azurerm_key_vault.workload.id && grant.principal_id == var.foundation.github_principal_ids[actor]])
    )
    error_message = "Verified current generation grants only the exact workload vault to backup/restore/reaper."
  }
}


run "workload_guard_descriptors_bind_current_generation_and_actual_grants" {
  command = apply

  assert {
    condition = (
      output.vault_guard_generation.current_activation_reference == "current/${var.config.environment}/${var.config.generation}.json" &&
      length(output.vault_guard_generation.inspection_bindings) == 6 &&
      alltrue([for binding in output.vault_guard_generation.inspection_bindings :
        binding.roleKey == "permissions" && binding.scope == azurerm_key_vault.workload.id && binding.queryScopes == [azurerm_key_vault.workload.id] &&
        contains([for grant in azurerm_role_assignment.guard_workload_permissions : grant.id], binding.assignmentId)
      ])
    )
    error_message = "Current generation must supply its fixed locator and six actual exact-vault permission bindings."
  }
}

run "workload_guard_permission_inspection_is_exact" {
  command = plan
  assert {
    condition = (
      toset(keys(azurerm_role_assignment.guard_workload_permissions)) == toset(["plan", "apply", "destroy", "backup", "restore", "reaper"]) &&
      alltrue([for actor, grant in azurerm_role_assignment.guard_workload_permissions : grant.scope == azurerm_key_vault.workload.id && grant.principal_id == var.foundation.github_principal_ids[actor]])
    )
    error_message = "Only exact current workload vault permission reads are granted to the six approved guard consumers."
  }
}
