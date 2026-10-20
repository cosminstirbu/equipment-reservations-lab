# Research and decisions — 2026-10-19

## Generator and package compatibility

Decision: Microsoft.AspNetCore.OpenApi 10.0.13, Scalar.AspNetCore 2.18.0, Microsoft.OpenApi 2.12.2; validate exact restore and locks before implementation. These are stable .NET 10 compatible versions. OpenAPI.NET 3.x is outside the generator dependency range. Retain existing unrelated package/SDK pins.

Rationale: approved built-in generator + Scalar; no Swashbuckle/NSwag or build-time export needed. Sources: [Microsoft package/dependency metadata](https://www.nuget.org/packages/Microsoft.AspNetCore.OpenApi/10.0.13), [Scalar package](https://www.nuget.org/packages/Scalar.AspNetCore/2.18.0), [Microsoft metadata](https://learn.microsoft.com/en-us/aspnet/core/fundamentals/openapi/include-metadata?view=aspnetcore-10.0).

## Scalar callback and local privacy

Decision: explicitly configure callback to each service `/oauth/callback`, register exactly those URLs and origins. Use response_mode=fragment, PKCE S256, persistAuth=false, agent disabled, proxy unset, local JS and no default CDN fonts. Never use a guessed Swagger oauth2-redirect.html path.

Rationale: official Scalar source resolves default callback from origin+pathname and supports callback credentials in query or hash; a dedicated inert callback avoids the full Scalar UI router mutating an authorization-code fragment (confirmed during real sequential login). OAuth state is paired with the same component as code. Official ASP.NET integration serves package-local assets and redirects `/scalar` to `/scalar/`. The pinned 2.18.0 bundle mutated a code fragment when the full UI was used as callback; the dedicated minimal callback preserves the same supported polling/state/S256 flow without loading that router. Fresh browser/provider evidence is required after repair.

Sources: [callback resolver](https://github.com/scalar/scalar/blob/main/packages/api-client/src/v2/blocks/scalar-auth-selector-block/helpers/resolve-default-oauth2-redirect-url.ts), [callback parsing](https://github.com/scalar/scalar/blob/main/packages/api-client/src/v2/blocks/scalar-auth-selector-block/helpers/oauth-callback.ts), [integration](https://github.com/scalar/scalar/blob/main/documentation/integrations/aspnetcore/integration.md), [ASP.NET routes](https://github.com/scalar/scalar/blob/main/integrations/dotnet/aspnetcore/src/Scalar.AspNetCore/Extensions/ScalarEndpointRouteBuilderExtensions.cs).

## Identity integration

Decision: dedicated equipment-docs public standard-flow client, same allowed human roles/audiences and principal_kind mapper, explicit narrow azp admission. API user key remains issuer+subject. Reuse reconciliation and production telemetry/resilience policies; no new privileges or API CORS. Validate all callback inputs before provider mutation and replace stale callback/origin lists per run.

Rationale: code inspection finds IsHuman currently admits only equipment-web, so provisioning a client alone cannot work. BrowserWriteGuard already permits canonical loopback origins; changing it would be unnecessary and prohibited. Dynamic Aspire proxy endpoints exist before process readiness, avoiding a bootstrap wait cycle. Alternative wildcard redirects, hard-coded API ports, weakening azp and borrowing the web client were rejected.

## Test boundary and trade-offs

Decision: production WebApplicationFactory contract checks plus real Keycloak contracts, existing manually targeted Playwright UI tests, manual Aspire dashboard/trace evidence. Real provider and browser are necessary for CORS, popup and PKCE claims; raw token-exchange tests alone cannot prove UI behavior. No AppHost in automated tests. Avoid a new browser-host runner unless existing manually started service workflow proves insufficient; permitted manual startup remains explicit.

Rationale: repository testing policy and approved feature scope. Existing fixtures replace external authority only in narrow HTTP metadata tests; real provider contracts establish fidelity. No new storage behavior requires new database abstractions. No unknown product decision remains; pinned callback/security behavior remains a mandatory implementation validation item, not assumed evidence.
