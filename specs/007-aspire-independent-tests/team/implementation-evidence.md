# Implementation evidence

## T001 — baseline and environment

- Date: 2026-10-16 (owner timezone Europe/Bucharest).
- Accepted source baseline: `e1952952e82aa1a32e79285923db68f26f995aed`, main, clean working tree before feature007.
- Prior accepted baseline validation/reviews: `specs/006-identity-access/team/run-state.json`, validation/review reports referenced there; preserved without edits. Those historical checks do not validate this refactor.
- Podman is running: `podman info --format '{{.Host.Arch}}'` exit0, arm64.
- Docker-compatible socket inspected from running Podman machine: `unix:///var/folders/6k/z9rq_rsj7gj5ghmy_rx43nzh0000gp/T/podman/podman-machine-default-api.sock`.
- Local supported Testcontainers setting: `TESTCONTAINERS_RYUK_DISABLED=true`; fixture disposal required, no skipped prerequisite passes.
- Node/.NET/package/image versions remain committed versions; no upgrades authorized.
- Runtime/session operations owned by coordinator; source/test migration owned by coder; historical supersession owned by analyst; verdicts owned by independent reviewers.
- Obsolete full Aspire suite not rerun merely for baseline. Baseline40-method108-case inventory is frozen in research.md; focused baseline runs permitted if useful.
- Final current-source required checks and review evidence remain pending.

## Coder evidence

Pending assigned implementation.

## Coder implementation evidence — T002–T014, T017

Baseline `e1952952e82aa1a32e79285923db68f26f995aed`; implementation performed with `SPECIFY_FEATURE_DIRECTORY=specs/007-aspire-independent-tests`. No extension hooks file exists. Prerequisite skill command resolved exact feature directory and required design/tasks; both checklists passed28/28. Existing ignore configuration covers generated output/dependencies/secrets. No runtime `src/` diff, dependency/image upgrades, concurrent test execution, staging or commits.

Implemented: complete40-method/108-case coverage mapping with exact final executable names and mixed-assertion resolutions; assembly-wide serialization retained; migrated real delivery/provider tests; production-definition Testcontainers broker fixture and complete denial/import/privacy contracts; actual three-service WAF recovery with real provider human/service authentication, scoped stores, exact immutable outbox/queued envelope/inbox/history/ledger/state assertions and unrelated legacy sentinel. Deleted the resolved obsolete Smoke project/helpers/package, simplified quality runner to one Backend invocation, updated contributor/manual boundary guidance and only obsolete provider-test wording in AGENTS. Applied writing-for-agents skill to that wording; analyst separately owns historical notices.

Environment: .NET SDK10.0.301, Node24.15.0, Podman6.0.2. Container test invocations below use `DOCKER_HOST=unix:///var/folders/6k/z9rq_rsj7gj5ghmy_rx43nzh0000gp/T/podman/podman-machine-default-api.sock TESTCONTAINERS_RYUK_DISABLED=true`. All fixture providers/images use pinned existing versions. No required test skipped.

### Commands/results

- `npm run format -- <exact edited source paths>`: PASS after each shell source write, re-read afterward. Initial sandbox attempt failed .NET build-host named-pipe permission denied; rerun outside sandbox passed. Subsequent .NET formatter/build/test commands executed unrestricted for required local pipe/socket access.
- `dotnet restore tests/Backend.Tests --force-evaluate -m:1`: PASS, existing-version direct BrokerBootstrap/IdentityBootstrap references and Backend lock updated; production lockfiles unchanged. Initial sandbox restore was superseded by unrestricted successful restore.
- `dotnet build tests/Backend.Tests --no-restore -m:1`: PASS, zero warnings/errors after explicit IDE/CA fixes.
- Initial focused test invocation omitted required Podman environment and was interrupted by SIGINT to only its exact parent PID9761; exit1, no pass claimed. Its fixture containers were confirmed cleaned before the correct run.
- With required environment: `dotnet test tests/Backend.Tests --no-build -m:1 --filter 'FullyQualifiedName~Broker|FullyQualifiedName~DatabaseProvisioning|FullyQualifiedName~IdentityProvider|FullyQualifiedName~ServiceIdentityContract|FullyQualifiedName~ReservationOutbox|FullyQualifiedName~ReservationConsumer|FullyQualifiedName~BookingRecovery'`: PASS86, failed0, skipped0, exit0, duration3min. Subsequent strengthening/partial-start cleanup means this is incremental evidence, not final full-gate approval.
- With required environment: `dotnet test tests/Backend.Tests -m:1 --filter 'FullyQualifiedName~BookingRecovery|FullyQualifiedName~IdentityProviderTests'`: PASS8, failed0, skipped0, exit0, duration47s. Validates final exact absent-consumer inbox rows, recovery histories/envelopes and all-four-account continuity/metadata authority assertions.
- With required environment: `dotnet test tests/Backend.Tests -m:1 --filter FullyQualifiedName~ServiceIdentityContractTests`: PASS2, failed0, skipped0, exit0, duration8s; final source build clean. Explicit real provider restart/reconcile precedes new Inventory-only service-token acquisition with stable credential; wrong credential remains safely rejected.
- `npm run test:tooling`: PASS4, failed0, skipped0, exit0. Final quality command uses existing synchronous run failure propagation and single Backend test project; async parallel runner and spawn import removed.
- `rg -n 'Smoke.Tests|Aspire.Hosting.Testing|Projects.AppHost|DistributedApplicationTestingBuilder|ResourceCommands|PublishManifest' tests scripts EquipmentReservation.slnx README.md docs/engineering AGENTS.md`: zero matches. Normal solution AppHost build remains; historical agreements intentionally retain original references with supersession.
- `git diff --check`: PASS, exit0. `git diff --stat -- src`: empty. Existing fixture collections remain, assembly DisableTestParallelization=true.

Full `npm run format-check`, `npm run lint`, `npm run check`, manual local observations, independent reviews and convergence are coordinator-arranged next gates, not self-approved here. No missing/unavailable check is marked passed. Implementation source writes stopped at this handoff; later source changes invalidate affected evidence.

### Handoff source manifest

SHA256 of following JSON including trailing newline: `0d9e5d1342a6f648f12da54560a6a3cafa7a4a17e8e6e7b0ce18f1159fd690a9`. This identifies the complete Backend source plus owned tooling/guides at handoff; focused commands above identify their differing incremental scopes. Coordinator must capture final frozen source and full current checks independently.

```json
{
  "AGENTS.md": "d596543cb6ed5851f4d31256dd889c416d392b198c75115b41541a8e53033dcb",
  "EquipmentReservation.slnx": "5c8be11c94f9d6156b8cfae4a1f995197dcb98c7c3b2da3af594949eecf6bf67",
  "README.md": "dce728b69b044329e959a76397510e2f879630b6986de3b90de466e6690b5abd",
  "docs/engineering/aspire.md": "e95ef24b0d1b56a8a2be86ff16ec081fcf60bc7140f68331ccd90304b114ca3a",
  "docs/engineering/formatting-and-linting.md": "4828af632d12309c5492596ee4799719cc49b3f4c8dd68b7835526f74b578e24",
  "docs/engineering/testing.md": "6e0aa41f3f802c3f62f7eb6537203ebbb3a761493e4b9702b3ecddd4543244d5",
  "scripts/quality.mjs": "e1b1055b23c6813b7cb3646eb49e3b9ce224ca55de65365ce4e09174defcbe43",
  "tests/Backend.Tests/AssemblyInfo.cs": "3f7edd72eac91614fcf49f709dd4e560c74ebef8da68a53a02947e5611cd1869",
  "tests/Backend.Tests/Backend.Tests.csproj": "d6ea7d2988444b143b77e0d1ff88f6be8e24b96f38638420361e96fe2cd77ef2",
  "tests/Backend.Tests/BookingConcurrencyTests.cs": "372f5fec0dafe00dd44f02d218b3d0ebf8f1216077539f4b593a794a3918de87",
  "tests/Backend.Tests/BookingRecoveryFixture.cs": "39d9c8851b7c1e4e4b32b96b3946b1451d3e61a867d5aad1bbb72b5c6067e54d",
  "tests/Backend.Tests/BookingRecoveryTests.cs": "898136cd83447c26cd3579bf0161bf9f0527a1e785a09ea27cff4ea6e099cd33",
  "tests/Backend.Tests/BookingScenario.cs": "2410081a89f7f23b5b33117807f5bc398180922aa5a4fdc719968cdaf8048b5d",
  "tests/Backend.Tests/BookingTelemetryTests.cs": "3bb1880eb5f6a48066a362c60ec224c080e48bf201210aab84c678314f7e1c90",
  "tests/Backend.Tests/BookingTests.cs": "0e16f8e304fa287cc4a457d05fcc53706a1e064238e93342e78082c6dca25215",
  "tests/Backend.Tests/BrokerAccessFixture.cs": "94d3d9105f851732df3886bb639d45e96475b43d18c41b155b2e83c63058b94f",
  "tests/Backend.Tests/BrokerContractTests.cs": "a471f3e020c057c3c0e87994a2788fbb69c01a7f03e8feed315fcdd591a781f3",
  "tests/Backend.Tests/BrokerImportTests.cs": "7585f8a69ee19284f08aebfb05f8eea4872a535f84a8383905df3243a33dad74",
  "tests/Backend.Tests/CancellationConcurrencyTests.cs": "78bb595072a687f751f573660b45d71f99477f98088da08ad863fe29272d79ba",
  "tests/Backend.Tests/CancellationTelemetryTests.cs": "bcac98b687bed21925da9c650c2b555ff17425d37b91bb7833c3e872eefd39a2",
  "tests/Backend.Tests/CancellationTests.cs": "722f3889cfd01c511b8f23bd33708906a47cd3386ecdbfdeb0b2c3d37bb66dbd",
  "tests/Backend.Tests/DatabaseBootstrapTracingTests.cs": "3f091abf1ef6bad94b999703d35c03a53d7055a6e308794d1191374cba05d33c",
  "tests/Backend.Tests/DatabaseProvisioningTests.cs": "97c2094a17d8af59797cb52b12e3e6758fc752f8a157688da14349b0878df6cd",
  "tests/Backend.Tests/DatabaseTelemetryCapture.cs": "112b16ffc3dcf7f252417c78a05d7b27ee7123ba8db08beaf2885ddce2e5cf04",
  "tests/Backend.Tests/DatabaseTelemetryPrivacyTests.cs": "1c07e91997be8b21b4d39399fb87fe36e783549bbf77f34d9f91d4fead6fcc94",
  "tests/Backend.Tests/DatabaseTracingTests.cs": "10627cf543084a2e581ea1cd997b4812d79f5480cfdf81418c7bacab0cb997cd",
  "tests/Backend.Tests/DatabaseWorkerTracingTests.cs": "f82d95f00f3caef534b9bd3f778eb92934251b3bc31dc77dbcf84c57ddbba240",
  "tests/Backend.Tests/EquipmentPersistenceTests.cs": "48612dcad3054e7b971ed7fb98db8f25ed45184e0dcb6ba3d350c457d45bb541",
  "tests/Backend.Tests/IdentityAccessTests.cs": "ddd19bbf7c0a7c8686fcf91cbcb05fe8896058bf4ed95f4e8319671db38377a0",
  "tests/Backend.Tests/IdentityAuthorityFixture.cs": "a2dd368597a1ea586cfab0c01f4e381a306045cf43d3e77e0d4c0c6b8a41e229",
  "tests/Backend.Tests/IdentityProviderFixture.cs": "5d1f9675f442c0bf5e5a9b296d4e36f733b622ca8d933bd1943859fbb34093fa",
  "tests/Backend.Tests/IdentityProviderTelemetryTests.cs": "b2646aa34895855f3855acd4defb339a658a1fe838c3272f9f90513721e04734",
  "tests/Backend.Tests/IdentityProviderTests.cs": "887d2b240c0ea08ced01a24683d9e2da55fcc53c0231e9496a8313e7f5b6120d",
  "tests/Backend.Tests/IdentityTelemetryTests.cs": "e20d92265379d020201c0c3c2eafc87c1c65e341ed242fcc2f055ebb6dd234ac",
  "tests/Backend.Tests/InventoryTests.cs": "105733eb07886cc428152efd7a4678d070435f23a567f7d82c98ae0b62028727",
  "tests/Backend.Tests/MigrationTests.cs": "da353a6dc884cb7421434062b8e614633411ee3c4f412cd2c1735bc7ab6fd538",
  "tests/Backend.Tests/NotificationOwnershipTests.cs": "af4bd47ad5dd1f6b0323f79cc900aad15113ba9e05a271beae1c2c37d7f24ee9",
  "tests/Backend.Tests/OperationalTests.cs": "25a8739135a063b0b70c7bba9053d4422ccb664df37845d15b5de2c5804976a9",
  "tests/Backend.Tests/OtlpMessage.cs": "f7bbfd29615a8a80e124768217761877088f37c8a4a4e5ed929a3ba51aee0de8",
  "tests/Backend.Tests/OwnershipInputTests.cs": "d708a0fdb41b0e9eeb287f7b5e65e04212c50e2a4f13541cfabe3374ed6cb5dc",
  "tests/Backend.Tests/PostgresFixture.cs": "c9d9d667b493b25f7d8089f66be6dc995a048db2aff2ea1cbd7ef8a5c3d1137e",
  "tests/Backend.Tests/ReservationConsumerTests.cs": "96507441b738afaf3f53b9df54e0936dd6cd136419f5b12da7f76ac4b3e28505",
  "tests/Backend.Tests/ReservationDeliveryFixture.cs": "4d6cccbde59b586f3fbc95245402f4e90529c5416ebfa27d1d47751f87f82ebd",
  "tests/Backend.Tests/ReservationOutboxTests.cs": "d06813363e41cbc977298ada3b316d6ee10c8f002a662e348d996dcefa0599fa",
  "tests/Backend.Tests/ReservationOwnershipTests.cs": "668be845929eaa7459a55ac034830834baec1dd8f4c25d0bbab8777bf7c64b6a",
  "tests/Backend.Tests/ReservationRecoveryTests.cs": "0146125be039f688075fcfdc37593fe0dc1ac873af178bf13e7d5a1391fe2af9",
  "tests/Backend.Tests/ReservationTelemetryTests.cs": "d1b4af9d8512054504f2d8310102125b66a4b8a06357eee8c07538a132b82939",
  "tests/Backend.Tests/SecurityBrowserWriteTests.cs": "738a9800595fa17fcc8659beb99ca8095814c7b0bf72c7b7076c6df6ae14c1d4",
  "tests/Backend.Tests/ServiceIdentityContractTests.cs": "a6d2c09de4c635d7e9a598360bc025829e75986301a5f4acba6a78861fe36786",
  "tests/Backend.Tests/ServiceIdentityTests.cs": "5ed2f9d61cb0134e5a8bcb90334f9364252354f10bb4c7c9371ab1fb9485d460",
  "tests/Backend.Tests/TelemetryPrivacyTests.cs": "a3deab34e32e907068894fbf3e87624f97c58ca7bcbed730bac06f3b641da6a5",
  "tests/Backend.Tests/TestTimeProvider.cs": "eb4440069b32d6edbaf2bf8432ca714fbe7e35bdf8b8fb7c59a8b45e4280b00c",
  "tests/Backend.Tests/packages.lock.json": "6b96d1d0a8060a8f3cfb1e95a4bf8816e804b491f3eb638f4a1ad38881cedf45"
}
```
