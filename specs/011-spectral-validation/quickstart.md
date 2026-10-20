# Validate OpenAPI documents

From the repository root, install the existing pinned .NET SDK, Node/npm and running Podman prerequisites described in [README](../../README.md). No running Aspire application is required.

```sh
npm ci
npm --prefix src/Web ci
dotnet restore EquipmentReservation.slnx
```

Use the README's Testcontainers environment for your Podman host (`DOCKER_HOST` and any documented rootless setting). First-time restore/image acquisition needs network access; validation rules themselves are local after installation.

```sh
npm run check:openapi
npm run test:tooling
npm run format-check
npm run lint
npm run check
```

The focused command builds/runs the three existing HTTP document contract test classes with isolated real PostgreSQL. The full command retains frontend, tooling, build/analyzer and complete backend checks, requiring its existing RabbitMQ/Keycloak/container prerequisites as well.

Expected: all three generated documents have zero warnings/errors and existing C# contract assertions pass. A warning alone fails. Diagnostics identify service, rule and JSON path/location; metadata changes belong in C# generation sources, never in saved schema exports. Missing prerequisites or tool errors are failures requiring correction, not skips.

Validation evidence must include actual-tool warning and error rejection, malformed/empty input, internal references, blocked external references, existing contract regression detection and focused/full command failure propagation. Preserve red-first evidence before fixes and final passing output with tested revision in team records. CI creation and schema export remain deferred. Final independent reviews and explicit human acceptance are separate completion gates.
