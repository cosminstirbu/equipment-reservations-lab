# OpenAPI and interactive API documentation

Applies to application HTTP API contracts, generated documentation, and interactive
API testing. Read with [ASP.NET Core](aspnet-core.md), [testing](testing.md),
[observability](observability.md), [resilience](resilience.md), and
[Aspire](aspire.md). This guide defines the approved requirements; it does not claim
that OpenAPI support is already implemented.

## Generation and contract ownership

Required: use built-in ASP.NET Core OpenAPI generation for all application business
HTTP endpoints, with OpenAPI 3.1 JSON documents. Inventory, Reservations, and
Notifications are in scope. Exclude health and other operational endpoints.

Minimal API endpoint definitions and their C# request/response contracts must be the
authoritative source of the generated documents. Add explicit endpoint metadata or
document transformers where inference is insufficient, including handlers that read
requests manually or return untyped results. Do not maintain a separate handwritten
OpenAPI document. Feature contract documents still describe intended behavior; generated
documents must agree with them and the implemented API.

Each business operation must have a unique, stable operation ID, a useful summary,
and tags that group related operations. Describe parameter locations, required inputs,
request and response schemas and media types, expected status codes, validation errors,
authentication requirements, and required roles or permissions. Document actual wire
behavior, including middleware-produced errors and empty authentication/authorization
responses. Do not label every error as Problem Details when the API does not return it.
Do not change API behavior solely to simplify schema generation.

Publish the same business-operation document regardless of the viewer's permissions.
Describe access requirements clearly; the API enforces them when a request executes.

Sources: [ASP.NET Core OpenAPI generation](https://learn.microsoft.com/en-us/aspnet/core/fundamentals/openapi/aspnetcore-openapi?view=aspnetcore-10.0)
and [endpoint metadata](https://learn.microsoft.com/en-us/aspnet/core/fundamentals/openapi/include-metadata?view=aspnetcore-10.0).

## Interactive development access

Required: each service must serve its document at runtime and provide Scalar as its
interactive UI. Make each service's UI discoverable through the Aspire dashboard.
Use browser-reachable service endpoints under the [Aspire guide](aspire.md#apphost).
A combined API portal is outside the initial scope.

Both document and UI endpoints must be mapped only in Development by default.
Enabling either in another environment requires an explicit owner-approved decision
about exposure and access controls, recorded in the implementation plan.

The UI must authenticate through a dedicated public Keycloak documentation client,
using authorization code flow with PKCE S256 and no client secret. Register explicit
allowed development redirect URIs and origins. Preserve existing human identity,
role, and API audience rules; do not bypass authentication, weaken authorization,
or relax browser-write protections for interactive documentation.

Send interactive API requests directly to the service hosting the UI, using the
developer's identity and permissions. Do not use an external request proxy. Configure
the identity provider's allowed origins for its browser token exchange deliberately.
Do not persist authorization across browser sessions, and disable Scalar's AI agent.
Keep credentials and tokens out of committed configuration; apply the existing
[telemetry privacy requirements](observability.md#instrument-behavior) to this flow.

The UI executes real operations against the running development environment, including
reservation creation and cancellation. Developer instructions must explain that these
actions change development data and describe how to sign in and test permitted and
forbidden operations.

Source: [Scalar ASP.NET Core integration and OAuth configuration](https://github.com/scalar/scalar/blob/main/documentation/integrations/aspnetcore/integration.md).

## Verification

Required: automated checks must verify document validity, coverage of expected business
operations, request/response contracts and status codes, security metadata, and the
absence of operational endpoints. Check the expected contract rather than merely
asserting that document generation succeeds. Verify that both document and UI endpoints
are available in Development and unavailable outside it under default configuration.

Use service HTTP entry points with the production routing and metadata retained, following
the [test boundary and design-record requirements](testing.md#test-design-and-review).
Existing API behavior tests remain responsible for business correctness; document checks
do not replace authentication, authorization, validation, or business-behavior coverage.

A browser smoke test must cover the UI login and an authenticated API call. Include a
representative write to verify compatibility with browser-write protections, and verify
permission-denied behavior without weakening those protections. Keep automated browser
tests within the [application test boundary](testing.md#automated-application-boundary):
do not construct, inspect, or run an Aspire AppHost in them. Verify dashboard discovery
links and local orchestration manually under the existing
[local development procedure](../../README.md#manual-local-development-check).

## Implementation planning and deferred scope

Plans must record compatible pinned package versions, document and UI routes, operation
IDs and grouping, missing endpoint metadata, Keycloak client names and configuration,
development redirect/origin handling, and the tests and manual evidence for this guide.
Follow the linked guides for identity-dependency resilience, telemetry, and test design
rather than treating documentation tooling as exempt from those requirements.

The initial scope does not require Angular client generation, breaking-change checks
against a saved schema baseline, build-time document export, published schema artifacts,
or a combined portal. Revisit document-version compatibility when selecting Angular
generation tools. These deferred capabilities require a separate planning decision.
