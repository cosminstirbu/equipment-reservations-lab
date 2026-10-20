# Implementation evidence

2026-10-19, approved preparation snapshot 7769236d69454c9a7538820f677257b0bf164f8556a8dff2e09b726b2fcd7883.

- All requirements checklists 16/16 checked each; prerequisite script resolves 010 feature.
- `dotnet restore EquipmentReservation.slnx --disable-parallel` (escalated build IPC): exit 0; pinned packages available.
- RED: `DOCKER_HOST=unix:///var/folders/6k/z9rq_rsj7gj5ghmy_rx43nzh0000gp/T/podman/podman-machine-default-api.sock TESTCONTAINERS_RYUK_DISABLED=true dotnet test --project tests/Inventory.Tests --filter-class '*OpenApiTests'`: exit 2; 1 failed at document GET 404, 2 exposure tests passed; real PostgreSQL container. Parser APIs compiled without legacy Readers.
- Initial sandbox .NET restore/format stalled on restricted IPC; escalated commands used subsequently. Interrupted formatter left empty lock; verified no formatter child before removing lock.

## Focused behavior evidence

All provider-backed commands use the Podman socket and `TESTCONTAINERS_RYUK_DISABLED=true` above, escalated for runtime/IPC access.

- RED Reservations/Notifications: `dotnet test --project tests/{Reservations,Notifications}.Tests --filter-class '*OpenApiTests'` (separate commands), exit 2 each, document 404; nondevelopment exposure passed.
- GREEN Inventory: same focused class command, exit 0, 3/3. GREEN Reservations after manual schema/query transformer, exit 0, 3/3. Expanded independent contract assertions (types/nullability/schema bindings/body/query/path/media/security) also GREEN Reservations, 3/3.
- RED manual Reservations contract: focused document command exit 2, missing ReservationInput required metadata; fixed via service-owned transformers without handler/validation changes.
- RED `dotnet test --project tests/IdentityAccess.Tests --filter-method '*DocumentationClient*'`: exit 2, equipment-docs human 403 instead of 200; other three cases pass. Narrow exact client admission implemented.
- RED `dotnet test --project tests/IdentityBootstrap.Tests --filter-method '*DocumentationCodeFlow*'`: exit 2, real Keycloak rejects missing docs client 400; GREEN after provisioning, 1/1, exit 0.
- Real provider positive/unsafe PKCE/grant/origin/callback tests: `dotnet test --project tests/IdentityBootstrap.Tests --filter-class '*IdentityProviderTests'`: exit 0, 21/21 (before final port-zero/stale additions).
- RED port-zero invalid callback: `dotnet test --project tests/IdentityBootstrap.Tests --filter-method '*InvalidDocumentationCallback*'`: exit 2, no exception for localhost:0. Both public UI/provisioning validators now reject uri.Port <1.
- `dotnet build EquipmentReservation.slnx --no-restore -warnaserror`: exit 0. First `npm run check` stopped on import ordering after successful zero-warning build; fixed explicit style imports and rerunning.

## Scope and review notes

Existing real PostgreSQL/WAF fixtures retain routing, metadata, JSON and guards. Authority double replaces external JWKS/discovery only, backed by existing and extended real Keycloak contracts. No solitary application tests added. Expected operation/status/schema values are independently enumerated from feature HTTP contract. Added real Keycloak tests verify unsafe grants, missing/plain PKCE, exact redirect/origin restrictions and reconciliation; privacy extends production exporters, never installs an ActivityListener.

New lockfile transitives in DatabaseBootstrap and all test projects are required because DatabaseBootstrap references API projects for migrations and shared TestSupport references all APIs/bootstrap. No unrelated dependency versions were upgraded.

- Expanded contract checks: GREEN Inventory and Reservations 3/3 each, including operation→response schema/array binding, dates/nullability, named Availability shape, request-body required/media/ref, path/query binding, Inventory service-bearer alternative, and distinct human-role equality.
- Optional problem extensions RED Inventory document assertion (missing code), then GREEN 3/3 after adding optional code/field schema metadata and using ProblemDetails for optional POST 403 body.
- Initial complete backend check after callback fixture repair: 507 tests, 506 passed, 1 failed at new docs raw-URL privacy assertion. All nine backend modules otherwise pass (Integration 2m46s). Failure category was framework DefaultActionDescriptorCollectionProvider event 1 containing its static troubleshooting URL for no controllers. Production documentation registration now filters that nonactionable information event at Warning; assertions unchanged, category diagnostics improved without outputting values. Focused actual doc/fragment callback exporter test GREEN 1/1.
- Both shared test host configurations now explicitly supply a trusted loopback documentation callback to satisfy Development startup; real routing, providers and guards retained.

## Provider readiness investigation

Final pre-readiness-fix full check: formatting, lint, build/style, tooling and frontend pass; backend 507 total, 506 passed, one existing BrokerStartup scoped/Unicode credentials case failed its initial fixture AMQP handshake (`connection.start never received`) after TCP listener readiness. The prior complete run passed that module. Failed container was disposed; historical CPU/memory exhaustion cannot be established. Safe current VM sample showed 6 CPUs/11444MiB and twenty containers, ~5GiB listed memory, two containers CPU-active. This is evidence of concurrent load, not proof of cause. Root preserved local Aspire tunnel failure separately.

Architect recorded targeted fixture design repair: wait for the existing authenticated real management protocol readiness before the first AMQP setup connection. Applied only that ordering, retaining 60s overall startup deadline, production 3s connection settings, real broker, and credential assertions. No retry/sleep or application behavior change. Original failure retained above; recurring failures remain blockers.

- After readiness repair, original focused broker command `dotnet test --project tests/BrokerBootstrap.Tests --filter-method '*ActualScopedCredentialsSupportConfiguredReservedAndUnicodeCharacters*'`: exit 0, 2/2, 36s. This is supported by the readiness-order change, not a blind rerun. Full required suite rerunning to establish wider stability.
- Explicit `npm run format-check`: exit 0. Explicit `npm run lint`: exit 0, build 0 warnings/errors and .NET suggestion-level style checks pass.
- Local AppHost lifecycle is coordinator-owned; initial runtime attempt hit Aspire physical tunnel startup failure (no actual UI/browser evidence yet). Coordinator/architect selected official invocation-only container tunnel disable workaround; no source wiring or authorization relaxation.

- `npm run check` after provider readiness repair: exit 0, 507/507 backend tests (0 skipped), 60/60 frontend tests, 4/4 tooling tests, format/ESLint/build/style all pass. Real providers and native parallel test execution retained; Integration module 3m57s. This establishes full suite stability after diagnosed readiness ordering repair under concurrent local startup load.
- First actual Edge browser run against coordinator-owned APIs: 4/4 fail at navigation; `/scalar/` and `/openapi/v1.json` 404 while `/health` 200. No login reached, no tokens/credentials entered or captured. Coordinator established APIs had neither environment variable and no launch profiles. Architect recorded T015 repair: local run mode propagates actual AppHost environment to both DOTNET_ENVIRONMENT/ASPNETCORE_ENVIRONMENT; does not hardcode Development or weaken default nondev exposure. Exact `dotnet build src/AppHost/AppHost.csproj --no-restore -warnaserror`: exit0, 0 warnings/errors. Coordinator restart/actual route checks pending.
- Browser artifact hardening: pinned Playwright captures failure-page aria context even with trace/screenshot/video disabled. Config sets its PLAYWRIGHT_NO_COPY_PROMPT guard before authenticated browser runs; this prevents page snapshot collection. Initial 404 failures occurred before any authentication. API origin validation also rejects explicit port zero.

## Actual Scalar browser validation

Coordinator-owned Development runtime allocated API origins on ports 58706/58705/58710 and Web58713; trusted Keycloak authority HTTPS127.0.0.1:18080. Edge executable supplied through BROWSER_EXECUTABLE; credentials read only from coordinator's private mode0600 account fixture, never printed. No TLS bypass, traces, screenshots, video or network-body artifacts. Context-wide request listeners admit only each exact configured API origin and the configured Keycloak origin, including popups.

- Actual code/S256/fragment popup login + token200/exact token CORS, visible Access Token readiness, same-origin authenticated equipment read200, no JWT local storage and a fresh-context UI request401: GREEN.
- Actual Employee Scalar JSON-body editor creates201; Scalar path editor cancels200 with empty body; normal browser-write guard retained: GREEN.
- Isolated Approver authenticated Scalar write returns403: GREEN.
- Actual cancelled popup and browser-boundary provider-transport abort both retain unauthenticated UI request401: GREEN.
- All3 Scalar UIs load local bundled assets, no interactive Agent Scalar button, exact destination assertions pass. An inert SVG symbol contains the text Agent Scalar; checks concern the actual interactive control rather than hidden/inert icon definitions.
- Accepted vendor accessibility Q-IMPL-003: initial Inventory axe WCAG A/AA reports aria-required-attr(critical, auth combobox controls), button-name(critical, scope toggle), color-contrast(serious, search/client tabs), html-has-lang(serious). Tests retain per-state diagnostics as explicit accepted-vendor-accessibility annotations, not a claim of clean WCAG. No vendor DOM/CSS/ARIA customization was made, following owner steering. Application-owned accessibility requirements unchanged.

### Unresolved browser OAuth stability investigation

Whole suite reached7/8 pass; sequential login sometimes produces token400 invalid_grant / Code not valid, independent of human role. Isolated successful runs are not accepted as resolution. Tight protocol assertions establish: one login-formPOST, one context-wide tokenPOST, a single body client_id exactly equipment-docs, no Authorization secret header, exact redirect URI equality, issued callback code/state equality, and actual verifier SHA256 equals popup S256 challenge. A failing grant callback-to-response age was220ms. No code/token/verifier/session identifiers are printed or persisted. Pinned Scalar source uses one200ms popup polling handler with clearInterval before exchange; architecture research excludes a built-in postMessage+poll double path. Root safely counted provider warning classes: bound-to-different-client is present; other parser fault classes absent. Root/architect continue server/client binding diagnosis. Functional browser task remains pending; no rerun-only flaky pass claim.

## Callback corruption root cause and repair

Root's safe provider-log inspection mapped every different-client warning to the correct documentation client ID with literal `/description/introduction` appended. The full Scalar callback UI router mutated the fragment before its original200ms parent poll. This explains role-independent single-exchange invalid_grant with correct original PKCE/credentials; it was not an authentication-policy exception or an accepted flaky test.

Approved repair gate ddb0211814a20da4b22929305d7bcd2b62ba80bdf43fa5b0d65c18b805c7f558 selected `/oauth/callback` outside Scalar routing. RED public Inventory HTTP regression expected200 got404 (exit2). Implemented static Development-only callback with no scripts/resources/router/redirect/reflection/query parsing, `Cache-Control: no-store`, `Referrer-Policy: no-referrer`, `Content-Security-Policy: default-src 'none'`. Exact new path validators/provisioning/runtime references/provider fixtures and browser expectations updated atomically; UI/dashboard remains `/scalar/`. Original Scalar opaque-code polling/state/S256 exchange retained without trimming or transforming codes. Browser captures immutable FIRST code-bearing callback navigation and compares opaque code/state with actual exchange in memory.

Callback uses a static `Task(HttpContext)` method group selecting the direct RequestDelegate MapGet overload, and HttpResponse.WriteAsync with RequestAborted. There is no Minimal API parameter binder or application JSON serialization to source-generate. Analyzer-identified redundant cast removed without changing overload.

Focused refreshed checks: all3 service OpenApiTests classes3/3 each GREEN; real IdentityProviderTests23/23 GREEN on exact new callbacks; actual Reservations docs+new-callback production-exporter privacy1/1 GREEN. Exact AppHost build after final typed handler passes with0warnings/errors1.64s. Scoped browser ESLint passes. Actual new runtime/browser validation pending coordinator-owned restart. Prior completed task IDs/history preserved as plan requires; affected claims await this fresh runtime evidence.


### Repaired callback actual runtime results

Coordinator-owned restarted Development APIs used ports63300/63307/63305, Web63301, with unchanged trusted HTTPS Keycloak authority. Actual OpenAPI browser suite:9/9 passed,0skipped,0flaky,17.26s. Complete existing plus new browser suite:27/27 passed,0skipped,0flaky,33.53s. Commands used exact loopback API_INVENTORY_URL/API_RESERVATIONS_URL/API_NOTIFICATIONS_URL/API_WEB_URL, private IDENTITY_BROWSER_ACCOUNTS_FILE, and BROWSER_EXECUTABLE pointing to installed Edge:

```sh
npm --prefix src/Web run test:browser -- openapi.spec.ts --reporter=json
npm --prefix src/Web run test:browser -- --reporter=json
```

Safe structured reports are /tmp/openapi-browser-callback-final.json and /tmp/openapi-all-browser-final.json; npm preamble precedes JSON. Sequential actual Employee then Approver login now passes immutable first opaque callback code/state equality, unique equipment-docs body client, no Basic secret, S256, fragment response and exact token CORS. Actual Scalar read200/create201/cancel200/Approver403/fresh-context401/cancelled-login401/provider-outage401 pass. Context-wide destination assertions span page and popup over authenticated operations, allowing only exact configured API and provider origins. Application-owned inert callback preserves fragment, has no scripts, retains CSP/no-store/no-referrer, and passes clean axe. Bundled vendor findings remain explicit Q-IMPL-003 diagnostic annotations; no clean-vendor-WCAG claim or accessibility customization.

No TLS bypass or token injection was used. Coordinator handles final actual dynamic registrations/dashboard/native keyboard/trace evidence and owned lifecycle. Browser complete; final revision-matched mandatory checks pending runtime stop.


## Final revision mandatory check observation

After coordinator stopped the final owned runtime (exit0), `npm run format-check` and `npm run lint` both passed; lint build0warnings/errors and suggestion-level style verification. `DOCKER_HOST=<documented Podman socket> TESTCONTAINERS_RYUK_DISABLED=true npm run check` currently reports one existing Integration fallback test timeout at OutboxNotificationTests.cs:195 (first publication after manual schedule Advance). Original evidence preserved in /tmp/openapi-revision-final-check.txt. This is a failed required gate; earlier507/507 run does not replace it. No budget/concurrency/source changes or blind reruns made. Investigating the manual schedule cancellation/startup-signal ordering before deciding a repair; production failure versus test-harness ordering is not yet proven.

Final failed check completed exit1:507total,506passed,1failed,0skipped,2m50.61s. Only MissingTriggerAndManualRepairAreRecoveredByFallback failed; all other backend modules and tooling/frontend checks passed. Architect independently identified that ManualSchedule.DelayAsync cancellation only abandons WaitAsync while leaving its queued completion live; a startup signal can cancel selected timer before Advance. Awaiting targeted fixture repair gate and deterministic reproduction, without altering production behavior or deadlines.


## T024 deterministic scheduler boundary repair

Approved final-round scope: tests/Integration.Tests/OutboxNotificationTests.cs only (plus this evidence/tasks). Regression uses scheduler public DelayAsync/NextAsync/Advance controls, independent of application private state. RED command `dotnet test --project tests/Integration.Tests --filter-method '*ManualScheduleAdvancesReplacementWhenPreviousDelayIsCancelled*'` with documented provider environment exited2,0/2 passed. Cancellation before selection returned stale30s rather than replacement10s; cancellation after selection left replacement blocked and timed out5s. This establishes the inspected test-boundary defect causally rather than accepting a rerun.

Repair registers cancellation on the queued completion itself. Selection skips cancelled entries; async advancement atomically completes the first currently live delay, selecting replacement if a previously selected delay cancels. Both selection/advancement have one unchanged5s bound; existing controls are awaited. Production worker/listener, deadlines, retry behavior, concurrency, assertions and real provider boundaries remain unchanged.

GREEN same deterministic command:2/2,0skipped,3.00s. Unchanged real application regression `dotnet test --project tests/Integration.Tests --filter-method '*MissingTriggerAndManualRepairAreRecoveredByFallback*'`:1/1 pass, using isolated real PostgreSQL, actual worker/listener/store and API booking. Safe logs: /tmp/openapi-scheduler-red.txt, /tmp/openapi-scheduler-green.txt, /tmp/openapi-scheduler-fallback-green.txt. Per-edit exact-file formatting completed before each read/run; final format-check passes. Final lint/fullcheck pending. Browser/application source unchanged since27/27 browser pass; no runtime restart required for test-only boundary repair.

T024 final format-check and lint both pass. Final fullcheck exposed a different provider-boundary cluster:34 Reservations cases time out while Npgsql loads backend type metadata in PostgresFixture.CreateMigratedDatabaseAsync line64 before business requests. Connection bootstrap budget remains3s; extension setup already separately allows30s. No source deadline/retry/concurrency changes made. Safe live snapshot showed23containers, including15old45min–2h containers and8current; current Keycloak instances CPU~127%/236%, VM11.62GB. This suggests load but does not establish historical exhaustion. Coordinator notified to assess ownership-scoped stale runtime cleanup; no broad pruning performed. Original failed run retained at /tmp/openapi-t024-final-check.txt. Required full gate remains pending until diagnosed environment/revalidation.


### Final handoff: required gate failed, no completion claim

Final T024 revision `npm run format-check` and `npm run lint`: exit0; warning-as-error build and suggestion-level style verification pass. Final provider-backed `npm run check`: exit1 (backend MTP exit2),509total,475passed,34failed,0skipped,2m46.70s. All34 failures are Reservations fixture bootstrap reads in Npgsql.LoadBackendTypes before business requests, not a proved application recovery failure. Integration module passed2m46.38s, including deterministic T024 cases and unchanged real fallback behavior. Reservations is the sole failed backend module; the remaining8 passed. Frontend60/60 and tooling4/4 pass. Full safe log /tmp/openapi-t024-final-check.txt; no rerun, timeout increase, exclusion, concurrency restriction or extra source repair was performed. T021/T024 remain pending as required full validation is not green; coordinator owns needs_intervention metadata and acceptance.

Safe ownership investigation after process exit:15active containers remain, all labeled org.testcontainers=true/dotnet. Eight were created15:22–15:23 and seven16:30–16:31 local2026-10-19; none belong to the final17:29run (its containers disposed normally). Allowlisted IDs/creation/image/session-label records are in /tmp/openapi-final-container-ownership.json. Labels establish Testcontainers provenance, not exclusive ownership by this implementation session or that another process does not use them. No containers were stopped/removed, no prune command executed. Resource contention is a hypothesis, not a demonstrated cause of the34 bootstrap timeouts. Potential cleanup/resume requires scoped ownership verification and coordinator/human direction; it is not a reason to claim the gate passed.

Source and browser implementation remain frozen since final reviewed snapshot. Earlier27/27 actual trusted-TLS browser pass remains applicable to unchanged application/browser source, with vendor accessibility diagnostics accepted only under Q-IMPL-003 and owned callback axe clean. Coordinator's exact private account-fixture folder is no longer needed by the coder; no credential values were copied into repository evidence. Final diff whitespace inspection passes.


## 2026-10-20 authorized validation resume and environment intervention

Human authorized continuing beyond the previous repair-round limit; required checks and policies remain unchanged. Source frozen at reviewed b485 snapshot; no production/test source edits. Re-read constitution/protocol/current role and implement prerequisites; active feature remains010. Today's five user-owned Aspire resources were explicitly left running and untouched.

Prior34 failures are first-connection Npgsql LoadBackendTypes/DataSource.Bootstrap read timeouts at fixture line64, before CREATE EXTENSION or business HTTP behavior; extension SQL30s budget does not cover connector metadata3s budget. No deterministic application defect established and no timeout/retry/concurrency changes authorized.

Ownership corroboration: old15 containers have exact saved Testcontainers session labels and yesterday creation windows. Six PostgreSQL containers have6/28/135/6/4/110 fixture test databases; sampled known equipment/reservations/outbox/schema tables match this repository. All eight old PostgreSQL instances report0active and0other client connections. All three old RabbitMQ instances contain exact equipment vhost, reservations exchange and reservation-notifications queue, with0connections. One Keycloak instance confirms equipment realm and exact four API/Web clients plus documentation client; the other two share exact session groups with that instance or a directly proven repository PostgreSQL instance. Safe host process names/start times show no surviving yesterday test processes. Exact old IDs were absent from successful-module logs; creation timing alone was not used as ownership proof. Aggregate database/topology evidence and exact session groups supplied alternate corroboration. No personal rows, credentials or token values were printed.

Coordinator authorized reversible exact-container stop after corroboration. `podman stop --time 10 <exact15IDs>` exited0 and stopped15. Containers and volumes remain preserved; no remove/prune command. Exact IDs:

6a7f59f5eb47, 2eaf30316207, 9e2c43707f8b, 817fd2d6dee2, d4e090b8f963, 0c4456ecd37b, d6bcce736f35, c08a9cbf7692, 1695e54a0f7f, 44ebc369f189, da158b59ec94, eb4bf63c9c39, adb23c9f9a3d, ed042e09e007, 51ede467df17

Current resource delta:20running containers/~4998MB listed memory before,5running/~1137MB after. Remaining exact user-owned IDs:9bb509ee0d30,c9219d207fb2,309f457bf5dd,3143d59620c5,8632ae763a83. Safe raw aggregate records are /tmp/openapi-resume-provider-provenance.json, /tmp/openapi-resume-identity-provenance.json, /tmp/openapi-resume-broker-provenance.json and /tmp/openapi-resume-stats-{before,after}.json. The ~3861MB released is a concrete environment intervention; it does not prove historical CPU/memory exhaustion caused the prior failures.

Focused diagnostic now runs unchanged `dotnet test --project tests/Reservations.Tests` with native default parallelism and documented DOCKER_HOST/TESTCONTAINERS_RYUK_DISABLED environment. Result pending; a focused pass alone cannot close the required fullcheck gate.

Post-intervention focused diagnostic passed172/172,0failed,0skipped,29.07s. Exact command `DOCKER_HOST=<documented Podman socket> TESTCONTAINERS_RYUK_DISABLED=true dotnet test --project tests/Reservations.Tests`; log /tmp/openapi-resume-reservations-diagnostic.txt. No test/source/budget changes, no sequential exclusion. Full `npm run check` now runs on frozen reviewed source with original default module parallelism and same environment; result pending. Both requirements checklists remain16/16; no extension hooks file; prerequisite script confirms exact010 feature.


### Resumed full gate and distinct recovery diagnostic

After intervention, full `npm run check` exited1:509total,508passed,1failed,0skipped,2m50.21s (/tmp/openapi-resume-final-check.txt). Reservations module passed42.56s; prior34-case bootstrap cluster did not recur in that run. Distinct existing PublisherAttemptHasThreeSecondBudgetAndHostDisposalCancelsBackoff timed out its shared10s observation at ControlledSchedule.NextAsync. Inspection confirms the scheduler cannot hide the first delay: it enqueues before waiting, and no Advance occurs before failure. Shared deadline begins before host creation and includes host/listener/DB/publish3s/rollback/reschedule phases; exact historical phase at failure was unavailable.

Coordinator approved temporary safe phase instrumentation only in ReservationRecoveryTests.cs, preserving all semantics/budgets/assertions. Focused diagnostic1/1 passed: host83ms, publisherentry97ms, cancellation3099ms, scheduler/probe3148ms; event1,canceltrue,workerpending/noerror,row1,attempt1,futureretry. Same9module native-parallel diagnostic ended508/509,1failed,0skipped,2m49.94s (/tmp/openapi-recovery-phase-parallel.txt). Recovery phases again normal: host157ms,entry174ms,cancel3176ms,schedule3192ms. This diagnostic pass is not closure; one Reservations case instead reproduced LoadBackendTypes timeout. Original source restored and formatted to exact SHA2561ad2d36a2f6c3bfcbd1dc3c5e7c77b855ff87124e4fc85ad4c2f2433250d9ce6. No permanent helper/deadline fix justified. Temporary diagnostics numeric/boolean/type-only JSON: /tmp/openapi-recovery-phase-{focused,parallel}.json.

Fixed VM counters during diagnostic:6vCPU,11444MiB,93GBdisk; CPUpressure someavg10=20.51%,avg60=22.29%; IOsomeavg60=7.17%,full2.60%; memorypressureavg10=0,MemAvailable~7.17GB,VMswap0. Host12logicalCPU/32GiB,hostswapused2521MB. CPU/IOpressure is supported; VMmemoryexhaustion is not. A later PG sample had9/13connections,0active/0locks and no connection-exhaustion/OOM/deadlock markers; sampling was after the failing wave and cannot establish its cause. Safe records: /tmp/openapi-resume-vm-pressure.txt and /tmp/openapi-recovery-parallel-pg-state.json. No further whole9module rerun without a changed causal variable.

### Tight bootstrap reproduction baseline

Approved throwaway console /private/tmp/openapi-bootstrap-repro calls actual public PostgresFixture.CreateMigratedDatabaseAsync("reservations"), real migrations and original3sconnection/5scommand/30sextension budgets. It records only per-scenario duration/success/error-type/bootstrap-stack-category and100ms aggregate PGclient/lock/IO/metadata-query counters. It is diagnostic minimization, not an application behavior regression or change to acceptance concurrency.

Fresh-container64scenario wave:64/64success,1.568s,peak65clients,0locks,4IOwaits. Fresh172scenario wave:172/172success,4.579s,peak173clients,0locks,15IOwaits. Originalcontainers disposed normally. Setupalone does not reproduce the full-run failure; these passes do not close gates. Safe records /tmp/openapi-bootstrap-repro-{64,172}.json. Investigating cross-project cold-start pressure versus client-side test/HTTP scheduling before proposing any source change.

Approved single-variable tightrepro with172real database setups overlapping two actual IdentityProviderFixture cold starts:172/172success,0bootstrapfail; PGwave9.806s,providersready17.98s. Peak174clients,1lockwait,112IOwaits. CPUpressureavg10=26%,memorypressure0. Both newly owned providers and PostgreSQL container disposed normally; userAspire unchanged. This authentic load doubles baseline wave duration but does not reproduce metadata failure, so it is not a fix or accepted gate. Records /tmp/openapi-bootstrap-repro-172-cold.json and /tmp/openapi-bootstrap-repro-cold-pressure.txt. Next hypothesis is client-side WAF/HTTP initialization/continuation pressure absent from setup-only console; no permanent source changes.


### Faithful WAF and exact-module diagnostic limits

Console WAF smoke was not faithful to testhost content-root/deps context (InvalidOperationException); it was discarded as setup evidence. Coordinator approved ephemeral diagnostic in existing Reservations friend assembly, using actual internal BookingScenario.CreateAsync (real migrations, WAF/auth setup) and public health HTTP.64scenario wave succeeded4.628s (pending23/thread43,65PGclients/0locks/8IO);172wave succeeded13.274s (pending54/thread84,173clients/0locks/14IO). These are workload diagnostics, not application-regression acceptance; no source interfaces were exposed. Temporary Fact removed before the next experiment.

Exact existing Reservations module172tests then ran with native default parallelism during two actual IdentityProviderFixture cold starts. Only ephemeral module initializer sampled safe process CPU/ThreadPool/GC aggregates; no added Fact or behavioral changes. Command `dotnet test --project tests/Reservations.Tests --no-build` with documented provider environment:172passed,0failed,0skipped,28.55s. Safe log /tmp/openapi-reservations-actual-cold.txt. Client peaks:pending124,threads68,GCpause10.86%,3gen2collections,494MB allocated; maximum100ms-sampler interval315ms. Recorded PGpeaks135clients/134active/0locks/8IO/0metadata; VMCPUpressureavg10peak25.36%,IO4.52%,memory0. Limitation: externalPGsampling began14s after module assembly load, so did not cover an initial8s failure window; no failures occurred in this diagnostic run. No inference of historical healthy PG execution is justified.

Two scoped provider fixtures disposed normally after an exact owned stop marker; holder exited0. User runtime left untouched. Safe records /tmp/openapi-reservations-live-client.json and /tmp/openapi-reservations-actual-cold-pressure.json. This narrowed actual workload still does not reproduce the intermittent whole-suite failures. No permanent source fix or deadline/concurrency relaxation is justified by these passing probes; full required gate remains failed/pending.


### One exact-profile early-window diagnostic and exact restoration

Coordinator approved a single further exact9module diagnostic to discriminate hypotheses with previously missing early PG coverage. Temporary Reservations-only module initializer opted its own process into fixture monitoring; each of its PG fixtures opened one additional persistent read-only connection, awaited its first aggregate sample before tests, then collected100ms counts. This is an explicit observer cost, not a production change. Original connection/SQL/extension budgets, assertions, tests and module concurrency remained unchanged. Recovery numeric phase instrumentation was temporarily reapplied. Build `dotnet build EquipmentReservation.slnx --no-restore -warnaserror` passed0warnings/errors.

`dotnet test --solution EquipmentReservation.slnx --max-parallel-test-modules 9 --no-build` with documented provider environment passed509/509,0skipped,2m45.09s (/tmp/openapi-early-profile-diagnostic.txt). This is diagnostic evidence only: extra monitoring connections/timers may affect scheduling and cannot replace required validation on original source. Early PG330samples peaked136clients/134active/5locks/101IOwaits/maxactive9.10s,0active metadata-query matches. Clientpending29/thread75/GCpause5.3%/4gen2collections. Recoveryhost70ms,entry84ms,cancel3085ms,schedule3099ms,oneevent/canceltrue/workerpending/noerror/row1attempt1futureretry. No failing case was reproduced, so no causal source fix is justified.

The intended repeated VM sampler's SSH transport timed out15s and failed before persisting its in-memory samples; early VM evidence is unavailable, not inferred. A later bounded fixed sample recorded CPUpressureavg60=20.28%,IO5.33%,memory0.04%,MemAvailable8.03GB; this is not first-window proof. Safe retained sources: /tmp/openapi-early-pg-*.json, /tmp/openapi-reservations-live-client.json, /tmp/openapi-recovery-phase-early-pg.json, /tmp/openapi-early-profile-vm-final-sample.json.

After process exit0, all ephemeral repository instrumentation was restored/removed and exact-file formatting completed. Byte-for-byte verified original PostgresFixture SHA256c1448910246710259aff7a9086cc663619351b35253334eb4a4008dcdc5c7eba and ReservationRecoveryTests SHA2561ad2d36a2f6c3bfcbd1dc3c5e7c77b855ff87124e4fc85ad4c2f2433250d9ce6. BootstrapPressureDiagnostics.cs deleted entirely. `git diff --check` passes. No permanent production/test source changes were made during resume.

Human explicitly authorized a brief stop/restart of their currently running Aspire environment. Coordinator owns that lifecycle action after this diagnostic ended; coder has not touched the user runtime. Required uninstrumented fullcheck will follow the coordinator's confirmed stop as a distinct environment-isolation intervention, preserving all prior failures and avoiding any policy waiver.


## Final uninstrumented isolation gate (2026-10-20)

Human explicitly authorized brief stop/restart of their active Aspire environment. Coordinator reported exact src/AppHost/AppHost.csproj stopped with exit0; coder did not perform that lifecycle action. Safe precheck confirmed0running containers (/tmp/openapi-isolated-capacity.json), while preserved abandoned containers remain stopped rather than removed. This is a concrete additional environment intervention, not an acceptance-by-rerun or a change to test policy.

Original source hashes reverified after all diagnostics: PostgresFixturec1448910246710259aff7a9086cc663619351b35253334eb4a4008dcdc5c7eba, ReservationRecoveryTests1ad2d36a2f6c3bfcbd1dc3c5e7c77b855ff87124e4fc85ad4c2f2433250d9ce6; BootstrapPressureDiagnostics.cs absent. Reviewed application/browser source unchanged. Final explicit `npm run format-check` and `npm run lint` both exit0; zero build warnings/errors and suggestion-level style checks pass. Logs /tmp/openapi-isolated-format-check.txt and /tmp/openapi-isolated-lint.txt.

Uninstrumented `DOCKER_HOST=<documented Podman socket> TESTCONTAINERS_RYUK_DISABLED=true npm run check` is now executing with original native test/module parallelism, budgets and assertions, no extra telemetry/probe connections/timers. Result pending at /tmp/openapi-isolated-final-check.txt. Earlier failures and diagnostic limitations remain preserved above. Coordinator alone owns subsequent runtime restoration, independent verdicts, convergence and human feature acceptance.


### Final executable result: all required checks pass on restored source

The final uninstrumented `npm run check` exited **0** on the restored reviewed application/test revision: **509/509 backend tests passed, 0 failed, 0 skipped, 2m37.09s**. All nine backend modules ran with the original native parallel profile; Integration also passed, including the previously failing recovery observation and T024 scheduler regressions. Frontend **60/60** and tooling **4/4** passed. Formatting, ESLint, warning-as-error build and suggestion-level style verification passed. Final explicit `npm run format-check` and `npm run lint` also exited0. Exact command:

```sh
DOCKER_HOST=unix:///var/folders/6k/z9rq_rsj7gj5ghmy_rx43nzh0000gp/T/podman/podman-machine-default-api.sock TESTCONTAINERS_RYUK_DISABLED=true npm run check
```

Evidence: /tmp/openapi-isolated-final-check.txt, /tmp/openapi-isolated-format-check.txt, /tmp/openapi-isolated-lint.txt. The run began with **zero pre-existing running containers** after ownership-proven abandoned fixtures were reversibly stopped and the coordinator performed the human-authorized user Aspire stop. Post-check inventory again reports0running containers; all new required-test providers disposed normally (/tmp/openapi-isolated-postcheck-capacity.json). This is an environment-isolation intervention with unchanged code, concurrency, deadlines and assertions. Prior failures remain preserved; the exact underlying CPU/I/O/client scheduling mechanism was not deterministically reproduced and is not claimed proven or repaired by source changes.

After the successful run, both original source backup hashes still match byte for byte and the temporary diagnostic module remains absent. `git diff --check` passes. No permanent production/test source changes occurred during this authorized resume; only this implementation evidence was updated. The earlier27/27 trusted-TLS browser result remains applicable to unchanged application/browser source, including explicit Q-IMPL-003 vendor accessibility diagnostics and clean owned callback checks. Runtime restoration is now safe and remains coordinator-owned. Independent review/convergence/metadata and explicit human feature acceptance are separate gates owned by the coordinator; this author result does not self-approve them.
