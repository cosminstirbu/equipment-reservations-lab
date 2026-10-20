# Production images

Build from repository root. Docker Buildx automatically uses each Dockerfile's
adjacent `.dockerignore`. When invoking Podman explicitly, pass the matching
`--ignorefile deploy/images/NAME.Dockerfile.dockerignore`; do not send an unrestricted
repository context. No build argument accepts credentials.

| Image | Dockerfile | Build argument |
| --- | --- | --- |
| inventory | api.Dockerfile | PROJECT=Inventory |
| reservations | api.Dockerfile | PROJECT=Reservations |
| notifications | api.Dockerfile | PROJECT=Notifications |
| database-bootstrap | bootstrap.Dockerfile | PROJECT=DatabaseBootstrap |
| identity-bootstrap | bootstrap.Dockerfile | PROJECT=IdentityBootstrap |
| broker-bootstrap | bootstrap.Dockerfile | PROJECT=BrokerBootstrap |
| web | web.Dockerfile | none |

Use `--platform linux/amd64,linux/arm64` for the separately authorized release.
Pinned base references identify researched multiarchitecture indexes; a Dockerfile
alone does not prove the resulting application index has been built or published.
Bootstrap images retain ASP.NET runtime because shared provider/application projects
reference that framework. Every final image uses an explicit numeric nonroot user.

The frontend builds optimized Angular assets with fixed public HTTPS identity
configuration. Its nginx listener is HTTP 8080 behind the TLS ingress. Supply a
writable ephemeral `/tmp` (16 MiB minimum) and a read-only root filesystem. Application
service DNS names are inventory, reservations and notifications on port 8080.
Readiness can request `/` with Host `app.equipment.test`; no public health route is
added. Only the runtime-contract service routes are forwarded. Host is canonical,
Origin is preserved for the API guard, forwarded headers are replaced, and retries
are disabled. Connection timeout is 5 seconds; send/read timeout is 15 seconds.
Access logging is disabled and error logging restricted to critical events to avoid
recording authorization callback query parameters.

Run `node --test scripts/deployment-routing.test.mjs` separately with working Podman.
Hosted Linux CI can set `CONTAINER_RUNTIME=docker` for the same test command.
It sends raw HTTP through the production nginx config with nonroot/read-only runtime,
using isolated real Node HTTP upstreams as transport-boundary doubles. It verifies
static navigation/assets, service paths and queries, forwarded-header replacement,
wrong-host rejection, operational-path denial and raw encoded-path rejection. It does
not establish real API authorization, browser login, TLS ingress or deployment smoke.
