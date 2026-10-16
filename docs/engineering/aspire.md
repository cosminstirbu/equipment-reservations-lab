# .NET Aspire

Applies to local development orchestration. Aspire connects the application; it does not
choose its business architecture or require multiple backend services.

## AppHost

Required: wire the Angular client, ASP.NET Core services, and required local dependencies
through AppHost. Declare dependency relationships and readiness explicitly rather than
relying on startup delays. Configure service endpoints through resource references and
configuration rather than hard-coded localhost ports.

Keep orchestration code separate from business logic. Document prerequisites, startup,
and how developers access the client, APIs, and dashboard when the application is created.
Secrets must stay outside committed configuration. Browser requests cannot resolve
server-side service-discovery names: provide a browser-reachable API endpoint or a
local development proxy, with deliberate CORS configuration where needed.

Source: [AppHost](https://aspire.dev/get-started/app-host/).

## Service defaults

Prefer shared service defaults for OpenTelemetry, health checks, service discovery,
and HTTP client setup. Keep this project limited to operational configuration.
Inspect generated defaults: the standard resilience handler must be adjusted to our
retry policy before it is used for operations with side effects.

Required: distinguish liveness from dependency readiness. A remote dependency outage must
not automatically imply the process is dead. Review health endpoint exposure outside
local development; generated mappings may be development-only.

Source: [C# service defaults](https://aspire.dev/get-started/csharp-service-defaults/).

## Tests and versions

Automated application tests do not construct, inspect, start or publish AppHosts.
Backend.Tests uses service factories and real provider containers independently of
Aspire. Verify local startup, dashboard/client/admin access, loopback bindings and
persistent state manually with [the documented procedure](../../README.md#manual-local-development-check).
Local wiring regressions may first surface during development. Neither dashboard
health nor successful startup replaces application/provider acceptance checks.
Manifest generation and cloud deployment through Aspire are outside this policy.

Pin a compatible Aspire version at setup. Aspire evolves independently from the .NET
runtime; do not assume matching major version numbers are required.
