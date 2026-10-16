# Identity contract

## Provider/clients

Realm equipment; issuer is the actual allocated host-network Keycloak endpoint URL plus `/realms/equipment`, with stable configurable host port `18080` by default. Aspire-managed developer TLS may promote the endpoint named `http` to HTTPS; retain managed TLS and use the resulting exact scheme/loopback host/port consistently for KC_HOSTNAME, browser configuration, provisioning and API validation. KC_HOSTNAME uses an explicitly localhost-network endpoint reference, preventing container-network hostname rewriting. Keep transport/certificate configuration and the entire issuer unchanged across ordinary restarts. Tests use isolated allocated ports/realms and preserve the identical issuer throughout each persistence scenario. A changed scheme/host/port is a different identity environment, never an issuer-validation exception. Development loopback HTTP metadata is allowed only for an actually HTTP authority; HTTPS certificate validation and strict metadata security otherwise remain enabled.

| Client | Kind | Audience/authority |
| --- | --- | --- |
| equipment-web | Public code+S256, no secret/password/implicit/offline | inventory-api, reservations-api, notifications-api; signed principal_kind=human; azp=equipment-web |
| reservations-service | Confidential client credentials only, Full Scope Allowed=false | inventory-api only; signed principal_kind=service; azp=reservations-service; client role equipment.read belonging to inventory-api |
| inventory-api / reservations-api / notifications-api | Resource/audience definitions, interactive/service issuance disabled | API roles/mappers only |

Exactly four requested local humans: employee-a/employee-b → Employee; approver → Approver; equipment-staff → EquipmentStaff. No default Employee role or future workflow grants. Human role mapping reads only documented realm role grants; non-Employee roles never imply Employee. Explicit multiple role assignment grants only the union.

Every API validates RS256 signature/discovery keys, exact issuer, its audience, expiry and signed payload typ=Bearer with maximum 5 seconds skew. Require valid subject; API ID token misuse fails. Human and service principal policies additionally validate azp/principal_kind, not username conventions. Access token lifespan 120 seconds; post-logout residual bound 125 seconds. Never accept supplied owner headers as identity.

Exact allocated Web root redirect/logout URI and exact Web origin registered per startup, no wildcard. Bootstrap uses privileged Admin REST, preserves opaque subjects/passwords, fails unexpected privilege drift. Public `/auth-config.json` contains only issuer/realm/clientId. Local credentials live in persisted generated secret parameters and are individually retrieved by documented operator procedure.

## Session behavior

Explicit login; fragment callback processed and URL cleaned before protected UI/telemetry. Nonce/state and enforced PKCE; adapter tokens memory-only. Invalid/cancelled login shows recoverable sign-in state. Expiry or refresh failure clears private state, no automatic write replay; bounded still-valid refresh only before explicit action. Logout clears app state then ends Keycloak session using logout URL captured before token removal. Provider logout failure is visible and retryable. Other tabs receive only a clear-session signal. Every protected response is gated by active session generation and expiry. Account change cannot display old responses.
