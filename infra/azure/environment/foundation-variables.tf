variable "foundation" {
  description = "Validated retained foundation output projection; no secret values or credentials."
  type = object({
    workload_resource_group_name = string
    dns_zone_name                = string
    dns_zone_resource_group_name = string
    github_client_ids            = map(string)
    github_principal_ids         = map(string)
    operation_role_ids           = map(string)
    approved_operator_object_ids = set(string)
    vault_guard                  = object({ definition_sha256 = string })
  })
}

variable "workload_secret_scopes" {
  description = "Canonical per-workload Key Vault object allowlists derived from scripts/azure-runtime.mjs workloadSecrets; values are names only."
  type        = map(set(string))

  validation {
    condition     = contains([15, 18], length(var.workload_secret_scopes)) && alltrue([for names in values(var.workload_secret_scopes) : length(names) > 0 && alltrue([for name in names : can(regex("^[a-z][a-z0-9-]{1,126}$", name))])])
    error_message = "Provide every canonical workload's nonempty explicit secret-object allowlist; wildcard permissions are forbidden."
  }
}



