# Research and Baseline Coverage Disposition

**Date**: 2026-10-16. **Baseline**: `e1952952e82aa1a32e79285923db68f26f995aed`.

## Decisions

### Remove orchestration from automated application tests

**Decision**: all automated AppHost construction/model/runtime/publication checks are removed. Required application/provider checks use WAF/Testcontainers.

**Rationale**: owner-approved local-only Aspire boundary; production behavior and security remain covered independently.

**Alternatives considered**: keep a tiny AppHost smoke suite (rejected by owner scope); move every Smoke test unchanged (retains unwanted harness); delete all Smoke coverage (loses important provider and recovery guarantees).

### Reuse production provisioning and existing provider fixtures

**Decision**: preserve existing pure Testcontainers fixtures; rewrite only Aspire-backed broker/recovery setup. Test fixture JSON remains independent wire verification where useful; production provisioners remain authoritative.

**Rationale**: existing IdentityProviderFixture and ReservationDeliveryFixture already support most required checks without Aspire. BrokerProvisioning.Build/Configuration supplies real grants and file import contracts; DatabaseProvisioner and IdentityProvisioning supply production state.

**Alternatives considered**: handwritten permissive broker/provider setup (invalid fidelity); another integration-test project (unnecessary); runtime test seams (outside scope).

### Preserve serialization and lifecycle fidelity

**Decision**: keep assembly-wide sequential execution when consolidating. Explicitly recreate WAF hosts with durable stores unchanged and broker stop/start; do not claim OS process crash or listener validation.

**Rationale**: process-wide environment/timezone/telemetry state exists, and parallelization is deferred. Stable state, exact envelopes and public effects are the actual guarantees.

**Alternatives considered**: collection concurrency redesign, container sharing optimization and actual application processes (all outside scope).

### No external technical research needed

**Decision**: reuse already pinned APIs/patterns demonstrated by baseline source. No new version/API recommendation or network claims are required; unresolved technical questions: none. Implementation must inspect installed APIs if details differ rather than upgrade dependencies.

## Exhaustive baseline inventory

Each row identifies the exact original method and every inline theory argument; single facts count once. Assertions require the mixed-guarantee table below and final executable evidence, not merely preserved method counts. Planned replacement names may change; coder must record exact final class/method and command/results before review.

Inventory: **40 methods, 108 expanded cases**.

| Baseline file and method | Cases (all retained/removed as stated) | Disposition | Planned evidence |
| --- | --- | --- | --- |
| `AdminConsoleTests.cs::DevelopmentProvidesDynamicLocalRabbitManagementWithExistingStorageAndPassword` | `single fact` | Aspire-only removal; manual local boundary (publication unsupported) | No automated replacement for orchestration; see mixed map where provider guarantees coexist. |
| `AdminConsoleTests.cs::DevelopmentProvidesDisposablePgAdminForExistingPostgresServer` | `single fact` | Aspire-only removal; manual local boundary (publication unsupported) | No automated replacement for orchestration; see mixed map where provider guarantees coexist. |
| `AdminConsoleTests.cs::OtherEnvironmentsAndPublishingRetainOrdinaryResourcesWithoutConsoles` | `"Production", false`; `"Development", true` | Aspire-only removal; manual local boundary (publication unsupported) | No automated replacement for orchestration; see mixed map where provider guarantees coexist. |
| `AdminConsoleTests.cs::RabbitManagementRequiresExistingCredentialsAfterRuntimeBindingGate` | `single fact` | Aspire-only removal; manual local boundary (publication unsupported) | No automated replacement for orchestration; see mixed map where provider guarantees coexist. |
| `AdminConsoleTests.cs::PgAdminOpensWithoutLoginAfterRuntimeBindingGate` | `single fact` | Aspire-only removal; manual local boundary (publication unsupported) | No automated replacement for orchestration; see mixed map where provider guarantees coexist. |
| `BookingSmokeTests.cs::IsolatedNamedVolumesRetainPendingOutboxQueuedMessagesAndInboxAcrossFreshAppHosts` | `single fact` | Split: retain application/provider guarantees; remove AppHost-only assertions | Focused cross-service recovery replacements + DB/identity provider contracts; detailed split below. |
| `BrokerContractTests.cs::ReservationTopologyRoutesBothEventsConfirmsAndRejectsUnroutable` | `single fact` | Retain with direct Testcontainers broker harness | Same named contract in Backend.Tests (rename permitted with final map). |
| `BrokerContractTests.cs::WorkerConnectionsConfirmRouteAndManuallyAcknowledgeOrRejectBothEvents` | `single fact` | Retain with direct Testcontainers broker harness | Same named contract in Backend.Tests (rename permitted with final map). |
| `BrokerContractTests.cs::WorkerCannotPerformUnrelatedOrReverseOperations` | `"reservations", "consume"`; `"reservations", "unrelated-consume"`; `"reservations", "configure"`; `"reservations", "bind"`; `"reservations", "unrelated-publish"`; `"reservations", "default-publish"`; `"notifications", "publish"`; `"notifications", "unrelated-publish"`; `"notifications", "configure"`; `"notifications", "bind"`; `"notifications", "unrelated-consume"`; `"notifications", "default-publish"` | Retain with direct Testcontainers broker harness | Same named contract in Backend.Tests (rename permitted with final map). |
| `BrokerContractTests.cs::WorkerHasNoOtherVirtualHostOrAdministrationAuthority` | `"reservations", "other-vhost"`; `"notifications", "other-vhost"`; `"reservations", "management"`; `"notifications", "management"` | Retain with direct Testcontainers broker harness | Same named contract in Backend.Tests (rename permitted with final map). |
| `BrokerImportTests.cs::CoreImportRetainsProtectedFilesCredentialsGrantsAndDurableDataAcrossNormalBoot` | `single fact` | Retain assertions; move to Backend.Tests | Same named method and every listed case in Backend.Tests. |
| `BrokerImportTests.cs::ActualScopedCredentialsSupportConfiguredReservedAndUnicodeCharacters` | `false`; `true` | Retain with direct Testcontainers broker harness | Same named contract in Backend.Tests (rename permitted with final map). |
| `BrokerImportTests.cs::ActualAppHostProtectsInjectedFilesAndObservesManagedStagingLifetime` | `single fact` | Split: provider protection retained; DCP/session lifetime removed | Broker provider file modes/import tests; manual staging boundary. |
| `BrokerImportTests.cs::FailedCoreImportBlocksActualWorkerAndReportsNoHashMaterial` | `"malformed"`; `"unreadable"` | Split: provider rejection/privacy retained; worker Waiting removed | Direct provider rejected-import and safe-log tests for both faults. |
| `BrokerPublicationTests.cs::FullWorkerPublishEnvironmentRetainsSymbolicBrokerSecretWithoutResolvingIt` | `"reservations", "reservations-publisher", "reservations-broker-password"`; `"notifications", "notifications-consumer", "notifications-broker-password"` | Aspire-only removal; manual local boundary (publication unsupported) | No automated replacement for orchestration; see mixed map where provider guarantees coexist. |
| `BrokerPublicationTests.cs::ParameterGuardRejectsActualValueResolutionBeforeReadingLocalSecret` | `single fact` | Aspire-only removal; manual local boundary (publication unsupported) | No automated replacement for orchestration; see mixed map where provider guarantees coexist. |
| `DatabaseProvisioningTests.cs::OwnDatabasePrivilegesAndRepeatedProvisioningRetainDataAndReconcilePasswords` | `single fact` | Retain assertions; move to Backend.Tests | Same named method and every listed case in Backend.Tests. |
| `IdentityProviderTelemetryTests.cs::ActualProviderMetadataTokenAndBootstrapExportCorrelatedNativeHttpWithoutPrivateValues` | `single fact` | Retain assertions; move to Backend.Tests | Same named method and every listed case in Backend.Tests. |
| `IdentityProviderTests.cs::RealCodePkceFlowIssuesOnlyExplicitHumanAuthority` | `"employee-a", "Employee"`; `"employee-b", "Employee"`; `"approver", "Approver"`; `"equipment-staff", "EquipmentStaff"` | Retain assertions; move to Backend.Tests | Same named method and every listed case in Backend.Tests. |
| `IdentityProviderTests.cs::RepeatedProvisioningPreservesSubjectsPasswordsAndAllocatedCallback` | `single fact` | Retain assertions; move to Backend.Tests | Same named method and every listed case in Backend.Tests. |
| `IdentityProviderTests.cs::ProviderRejectsUnregisteredCallbacksAndBrowserPasswordGrant` | `single fact` | Retain assertions; move to Backend.Tests | Same named method and every listed case in Backend.Tests. |
| `IdentityProviderTests.cs::SuccessfulAndRejectedProviderLoginsExcludePrivateSessionAndProfileDiagnostics` | `single fact` | Retain assertions; move to Backend.Tests | Same named method and every listed case in Backend.Tests. |
| `IdentityProviderTests.cs::ConfiguredPortPreservesSupportedIntegerFormats` | `"18081"`; `" 18081 "`; `"\u00a018081\u00a0"`; `"0x46A1"`; `"#46A1"`; `"&h46A1"` | Aspire-only removal; manual local boundary (publication unsupported) | No automated replacement for orchestration; see mixed map where provider guarantees coexist. |
| `IdentityProviderTests.cs::InvalidConfiguredPortFailsBeforeProviderStartup` | `""`; `" "`; `"0"`; `"65536"`; `"-1"`; `"not-a-port"`; `"0x10000"`; `"0xinvalid"` | Aspire-only removal; manual local boundary (publication unsupported) | No automated replacement for orchestration; see mixed map where provider guarantees coexist. |
| `IdentityProviderTests.cs::LocalProviderUsesStableAuthorityPersistentStateAndExplicitProvisioningGate` | `single fact` | Aspire-only removal; manual local boundary (publication unsupported) | No automated replacement for orchestration; see mixed map where provider guarantees coexist. |
| `IdentityProviderTests.cs::ProviderAdvertisesAllocatedBrowserAddressInsteadOfContainerNetworkAddress` | `single fact` | Aspire-only removal; manual local boundary (publication unsupported) | No automated replacement for orchestration; see mixed map where provider guarantees coexist. |
| `ReservationConsumerTests.cs::PermanentInboxPermissionFailureHaltsUnackedDeliveryUntilRepairedRestart` | `single fact` | Retain assertions; move to Backend.Tests | Same named method and every listed case in Backend.Tests. |
| `ReservationConsumerTests.cs::ConsumeAndDuplicateDeliveryEmitCorrelatedBoundedSignalsAfterCommit` | `single fact` | Retain assertions; move to Backend.Tests | Same named method and every listed case in Backend.Tests. |
| `ReservationConsumerTests.cs::DuplicateDeliveryAfterConsumerRestartRetainsOneEntryAndFiniteUtcSnapshot` | `single fact` | Retain assertions; move to Backend.Tests | Same named method and every listed case in Backend.Tests. |
| `ReservationConsumerTests.cs::PoisonIsRejectedWithoutRequeueAndFollowingValidDeliveryProgresses` | `"schema"`; `"event_id"`; `"type"`; `"routing"`; `"message_id"`; `"offset"`; `"precision"`; `"interval"`; `"name"`; `"oversize"`; `"traceparent"`; `"tracestate"`; `"tracestate_newline"`; `"content_type"`; `"schema_header"`; `"malformed_json"`; `"unknown_field"`; `"user_key_short"`; `"user_key_uppercase"`; `"user_key_null"`; `"token_field"`; `"session_field"`; `"profile_field"`; `"correlation_id"`; `"aligned_startAt"`; `"aligned_endAt"`; `"aligned_occurredAt"`; `"truncated_startAt"`; `"truncated_endAt"`; `"truncated_occurredAt"`; `"offsetfree_startAt"`; `"offsetfree_endAt"`; `"offsetfree_occurredAt"` | Retain assertions; move to Backend.Tests | Same named method and every listed case in Backend.Tests. |
| `ReservationConsumerTests.cs::TransientInboxDatabaseFailureIsNotAcknowledgedAndRecoveryStoresIt` | `single fact` | Retain assertions; move to Backend.Tests | Same named method and every listed case in Backend.Tests. |
| `ReservationConsumerTests.cs::InboxOrdersSubMillisecondEventsByOccurrenceThenIdAndSurvivesBrokerRestart` | `single fact` | Retain assertions; move to Backend.Tests | Same named method and every listed case in Backend.Tests. |
| `ReservationConsumerTests.cs::InboxCommitBeforeInterruptedAckRedeliversAndRetainsOneIdenticalEntry` | `single fact` | Retain assertions; move to Backend.Tests | Same named method and every listed case in Backend.Tests. |
| `ReservationOutboxTests.cs::PermanentMetadataWriteFailureHaltsWithoutFalsePublishedOrParkingAndRepairsByRestart` | `single fact` | Retain assertions; move to Backend.Tests | Same named method and every listed case in Backend.Tests. |
| `ReservationOutboxTests.cs::PermanentRealBrokerConfigurationParksAcrossCyclesAndRestartUntilRepaired` | `"permission"`; `"authentication"` | Retain assertions; move to Backend.Tests | Same named method and every listed case in Backend.Tests. |
| `ReservationOutboxTests.cs::UnconfirmedProviderOutcomeStaysPendingAndRetryPreservesWholeEnvelope` | `"return"`; `"nack"`; `"timeout"` | Retain assertions; move to Backend.Tests | Same named method and every listed case in Backend.Tests. |
| `ReservationOutboxTests.cs::InitialBrokerOutageDoesNotPreventCommittedTransitionsAndRecoveryDeliversStableIds` | `single fact` | Retain assertions; move to Backend.Tests | Same named method and every listed case in Backend.Tests. |
| `ReservationOutboxTests.cs::BrokerAcceptanceBeforePublishedCommitRemainsPendingAndDuplicatesAreDeduplicated` | `single fact` | Retain assertions; move to Backend.Tests | Same named method and every listed case in Backend.Tests. |
| `ServiceIdentityContractTests.cs::RealClientCredentialsIssueInventoryOnlyAuthorityAndNeverHumanPrivileges` | `single fact` | Retain assertions; move to Backend.Tests | Same named method and every listed case in Backend.Tests. |
| `ServiceIdentityContractTests.cs::RealProviderRejectsWrongServiceCredentialWithSafeFailure` | `single fact` | Retain assertions; move to Backend.Tests | Same named method and every listed case in Backend.Tests. |

## Mixed guarantees and explicit replacements

| Baseline assertion family | Retained automated guarantee and planned location | Removed boundary |
| --- | --- | --- |
| BookingSmoke initial catalogue/projector status and persisted edit | Existing inventory/persistence tests plus recovery test queries actual Inventory before/after recreated hosts; exact seed count, edited projector retained | AppHost resource annotation/endpoint setup |
| BookingSmoke migration ledger version/checksum/timestamp | Recovery test snapshots all three actual schema_migrations rows and compares after lifecycle; DatabaseProvisioningTests no destructive reseeding | AppHost process-start timestamps |
| BookingSmoke three histories/statuses/confirmation+cancel IDs | Recovery HTTP queries compare full stored reservation snapshots with exact IDs/status/timestamps | Full three-AppHost startup choreography |
| BookingSmoke broker-down pending envelopes | WAF booking/cancel commits while broker down; new host sees same pending rows before replay; existing outbox tests retain return/nack/timeout and commit-window guarantees | ResourceCommands stop/start calls |
| BookingSmoke queued work while consumer absent and broker restart | Publisher resumes without consumer host, queue exact IDs/payload retained over broker restart; recreated consumer yields one inbox effect per ID | AppHost explicit-start resource annotations |
| BookingSmoke inbox retention and user isolation | Public history/inbox snapshots survive recreated hosts, stable hashed owner keys; other subject receives empty lists | Actual application network listeners |
| BookingSmoke issuer/subjects/password roles | Real Keycloak fixture/provider test compares issuer and subjects before/after restart/reconcile and validates expected human roles and old password; provider metadata authority validated directly | Host endpoint allocation/network annotations |
| BookingSmoke own DB credentials/cross-db denial | DatabaseProvisioningTests actual flags/memberships/42501 retained and service-specific connections in recovery when asserting scoped access | AppHost environment inspection |
| BookingSmoke legacy hello exchange/queue/message remains idle | Direct broker sentinel test retains exact queue message and zero consumer state during provisioning/application/restarts | None: preservation of existing unrelated data remains meaningful |
| BrokerContract topology routes, durable messages, confirms, mandatory return | Direct broker contracts using production topology; both confirmed/cancelled routes, exact body and persistence, unroutable rejection | Aspire endpoint tcp/5672 model assertions |
| BrokerAccess all forbidden operations and exact grants | Preserve all 12 forbidden operation cases with actual 403; both other-vhost denials 530; both management denials; exact scoped grants via provider admin API | Extracting worker URI from AppHost execution configuration |
| BrokerStartup reserved/unicode passwords | Both short override cases authenticate exact publisher/consumer, route/ack actual message and retain scoped grants | AppHost parameter injection mechanism |
| BrokerStartup protected injected files / managed staging | Direct provider stat verifies 999:999:600 configuration/definitions; classify conf directory700 separately as host staging if not provider requirement | DCP temp-directory/kubeconfig modes/lifetime and Podman bind metadata |
| BrokerStartup malformed/unreadable import | Both faulty production-file cases cause observed provider boot rejection; safe diagnostics exclude all generated passwords and hashes; fixed-file owner/mode tests retained | Notifications resource Waiting and DCP resource-log/session inspection |
| IdentityHosting local stable authority/persistent state | Explicit real-provider issuer/subject/password restart assertions above; metadata/token issuer checked via actual authority | Default/configured IdentityPort formats, range rejection, WithDataVolume/WaitFor and allocated network endpoint |
| AdminConsole local credential behavior/bindings/state | Manual startup/admin/access/persistence procedure documents these local-only console observations; DB/broker real grants and state contracts remain automated elsewhere | All automated Development/non-Development/publish-model checks, console listener/browser lifecycle assertions |
| BrokerPublication symbolic secrets/no local resolution | Owner-approved removal of publishing surface tests; retained runtime tests still exclude secrets/hashes | Entire manifest/publication parameter-guard contract; publishing unsupported |

## Additional automated-suite audit

Search `tests/`, scripts and project references for `Aspire.Hosting.Testing`, `Projects.AppHost`, `DistributedApplicationTestingBuilder`, resource commands and manifest publication. Remove equivalent orchestration assertions outside the baseline Smoke directory if found; split mixed provider assertions first. Building the normal AppHost project as part of solution lint is permitted. No active Smoke project references remain; historical evidence links may remain with a supersession notice.

## Evidence obligations

The final implementation evidence must map every row/case and each mixed guarantee to exact final test names and passing snapshot-matched commands, or the owner-approved Aspire-only removal. Do not infer a new owner approval for dropping a provider guarantee. Record any redundant case with its exact executable equivalent and failure it detects. Existing test counts are accounting only; final counts may decrease when orchestration cases disappear and increase when mixed tests are split.

No production code or provider version changes are planned. All remaining implementation ambiguity concerns mechanics rather than a product decision; any newly discovered impossible guarantee goes to coordinator/owner before removal.
