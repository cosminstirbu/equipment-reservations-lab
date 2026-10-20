# Data model

No persistent entities, migrations, or business state transitions change. Existing EquipmentItem, Reservation, Availability and InboxEntry remain the source of response schemas; ReservationInput remains the parsed write contract.

Documentation configuration contains a validated authority, fixed public client ID equipment-docs, exact per-service callback URI ending `/oauth/callback`, and derived exact origin. Three callbacks are allocated by orchestration per run and reconciled into one Keycloak client. No credentials or tokens are configuration defaults. Existing identity provisioning settings gain an optional callback collection for compatibility with preexisting isolated tests.

Generated documents contain operations, schemas and authorization metadata, not account-specific state. Runtime UI authentication is memory scoped; it must not restore access/refresh tokens from persistent storage in a new browser session. Browser writes use existing reservation state transitions and ownership keys unchanged.
