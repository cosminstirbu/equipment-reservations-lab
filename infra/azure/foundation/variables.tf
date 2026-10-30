variable "config" {
  description = "Validated non-secret environment configuration, passed through the shared Azure configuration contract."
  type = object({
    version               = number
    taxRate               = number
    environment           = string
    generation            = string
    subscriptionId        = string
    tenantId              = string
    region                = string
    domain                = string
    operatorGroupObjectId = string
    operatorCidrs         = list(string)
    acmeEmail             = string
    acmeTermsAccepted     = bool
    kubernetesVersion     = string
    nodeVmSize            = string
    nodeCount             = number
    githubRepository      = string
    gitRevision           = string
    foundationBackend = object({
      resourceGroupName  = string
      storageAccountName = string
      containerName      = string
      key                = string
    })
    environmentBackend = object({
      resourceGroupName  = string
      storageAccountName = string
      containerName      = string
      key                = string
    })
    recoveryKeyVersion = string
  })

  validation {
    condition = (
      var.config.version == 1 &&
      var.config.domain == "codingfunlab.com" &&
      var.config.region == "westeurope" &&
      var.config.nodeVmSize == "Standard_D4s_v5" &&
      var.config.nodeCount == 2 &&
      can(regex("^1\\.35\\.[0-9]+$", var.config.kubernetesVersion))
    )
    error_message = "Configuration must match the approved region, domain, capacity and exact Kubernetes patch family."
  }

  validation {
    condition = (
      can(regex("^[a-z][a-z0-9-]{2,19}$", var.config.environment)) &&
      can(regex("^[a-z0-9]{4,12}$", var.config.generation)) &&
      can(regex("^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$", var.config.githubRepository)) &&
      can(regex("^[a-f0-9]{40}$", var.config.gitRevision))
    )
    error_message = "Environment, generation, repository and immutable revision must be explicit."
  }

  validation {
    condition = (
      alltrue([for id in [var.config.subscriptionId, var.config.tenantId, var.config.operatorGroupObjectId] : can(regex("^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}$", id)) &&
      !startswith(id, "00000000-")]) &&
      length(var.config.operatorCidrs) > 0 &&
      alltrue([for cidr in var.config.operatorCidrs : can(cidrhost(cidr, 0)) &&
      can(regex("/(2[4-9]|3[0-2])$", cidr))])
    )
    error_message = "Actual identities and narrow IPv4 operator CIDRs are required."
  }

  validation {
    condition = (
      var.config.acmeTermsAccepted &&
      can(regex("^[^@ ]+@[^@ ]+\\.[^@ ]+$", var.config.acmeEmail)) &&
      var.config.foundationBackend.key != var.config.environmentBackend.key &&
      var.config.foundationBackend.containerName != var.config.environmentBackend.containerName &&
      var.config.foundationBackend.storageAccountName == var.config.environmentBackend.storageAccountName &&
      var.config.foundationBackend.resourceGroupName == var.config.environmentBackend.resourceGroupName &&
      var.config.taxRate >= 0 && var.config.taxRate <= 1
    )
    error_message = "ACME consent/contact and distinct foundation/environment state keys are required."
  }
}

