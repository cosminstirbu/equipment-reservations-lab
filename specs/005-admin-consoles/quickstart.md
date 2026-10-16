# Validate Local Administration Consoles

## Prerequisites

Use repository-pinned .NET/Node dependencies, running Podman, existing development secret storage and a supported local browser. Follow root README setup. Never remove the application's named data volumes to enable the consoles. Validation mutations must use isolated temporary infrastructure/objects.

## Automated checks

Before wiring, run new focused AppHost tests and record their expected failures for missing consoles and required isolation. After implementation run the same focused tests, existing broker/persistence/role tests and full checks. From repository root:

```sh
dotnet test tests/Smoke.Tests --filter FullyQualifiedName~AdminConsoleTests -m:1
npm run format-check
npm run lint
npm run check
```

Missing runtime/dependencies, skipped tests and timeout failures remain pending, never pass. Record exact revision, exit codes and any required environment variables; do not record credentials.

## Normal startup and UI verification

Start through the project's Aspire lifecycle workflow using exact AppHost `src/AppHost/AppHost.csproj`. Open current dashboard links; never depend on fixed port numbers. Both consoles start automatically. Verify the configured/running pgAdmin image is `dpage/pgadmin4:9.18.0` before its first-start binding gate and browser use. Re-run affected model/publish, binding, browser/database and recreation checks on this image; 9.15 evidence remains historical only. Obtain RabbitMQ's existing credentials using the final README's secure retrieval instructions; values remain only in local memory/UI.

1. Confirm unauthenticated Rabbit administration fails, then sign in normally. Create unique disposable exchange/queue/binding, maintain an isolated consumer, inspect all these and messages, publish a test message, inspect/get it and purge the test queue. Confirm effects and clean up only those objects.
2. Open pgAdmin without separate login, manual registration or database password entry. Expand the generated server and inventory/reservations/notifications. Browse real tables and run a simple query in each. In each database create a unique disposable table/schema, insert and edit a row, inspect results, delete rows and drop objects. Record credential-free outcomes.
3. Recreate only pgAdmin through the supported lifecycle workflow. Reopen its link and confirm automatic access to all databases without restored settings. Capture state preservation evidence using isolated infrastructure; do not delete owner volumes or rotate passwords.

## Exposure and publish verification

Inspect actual Aspire proxy listeners and Podman port publications for BOTH interfaces, including backing ports and IPv4/IPv6. Save a minimal redacted list of port/address bindings; do not save raw container inspection with environment secrets. All bindings must be loopback; wildcard/non-loopback bindings fail. Attempt bounded direct access through discovered non-loopback host addresses and backing ports; all fail while loopback HTTP succeeds. A displayed localhost URL alone is insufficient.

Generate local deployment manifest/model output using the installed Aspire testing/publishing API or CLI manifest publisher; this is artifact generation only, never deployment. The implementer must record the exact supported command/API and inspected output. Confirm no pgAdmin, management endpoint or broker management image change; ordinary Postgres/Rabbit/app resources remain. Build a non-Development run model and confirm the same console absence.

## Retained behavior and final evidence

Confirm original volume names, secret-store identity and application account restrictions remain unchanged. Existing real persistence/role/booking/messaging-recovery and telemetry/privacy tests must pass with consoles enabled. Review new docs/logs/evidence for secret leakage. Coordinator records tested revision, independent quality/security reviews and convergence; final owner acceptance remains a separate gate.
