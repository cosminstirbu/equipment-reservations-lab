# Identity and Access research — 2026-10-16

All initial technical unknowns resolved into the proposed plan; runtime compatibility and security assertions still require implementation evidence. Research performed by assigned architect because all five specialist slots are allocated; no extra agents spawned.

## Provider and hosting

Decision: Keycloak `26.8.1`, official Aspire hosting integration `13.6.1-preview.1.26506.6`, persistent volume and stable configurable loopback endpoint. Pin versions. The preview package is deliberately selected for local integration, not inferred to be stable from Aspire itself.

Rationale: existing stack has no provider; official integration supplies documented resources/readiness/secrets. [Official downloads](https://www.keycloak.org/downloads) lists server 26.8.1 and independently released JS 26.2.4. [NuGet package](https://www.nuget.org/packages/Aspire.Hosting.Keycloak/13.6.1-preview.1.26506.6) is preview; [Aspire integration](https://aspire.dev/integrations/security/keycloak/) documents AddKeycloak, data volumes and references. Verify exact package API with Aspire docs/API lookup before source edits. Aspire CLI API search was initiated; published official docs provide the current shapes.

Alternatives: external provider unnecessary for bounded local use; generic container would duplicate official integration plumbing; dynamic ordinary-run authority changes issuer ownership and is rejected. Keep existing AppHost ProjectResource APIs; no Project v2 migration.

## Repeatable provisioning

Decision: finite Admin REST bootstrap, generated persisted secret parameters, preserve subjects/passwords, reconcile exact clients/origins and roles, fail safely on unexpected privilege/account drift.

Rationale: [Keycloak startup import](https://www.keycloak.org/server/importExport) skips an already-existing realm, so import alone cannot update dynamic Web callback origins on restarts. [Admin REST](https://www.keycloak.org/docs-api/latest/rest-api/index.html) supports realm/client/user/role provisioning. Admin credentials reach only bootstrap, not APIs/Web. Fixed authority configured as described in [hostname guide](https://www.keycloak.org/server/hostname). Exact subjects remain opaque.

Alternatives: committed export with passwords rejected; deleting/recreating realm rejected; direct grant test shortcuts rejected. Owner performs initial volume reset; no schema compatibility/migration required.

## SPA handling

Decision: keycloak-js 26.2.4, code/S256, memory-only access/refresh tokens, no silent iframe reliance, generation-scoped responses and no write replay. 120-second token lifetime plus 5-second API skew bounds surviving-token validity to 125 seconds.

Rationale: [official adapter](https://www.keycloak.org/securing-apps/javascript-adapter) supports code flow/S256, memory retention and logout; cross-site-cookie restrictions make iframe logout detection unreliable. Clear private state locally on expiry/logout and signal other tabs without sending tokens. Its transient nonce/state/verifier callback bookkeeping is distinguished from persistent credential storage. Immediate callback URL cleanup, no callback logging and fragment response mode avoid authorization query strings in server diagnostics.

Alternatives evaluated: localStorage/sessionStorage/IndexedDB tokens extend theft/persistence exposure and are rejected. BFF with HttpOnly cookies reduces JavaScript token exposure but adds a session/proxy boundary and CSRF requirements to this existing SPA; unnecessary for confirmed local scope. Memory-only tokens remain exposed to active XSS: preserve Angular sanitization, no bypasses, narrow bearer attachment, exact callbacks and avoid token/global debug surfaces. Independent security review owns suitability verdict.

## API authority and service identity

Decision: built-in JwtBearer with strict exact issuer/audience/signature/expiry and explicit signed token type, authorized party and principal-kind. Human audience per API; service audience Inventory only. Client roles parsed from the expected client only; no flattening arbitrary realm roles into privileged service access.

Rationale: [Microsoft JWT guidance](https://learn.microsoft.com/en-us/aspnet/core/security/authentication/configure-jwt-bearer-authentication?view=aspnetcore-10.0) requires validation and distinct 401/403 handling. [Keycloak server administration](https://www.keycloak.org/docs/latest/server_admin/) documents service accounts, role scope and audience mappers. SPA token has all three intended API audiences; service token has Inventory audience and equipment.read only, Full Scope Allowed=false. ID token is rejected, not accepted merely because it is signed.

Alternatives: browser token forwarding rejected by dedicated-service requirement; static API key lacks requested provider authority; broad service roles rejected. Canonical framed issuer/subject hash avoids delimiter ambiguity and cross-service user registration coupling.

## Messaging permissions

Decision: topology bootstrap separated from workers, dedicated vhost and exact publish/consume regex permissions documented in contracts. Preserve actual confirm/ack/recovery operations and deny unrelated access.

Rationale: [RabbitMQ access control](https://www.rabbitmq.com/docs/access-control) describes configure/write/read permissions; queue.bind needs queue write and exchange read. Granting workers binding rights would unnecessarily widen permissions. The initially proposed HTTP API bootstrap is superseded below by core boot definitions import to preserve feature005 administration boundaries.

Alternatives: common administrator credentials rejected; declaring topology in each worker rejected. Permission-denial tests use fresh channels after broker channel exceptions.

## Dependency telemetry and resilience

Decision: official existing .NET HttpClient instrumentation for provider metadata/token and admin calls, DI backchannel, safe existing processor, no custom replacement dependency spans. Explicit budgets/no write retries in plan.

Rationale: [OpenTelemetry .NET HTTP instrumentation](https://github.com/open-telemetry/opentelemetry-dotnet-contrib/tree/main/src/OpenTelemetry.Instrumentation.Http) collects native .NET HTTP activities. [Keycloak native tracing](https://www.keycloak.org/observability/tracing) uses Quarkus OTel but documents session/token IDs and full login-event details; exporting it would require additional filtering and expand privacy scope. Application-side operation spans satisfy dependency evidence without provider internal export. Existing SQL and broker native registrations remain mandatory. [Microsoft resilience](https://learn.microsoft.com/en-us/dotnet/core/resilience/http-resilience) explains pipelines; keep deliberate bounded no-retry token POST rather than stack a default handler.

Alternatives: test-only ActivityListener evidence rejected; native provider raw session events rejected; custom HTTP spans duplicate supported instrumentation. Runtime span/exception privacy and negative-registration evidence remain required.


## Targeted transport clarification — 2026-10-16

Decision: replace the original literal HTTP issuer example with the allocated host-network scheme/host and default configured port 18080; preserve Aspire-managed developer TLS and strict issuer/certificate validation. Keep complete issuer and transport configuration stable on ordinary restart. Use explicit `KnownNetworkIdentifiers.LocalhostNetwork` for KC_HOSTNAME so container-context expression resolution cannot advertise an internal hostname. This corrects a design assumption; business scope, token validation, ownership algorithm and reset authorization are unchanged.

Evidence: installed Aspire.Hosting.Keycloak `13.6.1-preview.1.26506.6` nuspec identifies source commit `3751e615ad660621f2a7aa4c390ef48e08a0eed8`; its assembly contains WithHttpsCertificateConfiguration and SubscribeHttpsEndpointsUpdate. Installed Aspire.Hosting `13.6.1` XML documentation for SubscribeHttpsEndpointsUpdate states BeforeStart callbacks run when developer-certificate defaults or explicit certificate configuration enable HTTPS, without an isolated-mode restriction. Its EndpointReference/GetEndpoint overload documentation guarantees an explicitly selected network overrides requesting-resource context. [Official Keycloak integration source](https://github.com/microsoft/aspire/blob/main/src/Aspire.Hosting.Keycloak/KeycloakResourceBuilderExtensions.cs) corroborates run-mode certificate-driven promotion of primary endpoint scheme to HTTPS and target port 8443; current main is corroboration, not claimed byte-identical pinned source. [Keycloak hostname documentation](https://www.keycloak.org/server/hostname) supports the explicit full frontend URL. Runtime isolated-browser evidence reported by coordinator showed public HTTPS with an internal-host form action before explicit host-network correction.

Alternatives: disabling managed certificates merely to preserve old HTTP prose is rejected; inferring scheme from endpoint name is incorrect; accepting alternate issuers would violate ownership/validation. No publishing/deployment behavior is authorized. Normal-mode runtime verification and isolated browser issuer/form-action verification remain implementation evidence, not established by this read-only research. Targeted independent design re-review is required; preserve previous hashes/verdicts as historical evidence.


## Targeted broker import amendment — 2026-10-16

Decision: use RabbitMQ4.3.6 core boot definitions import and a pure BrokerBootstrap library called by AppHost container-file preparation; retain Development-only management image/listener. This is a technical amendment: requirements analyst confirmed006 FR-011 is result-based and FR-015 preserves005 FR-006. No product decision or005 policy relaxation; original review snapshots remain historical and targeted re-review is required.

[Official4.3 definitions documentation](https://www.rabbitmq.com/docs/definitions) supports local_filesystem import with definitions.local.path and skip_if_unchanged. Fresh import suppresses default-user/vhost creation; include administrator and `/` explicitly. [Pinned4.3.6 importer](https://github.com/rabbitmq/rabbitmq-server/blob/v4.3.6/deps/rabbit/src/rabbit_definitions.erl) processes users/vhosts/permissions before topology; permissions are set, existing queues/exchanges skipped. [Pinned user backend](https://github.com/rabbitmq/rabbitmq-server/blob/v4.3.6/deps/rabbit/src/rabbit_auth_backend_internal.erl) updates included existing password hashes/tags; don't extrapolate generic non-overwrite prose into preservation of every user field. Same persisted secrets/salts produce identical files; skip unchanged content avoids ordinary reapplication, and import deletes no unrelated resources. No global drift policing promised.

[Password algorithm](https://www.rabbitmq.com/docs/passwords) specifies four-byte salt, SHA256(salt || UTF8password), then base64(salt || digest). Explicit algorithm rabbit_password_hashing_sha256; each salt derives from independent persisted random material, never regenerated per startup. [Pinned schema](https://github.com/rabbitmq/rabbitmq-server/blob/v4.3.6/deps/rabbit/priv/schema/rabbit.schema) confirms the core configuration keys/backend aliases. Definitions contain hashes only, still sensitive.

Pinned Aspire.Hosting13.6.1 installed XML documents async WithContainerFiles before container start and explicit owner/group/mode. Use owner/group999, files0600 and new directories0700; [official image4.3 source](https://github.com/docker-library/rabbitmq/blob/master/4.3/ubuntu/Dockerfile) identifies account999; verify actual pinned image. [Aspire container files](https://aspire.dev/app-host/container-files/) limits dynamic injection to runtime/development. Run-mode callbacks resolve secret parameters into memory, no application-managed host file; inspect Aspire staging privacy rather than claiming secure erasure. Publishing must not resolve/serialize local hashes or claim production provisioning; preserve ordinary model and no admin endpoint. Production target-specific secret mounts require future design.

Rejected: unconditional management HTTP would expose API/UI together outside approved boundary. A new privileged container/bootstrap network or shell/rabbitmqctl secret command adds unnecessary attack surface. Core import needs no extra HTTP dependency, so replace broker admin-HTTP timeout/span promises with bounded local preparation/import readiness, safe correlated logs/outcome metrics and existing supported native AMQP dependency evidence. Tests must demonstrate boot/import failure blocks workers, unchanged restart preserves data/credentials and exact workload allow/deny operations. This amendment does not waive telemetry or negative privacy checks.
