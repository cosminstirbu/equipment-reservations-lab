resource "azurerm_dns_a_record" "browser" {
  for_each = toset(["app", "identity", "argocd", "dashboard"])

  name                = each.key
  zone_name           = data.azurerm_dns_zone.application.name
  resource_group_name = data.azurerm_dns_zone.application.resource_group_name
  ttl                 = 300
  records             = [azurerm_public_ip.ingress.ip_address]
  tags                = local.tags
}
