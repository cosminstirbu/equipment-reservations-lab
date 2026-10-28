provider "azurerm" {
  subscription_id                 = var.config.subscriptionId
  tenant_id                       = var.config.tenantId
  resource_provider_registrations = "none"
  storage_use_azuread             = true

  features {
    key_vault {
      purge_soft_delete_on_destroy    = false
      recover_soft_deleted_key_vaults = false
    }
  }
}

locals {
  prefix = "er-${var.config.environment}"
  suffix = substr(sha256("${var.config.subscriptionId}/${var.config.environment}/${var.config.generation}"), 0, 18)
  tags = {
    application = "equipment-reservations"
    environment = var.config.environment
    generation  = var.config.generation
    owner       = "terraform-environment"
  }
  service_account_names = { argocd = "argocd-server" }
  platform_namespaces = {
    equipment-backup-client       = "equipment-recovery"
    equipment-restore-client      = "equipment-recovery"
    equipment-verification-server = "equipment-recovery"
    cert-manager                  = "cert-manager"
    argocd                        = "argocd"
    otel-collector                = "equipment-platform"
    prometheus                    = "equipment-platform"
    loki                          = "equipment-platform"
    tempo                         = "equipment-platform"
    grafana                       = "equipment-platform"
  }
  workload_names = setunion(toset(keys(var.workload_secret_scopes)), toset(["cert-manager"]))
  secret_grants = {
    for pair in flatten([for workload, names in var.workload_secret_scopes : [for name in names : { workload = workload, name = name }]]) :
    "${pair.workload}/${pair.name}" => pair
  }
}



data "azurerm_resource_group" "workload" {
  name = var.foundation.workload_resource_group_name
}

data "azurerm_dns_zone" "application" {
  name                = var.foundation.dns_zone_name
  resource_group_name = var.foundation.dns_zone_resource_group_name
}

resource "azurerm_virtual_network" "application" {
  name                = "${local.prefix}-network"
  resource_group_name = data.azurerm_resource_group.workload.name
  location            = var.config.region
  address_space       = ["10.40.0.0/16"]
  tags                = local.tags
}

resource "azurerm_subnet" "nodes" {
  name                            = "aks"
  resource_group_name             = data.azurerm_resource_group.workload.name
  virtual_network_name            = azurerm_virtual_network.application.name
  address_prefixes                = ["10.40.0.0/22"]
  default_outbound_access_enabled = false

  service_endpoint {
    service = "Microsoft.Storage"
  }

  service_endpoint {
    service = "Microsoft.KeyVault"
  }
}

resource "azurerm_public_ip" "ingress" {
  name                = "${local.prefix}-ingress"
  resource_group_name = data.azurerm_resource_group.workload.name
  location            = var.config.region
  allocation_method   = "Static"
  sku                 = "Standard"
  tags                = local.tags
}

resource "azurerm_public_ip" "egress" {
  name                = "${local.prefix}-egress"
  resource_group_name = data.azurerm_resource_group.workload.name
  location            = var.config.region
  allocation_method   = "Static"
  sku                 = "Standard"
  tags                = local.tags
}

resource "azurerm_user_assigned_identity" "cluster" {
  name                = "${local.prefix}-cluster"
  resource_group_name = data.azurerm_resource_group.workload.name
  location            = var.config.region
  tags                = local.tags
}

resource "azurerm_role_assignment" "cluster_network" {
  for_each = {
    subnet  = azurerm_subnet.nodes.id
    ingress = azurerm_public_ip.ingress.id
    egress  = azurerm_public_ip.egress.id
  }

  scope                = each.value
  role_definition_name = "Network Contributor"
  principal_id         = azurerm_user_assigned_identity.cluster.principal_id
  principal_type       = "ServicePrincipal"
}

resource "azurerm_user_assigned_identity" "kubelet" {
  name                = "${local.prefix}-kubelet"
  resource_group_name = data.azurerm_resource_group.workload.name
  location            = var.config.region
  tags                = local.tags
}

resource "azurerm_role_assignment" "kubelet_identity" {
  scope                = azurerm_user_assigned_identity.kubelet.id
  role_definition_name = "Managed Identity Operator"
  principal_id         = azurerm_user_assigned_identity.cluster.principal_id
  principal_type       = "ServicePrincipal"
}

resource "azurerm_kubernetes_cluster" "application" {
  name                              = "${local.prefix}-aks"
  resource_group_name               = data.azurerm_resource_group.workload.name
  location                          = var.config.region
  dns_prefix                        = local.prefix
  node_resource_group               = "${local.prefix}-nodes"
  kubernetes_version                = var.config.kubernetesVersion
  sku_tier                          = "Free"
  local_account_disabled            = true
  role_based_access_control_enabled = true
  oidc_issuer_enabled               = true
  workload_identity_enabled         = true
  run_command_enabled               = false
  tags                              = local.tags

  node_provisioning_profile {
    mode = "Manual"
  }

  default_node_pool {
    name                        = "system"
    vm_size                     = var.config.nodeVmSize
    node_count                  = var.config.nodeCount
    os_sku                      = "Ubuntu"
    os_disk_type                = "Managed"
    os_disk_size_gb             = 64
    type                        = "VirtualMachineScaleSets"
    auto_scaling_enabled        = false
    node_public_ip_enabled      = false
    vnet_subnet_id              = azurerm_subnet.nodes.id
    max_pods                    = 60
    temporary_name_for_rotation = "rotation"

    upgrade_settings {
      max_surge = "1"
    }
  }

  identity {
    type         = "UserAssigned"
    identity_ids = [azurerm_user_assigned_identity.cluster.id]
  }

  kubelet_identity {
    client_id                 = azurerm_user_assigned_identity.kubelet.client_id
    object_id                 = azurerm_user_assigned_identity.kubelet.principal_id
    user_assigned_identity_id = azurerm_user_assigned_identity.kubelet.id
  }

  azure_active_directory_role_based_access_control {
    tenant_id              = var.config.tenantId
    azure_rbac_enabled     = true
    admin_group_object_ids = [var.config.operatorGroupObjectId]
  }

  api_server_access_profile {
    authorized_ip_ranges = toset(concat(var.config.operatorCidrs, ["${azurerm_public_ip.egress.ip_address}/32"]))
  }

  network_profile {
    network_plugin      = "azure"
    network_plugin_mode = "overlay"
    network_data_plane  = "cilium"
    network_policy      = "cilium"
    pod_cidr            = "10.244.0.0/16"
    service_cidr        = "10.41.0.0/16"
    dns_service_ip      = "10.41.0.10"
    load_balancer_sku   = "standard"
    outbound_type       = "loadBalancer"

    load_balancer_profile {
      outbound_ip_address_ids = [azurerm_public_ip.egress.id]
    }
  }

  key_vault_secrets_provider {
    secret_rotation_enabled  = true
    secret_rotation_interval = "2m"
  }

  depends_on = [azurerm_role_assignment.cluster_network, azurerm_role_assignment.kubelet_identity]
}

resource "azurerm_container_registry" "application" {
  name                   = "er${local.suffix}"
  resource_group_name    = data.azurerm_resource_group.workload.name
  location               = var.config.region
  sku                    = "Basic"
  admin_enabled          = false
  anonymous_pull_enabled = false
  tags                   = local.tags
}

resource "azurerm_role_assignment" "acr_pull" {
  scope                = azurerm_container_registry.application.id
  role_definition_name = "AcrPull"
  principal_id         = azurerm_kubernetes_cluster.application.kubelet_identity[0].object_id
  principal_type       = "ServicePrincipal"
}

resource "azurerm_key_vault" "workload" {
  name                       = "erw${local.suffix}"
  resource_group_name        = data.azurerm_resource_group.workload.name
  location                   = var.config.region
  tenant_id                  = var.config.tenantId
  sku_name                   = "standard"
  rbac_authorization_enabled = true
  purge_protection_enabled   = true
  soft_delete_retention_days = 90
  tags                       = local.tags

  network_acls {
    default_action             = "Deny"
    bypass                     = "None"
    ip_rules                   = var.config.operatorCidrs
    virtual_network_subnet_ids = [azurerm_subnet.nodes.id]
  }
}

resource "azurerm_user_assigned_identity" "workload" {
  for_each = local.workload_names

  name                = "${local.prefix}-${each.key}"
  resource_group_name = data.azurerm_resource_group.workload.name
  location            = var.config.region
  tags                = local.tags
}

resource "azurerm_federated_identity_credential" "workload" {
  for_each = local.workload_names

  name                      = "kubernetes-${each.key}"
  user_assigned_identity_id = azurerm_user_assigned_identity.workload[each.key].id
  issuer                    = azurerm_kubernetes_cluster.application.oidc_issuer_url
  audience                  = ["api://AzureADTokenExchange"]
  subject                   = "system:serviceaccount:${lookup(local.platform_namespaces, each.key, "equipment")}:${lookup(local.service_account_names, each.key, each.key)}"
}

resource "azurerm_role_assignment" "workload_secret" {
  for_each = local.secret_grants

  scope                = "${azurerm_key_vault.workload.id}/secrets/${each.value.name}"
  role_definition_name = "Key Vault Secrets User"
  principal_id         = azurerm_user_assigned_identity.workload[each.value.workload].principal_id
  principal_type       = "ServicePrincipal"
}

resource "azurerm_role_assignment" "cert_manager_dns" {
  scope                = data.azurerm_dns_zone.application.id
  role_definition_name = "DNS Zone Contributor"
  principal_id         = azurerm_user_assigned_identity.workload["cert-manager"].principal_id
  principal_type       = "ServicePrincipal"
}

resource "azurerm_role_assignment" "secret_populate" {
  for_each = toset([var.foundation.github_principal_ids["apply"]])

  scope                = azurerm_key_vault.workload.id
  role_definition_name = "Key Vault Secrets Officer"
  principal_id         = each.value
  principal_type       = "ServicePrincipal"
}





