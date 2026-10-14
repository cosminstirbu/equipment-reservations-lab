# Local validation quickstart

Prerequisites: .NET SDK 10.0.301, Node 24.15.0/npm 11.12.1, running Podman (tested host 6.0.2); pinned Aspire packages restore with the AppHost. No Docker Compose or database setup. Network access is needed for first restore and image pull. Angular 22.2.2, OpenTelemetry exporter 1.19.1 and instrumentation 1.19.0 are pinned; restored package lockfiles and exact versions are recorded in delivered README.

From repository root, start the single local procedure:

```sh
export ASPIRE_CONTAINER_RUNTIME=podman
dotnet run --project src/AppHost
```

AppHost restores/installs the locked client dependencies, starts one ephemeral RabbitMQ and the three APIs plus SPA, and prints the dashboard URL/token. Open the loopback Web resource link. Expect Demo Camera, click Send hello, then expect a GUID and “Hello received for Demo Camera”. A second send returns a different GUID. Stop AppHost with Ctrl+C; state is transient.

Required automated checks after implementation:

```sh
dotnet build
dotnet test tests/Backend.Tests
dotnet test tests/Smoke.Tests
npm --prefix src/Web ci
npm --prefix src/Web run build
npm --prefix src/Web test -- --watch=false
```

Smoke.Tests starts isolated AppHost resources and verifies real HTTP→HTTP→RabbitMQ→Notifications lookup with a bounded deadline. It fails with a prerequisite/dependency diagnostic when runtime or any link is absent. The final README supplies exact implemented command/options if tooling requires adjustments.

Validation also records: unknown equipment rejection with no publish; Inventory/broker unavailable clear error; missing notification leaves pending within 30 seconds; no polling after destroy/result; TTL/cap eviction; axe screen checks and manual keyboard/live announcements; one successful correlated OTEL trace and failure metrics; `podman port` plus host listener evidence demonstrating loopback only. Do not capture broker credentials or dashboard tokens in committed evidence.

Troubleshooting: start the Podman machine if stopped; check resource readiness/logs and first-restore network access; use printed resource references rather than guessed ports. After a broker outage restart AppHost (automatic recovery intentionally disabled). A notification timeout may require a new deliberate Send hello. A failed publish deadline may already have delivered, so do not interpret an error as proof of zero delivery. Restarting clears state; this app is local-only with no identity or persistence.
