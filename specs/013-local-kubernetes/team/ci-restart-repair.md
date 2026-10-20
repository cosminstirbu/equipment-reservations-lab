# Hosted CI restart repair

Scope: the three restartable provider fixtures, one shared namespace/port owner, and existing real-provider restart contracts. Coordinator owns task state and review verdicts. No production pipeline, outbox timing, PostgreSQL fixture budget, scheduling policy or application assertion is relaxed.

## Failing evidence and test design

Hosted run 39412807716, Docker Engine 28.0.4, failed after actual provider stop/start because fixtures cached daemon-assigned ephemeral ports before stopping. Reported cascades include 35 Notifications, 18 Identity, one Broker and 11 Integration failures. This is the intended existing real-provider red evidence. Local Podman retains these mappings and does not reproduce Docker's remapping; a local green is not evidence that the Docker defect is closed.

Retain real RabbitMQ/Keycloak, production import/provisioning, exact issuer/audience/roles, durable storage and live HTTP/AMQP clients. Extend existing restart tests to preserve original endpoints and, for identity, an already-created application host; observe genuine service unavailability during stop, then recovery against original addresses. No double, solitary parser test, arbitrary free-port probe or assertion weakening is introduced. Actual hosted Docker green remains required.

## Reviewed infrastructure design

Independent quality and security reviewers passed the namespace-holder design provisionally. A dedicated per-fixture container keeps its daemon-allocated random loopback publications alive for the fixture lifetime. The actual provider shares only that container's network namespace, stops and starts normally, and publishes no independent ports. All cached AMQP, management and exact issuer addresses come from the holder once. It forwards no traffic and runs no provider; therefore readiness and outage observations still reach the actual service.

Use the existing approved immutable multiarchitecture PostgreSQL image index, docker.io/library/postgres@sha256:74935e72241653ca55e0414067e6d8763aceb8a810eb51b452253ec3dcfc4336, overriding its entrypoint to /bin/sleep infinity. It runs no database process and receives no credentials, bind mounts or Docker socket. Use a nonroot user, no capability elevation, daemon-assigned ports and loopback HostIP. Start holder before backend, dispose backend before holder and attempt holder cleanup even if backend disposal fails. All partially initialized resources follow the same cleanup order.

The supported Testcontainers 4.16 create-parameter modifier sets HostConfig.NetworkMode to container:<owned holder ID>; it does not look for an arbitrary free port or patch daemon state. Keycloak's existing HTTP readiness strategy must evaluate the holder's mapped address and require actual /realms/master success, not merely holder-running state. RabbitMQ's internal listener/import and authenticated management readiness remain real.

Primary references: [Docker container networking](https://docs.docker.com/engine/network/#container-networks), [Docker 28.0.4 port configuration](https://github.com/moby/moby/blob/v28.0.4/daemon/container_operations.go), [Docker 28.0.4 restart](https://github.com/moby/moby/blob/v28.0.4/daemon/restart.go), [Testcontainers 4.16 lifecycle and mapped ports](https://github.com/testcontainers/testcontainers-dotnet/blob/4.16.0/src/Testcontainers/Containers/DockerContainer.cs), [Testcontainers HTTP wait](https://github.com/testcontainers/testcontainers-dotnet/blob/4.16.0/src/Testcontainers/Configurations/WaitStrategies/HttpWaitStrategy.cs), [Testcontainers container configuration](https://dotnet.testcontainers.org/api/create_docker_container/). Docker's restart implementation itself performs stop/start; replacing the tests' explicit outage interval with that call would not establish the required stable endpoint behavior.

## Implementation and focused checks

Implemented StableContainerPorts and integrated it into ReservationDeliveryFixture, BrokerAccessFixture and IdentityProviderFixture. Holder runs as UID/GID 999 with all capabilities dropped, owns only random loopback publications, and retains the existing immutable image pin. Actual provider initialization, imports, permissions, login and stop/start remain unchanged. Cleanup independently attempts backend, holder and any fixture database disposal in that order. Keycloak's readiness still requires the real HTTP endpoint through the retained publication.

Existing contracts were extended before fixture edits. Core broker import now observes real AMQP unavailability and uses original publisher/consumer authority after restart, while retaining durable-body and permission-denial assertions. The existing protected-files case also verifies genuine management/AMQP outage and recovery through the original HTTP client and scoped connection. Identity provisioning observes real HTTP unavailability and retains exact original issuer, subjects and passwords. The service identity case creates its real application host before the provider restart and then acquires/validates authority through that original host. The existing live Notifications consumer restart case is retained without edits.

`dotnet build EquipmentReservation.slnx -m:1 -warnaserror` passed with zero warnings/errors. Initial compile feedback identified nullable Docker model members, explicit type style and a colliding test-local variable; these were corrected without suppressions. Exact-file formatter/readback, scoped suggestion-level style verification and `git diff --check` passed on the frozen source. Only logical spacing changed after the focused runtime checks.

Environment: macOS arm64, .NET 10.0.301 and the existing rootful Podman runtime. Commands used the normal documented Docker-compatible socket and TESTCONTAINERS_RYUK_DISABLED=true. Each command used `dotnet test --project <project> --no-build` with the following MTP method filters; raw test output was captured privately and only sanitized summaries displayed:

| Project | Method filter | Result |
| --- | --- | --- |
| BrokerBootstrap.Tests | `*CoreImportRetains*` | 1/1 passed, 22.852 seconds |
| BrokerBootstrap.Tests | `*ImportedProviderFilesAndPublished*` | 1/1 passed, 38.404 seconds |
| IdentityBootstrap.Tests | `*RepeatedProvisioningPreserves*` and `*RealClientCredentialsIssue*` | 2/2 passed, 40.389 seconds |
| Notifications.Tests | `*InboxOrdersSubMillisecondEvents*` | 1/1 passed, 33.412 seconds |

All focused runs exited 0 with zero skips. These establish genuine outage/recovery and preserved original clients/authority on Podman. They do not reproduce or close the Docker remapping defect. The coordinator owns full required checks, independent final review and actual hosted Docker 28 regression green.

## Frozen source SHA256

- StableContainerPorts.cs: 74062f2ae85a60dbf59cf25248a356e3bcbd688051a4356aa183307f2675a24c
- ReservationDeliveryFixture.cs: 6b938017b2c49381d3be3d95dc3d101b09c1566fb8dfe768af338ac087675d3f
- IdentityProviderFixture.cs: 9831491f7bdd78a07648238bd343410b95dcebc377fe02fbe099508bdd13bf34
- BrokerAccessFixture.cs: 2a732a01aa5a836575dc833a00aa981f9b3c39bf8f4ac89f10553ec2406118bf
- BrokerImportTests.cs: c316c469d5b26ff6600b866133dc4cad19d3d14d31aead536cbc177fef867d93
- IdentityProviderTests.cs: a4bacf5260a2f39c4ba29af850fe1f7d64bff27c6d142c8bf7d0047fb4f2a0eb
- ServiceIdentityContractTests.cs: 96bc111c1aaf5226e9a7f325267e36d54a13cdd475346622cd6349df4ae60c0f
