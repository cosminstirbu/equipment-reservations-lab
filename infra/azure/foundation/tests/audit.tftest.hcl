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


run "create_retained_audit_without_ingestion" {
  command = apply

  assert {
    condition     = azurerm_log_analytics_workspace.audit.retention_in_days == 30 && azurerm_log_analytics_workspace.audit.daily_quota_gb == 0.03 && !azurerm_log_analytics_workspace.audit.local_authentication_enabled && !azurerm_log_analytics_workspace.audit.allow_resource_only_permissions
    error_message = "Audit workspace requires finite retention/quota and explicit Entra workspace query rights."
  }

  assert {
    condition     = azurerm_monitor_data_collection_rule.audit.kind == "WorkspaceTransforms" && azurerm_monitor_data_collection_rule.audit.data_flow[0].transform_kql == "source | project TimeGenerated, _ResourceId, AccountName, Category, OperationName, StatusCode, DurationMs, ServerLatencyMs, AuthenticationType, RequesterObjectId, Protocol, TlsVersion"
    error_message = "Stored audit columns must match the approved strict allowlist, without raw metadata."
  }

  assert {
    condition     = length(azurerm_monitor_diagnostic_setting.blob_audit) == 0 && azurerm_log_analytics_workspace.audit.data_collection_rule_id == null && azurerm_log_analytics_workspace_table.blob_audit.total_retention_in_days == 30
    error_message = "Initial create stage must not ingest into an unattached transform or archive raw data."
  }
}

run "deny_diagnostics_without_bound_transform" {
  command = plan
  variables {
    audit_diagnostics_ready = true
  }
  expect_failures = [terraform_data.audit_stage_guard]
}

run "deny_ready_flags_without_actual_qualification" {
  command = plan
  variables {
    audit_transform_ready   = true
    audit_diagnostics_ready = true
  }
  expect_failures = [terraform_data.audit_stage_guard]
}


run "reject_stale_audit_qualification" {
  command = plan
  variables {
    audit_transform_ready = true
    audit_qualification = {
      version                  = 1
      stage                    = "bind"
      environment              = "contract"
      generation               = "test0001"
      revision                 = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
      workspace_resource_id    = "/subscriptions/11111111-1111-4111-8111-111111111111/resourceGroups/er-contract-foundation/providers/Microsoft.OperationalInsights/workspaces/er-contract-audit"
      dcr_resource_id          = "/subscriptions/11111111-1111-4111-8111-111111111111/resourceGroups/er-contract-foundation/providers/Microsoft.Insights/dataCollectionRules/er-contract-blob-audit-transform"
      transform_sha256         = sha256("source | project TimeGenerated, _ResourceId, AccountName, Category, OperationName, StatusCode, DurationMs, ServerLatencyMs, AuthenticationType, RequesterObjectId, Protocol, TlsVersion")
      observed_at              = "2000-01-01T00:00:00Z"
      expires_at               = "2000-01-01T00:20:00Z"
      workspace_default_dcr_id = null
      dcr_provisioning_state   = "Succeeded"
    }
  }
  expect_failures = [terraform_data.audit_stage_guard]
}

run "reject_cross_generation_audit_qualification" {
  command = plan
  variables {
    audit_transform_ready = true
    audit_qualification = {
      version                  = 1
      stage                    = "bind"
      environment              = "contract"
      generation               = "wrong0001"
      revision                 = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
      workspace_resource_id    = "/subscriptions/11111111-1111-4111-8111-111111111111/resourceGroups/er-contract-foundation/providers/Microsoft.OperationalInsights/workspaces/er-contract-audit"
      dcr_resource_id          = "/subscriptions/11111111-1111-4111-8111-111111111111/resourceGroups/er-contract-foundation/providers/Microsoft.Insights/dataCollectionRules/er-contract-blob-audit-transform"
      transform_sha256         = sha256("source | project TimeGenerated, _ResourceId, AccountName, Category, OperationName, StatusCode, DurationMs, ServerLatencyMs, AuthenticationType, RequesterObjectId, Protocol, TlsVersion")
      observed_at              = timestamp()
      expires_at               = timeadd(timestamp(), "20m")
      workspace_default_dcr_id = null
      dcr_provisioning_state   = "Succeeded"
    }
  }
  expect_failures = [terraform_data.audit_stage_guard]
}

run "bind_verified_existing_transform" {
  command = apply
  variables {
    audit_transform_ready = true
    audit_qualification = {
      version                  = 1
      stage                    = "bind"
      environment              = "contract"
      generation               = "test0001"
      revision                 = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
      workspace_resource_id    = "/subscriptions/11111111-1111-4111-8111-111111111111/resourceGroups/er-contract-foundation/providers/Microsoft.OperationalInsights/workspaces/er-contract-audit"
      dcr_resource_id          = "/subscriptions/11111111-1111-4111-8111-111111111111/resourceGroups/er-contract-foundation/providers/Microsoft.Insights/dataCollectionRules/er-contract-blob-audit-transform"
      transform_sha256         = sha256("source | project TimeGenerated, _ResourceId, AccountName, Category, OperationName, StatusCode, DurationMs, ServerLatencyMs, AuthenticationType, RequesterObjectId, Protocol, TlsVersion")
      observed_at              = timestamp()
      expires_at               = timeadd(timestamp(), "20m")
      workspace_default_dcr_id = null
      dcr_provisioning_state   = "Succeeded"
    }
  }
  assert {
    condition     = azurerm_log_analytics_workspace.audit.data_collection_rule_id == output.audit_dcr_resource_id && length(azurerm_monitor_diagnostic_setting.blob_audit) == 0
    error_message = "Binding sets the actual workspace default-DCR property without enabling ingestion."
  }
}


run "deny_changed_actual_dcr" {
  command = plan
  variables {
    audit_transform_ready = true
    audit_qualification = {
      version                  = 1
      stage                    = "bind"
      environment              = "contract"
      generation               = "test0001"
      revision                 = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
      workspace_resource_id    = "/subscriptions/11111111-1111-4111-8111-111111111111/resourceGroups/er-contract-foundation/providers/Microsoft.OperationalInsights/workspaces/er-contract-audit"
      dcr_resource_id          = "/subscriptions/11111111-1111-4111-8111-111111111111/resourceGroups/er-contract-foundation/providers/Microsoft.Insights/dataCollectionRules/er-contract-blob-audit-transform"
      transform_sha256         = sha256("source | project TimeGenerated, _ResourceId, AccountName, Category, OperationName, StatusCode, DurationMs, ServerLatencyMs, AuthenticationType, RequesterObjectId, Protocol, TlsVersion")
      observed_at              = timestamp()
      expires_at               = timeadd(timestamp(), "20m")
      workspace_default_dcr_id = null
      dcr_provisioning_state   = "Succeeded"
    }

  }
  override_data {
    target = data.azurerm_monitor_data_collection_rule.audit_existing[0]
    values = { kind = "Linux" }
  }
  expect_failures = [terraform_data.audit_stage_guard]
}

run "deny_wrong_actual_workspace_link" {
  command = plan
  variables {
    audit_transform_ready   = true
    audit_diagnostics_ready = true
    audit_qualification = {
      version                  = 1
      stage                    = "enable"
      environment              = "contract"
      generation               = "test0001"
      revision                 = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
      workspace_resource_id    = "/subscriptions/11111111-1111-4111-8111-111111111111/resourceGroups/er-contract-foundation/providers/Microsoft.OperationalInsights/workspaces/er-contract-audit"
      dcr_resource_id          = "/subscriptions/11111111-1111-4111-8111-111111111111/resourceGroups/er-contract-foundation/providers/Microsoft.Insights/dataCollectionRules/er-contract-blob-audit-transform"
      transform_sha256         = sha256("source | project TimeGenerated, _ResourceId, AccountName, Category, OperationName, StatusCode, DurationMs, ServerLatencyMs, AuthenticationType, RequesterObjectId, Protocol, TlsVersion")
      observed_at              = timestamp()
      expires_at               = timeadd(timestamp(), "20m")
      workspace_default_dcr_id = "/subscriptions/11111111-1111-4111-8111-111111111111/resourceGroups/er-contract-foundation/providers/Microsoft.Insights/dataCollectionRules/unrelated"
      dcr_provisioning_state   = "Succeeded"
    }

  }
  expect_failures = [terraform_data.audit_stage_guard]
}

run "enable_only_qualified_protected_sinks" {
  command = apply
  variables {
    audit_transform_ready   = true
    audit_diagnostics_ready = true
    audit_qualification = {
      version                  = 1
      stage                    = "enable"
      environment              = "contract"
      generation               = "test0001"
      revision                 = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
      workspace_resource_id    = "/subscriptions/11111111-1111-4111-8111-111111111111/resourceGroups/er-contract-foundation/providers/Microsoft.OperationalInsights/workspaces/er-contract-audit"
      dcr_resource_id          = "/subscriptions/11111111-1111-4111-8111-111111111111/resourceGroups/er-contract-foundation/providers/Microsoft.Insights/dataCollectionRules/er-contract-blob-audit-transform"
      transform_sha256         = sha256("source | project TimeGenerated, _ResourceId, AccountName, Category, OperationName, StatusCode, DurationMs, ServerLatencyMs, AuthenticationType, RequesterObjectId, Protocol, TlsVersion")
      observed_at              = timestamp()
      expires_at               = timeadd(timestamp(), "20m")
      workspace_default_dcr_id = "/subscriptions/11111111-1111-4111-8111-111111111111/resourceGroups/er-contract-foundation/providers/Microsoft.Insights/dataCollectionRules/er-contract-blob-audit-transform"
      dcr_provisioning_state   = "Succeeded"
    }

  }
  assert {
    condition     = length(azurerm_monitor_diagnostic_setting.blob_audit) == 2 && alltrue([for diagnostic in azurerm_monitor_diagnostic_setting.blob_audit : diagnostic.log_analytics_workspace_id == azurerm_log_analytics_workspace.audit.id && diagnostic.log_analytics_destination_type == "Dedicated" && toset([for log in diagnostic.enabled_log : log.category]) == toset(["StorageRead", "StorageWrite", "StorageDelete"]) && diagnostic.storage_account_id == null && diagnostic.eventhub_authorization_rule_id == null && diagnostic.partner_solution_id == null])
    error_message = "Both Blob sinks require exactly approved categories and only the transformed workspace destination."
  }
}

