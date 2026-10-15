# Quickstart and Validation: Book and Cancel Equipment

This is the planned validation guide; implementation must make these commands/scenarios true and update README with actual output before completion. No authentication/authorization/user isolation: one visible `demo-user`, trusted local workstation only.

## Prerequisites and start

Use committed .NET SDK 10.0.301, Node 24.15.0/npm 11.12.1, Aspire 13.6.1 and a running Podman machine. PostgreSQL 18.6 and RabbitMQ 4.3.6 images plus NuGet/npm dependencies must be available. On macOS, start Podman if necessary with `podman machine start`.

```sh
npm ci
npm --prefix src/Web ci
dotnet restore EquipmentReservation.slnx
export ASPIRE_CONTAINER_RUNTIME=podman
dotnet run --project src/AppHost
```

AppHost startup must provision persistent volumes, stable external secret parameters, three separately credentialed databases, versioned migrations and deterministic seed records automatically. Initial secret provisioning must use AppHost user-secrets/generated supported secret parameters persisted outside Git; implementation documents exact supported setup and must not require committed passwords. Use printed loopback Web/dashboard URLs; no hard-coded API ports. APIs wait for successful migration but SPA/booking never wait for broker-dependent readiness. Inspect resources/logs if bootstrap fails; never skip failed provisioning.

## Full journey

1. Screen displays demo-user and local-only scope. Equipment includes operational Demo Camera/Laptop and non-operational Demo Projector; repeated startup does not duplicate/overwrite seeds.
2. Choose camera and a future interval, inspect visible timezone/offset, check advisory availability, then book. Status immediately Confirmed even if broker is unavailable. A missing matching inbox event displays not-yet-observed delivery, separately from saved reservation.
3. Refresh history; note identifier, dates/status and confirmation event. Create an overlapping booking: clear conflict, no new record. Adjacent intervals/different items are allowed. Invalid/equal/reversed/past times and non-operational/unknown item are safe errors.
4. Cancel a future Confirmed booking; status becomes Cancelled and history stays. Repeat cancellation (also via API after original start in controlled-time tests): same record, no extra event. Rebook released interval. Confirmed at/after start rejects cancellation.
5. Refresh inbox: one confirmation and one cancellation entry, stable event IDs and original occurrence times. No automatic browser push/poll is needed. Notification load failure never erases a saved booking.

## Persistence and recovery

Ordinary service/AppHost restart reuses volumes and stable secrets. Equipment, reservation/outbox history and inbox survive. With broker stopped, book/cancel must still commit; restore broker and check one inbox per event within 60s of actual broker readiness. With consumer stopped, broker queues persist messages; restart consumer and refresh inbox. Automated tests additionally cover publication/ACK crash windows, duplicate delivery, concurrent requests and isolated credential rejection. Do not validate outage by deleting volumes or change committed credentials.

A permanent contract/configuration publication fault remains an unpublished Pending event and requires developer repair rather than automatic retry. Its `next_attempt_at` is parked at finite UTC `9999-12-31T23:59:59.999999Z` across worker restarts. After fixing the underlying fault, use the Reservations-only database credential to explicitly set next_attempt_at to current UTC for the identified still-unpublished EventId; preserve event payload/ID and reservation history. This is infrastructure repair, not a new screen action. If a known permanent own-database authentication/permission/schema/catalog fault prevents opening/selecting the outbox or saving retry metadata, the affected worker instead stops with a safe permanent-error signal; repair the database configuration/privileges/schema, then explicitly restart that service. Do not assume an inaccessible database event was parked. A permanent inbox database fault similarly stops the consumer without ACK; after repair/restart it redelivers with durable duplicate suppression. Existing records/events remain unchanged. Transient broker/consumer/database outages and uncertain provider outcomes recover through the existing bounded policy and do not need this permanent-fault repair path.

Explicit developer data reset is destructive and separate from ordinary startup: stop AppHost, identify its exact named PostgreSQL/RabbitMQ volumes from Podman, remove only those identified volumes after an explicit reset decision, restart using the documented stable secrets. README implementation must list actual volume names and warning that equipment/reservations/events/inbox are erased. No reset command runs automatically.

## Automated and human checks

```sh
npm run format-check
npm run lint
npm run check
```

Check includes real smoke/database tests; missing Podman/images are pending prerequisites, never skipped passes. With AppHost running, use printed Web URL and installed Chromium/Edge:

```sh
export API_WEB_URL='<printed loopback Web URL>'
export BROWSER_EXECUTABLE='/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'
npm --prefix src/Web run test:browser
```

Run transitive vulnerable-package audit and inspect actual sockets/Podman mappings: database, broker, API, dashboard, OTLP and Web listeners must stay loopback. Negative credential tests prove each service cannot connect to the other service databases. Capture correlated booking/cancellation/conflict/controlled outage telemetry and inspect no secrets/bodies or identifier metric dimensions.

Record manual keyboard/focus/status review for changed journey and preserved hello; automated keyboard/axe alone does not close required manual review or old Q-001. Coordinator records commands, environment, exits/results and frozen revision, reviewer verdicts and latest convergence. Human final feature acceptance remains necessary.
