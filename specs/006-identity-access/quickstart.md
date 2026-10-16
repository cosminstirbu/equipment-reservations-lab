# Identity and Access validation guide

This is the planned validation procedure; commands and actual results belong to implementation evidence. Implementation must update README with finalized secret parameter names and startup details.

## Prerequisites/startup

Use repository-pinned .NET/Node, running Podman, root/frontend npm dependencies and restored packages. Owner manually deletes old local volumes before first new-schema startup; agents/startup/tests never delete operator volumes. No pre-production migration exists. Keep fixed local Keycloak authority port (default 18080), allocated loopback hostname and transport/certificate configuration unchanged across ordinary restarts. Read the actual issuer URL from provisioned runtime configuration: Aspire-managed developer TLS can promote the endpoint named `http` to HTTPS. Do not construct an HTTP issuer from the endpoint name or disable certificates to match an example. The browser, provider KC_HOSTNAME and APIs must use the same exact allocated host-network URL. Isolated tests may use random ports but retain one complete issuer across their restart scenario.

```sh
npm ci
npm --prefix src/Web ci
dotnet restore EquipmentReservation.slnx
aspire start --apphost src/AppHost/AppHost.csproj --non-interactive
```

AppHost prepares protected broker core definitions before broker boot, starts persistent provider/database/broker, completes identity/database provisioning then APIs/Web. The broker HTTP console remains local Development only; other local run environments use core import without management exposure. Generated hashes/configuration never belong in README or captured output. Open allocated Web URL from Aspire; do not invent ports. Four usernames: employee-a, employee-b, approver, equipment-staff. Retrieve one intended parameter from AppHost's user-secrets using the documented local operator retrieval command, never bulk-list/log secrets. Expected parameter names: employee-a-password, employee-b-password, approver-password, equipment-staff-password; bootstrap admin and service secrets stay operator-only. README must provide the concrete filtered retrieval procedure once implemented. Public SPA has no secret.

## Behavioral scenarios

1. Signed out: protected data absent; direct protected API without bearer returns 401. Sign in via real Keycloak as employee-a; inspect explicit account/actions and exact code+PKCE callback.
2. Browse/check future interval/book/refresh own history; inspect durable confirmation and asynchronous own inbox. Cancel before start; history retains Cancelled, availability released, repeated cancellation creates no second event.
3. Sign out then employee-b: no A state reappears, even when A's request resolves late. Foreign A GET/cancel is same 404 as unknown; B lists/inbox exclude A. Forged body/query/header owner input yields 400 with no effects.
4. Approver/staff browse/check availability/view own inbox; all reservation paths 403. Valid explicitly combined-role test allows Employee operations without cross-user authority.
5. Expire session, cancel/fail login, interrupt write, switch account and try logout with provider unavailable. Clear private state, recoverable messages, no replay; authenticated history resolves uncertain result. Test cross-tab clear signals. Already-issued token may remain valid at most 125 seconds after issuance including skew; logout ends login session independently.
6. Real service credentials can read Inventory and cannot use human reservation/inbox routes; missing/invalid/insufficient authority fails and dependent booking writes no record/event.
7. Verify both Rabbit accounts required/denied operations, outage/recovery, delayed delivery after logout and duplicate delivery recipient isolation. Restart normally; identities/subjects/credentials/data/pending messages remain. Never reset volumes for this check.

## Checks/evidence

```sh
npm run format-check
npm run lint
npm run check
npm --prefix src/Web run test:browser
```

Browser checks need running AppHost and its API_WEB_URL plus installed browser executable as documented in README. Real-provider tests use isolated provider state, not password grants or operator accounts. Record intended red/green tests and actual command/environment/status/revision, including real provider contracts, authenticated browser journey, axe and manual keyboard/focus/status outcomes. Inspect exported production HTTP/SQL/broker spans for success/failure/correlation/privacy; confirm invalid metadata/token authority does not leak raw provider errors. Capture representative Aspire traces without credentials, access tokens, login codes or session details. Independent reviews/convergence and final human acceptance remain separate pending gates.


## Broker boot/import boundary

Core import is part of local run startup, not an extra operator command. Repeated starts with the same persisted passwords/salt material keep credentials, ACLs, topology and messages. Validate actual runtime file owner/mode and boot success without printing definitions/hash material; malformed import or unreadable file must block workload readiness with safe diagnostics. Verify ordinary non-Development model/run has no management HTTP endpoint and publishing excludes console/plugin exposure and local generated secret/hash files. Model inspection is not production deployment readiness: target-specific production secret delivery remains outside this local feature. Do not enable management outside Development to repair import. Do not rotate salts/passwords, purge resources or delete volumes as recovery.
