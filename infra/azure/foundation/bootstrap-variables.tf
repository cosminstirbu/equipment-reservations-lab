variable "recovery_key_expiration_date" {
  description = "Reviewed fixed UTC recovery-key expiry, initially 365 days after creation; retained backup versions require usable unwrap authority before expiry."
  type        = string

  validation {
    condition     = can(formatdate("YYYY-MM-DD'T'hh:mm:ssZ", var.recovery_key_expiration_date))
    error_message = "Recovery key expiry must be a concrete RFC3339 timestamp."
  }
}

variable "network_gate_ready" {
  description = "Enable exact-record grants only after the human bootstrap has created and verified the operational DNS gate."
  type        = bool
  default     = false
}

variable "bootstrap_operator_object_id" {
  description = "Explicitly reviewed human bootstrap owner object ID; never inferred from the identity that creates a saved plan."
  type        = string

  validation {
    condition = (
      can(regex("^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}$", var.bootstrap_operator_object_id)) &&
      !startswith(var.bootstrap_operator_object_id, "00000000-")
    )
    error_message = "An explicit reviewed human operator object ID is required."
  }
}

variable "operator_secret_names" {
  description = "Canonical retained OIDC credential object names; values are secret names, never credentials."
  type        = object({ argocd = string, dashboard = string })

  validation {
    condition = (
      var.operator_secret_names.argocd == "argocd-oidc-client-secret" &&
      var.operator_secret_names.dashboard == "dashboard-oidc-client-secret"
    )
    error_message = "Operator credential source scopes must match the two approved retained secret names."
  }
}

