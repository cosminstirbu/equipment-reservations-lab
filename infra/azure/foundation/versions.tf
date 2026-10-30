terraform {
  required_version = "= 1.17.0"

  backend "azurerm" {
    use_azuread_auth = true
  }

  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "= 5.11.0"
    }
    azuread = {
      source  = "hashicorp/azuread"
      version = "= 3.10.0"
    }
  }
}

