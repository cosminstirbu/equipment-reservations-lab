# Research: Local API metadata

## Supported metadata

Decision: use Description attributes on model/property declarations and existing path parameters, with endpoint-specific operation transformers for remaining operation details. Rationale: built-in framework ownership matches the approved guide. Alternatives: XML documentation needs generator/project changes; centralized property dictionaries duplicate ownership; binding new query/body parameters risks behavior changes.

Evidence: [Microsoft metadata reference](https://learn.microsoft.com/en-us/aspnet/core/fundamentals/openapi/include-metadata?view=aspnetcore-10.0) documents positional record property Description targets, parameter descriptions, and declarative response descriptions. [Transformer reference](https://learn.microsoft.com/en-us/aspnet/core/fundamentals/openapi/customize-openapi?view=aspnetcore-10.0) documents endpoint-specific AddOpenApiOperationTransformer; installed Microsoft.AspNetCore.OpenApi 10.0.13 XML contains the API. Retrieved 2026-10-20. Type-level attribute surfacing must be verified through generated HTTP output; narrow attribute-reading bridge permitted only if needed.

## Inference gaps

Decision: retain narrow ReservationInput schema correction; remove its prose overwrite and all reservation operation-ID dispatch. Rationale: nullable strings support custom validation/error outcomes while valid input requires three non-null strings and rejects extra properties. Alternatives: Required/new validation/binding could change runtime outcomes and are excluded.

Decision: retain shared framework ProblemDetails descriptions and security configuration. Rationale: framework model declarations cannot carry application-owned attributes; dynamic code/field extensions and shared OAuth/server configuration are central concerns. Alternatives: custom error DTO or new security-marker abstraction expand scope and risk structural changes.

## Accurate prose

Decision: document existing behavior only: reservation status Confirmed/Cancelled; cancellation time/event ID nullable before cancellation; interval end excludes overlap boundary; availability advisory does not reserve; timestamps explicitly offset with at most six fractional digits and start before end/not past; ownership enforced by APIs. Rationale: metadata must describe actual validators/store and current HTTP results. Alternatives: inferred new business constraints/enums/examples rejected.

No unresolved product decision, dependency upgrade, trust boundary or new resilience/telemetry integration remains.
