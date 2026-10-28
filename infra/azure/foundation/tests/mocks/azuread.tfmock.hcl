mock_resource "azuread_application" {
  defaults = {
    client_id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
    object_id = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
    id        = "/applications/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
  }
}

mock_resource "azuread_service_principal" {
  defaults = {
    object_id = "cccccccc-cccc-4ccc-8ccc-cccccccccccc"
    id        = "/servicePrincipals/cccccccc-cccc-4ccc-8ccc-cccccccccccc"
  }
}
