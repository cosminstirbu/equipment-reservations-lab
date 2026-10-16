# Research: Local Administration Consoles

Date: 2026-10-15. Baseline: `9878407026878e966c0b442cd0f62f9f409f140d`.

## Installed integration selection

**Decision**: Use pinned Aspire.Hosting.PostgreSQL/RabbitMQ 13.6.1 APIs already referenced by AppHost. Local package XML confirms `WithPgAdmin<T>(..., Action<IResourceBuilder<PgAdminContainerResource>>, string)` and Rabbit `WithManagementPlugin(...)`; no package additions needed.

**Rationale**: Required owner choices; minimum change and existing parameter/network integration.

**Alternatives considered**: Custom container UI, pgweb, custom admin application and version upgrades rejected as outside accepted scope.

Sources: local NuGet XML at `~/.nuget/packages/aspire.hosting.postgresql/13.6.1/lib/net8.0/Aspire.Hosting.PostgreSQL.xml`, RabbitMQ equivalent, and [pinned Postgres source](https://raw.githubusercontent.com/dotnet/aspire/v13.6.1/src/Aspire.Hosting.PostgreSQL/PostgresBuilderExtensions.cs).

The pinned Postgres implementation registers a pgAdmin resource with an HTTP endpoint, health check, manifest exclusion and generated server-registration file. It disables separate console authentication and supplies the existing administrator credentials through generated internal configuration. It registers servers, so the bootstrap's three databases need no additional Aspire database resources. Generated configuration is secret-bearing and must not be copied into review evidence. Default console settings require no persistent volume.

## Development and publish isolation

**Decision**: Guard both integration invocations by Development environment AND run execution context. Keep normal Postgres/Rabbit resources untouched outside the guard.

**Rationale**: Rabbit management changes the broker image as well as adding an endpoint; excluding a pgAdmin resource alone cannot exclude that plugin at publish time. Assert actual generated publish model/output, not only the environment string.

**Alternatives considered**: Always enabled integrations with only external-endpoint flags rejected; those flags do not remove the plugin or assure local-only deployment.

## Host exposure

**Decision**: Use explicit proxied loopback endpoint configuration plus actual runtime binding validation on both proxy and backing publications.

**Rationale**: Existing AppHost uses TargetHost 127.0.0.1 and enabled proxy support for data services. Pinned hosting XML supports TargetHost, IsProxied, ExcludeReferenceEndpoint and WithEndpointProxySupport. Pinned [EndpointAnnotation](https://raw.githubusercontent.com/dotnet/aspire/v13.6.1/src/Aspire.Hosting/ApplicationModel/EndpointAnnotation.cs) and [DcpModelUtilities](https://raw.githubusercontent.com/dotnet/aspire/v13.6.1/src/Aspire.Hosting/Dcp/DcpModelUtilities.cs) confirm target binding/address concepts; the allocated displayed URL alone does not establish real runtime publication behavior. Host/runtime inspection is the decisive test, required before accepting no-login access.

**Alternatives considered**: Dashboard login as access control, hardcoded ports, wildcard publication and custom authentication proxy rejected. No accepted fallback weakens loopback-only access. If supported configuration fails, report a blocker.

## Test approach

**Decision**: Add focused real AppHost behavioral tests before wiring; retain existing application fixtures and real Rabbit topology contract. Supplement with actual browser workflows and listener/publication checks.

**Rationale**: The changed public behavior is orchestration and administration availability. Testing private builder helper arrangement would miss usable console access. Existing BrokerContractTests selects a single endpoint; its assumption requires a targeted repair when the new endpoint is introduced. Its isolated graph must also remove pgAdmin if it removes Postgres.

**Alternatives considered**: Broad new test framework, mocked SQL/broker tests and checks that only inspect dashboard health rejected. UI evidence cannot be replaced by direct admin SQL alone.

## Research limits

`aspire docs api search WithManagementPlugin --language csharp` and `WithPgAdmin` did not return useful output promptly. Web access retrieved pinned PostgreSQL/hosting source but Rabbit source retrieval failed; shell curl failed DNS in sandbox and the proposed escalated fallback was aborted. Local installed XML is authoritative API-shape evidence; coder must compile and check resulting management image/endpoint using the installed package. These failures do not establish runtime binding; that remains an explicit test gate. No product questions remain unresolved.

## SEC-005-D1: new console image security pin

**Decision**: Explicitly pin the newly introduced `pgadmin` resource to `dpage/pgadmin4:9.18.0` using supported `WithImageTag("9.18.0")` in the `WithPgAdmin` callback. Do not alter existing Aspire 13.6.1, PostgreSQL 18.6 or RabbitMQ 4.3.6 versions.

**Rationale**: Runtime observation identifies the integration default as pgAdmin 9.15. Official [9.16 release notes](https://www.pgadmin.org/docs/pgadmin4/9.18/release_notes_9_16.html) document CVE-2026-12048 involving stored XSS through database errors/EXPLAIN with credential-theft consequences. Official [9.18 release notes](https://www.pgadmin.org/docs/pgadmin4/9.18/release_notes_9_18.html) document later credential-redirection protections. Loopback exposure does not remove malicious-content risks within an administrator browser session. The new console image selection is a technical security repair within approved scope.

**Alternatives considered**: Retaining the vulnerable default is rejected. Upgrading the entire Aspire stack or existing data servers is unnecessary. No exception or human risk acceptance is proposed.

**Validation**: Before source pin, add an expected-failing configured-tag assertion; then check actual image/version and repeat affected first-start binding, no-login/database browser, console-recreation and publish/non-Development evidence on 9.18. Preserve older observations and completed task history explicitly as historical; final checks/reviews must cover the repaired revision.

**Registry verification**: Read-only `podman manifest inspect docker.io/dpage/pgadmin4:9.18` and `podman manifest inspect docker.io/dpage/pgadmin4:9.18.0` both exited0 on 2026-10-15 and returned matching linux arm64/amd64 image manifests. Select the concrete published tag `9.18.0`; arm64 child digest `sha256:6373d89ab2767c52875aee1aafd3731781abb4a5774f5633f7d9d8762efde536`, amd64 child digest `sha256:33eb7d070ee7500d1513453773f61df1256fdea08257d4a3f4aebd8cf1cc87cf`. This records availability, not a substitute for actual running-version and behavioral revalidation.
