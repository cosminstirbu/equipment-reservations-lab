# Initial Docker publication repair

Scope: initial PostgreSQL and stable namespace-holder starts only. Hosted Docker 28.0.4 returned HTTP 500 while programming external connectivity, with `failed to listen on TCP socket: address already in use`; 49 Notifications cases could not initialize their assembly fixture. All other eight modules passed (492/541 overall). The precise kernel collision cause is unproven.

Quality approved the external Docker-start delegate boundary before implementation. Retain real PostgreSQL migration behavior during direct-delegation extraction; then verify observable success, bounded attempts, unchanged failure propagation and cancellation through faithful typed Docker API responses. No database substitute or application retry is introduced. Initial startup remains within its existing cancellation deadline. Only the exact documented networking/external-connectivity/listen error with HTTP 500 qualifies, for two total attempts and one cancellable 100–200ms jitter interval. Authentication, malformed responses, other failures and process restarts remain immediate failures.

Repeat safety: [Moby 28 start](https://github.com/moby/moby/blob/v28.0.4/daemon/start.go) initializes networking before creating/starting the process and resets/cleans failed startup. [Bridge publication](https://github.com/moby/moby/blob/v28.0.4/libnetwork/drivers/bridge/port_mapping_linux.go) releases partial mappings on error; its late listen failure occurs after its allocation retry loop. No side-effecting database command has run. The same Testcontainers instance retains its created container after a failed daemon start, permitting its initial StartAsync to be attempted again; no new resource or fixed port is allocated by test code.

Actual Docker 28 hosted validation remains required; local Podman success cannot establish resolution of the observed daemon failure.

## Red/green evidence (2026-10-20)

- Behavior-preserving direct delegation: `dotnet test --project tests/Persistence.Tests/Persistence.Tests.csproj --filter-method '*FirstRunCreatesSchemaSeedAndLedger*'` PASS 1/1, zero skipped, 3.393s.
- Before retry implementation: `dotnet test --project tests/Persistence.Tests/Persistence.Tests.csproj --filter-class '*ContainerStartupTests'` reported test exit 2: 14 total, 4 failed, 10 passed. Intended failures were first eligible collision propagation, only one attempt on repeated collision, and missing cancellation handling before startup/after collision. The negative response cases already passed. The capture shell itself returned zero because its final command displayed a log tail; the test failure is preserved explicitly here.
- After bounded retry: complete `dotnet test --project tests/Persistence.Tests/Persistence.Tests.csproj` PASS 29/29, zero skipped, 4.759s. This includes actual PostgreSQL provisioning/migrations and all 14 Docker boundary cases. Runtime: local Podman, `TESTCONTAINERS_RYUK_DISABLED=true`, machine socket discovered with `podman machine inspect`. Owned containers cleaned through fixture disposal.
- An earlier combined class+method filter selected zero tests (exit 8); it was discarded and replaced by the complete module run above.
- Exact-file formatter completed after each edit. Scoped style check found IDE0007 and JSON002; explicitly changed the local declaration to `var` and payloads to equivalent raw strings. Final raw-literal-only edit awaits coordinator global build/style/check; no result is claimed for an unrun check. `git diff --check` PASS.
- Installed Testcontainers 4.16.0 implementation inspected directly: StartAsync acquires/releases its lifecycle lock; UnsafeCreateAsync returns for the existing created container; UnsafeStartAsync disposes any prior attached stream before repeating daemon StartAsync. A failed daemon start does not dispose/remove the fixture object. This supports retrying this narrow pre-process failure on the same instance.

Frozen source SHA256:

```text
460ceaf81f9374df3d0e8757d3a8f2d20fe5162f093dcf97d6ae3d3241274447 tests/TestSupport/ContainerStartup.cs
6875bc2768cbc73dd5c4355deb509a2c9109ca531f8b04e3b3fc3dfb9871989c tests/TestSupport/PostgresFixture.cs
fbe3bd093218a0077952a8c2c7e43878313edb4e2da9038a961ed92e259fb1f7 tests/TestSupport/StableContainerPorts.cs
0aef067ef18627c122294aa2d0d590d22c4695884fc646d87fb5e07b6083d0ef tests/Persistence.Tests/ContainerStartupTests.cs
```

No claim of actual Docker collision reproduction or hosted closure is made. Independent reviews and actual Docker 28 hosted quality validation remain coordinator-owned pending gates.

Final analyzer correction: raw literals alone did not satisfy JSON002. Explicit `/*lang=json*/` annotations identify the four valid JSON payload literals, following the [Microsoft diagnostic guidance](https://learn.microsoft.com/en-us/visualstudio/ide/reference/json002). Payload bytes and assertions are unchanged. Parent reruns all required checks on these final bytes; earlier failed style checks are not passes.

## Owner-authorized fourth repair round: bind variant

Hosted revision `ca76649`, run `39420693665`: 525/555 passed, zero skipped. Of 30 failures, 27 IdentityBootstrap cases could not initialize the shared identity fixture. Their trace is `ContainerStartup.StartAsync` line14 -> `IdentityProviderFixture.InitializeAsync` line28: namespace holder initial publication, before constructing Keycloak at line29. The new typed500 response uses the same networking/external-connectivity prefix but ends `failed to bind host port for 127.0.0.1::172.17.0.15:8080/tcp: address already in use`. Existing exact-listen classification correctly did not match it.

The remaining three failures are distinct: two IdentityAccess cases timed out at Npgsql TCP connection during Inventory migration (PostgresFixture line85); one Broker core-import case reset its consumer AMQP handshake after restart at BrokerImportTests line45. This extension does not establish closure of those failures. Integration passed. Runner daemon remained Docker28.0.4; its reported kernel was7.0.0-1017-azure.

Owner authorized the additional round; quality approved the narrow external seam and classifier before edits. The only new recognized shape is literal loopback publication `127.0.0.1::`, canonical numeric IPv4 target, port1..65535, and exact `/tcp: address already in use` ending beneath the existing full networking prefix. Malformed addresses/ports, UDP, permission errors and wrong statuses remain immediate failures. Existing listen recognition, two total attempts, original deadlines and initial-only callsites remain unchanged.

Primary-source repeat safety: Moby28 bridge `bindTCPOrUDP` lines616–620 produces this bind variant. Error defers close the socket (588–592), release allocator reservations (496–502), and close previous partial bindings (505–523); outer addPortMappings cleanup remains99–105. Daemon network setup still precedes process start. Unlike the late-listen variant, dynamic bind errors already pass through Docker's own finite allocation attempts (446–461). One outer reattempt is repeat-safe, but neither proves the underlying kernel collision cause nor guarantees recovery.

Test-first: added the exact captured variant to recovery, repeated-failure and cancellation behavior tests before classifier changes; added wrong-status, permission, invalid IPv4/port and UDP negative cases. `dotnet test --project tests/Persistence.Tests/Persistence.Tests.csproj --filter-class '*ContainerStartupTests'` reported exit2:23total,3intended variant failures,20passed,0skipped,3.641s (capture-shell tail returned0, test failure explicitly retained). After implementation, complete Persistence module command passed38/38,0skipped,5.645s against real local Podman PostgreSQL. Actual Docker hosted validation and the three separate failures remain pending coordinator gates. No application/Npgsql/restart retry or budget change was made.

Round4 final source frozen after exact formatter/readback and `git diff --check` PASS. Scoped suggestion-level verification found JSON002 on new literal fixtures; added explicit JSON language annotations without changing payload bytes. Coordinator global lint/check must verify final snapshot. Final SHA256:

```text
3509d2382feb16dcfef9f00204ef28b0df3bdecf5015c781f7c2f7388caf2f3f tests/TestSupport/ContainerStartup.cs
cdfc394e00ba9cf23a597ab8afe0143ea4ac770212e4d83a423ea9f473289bb0 tests/Persistence.Tests/ContainerStartupTests.cs
```
