# Feature validation evidence

Baseline: see baseline.md; npm run check passed on unchanged HEAD0f3ee965.

## Batch 1: test first (in progress)

Coder reported T001 explicit restore exit0, selected Npgsql10.0.3, Aspire.Hosting.PostgreSQL13.6.1, Testcontainers.PostgreSql4.16.0 available, PostgreSQL18.6 pulled, RabbitMQ4.3.6 image present. Exact-file npm formatting passed with escalation after sandbox named-pipe denial.

T003 red: `env DOCKER_HOST=<local Podman socket> TESTCONTAINERS_RYUK_DISABLED=true dotnet test tests/Backend.Tests --filter FullyQualifiedName~MigrationTests -m:1` exit1 on real isolated PostgreSQL18.6. One infrastructure/version test passed, five intended migration tests failed: absent schema and absent checksum/rollback exceptions. Zero skips. This establishes intended behavioral failure, not missing infrastructure. Green pending.

Evidence remains batch-development evidence; final revision-matched required gates and independent implementation review are pending.

T004 red: real PostgreSQL provisioning test exit1, one failed/zero skipped, inventory_app authentication failed because placeholder had not provisioned roles.

Coder reports T003 green6/6 and T004 green1/1, both exit0/zero skipped: production migration ledger/checksum/rollback/serialization and own-role provisioning with denied cross-DB/admin database connections, no elevated role attributes/memberships, password reconciliation and repeated bootstrap preserving seeds/data. Exact final commands/revision will be captured in Batch1 handoff; analyzer fixes and AppHost/legacy checks pending.

Batch1 development green: full Backend.Tests exit0,22 passed/0 skipped,9s (original16+6 migration tests). Full Smoke.Tests exit0,3 passed/0 skipped,1m8s: real AppHost hello, broker contract, PG isolation/password reconciliation. Smoke assertions inspect API environment own database keys/role and absence of admin credentials. Tests remove production named-volume annotations to isolate test resources; production repeated-AppHost-volume proof remains T039. Subsequent analyzer/readiness edits invalidate earlier final-gate applicability; final batch snapshot/checks pending.

## Batch2 test first (in progress)

T010 intended red before Inventory edits: `dotnet test tests/Backend.Tests --filter FullyQualifiedName~EquipmentPersistenceTests -m:1` exit1,2failed/2passed/0skipped. Failures: catalog remained one hardcoded camera rather than three sorted seeds; HTTP ignored persisted Stored Camera name after restart. Production remained B1.

T011 intended red before booking production edits: `dotnet test tests/Backend.Tests --filter FullyQualifiedName~BookingTests -m:1` exit1,30failed/0passed/0skipped. Expected201/400/503/availability200 received404 absent endpoints; realPG fixture worked. No reservation production changes yet.

T012 intended red before reservation production edits: `dotnet test tests/Backend.Tests --filter FullyQualifiedName~BookingConcurrencyTests -m:1` exit1,10failed/0passed/0skipped. Expected creation/conflict/advisory contracts absent404, including both concurrent requests404. This establishes missing API behavior before implementing allocation; later realDB concurrent green must prove constraint enforcement.

T010green4/4exit0,0skips. Persisted sorted threeitem equipment and saved-name restart behavior verified.

Booking+concurrencydevelopmentgreen: `dotnet test tests/Backend.Tests --filter 'FullyQualifiedName~BookingTests|FullyQualifiedName~BookingConcurrencyTests' -m:1` exit0,40passed/0skipped,8s. RealPG public HTTP strict dates/body/unknownfields, UTC/start-equalclock, no-state Inventory dependency rejection, stale advisory result, simultaneous one201/one409, overlap/adjacency/different items, forced outbox failure rolls back state, durable history. Later edits/final-gates pending.

Telemetry intendedred after businessgreen and before instrumentation: `dotnet test tests/Backend.Tests --filter FullyQualifiedName~BookingTelemetryTests -m:1` exit1,2failed/0passed. HTTP201/409/503 assertions pass; absent Equipment.Reservations outcome measurements and missing inventory_unavailable structured log are intended failures.

Matching @angular/forms22.2.2 installed, coder reports npm audit0 during installation. Final dependency audit remains separate.

Telemetrygreen2/2exit0 beforeUI. T013intendedUIred: `npm --prefix src/Web test -- src/app/booking/booking.spec.ts` exit1,11failed/0passed. Compiled inert component had no catalog request/controls/loading/actions; no compile/runtime prerequisite failure. UI implementation follows recordedred.

Batch2 quota interruption resumed after explicit owner plan upgrade. Angular productionbuild passed; bareVitest externaltemplate resolution error was corrected using supported TestBedoverride/compile setup (not passing behavior evidence). RenderedUI then3pass8fail; faithful native select events yielded9pass2fail. Remaining existing-test failures: stale advisory text after date edits and conflict wording. DST gap/overlap choice, UTC conversion, savedConfirmed+pendingnotification, duplicateclick/timeout/destruction, axe were green in development run. FullUI/final gates remain pending.

## Batch3 testfirst (in progress)

T021/T022intendedred BEFORE cancellationproductionedits: `dotnet test tests/Backend.Tests --filter 'FullyQualifiedName~CancellationTests|FullyQualifiedName~CancellationConcurrencyTests' -m:1` exit1,13failed/0passed/0skipped. RealPG and confirmedbookingprerequisiteworked; absent cancelroute404 and controlled-lockcasescompletedinstead ofwaiting. Tests cover microsecondtimeboundary, repeatafteroriginalstart, rollback, restartedhistory/rebook, concurrentstableevent, clockafterrowlock, bookingwaitforcancellationcommit.

T023intendedUIred: `npm --prefix src/Web test -- src/app/booking/reservations.spec.ts` exit1,8/8failed, realcompiledBookingtemplate missingvisible explicit historyrefreshcontrol before history/cancellationimplementation.

Initialcancellationgreen13/13. Strengthened contentiontest intendedregressionred: sixpublicrequests forcedwait on externalrowlock, focused ConcurrentCancellationReturnsOneStableEventAndTimestamp exit1,1failed. All6HTTP200 but5Cancelledresponses nullcancellationEventId; projection subqueries retainedpre-lock READCOMMITTEDstatement snapshot. Bugfix planned lock rowid first thenfresh responseprojection within same lockedtransaction; no success claim untilrerun.

Rowlocksnapshotfixgreen13/13including6forcedwaiters. Cancellationtelemetryspecificred onworkingHTTP:13pass1fail,200assertionpasses butoperationcancel metricoutcome successinstead ofrequiredcancelled before instrumentationfix.

FocusedBatch3green14backend/14 and8renderedhistory/cancelUI/8,exit0: strictatstart, deterministicstableconcurrentIDs, bookingwaitforcommit, rollback, restartedhistory/rebook, timezone, noretry/uncertainrefresh/focusfallback. Requiredgatespending.

## Batch4 testfirst (in progress)

Initialfixturecompilefailure notcountedasred; correctedtestconfiguration. T027genuineintendedred beforeUS3production: `dotnet test tests/Smoke.Tests --filter FullyQualifiedName~ReservationOutboxTests -m:1` exit1,2failed/0passed. RealPG/RabbitMQstartupworked; stoppedbrokerbooking201/cancel200committed thenmissinginboxGET404 causedfailure; publishercommitcrashwindowcasealsomissinginbox404. Subsequenttests mustprovepublishing/recovery onceinboxAPIimplemented.

T028intendedred beforeconsumer/inboxproduction: `dotnet test tests/Smoke.Tests --filter FullyQualifiedName~ReservationConsumerTests -m:1` exit1,17failed/0passed/0skipped. Realbroker/DBstartupworked; inboxGET404. Includesdedup/restart,14poisonmetadata/bodycases followedvaliddelivery, transientDBtriggerrecovery, sixdigitinboxordering+brokerrestart. Deterministicinboxcommit-beforeACKwindow separatelyrequired; initialmissingroutefailures don'taloneproveeventualimplementedbehavior.

T030intendedrenderedinboxred: `npm --prefix src/Web test -- src/app/booking/notifications.spec.ts` exit1,7/7failed missingexplicitinboxrefreshcontrol againstrealcompiledtemplate. Beforepublication/consumption/retryimplementation, typedcontracts+inertregisteredworkershells addedsolelycompilepubliclifecycletests.

T029executiondiagnosis: twointerruptedcoderturnsreturned no testoutput/actualrejection; sourcefrozen andcoordinatorverifiedreadonlyexactfileformatcheckexit0, no activeformatlock. Coordinatorran `dotnet test tests/Backend.Tests --filter FullyQualifiedName~ReservationRecoveryTests -m:1` viaescalatedstandalonecommand,cell88/session96801. Exit1,4failed/0passed/0skipped,40s. RealPGfixture/bookingworked; inertworkersnever scheduled attempts/backoff, ControlledSchedule.NextAsync timedout10s in permanentcontractpending, publisher3sbudget/disposal, jittered3attemptbursts+stablepayload+lockrelease, consumerboundedreconnect/disposal tests. Thisgenuinered occurred before delivery/retryimplementation. IDE0058testsuggestions pendingexplicitcleanup. CLIcommandapprovalnowpersisted; sourceownerresumedwithoutresettingrepairbudget1of3.

ACKwindowadditionalintendedredafterfixturecorrection:1failedexit1,realbrokerready,inboxGET200worksbutinertconsumernever invokescommit/settlementcallbackwithin10s. Earlierlazyfixture-resolutionfailure notcountedasbehaviorred. StrengthenedT029jitter0/.5/1 beforeimplementation:6failedexit1,realPGready,inertworkersneveract.

SEC001targetdesignamendment independentlyapprovedquality/security (specunchanged). Regressionfirstguardimplementation+actualbrowserzeroeffects proof+originalsecurityclosurestillpending. No acceptance/waiver.

T029developmentgreen afterinitial6intendedred: exactReservationRecoveryTestscommandexit0,6/6passed4s. Jitter0/.5/1, stablepayload, realPGoutboxrowlockavailableduringbackoff, permanentpending/no falsepublish,3sattempttimeout/disposal, consumer3attemptreconnectverified. Realbroker/crashgreenandtelemetryverificationpending. ApprovedSECpolicyread; guardnotimplementedbeforeitsregressions.

SEC001genuineRED beforeguard: codernewcommandreturned nooutputbeforecoordinterrupt847.7s; sourcepausedguardunimplemented. Rootreadonlyexactnewfileformatcheck0, then standaloneescalated `dotnet test tests/Backend.Tests --filter FullyQualifiedName~SecurityBrowserWriteTests -m:1` cell99/session28835. Exit1,42failed/4passed/0skipped6s; negativeOrigin/authority/browsermetadata/mediaadmission expected403/415 butunprotectedbookingCreated, legitimateclients4passed. RealPGhealthy. No guardbehavior existed beforethisregressionrun. Commandapprovalpersisted; guardownerresumed. Future newfilteredchecks coordinatorarranges ifworkerexecutiondoesn'treturn; no policy/repairbudgetreset.

Batch 4 resumed after the explicit owner plan upgrade; implementation repair counter remains 2 of 3. Commit-before-ACK development green: `dotnet test tests/Smoke.Tests --filter FullyQualifiedName~InboxCommitBeforeInterruptedAckRedeliversAndRetainsOneIdenticalEntry -m:1` exit0, 1 passed. The settlement callback observed the committed PostgreSQL entry, interrupted ACK/reconnected, and RabbitMQ redelivery retained one identical entry. Full Batch 4 snapshot remains pending.

Strengthened permanent-failure next-cycle regression before durable blocking fix: `dotnet test tests/Backend.Tests --filter FullyQualifiedName~ReservationRecoveryTests -m:1` exit1, 1 failed / 5 passed. Advancing another scheduled cycle produced a second publication attempt for a permanent failure. Durable disposition fix and green remain pending.

SEC guard development matrix after implementation: 43 passed / 3 failed of 46. Empty-header cases exposed HttpClient/TestServer dropping empty Origin/Sec-Fetch headers, changing the observable request to an originless CLI request. Coder is strengthening those fixtures with raw TCP to loopback Kestrel; production policy remains unchanged. Corrected full matrix and real browser proof remain pending.

Permanent disposition development green: ReservationRecoveryTests exit0, 6/6 passed, including no automatic attempt in the next cycle or after restart, followed by repaired publication and an explicit scheduling reset constrained by EventId and unpublished state. Stable payload/event identity retained. Final batch snapshot/gates pending.

Rendered inbox development green: 8/8 passed, including focus restoration. Coder reports the added focus behavior was included in an 8/8 intended red before inbox UI implementation; exact command/reasons to be preserved in the batch handoff.

Expanded SEC matrix: 47 passed / 1 failed of 48. Corrected raw TCP fixtures distinguish empty Origin/Fetch-Metadata headers from omitted headers; an accidental duplicate Content-Length fixture error was corrected without relaxing production admission. New genuine regression red: trailing-slash creation route accepted unsupported media with Created instead of expected415. Uppercase route variant passed. Media-route normalization fix follows this recorded red; complete green and real browser proof pending.

SEC HTTP development green: corrected and expanded SecurityBrowserWriteTests exit0, 48/48 passed, including raw empty-header requests and trailing-slash media regression. Real browser and independent security closure remain pending.

Real outbox development green: ReservationOutboxTests exit0, 2/2 passed in25s. Broker-stopped booking/cancellation included an observed failed publication attempt before restoration; broker acceptance before Published rollback/restart produced duplicate delivery safely deduplicated by the inbox.

Strengthened consumer retry regression intended red: 1 failed / 6 passed. A successful connection handshake followed by transport failure incorrectly reset the burst, yielding1s rather than required2s backoff. Fix retains the failure count until a committed delivery and successful settlement; rerun pending.

Consumer retry regression development green: ReservationRecoveryTests exit0, 7/7 passed. Broader real broker consumer green: ReservationConsumerTests exit0, 18/18 passed in18s. Includes14 poison-then-valid cases, actual failed inbox insertion observed via nontransactional sequence before database repair, microsecond ordering and broker restart, plus commit-before-ACK interruption with actual redelivery.

Delivery telemetry tests were authored/formatted after delivery behavior worked and before its instrumentation. Intended red is running through the approved Recovery filter; exact outcome pending. Batch freeze and required gates remain pending.

Delivery telemetry intended red: publisher tests failed twice for absent retry/permanent_error signals while7 working recovery tests passed. Consumer signal test failed after two actual settled deliveries and one durable inbox row, for missing stored signal;18 existing consumer tests passed. Publisher instrumentation then added correlated Producer span, generated safe logs, bounded outcomes and latency; consumer stored/duplicate signals added. Additional poison-rejection/transient-database signal regressions are running before those paths are instrumented. Full outbox-age/dependency/export capture remains T037/T042. Exact red/green commands and final snapshot pending handoff.

Publisher telemetry development green: 9/9 passed, including recovered publication, permanent_error safe generated logs, persisted W3C parent and EventId/ReservationId span correlation. Consumer telemetry additional intended red: two missing outcome failures after actual poison rejection/following valid delivery and proven failed insert. Instrumentation then green19/19 for delivery telemetry coverage. Lint exit0 and build zero warnings/errors after explicit style/import fixes without suppressions.

Final scoped retry regression is running before the fix: permanent consumer configuration failures currently retry in scheduled10s cycles, contradicting transient-only retry policy. Consumer must stop after a permanent setup failure and resume only after repair/restart. No new business scope or owner policy decision. Final gates and frozen source remain pending.

Permanent consumer regression intended red: 1 failed / 9 passed because the next scheduled attempt occurred; safe permanent-log regression then 1 failed / 9 passed. Both fixed before development green10/10: no automatic attempt after permanent setup failure, repaired restart resumes, fixed permanent_error signal.

Consumer counts clarified:18 original real consumer cases plus one stored/duplicate telemetry case =19. Three supplemental tests of already-built malformed JSON/unknown-field/correlation-ID poison contracts bring expected full consumer count to22; these are supplemental validation, not retrospective test-first claims.

T027 supplemental unconfirmed cases running: actual RabbitMQ.Client7.2.2 mandatory-confirm return via test-owned unroutable binding and nack via separate fixture-only reject queue max-length0/reject-publish. Canonical production queue topology unchanged. Controlled publisher stall verifies the actual worker3s budget through the public publisher boundary; that timeout boundary double is distinguished from actual broker contracts. Each case asserts Pending metadata and identical full envelope, followed by canonical real publication/recovery. Results pending.

Supplemental outbox check:4 passed / 1 fixture failure; mandatory return and bounded timeout passed, nack remained unverified. Bounded broker reason identified RabbitMQ4.3.6 refusal of deprecated transient nonexclusive test queue (541), not a production delivery defect or intended behavioral red. Fixture changed to exclusive/auto-delete without enabling deprecated flags or modifying the canonical durable queue; provider rerun pending. Exact-file formatting and explicit new-fixture type diagnostic cleanup completed.

Outbox full filter development green:5/5 passed in33s. Actual mandatory-return and nack exceptions verified, controlled external-publisher timeout distinguished from real broker evidence, unchanged full envelope retained through recovery.

Strict tracestate regression intended red:1 failed / 22 passed. A newline-terminated key was accepted and produced two inbox rows instead of rejecting poison then storing only the valid event. Generated key regex anchors changed to absolute input anchors after this red; rerun pending. Related browser Origin/Host and booking ISO anchors already absolute, equipment ASCII predicate rejects controls; no unrelated production changes.

## Batch 4 frozen checks and independent review

Final source134 paths: `3f4080a91b0ec60b5b570ec9112d3a4b442d39f27fdcd25403deb8da8f666952`. Coordinator and both reviewers independently verified the manifest. Temporary formatter-test fixture during the tooling test briefly appeared in a candidate135-path hash; that candidate was discarded, and final evidence uses the post-gate134-path manifest.

All required Batch4 checks exit0: format-check, lint, full check, diff-check. Full suite4 tooling/35 Angular/144 backend/31 real smoke, zero skips/warnings; backend49s, smoke2m10s. Final consumer23/23 and Recovery13/13. Exact handoff: batch-4-handoff.md.

Independent quality and security both changes_requested: Q-B4-001 real provider permanent protocol/authentication exceptions misclassified as transient; Q-B4-002 default DateTimeOffset conversion loses raw timestamp grammar. Reports persisted verbatim. T047–T048 form bounded implementation repair round3of3; intended regressions precede fixes. No budget reset. T046 still requires actual browser and original security closure.

## Runtime startup preflight (not final acceptance)

`ASPIRE_CONTAINER_RUNTIME=podman dotnet run --project src/AppHost` on frozen B4 source launched successfully. `aspire describe --apphost src/AppHost/AppHost.csproj --format Json --non-interactive --nologo` exit0: database bootstrap Finished, Inventory/Reservations/Notifications/Web/PostgreSQL/RabbitMQ Running/Healthy. Printed local endpoints inspected without outputting parameter values or dashboard tokens. Web proxy `http://127.0.0.1:64675`: GET equipment returned camera/laptop operational and projector nonoperational; GET reservations and notifications returned empty arrays. No production state writes or reset.

Own AppHost process stopped gracefully with SIGINT; startup session exit0. `podman volume inspect equipment-reservations-postgres equipment-reservations-rabbitmq --format '{{.Name}}'` exit0 confirms exact persistent volume names; volumes preserved. This preflight is on superseded B4 source and does not satisfy final T039/T043 revision-matched restart/browser acceptance. Final runtime will restart on repaired/final source.

Native Edge accessibility-read preflight succeeded in1.2s with no UI changes. Manual keyboard/focus/status evidence remains pending; availability is not review completion.

## Repair round 3 test first

Before production edits, Recovery intended red:10 failed / 13 passed. Faithful provider shapes403/406/530, nested BrokerUnreachable/Aggregate/AuthenticationFailure and UriFormat entered1s automatic retry instead of permanent parking/stop. Initial missing ShutdownEventArgs import compile failure was corrected and excluded from intended-red evidence. Controlled real RabbitMQ configuration-fault coverage is being authored before classification changes.

Timestamp consumer intended red before production edits:9 failed / 23 passed. Seven aligned digits, eight digits with discarded precision and missing offset under controlled UTC, each in startAt/endAt/occurredAt, wrongly stored a second row rather than rejecting poison and continuing with one valid entry. Strict generated-metadata-compatible wire validation fix remains pending.

Q-B4-002 development green:32/32 real consumer tests. Strict per-event-property timestamp converter validates original grammar before conversion, explicit zero UTC offset, at most six fractional digits and finite bounds; generated metadata and default writer wire format preserved.

Q-B4-001 real RabbitMQ configuration intended red before classifier fix:2 failed / 5 passed. Actual406 incompatible exchange and rejected credentials incorrectly retried after1s. Expanded public-lifecycle intended red:30 failed / 13 passed for AMQP311/402/403/404/405/406/501–505/530/540 plus explicit nested authentication/URI failures. Shared classification now used in publisher and consumer paths; unknown errors, forced320/resource506/internal541 and uncertain transport/authentication indicators remain transient. Supplementary retention cases added for existing transient behavior. Lifecycle and actual-broker reruns pending, followed by full gates/freeze.

Broker classification development green:48/48 lifecycle cases and7/7 real outbox cases. Actual406 and rejected credentials remained parked after the scheduled cycle and sender restart, then repaired selected-event reset delivered one inbox entry with unchanged event identity/payload. Transient320/506/541, nested uncertain transport, actual mandatory returns/nacks and outage recovery retained. Original security48/48 also passed on repaired source. Analyzer readability fixes remain subject to final revalidation.

Own-database root-cause consolidation intended red before database production edits: Recovery11 failed /49 passed in33s (10 faithful authentication/permission/table/catalog/schema provider cases plus actual renamed-outbox42P01 selection failure); real consumer1 failed /32 passed in20s for server42501 before commit, incorrectly entering1s reconnection. No ACK observed. Actual transient inbox fixture uses08006; uncertain accept-before-Published crash fixture usesP0001; both retained. DB classifier/halt and final gates pending.

Own-DB classifier development green: Recovery60/60 in37s and real consumer33/33 in22s. Actual42501 stopped without ACK; repaired restart observed RabbitMQ Redelivered=true and one entry. Explicit permanent states only;08006 and P0001 retained. Initial supplementary metadata-denial proof passed real Outbox8/8 in56s when all outbox updates failed; its import-placement compile failure was corrected and not counted as red. A concurrent focused build emitted transient MSB3026 copy-retry warning; final gates will run sequentially and must have zero warnings.

Stronger selected-event DB regression intended red before that branch fix:5 failed /55 passed in36s. Source parked/scheduled known own-DB faults instead of halting. Updated cases require worker halt, no false parked claim, unchanged payload and repaired restart; broker permanent parking cases retained. Real broker metadata fixture now denies only Published UPDATE while allowing scheduling UPDATE, testing that failure to persist publication must halt even when parking would be writable. Its result and branch fix remain pending. Same Q-B4-001 root cause and round3 scope.

## Batch 4 repair round 3 closure

Final source137 paths: `c40044c4771a1abf9df625520207a867298e75ff09f9fd6b8b021906376cd81a`. Root and both original reviewers independently verified the manifest. Focused Recovery60/60, Outbox8/8, Consumer33/33 and Security48/48 passed. Final format-check, lint, check and diff-check exit0:4 tooling/35 Angular/191 backend/44 real smoke, zero skips/warnings/errors. Original quality and security reviewers closed Q-B4-001 and Q-B4-002; reports persisted verbatim. T047–T048 complete; repair round3 remains consumed, with no limit reset.

## Batch 5 telemetry test first (development evidence)

Coder reported first intended red for `dotnet test tests/Backend.Tests --filter FullyQualifiedName~ReservationTelemetryTests -m:1`:3 failed/0 passed/0 skipped after successful real PostgreSQL/HTTP setup. Missing Inventory outcome/latency and pending count/oldest-age signals for parked events. Implemented signals gave3/3 green. Expanded same-filter dependency requirements then failed9/passed3 before production instrumentation. Final focused dependency run12/12 green with no analyzer warnings: Inventory available/outage, HTTP own-DB healthy/schema fault, broker publish healthy/outage, consumer setup outage, DB healthy/actual42501 and ACK healthy/interrupted. Bounded dependency/outcome dimensions and durations asserted. Parked-event count/age clears after explicit repaired reschedule and worker confirmation.

Additional intended red `dotnet test tests/Backend.Tests --filter FullyQualifiedName~PublicInboxReadHasCorrelatedOutcomeAndDependencySignals -m:1`:2 failed/0 passed/0 skipped,529ms. Healthy200 and actual missing-table503 occur correctly, but public inbox outcome/duration/span signals absent. Generated safe logging regression is being completed before endpoint instrumentation. These are development checks, not final frozen evidence.

## Repaired-runtime preparation (not final acceptance)

A second live AppHost compiled on B4 repaired c400 source started with all APIs/Web/PostgreSQL/RabbitMQ Healthy and bootstrap Finished. Web `http://127.0.0.1:64230`. Native Edge task-owned tab keyboard navigation and future date entry worked; advisory GET returned available, focus remained on Check availability. No reservation/cancellation/hello writes performed. Source has since changed for T037, so these observations are preparation only. Final runtime must rebuild/restart before final browser/manual evidence.

Supported `aspire export --apphost src/AppHost/AppHost.csproj --output /tmp/feature1-preflight-telemetry.zip --non-interactive --nologo` exit0; private125082-byte archive contains resource JSON, console/structured logs and traces, no standalone metric files. Raw resources include secret parameters and remain private; only sanitized telemetry is eligible for evidence.

T037 development update: full telemetry filter14/14 green,2s,zero warnings/skips. Inbox generated-log regression separately failed2 cases for absent safe outcome logs before instrumentation; now endpoint outcome/duration/span/own-DB signal and generated correlated safe log coverage pass. Outbox dependency/correlation validation remains underway; no final snapshot claimed.

Runtime preparation: `podman ps --format` on repaired B4 AppHost shows messaging-gzrbkuhz host mapping127.0.0.1:39531→5672 and postgres-jmjumvga127.0.0.1:41935→5432; `lsof -nP -iTCP:15888 -sTCP:LISTEN` shows dashboard proxy127.0.0.1:15888. This is discovery only; final full listener and mapping checks pending. Security reviewer approved credential audit via container psql/TCP with passwords privately via stdin and bounded fixed arguments; clarification report persisted verbatim.

Dashboard metrics export preparation reaches normal token login. Owner asked to log in locally without sending token because no secure token-to-CUA bridge exists. Architect confirmed supported UI metrics export and no documented machine metrics-read API; authentication remains enabled. Final runtime must probe same localhost/browser profile after restart, and export only Metrics selections once final measurements exist.

## Batch 5 planned native focus repair and telemetry development

Actual native review report `native-review-development.md` records successful labeled keyboard/date/advisory/book/cancel/inbox/conflict/hello behavior and observed Reload/history completion focus loss. Before production edits, actual Edge focused regressions failed4/4 solely for lost focus after success/error; rendered companion4 failed/10 passed with explicit faithful browser disabled-focus boundary. Coder then reused guarded afterNextRender focus restoration for explicit Reload/history success/error, excluding constructor initial load; rendered14/14 green. This remains planned T038 work, not a reset of the consumed formal repair limit. Actual browser/final native revalidation pending.

T037 outbox dependency metric cases intended red2 before SQL-boundary instrumentation, full telemetry16/16 green. Supplementary public HTTP persisted-W3C/outbox→publisher/consumer/inbox correlation validation now17/17 green,3s; one explicit-type test suggestion corrected afterward. Final full gates pending.

Actual Inventory stop showed Saving reservation… with disabled controls and temporary body focus; bounded error restored Book focus and retained saved state. Catalog loading/error exposed focus gap above. Inventory restored. Actual broker stop showed hello Sending hello…/disabled then safe error with Send hello restored. While broker stopped, task-owned reservation f97741d2-2b1d-455f-bb8a-ceeb0753d68e cancellation returned200 Cancelled. Own-role SQL proved cancellation8d869471-403a-4d51-b56d-aea4e6efe4a3 Pending withattempt2, confirmation4fb5caac-5126-4f47-b6e8-3d0b93914e6a already Published. Dashboard Metrics/Table showed outbox.pending1, oldest_age3.758964→78.531089→97.388687seconds, then0 after recovery. Broker restored; public inbox contains exactlyone matching cancellation event.

Supported native dashboard metrics-only download succeeded. Archive `/tmp/feature1-development-metrics.zip` mode600 contains exactly metrics/notifications.json and metrics/reservations.json (OTLP resourceMetrics), no resource details. Custom Equipment.* metric dimensions only operation/outcome/dependency, no identifier labels; includes created/cancelled/booking_conflict/inventory_unavailable, broker publish available/unavailable and published/retry, consume/stored, ownDB/ACK/setup signals, plus preserved Hello. This is development runtime evidence; final revision/capture still pending.

Concurrent isolated AppHost Web installer briefly disrupted shared node_modules, creating a transient Vite TS7016 overlay; no product TypeScript defect inferred. Fixture now uses explicit Web start to avoid installer execution. Root live Web restarted successfully (two coordinated-in-error overlapping restart requests both exit0; no browser running). Root alone owns live resource mutations going forward. Final installer/full gates must complete before final browser/native capture.

## Dependency and candidate-secret audit development

`dotnet list EquipmentReservation.slnx package --vulnerable --include-transitive` exit0, all10 projects no vulnerable packages given configured NuGet source. Root npm and Web npm audits initially blocked by sandbox DNS/log permissions, rerun with required escalation: both exit0; each metadata reports0 info/low/moderate/high/critical. Audit JSON/lock hashes recorded in `audit-development.json`; final freeze will verify unchanged lockfiles.

Private exact comparison against6 live secret values across292 candidate files found0 matches. Generic private-key/provider-token/quoted-secret-assignment scan across293 candidate paths found one hit: ReservationOutboxTests.cs:96 in PermanentRealBrokerConfigurationParksAcrossCyclesAndRestartUntilRepaired, deliberately invalid broker test credential, not a running secret. No actual secret values printed. Final candidate scan must be repeated after all writes.

## T039 lifecycle development

Initial fixture compile-return and post-open Npgsql password-redaction setup issues were corrected without claiming behavior reds. Controlled explicit Notifications readiness before transient hello avoids conflating its preserved no-retry startup contract with durable reservation delivery; ordinary HelloSmokeTests unchanged. Real initial roles/crossDB denials, book/cancel/inbox/hello and repeated bootstrap/edited seed checks passed, but public Project Restart returned Success=false/Failed to stop resource twice. No persistence pass claimed. Architect supplied public state/log diagnostics and full fresh-AppHost fallback. Original verifier confirmed three-scope disposal/recreation with same isolated volumes/secrets can meet the persistence criteria, including inspecting retained broker queue before either worker starts. Design assessment saved verbatim; actual execution pending.

## Batch 5 persistence, actual hostile browser and runtime audit development

T039 three-scope real persistence check passed1/1 in1m53s. Both Confirmed/Cancelled, modified seed/exact ledger persisted;2 committed pending events before first disposal and still Pending scope2 before publisher; then Published/queue2 while consumer withheld; scope3 queue2 observed before either worker, then exact5 inbox IDs/prior state/hello. Separate JavaScriptInstallerResource now explicit-start alongside Web. Refreshed fixture passed1/1 with public per-service lifecycle start timestamps changed first→third; subsequent test-only analyzer/readability cleanup remains subject to final gates. No full persistence pass inferred from earlier fixture errors or failed project stop commands.

Actual corrected Edge focus4/4 green. Actual hostile supplement2/2 green7.5s; each hostile-alias and opaque-null browser context yielded server403 for no-cors text/plain booking, form booking, no-cors hello, bodyless cancel. Browser context origin verified exactly; Playwright omitted Origin/Sec-Fetch headers, so no on-wire header observation is claimed.48-case real-PG HTTP matrix separately proves literal-header branches. Own-role SQL audit for both trial IDs confirmed exactly expected confirmation+cleanup cancellation outbox/inbox identities and0 hostile laptop rows: hostile-browser-database-development.json. Final current-snapshot full browser suite still pending.

Actual live own-role TCP credentials audit passed3 positives and12 denied cross-database/postgres/template1 admissions; flags superuser/createdb/createrole/replication/bypassrls allfalse, memberships0, no API admin connection. Both CONNECT privilege=false and server permission-denied connection failure verified; no SQLSTATE invented for psql connection failures. live-database-audit-development.json. Socket inspection13 app/control-plane/proxy/target listeners all127.0.0.1, including actual Web target23197; PG/Rabbit host mappings127.0.0.1. Final runtime repeat/linkage pending.

## Open T037 privacy completion and approved retention factual correction

Actual private development telemetry export succeeded4513277bytes. Scope inspection found10,116 framework Hosting.Diagnostics raw-local-URL messages with Host/Path/QueryString,6 nonempty queries, plus Lifetime listening URL/ContentRoot local-user path fields. No raw provider exception messages found. Passing generated custom-log tests did not establish framework privacy. Full gates held; coder assigned intended-red production-config export/privacy probe with harmless query/header/body canaries before privacy implementation. Console and OTLP, fields/scopes/resource metadata, HTTP instrumentation query redaction and useful correlated signals all require validation. Both original reviewers explicitly assess this as completion of still-open T037/T042; no final source verdict or repair-round reset. Their reports persisted verbatim. Old private diagnostic captures are not acceptance evidence for privacy.

Both original reviewers approved factual dashboard retention correction: pinned Aspire13.6.1 AppHost Dashboard defaults local SQLite Run diagnostics/up to10 unpinned runs/app; official version docs and local metadata corroborate. Architect changed only plan first Observability sentence/research paragraph, preserving product/local scope/AlwaysOn/application retention/content permission policy. Hashes recorded in run-state. No privacy waiver. README T040 draft completed/formatted/reread by architect, final documented startup/runtime confirmation pending.

T037 privacy intended RED before production changes: `dotnet test tests/Backend.Tests --filter FullyQualifiedName~TelemetryPrivacyTests -m:1` exit1,3 failed/0 passed/0 skipped,1s,no warnings. All intended HTTP/real-DB and outgoing Kestrel probe calls succeeded. Exported incoming HTTP span leaked distinct harmless query canary under development flags; both log scenarios leaked ContentRoot. Generated success/conflict/Inventory-failure logs remained correlated, preventing a silence-only pass. Earlier inaccessible private instrumentation-option compile issue was not a behavioral red; those white-box assertions removed. Pinned public pre-export Activity processor selected per architect guidance, no reflection or process-global production env mutation. Global framework logging filters and OTLP external-scope omission implementation underway; final SDK/console/runtime export reinspection pending.

Security clarification: application console/OTLP/scopes/resource attrs/spans/metrics must meet content policy; DCP resource config and launcher/build/installer diagnostics stay private/excluded based on actual producer, not blanket filename/value exclusion. Mixed console streams require attribution; application Lifetime ContentRoot always in scope. No actual live-secret matches found in14 inspected development telemetry entries, but local identity in framework records invalidates that capture as final privacy evidence.

Root older AppHost stopped gracefully, startup session20839 exit0. Both exact persistent volumes still present; no reset performed. Live runtime/browser URL temporarily unavailable until final privacy/gates/rebuild. Latest README factual corrections SHA2d4e889aede20c8dab19ed4979a2d32ddc82bd862898e4f5ddcba08f7719a875, no active documentation writer.

Privacy3/3 GREEN950ms after intended3/3 red, no warnings/skips. Exact global framework categories filter console/OTLP, OTLP external scopes excluded with native Activity correlation retained, public pre-export processor removes rawURL/query/legacy fields. No AppHost/private API hack or production process-global environment mutation. Original security then requested a distinct actual User-Agent canary/removal because SDK captures user_agent.original; ordinary software version is not classified inherently sensitive and no secret leak is asserted. This remains completion of open T037; assessment persisted verbatim, no universal header-sanitization claim. New intended red must precede tiny removal; final runtime inspection still pending.

First broad development gates: format-check passed; lint build zero warnings/errors, suggestion gate caught import ordering/unused import in two telemetry tests. Exact import fixes formatted/reread; rerun format-check/lint exit0. Full check then tooling4/4, Angular build and39/39 passed; backend211 total209 pass/2 fail/0skip. Existing BookingTelemetryTests/CancellationTelemetryTests listeners subscribed all instruments in Equipment.Reservations and applied old operation/outcome-only assertion to new dependency counters. Planned fixture correction scopes old listeners to reservation.outcomes;17 new tests independently assert dependency dimensions. No production failure or removed outcome/span/log expectation. Smoke45 still running; no source edits during the check. Current gate run is interim, not frozen final evidence.

### Final telemetry privacy completion and gate revalidation

The first full Batch5 check finished exit1: tooling4/4, Angular39/39 and production build passed, backend209/211, real infrastructure smoke45/45, zero skips. The two backend failures were existing BookingTelemetryTests/CancellationTelemetryTests metric listeners subscribing to every instrument in Equipment.Reservations and applying outcome-only dimensions to the newly required dependency counter. No source files changed during that run. The listeners were subsequently limited to their reservation.outcomes contract; all original outcome/span/log assertions remain. The dedicated new tests independently assert dependency dimensions.

Actual incoming/outgoing User-Agent canaries were added before production privacy changes. The focused TelemetryPrivacyTests run genuinely failed1/3, with the incoming exported HTTP span containing the caller-controlled User-Agent canary after successful real201/method/route/status/duration prerequisites. The existing pre-export processor then removed user_agent.original alongside raw URL/query fields. Focused rerun passed3/3 in974ms, zero warnings/skips. This completes still-open T037/T042 under the original security assessment; it grants no general input-logging exception and consumes no reset of the three closed formal repair rounds.

After exact-file formatting/reread, final format-check and lint passed (zero warnings/errors and analyzer suggestions addressed). The repeated full check has passed tooling4/4, Angular39/39 with production build, and backend211/211 (1m14s, zero skips). The final45-case real infrastructure suite remains running; no final source manifest is frozen until it finishes and temporary formatter fixtures are removed. These command results are coder handoffs, pending final manifest and coordinator verification.

### Batch5 final required gates and source freeze

Coder final command handoff: format-check0, lint0, check0, git diff --check0. Full counts: tooling4/4, Angular39/39 with production build, backend211/211 (1m14s), real smoke45/45 (4m22s), zero skips and .NET build zero warnings/errors. No active test/installer remains. No source edits during gates. T039 marked complete; actual export/privacy, full browser, native review and final reviewer/acceptance tasks remain pending.

Coordinator independently recomputed the agreed manifest algorithm after temporary FormatterFixture cleanup:143 paths, SHA256 `05da930fed1290f7e88fd8fbc409188a88975aaf3974f9373e7aa7bdb18f5107`, matching coder handoff. Persisted `batch-5-source-manifest.json`. Source frozen for subsequent runtime and reviews. Fresh documented `ASPIRE_CONTAINER_RUNTIME=podman dotnet run --project src/AppHost` started against retained production demo volumes; private output mode600, no reset. Initial bootstrap/installer Finished and API health becoming ready; startup confirmation is not yet marked complete.

### Final actual Edge suite and diagnosed legacy prerequisite

Frozen source05da930f (143 paths), Web127.0.0.1:51221. First full actual Edge run exit1,11/12 passed,0skips: all9 booking cases passed (real services journey/axe, held loading/empty/pending/errors, DST,4 focus,2 hostile origins); preserved live hello timed out waiting for notification after202. Root read actual Notifications worker health503 and private resource logs: unchanged HelloConsumer emitted the safe type-only BrokerUnreachableException startup failure with explicit restart instruction. Durable ReservationConsumer remained active. The legacy single-attempt/no-retry contract and restart distinction are documented; API health alone excludes workers and did not establish hello readiness.

Supported `aspire resource notifications restart --apphost src/AppHost/AppHost.csproj --non-interactive --nologo` succeeded0. Root then verified /health/workers200Healthy. With this diagnosed prerequisite restored and no source edits, the complete unchanged actual Edge suite passed12/12,0skips,exit0 in17.7s; all exercised axe assertions had zero violations. Command: `env API_WEB_URL=http://127.0.0.1:51221 BROWSER_EXECUTABLE=/Applications/Microsoft\ Edge.app/Contents/MacOS/Microsoft\ Edge npm --prefix src/Web run test:browser`. First failure is retained rather than reclassified as passing. Coder marked T038/T039/T043 complete, reran git diff --check0 and verified manifest unchanged. Browser process closed before root controlled outages.

### Final runtime/privacy evidence complete

See acceptance-evidence-map.md for SC001–018 traceability and current report paths. Native report independently approved by original verifier; PRE-Q-001 and legacy skeleton Q-001 closed through new report/current hash, historical reports unchanged. Own-role final runtime checks3 own/12 denied,13 loopback listeners, exact2 loopback container mappings,308-file six-secret scan0matches,12 unchanged audit lockfiles. Both final browser hostile runs:4fixtures,8expected outbox+same8inbox,0hostilelaptoprows.

Private CLI export inspected642spans/1271structuredlogs/111correlatedbusinesslogs/11book-publish-consume traces. Separate supported native metrics-only archive contains exactly2 metricJSONs;596custompoints, onlyoperation/outcome/dependency labels, gauges pendingmax1/latest0 and oldestmax45.846665s/latest0. No exact live-secret/canary/local-identity or rawHTTP tag matches in inspected application telemetry. DCP [sys] launcher paths attributed by producer and excluded; resource configuration credential-bearing/private, frontend build/npm and container consoles excluded explicitly. No whole-archive sanitization claim. Actual prior User-Agent/query/body probe setup expectation corrected from200 to documented unknownquery400; no product failure implied.

After-start Laptop fixture remains Confirmed with one event/inbox; original native Camera cancelled and broker-outage rebook cancelled each exactly2published events and same2inbox. All5 restoredAPI/workerhealth200. T037/T040/T041/T042 complete; T044 and originalsecurityT046 closure remain pending independentfinalreviews/convergence/humanacceptance. Source unchanged05da930f throughout.

### Final independent review and convergence

Original quality/security final PASS on143-path05da930f, allfiledigestsindependentlyverified; reports persisted verbatim asquality-final.md/security-final.md. No unresolvedblockingfindings; SEC001originalsecurityclosed. Coordinator completedinstalledconverge afterimplement:21FR18SC20AC12edges48tasks16plan6principles,0gaps/alltypes,0newtasks, tasksfilebyteidentical573924a5c17bca30841ae14a402da8c3956f5a599b68de4a1030d92240cafbf5. No extensionhooks. Remaininggate: explicitownerfeatureacceptance; T044not falselymarkedcomplete.

### Explicit final human acceptance

2026-10-15 Europe/Bucharest: human owner explicitly answered “Accept Feature 1” for reviewed05da930f. All143 source digests unchanged; required gates/reviews/convergence still satisfied. Acceptance recorded inhuman-acceptance.md/run-state.json; T044 closed, all48 tasks complete. No new application change or external action.
