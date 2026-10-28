# ACME email privacy clarification

Status: proposed bounded generator change; independent preparation review required.
No real email value is reproduced, logged or committed by this proposal.

Pinned cert-manager1.21.3 [ACMEIssuer API source](https://github.com/cert-manager/cert-manager/blob/v1.21.3/pkg/apis/acme/v1/types_issuer.go)
and the vendored CRD in deploy/platform/azure/certificates/controller/cert-manager.yaml
explicitly make email optional. The recommendation text mentions expiration messages,
but [Let's Encrypt ended that service](https://letsencrypt.org/2025/01/22/ending-expiration-emails.html)
on June4,2025; its [current notice](https://letsencrypt.org/docs/expiration-emails/)
confirms shutdown. Thus examples containing email do not make it a schema requirement.

Select omission of spec.acme.email for BOTH generated staging and production
ClusterIssuers. Remove acmeEmail from the public/sanitized generator input tuple and
generated projection; private operator configuration may retain it solely for backward
input compatibility but it is never serialized into committed manifests/output snapshots
or failure messages. Do not substitute a fake/personal/placeholder address. Enforce
reviewed ACME directory allowlist, actual terms agreement/account-key proof and DNS01
solver unchanged; account URI/key checksum recovery remains required, not email matching.
Remove any acceptance assumption that Let's Encrypt will email expiry alerts; existing
renewal/certificate readiness/served-trust monitoring remains the actual evidence.

Source/native tests prove generated no-email issuers validate against the pinned CRD,
no contact appears in projection/errors, both issuer account recovery remains compatible
and exact TLS/secret inventories unchanged. Actual staging issuance/renewal/account
reconciliation is still required before live acceptance. This adds no service/cost or
notification replacement and changes no user identity or authorization policy.
