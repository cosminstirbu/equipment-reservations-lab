# Confirmed scope — 2026-10-16

Owner: human owner. Final confirmation: “I confirm the scope.” This authorizes the feature team to implement; it is not acceptance of finished work.

The original feature request is Identity and Access integrated into Book and Cancel. Confirmed interview decisions override its migration requirement:

- Local Keycloak, administrator-provisioned two Employees, Approver only, Equipment Staff only. Registration, password recovery, MFA and production deployment workflows outside scope.
- All authenticated humans browse equipment, inspect boolean availability without booking details, and view own notifications. Employee required for own booking/create/list/read/cancel. Additional roles additive only by explicit assignment; no implicit cross-user permissions.
- Owner will delete local volumes. No deployed pre-production environment; old demo data disposable. No migration, reassignment, legacy-event/contract compatibility or agent deletion of volumes. Normal subsequent startup/restarts preserve data.
- Replace demo contracts and update behavior tests and docs. No tests solely asserting absence/removal of demo code.
- Logout clears app state and ends Keycloak session; existing short access tokens may remain valid until expiry, explicitly accepted.
- Expiry/account changes clear previous user data; no automatic write replay. Uncertain operations recovered by refreshing own history.
- Routine technical decisions autonomous, with browser storage risk evaluation and independent reviews. Preserve booking, persistence, concurrency, outbox/inbox guarantees. Narrow HTTP service identity and RabbitMQ permissions. No tokens in events/logs or committed credentials.
- No merge/deploy/publish/external messages/issues authorized.
