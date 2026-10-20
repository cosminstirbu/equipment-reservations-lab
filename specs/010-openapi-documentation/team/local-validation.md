# Coordinator local validation — 2026-10-19

Backend content snapshot: `de8768a34a7f51e9a1128d8de203c0c942067d822b927c53abdd66bc706d4601`. Hash definition: sorted modified/untracked Git file names + NUL + bytes, excluding specs, Web and readme. Browser tests tracked separately by coder; no claim of final feature completion.

## Lifecycle and environment

- Initial `aspire ps --format Json`: no running AppHosts. Coordinator owns only the exact `src/AppHost/AppHost.csproj` sessions started here.
- First startup failed in Aspire container-network tunnel proxy creation; identity never started. Exact owned stop returned 0, retaining existing volumes and user secrets.
- Supported invocation-only `ASPIRE_ENABLE_CONTAINER_TUNNEL=false` resolved the tunnel failure. No package, endpoint-proxy, volume or credential change. Official reference: https://aspire.dev/fundamentals/container-networking/#disable-the-container-tunnel . First workaround run APIs were healthy but docs/UI404, exposing missing child host environment configuration; stopped owned session0 before targeted AppHost repair.
- Current restart after repair: APIs and Web readiness commands all exit0. Both child `ASPNETCORE_ENVIRONMENT` and `DOTNET_ENVIRONMENT` are Development. Identity issuer remains `https://127.0.0.1:18080/realms/equipment`, with normal trusted TLS, no certificate bypass.
- Runtime origins: Inventory `http://127.0.0.1:58706`, Reservations `http://127.0.0.1:58705`, Notifications `http://127.0.0.1:58710`, Web `http://127.0.0.1:58713`. Each actual resource URL collection contains its `/scalar/` API documentation link. Prior run used different 568xx API allocations.
- Current APIs each return document200 and UI200. Documents are OpenAPI3.1.1, exact business operation counts2/5/1, and every path starts `/api/`.
- Native Edge dashboard inspected: three API documentation links were visibly present. Native Edge Inventory UI now loads with operation list, schemas, authentication controls and real-data warning in title.

## Runtime client reconciliation

Read actual Keycloak equipment-docs configuration via existing private admin credential held only in subprocess memory and normal validated TLS. Exact current three callback URI set and three WebOrigins match allocated API origins; prior568xx callbacks removed. Public client and standard flow true; implicit flow, password/direct grants and service accounts false; PKCE S256. No credentials/tokens emitted or committed.

## Native keyboard diagnostic

Native Edge via CUA: Tab focuses Search with visible focus ring; Enter opens search and focuses query; Escape returns focus; Tab advances to Introduction. Test Request opens client panel with Close focused; Cmd+Enter executes actual anonymous equipment GET and visibly shows401; Escape dismisses panel and restores focus to Test Request. No native-login secrets entered or captured. Remaining authenticated behavior is coder browser evidence. Vendor accessibility findings accepted only under explicit owner exceptionQ-IMPL-003; these observations do not claim clean WCAG AA.

## Trace diagnostic

Aspire CLI selected current Reservations document trace `eca9e59330f637559f0a6acf84bc86be`, span `e9abf8cc760a668a`, route `/openapi/{documentName}.json`, GET200,96ms, one span, no error. Actual exported attributes include bounded route, method/status, server and protocol/path; no authorization/cookie/token/password/query/body attribute and no private account credential match. Raw captured telemetry stays in private temporary directory and is not a committed artifact. This is representative runtime evidence; production-exporter success/failure tests establish broader coverage.

Actual identity bootstrap trace `106c5ea446414c8c5cf8a323ac6d39e1`: identity.bootstrap,1829ms,66 correlated spans (1Internal/65Client),no error. Client attributes only HTTP method/status, network protocol and server address/port; no forbidden token/cookie/query/body/password attribute or private account credential match. This verifies real provisioning dependency spans were exported by the running application.

Infrastructure follow-up: current identity, messaging, PostgreSQL and pgAdmin all Running/Healthy. Exact container publication checks show only loopback listeners (identity2, messaging2, PostgreSQL1, pgAdmin1). Earlier pgAdmin warm-up/failure observations were not counted as passing; final current observation is healthy. No volumes/secrets reset or unrelated containers pruned.

## OAuth callback repair and cleanup checkpoint

The above live runtime is historical evidence before Q-IMPL-004 repair. Full Scalar callback page mutated code fragments by appending literal `/description/introduction`; six private provider warnings confirmed the added suffix on the known documentation client identifier. No authorization code or session value was emitted. The owned session was stopped successfully (exit0) before backend edits. Current replacement callback route `/oauth/callback` requires a fresh startup, registration/exposure and sequential browser proof; prior `/scalar/` callback acceptance is not current approval.

## Pending

Actual browser login/write/denial/privacy full results, final required checks, final independent reviews, convergence and explicit human acceptance remain pending. Current owned session cleanup is still due after browser/trace checks. Vendor axe findings remain recorded under the approved exception.

## Current isolated-callback runtime revalidation

Backend snapshot `a16b900e70db36a3714e03959209ae4fcb2127840228bb38ea3df1ba112a1164`. Owned start4 and readiness commands exit0, same ordinary secrets/volumes and invocation-only tunnel=false. API origins Inventory63300, Reservations63307, Notifications63305; Web63301, exact issuer unchanged. All three document/UI/callback endpoints200; 3.1.1 exact2/5/1 businessoperations, callback static scriptless and headers no-store/no-referrer/default-src none. Resource URL collections show all three /scalar/ dashboard links.

Actual Keycloak dedicated client re-read securely with normal TLS: exact current3 `/oauth/callback` redirect set and3 origins, prior `/scalar/` callback registration removed, public/code-only/S256 preserved. No secrets or tokens emitted. Full new browser suite9/9, no retry/skipped, supplied by coder; final existing suite/check evidence remains pending.

Final current callback trace `39dcb8c15d9866f70e1184a5d5e5018f`: GET /oauth/callback,2ms,one span,no error. Current bootstrap trace `dddb8b857d0fd76de26512110f127470`: identity.bootstrap,2344ms,66spans,no error. Their exported span summaries contain no token/cookie/query/body/password field or private account credential match. Old trace records above remain historical; these identify the repaired revision.

## Final local cleanup

Current owned AppHost stopped successfully (exit0) after full browser27/27 pass (OpenAPI9/9 included), no retries/skips. Ordinary volumes and user-secret store preserved. Private credential/telemetry captures retained only until review handoff, then coordinator deletes its exact temporary folder. Attempt to close the native inspection tab failed at initial state read with cgWindowNotFound; no other browser tabs were touched. This does not change the recorded native keyboard observations.

Final implementation snapshot: `276f33e9f0fd1db582594bb774e13b91260041ce1fea56567b5dda0fa9e5cc03`. Final repository-wide scripts and independent whole-scope reviews are in progress.


## Handoff state (supersedes earlier pending runtime notes)

Current implementation snapshot `b485c18cd86b77bbf28e87b16960d98aad2c609d3868def74bd46412b982fa6a` verified against all47 manifest entries; only scheduler test differs from full browser27/27 snapshot. Runtime/manual gate T022 is satisfied by the observations above, subject to the explicit vendor accessibility exception. Owned AppHost is stopped; exact owned private credential/telemetry folder deleted at handoff. Ordinary volumes/secrets and unrelated resources preserved.

Final formatting/lint pass, source quality/security reviews pass, but mandatory repository check fails34/509 during PostgreSQL fixture startup (475pass,0skip). Three implementation repair rounds exhausted. State is needs_intervention; full validation, final convergence and explicit human acceptance remain pending. Resource pressure is an investigation hypothesis, not a proven failure cause. No additional retries or source relaxations authorized.


## Resumed final validation and authorized runtime restoration — 2026-10-20

Owner authorized work beyond repair limit and separately authorized stopping/restarting current Aspire for isolation. Required uninstrumented check now passes509/509 backend,60/60 frontend,4/4 tooling; explicit format/lint pass. All temporary diagnostic source restored exactly and throwaway harness removed; original failed runs preserved. Measured contention evidence does not prove a precise historical root cause.

Exact src/AppHost/AppHost.csproj stop exited0. After checks, same AppHost start exited0 using ordinary Podman settings/secrets/volumes (no isolated secrets or force deletion). Aspire wait confirms inventory, reservations, notifications and web healthy; all infrastructure healthy and bootstrap jobs Finished in describe. Single requests after readiness confirm all three document/UI/callback routes200: Inventory50674,Reservations50673,Notifications50672 loopback origins. User runtime intentionally left running as authorized.

Current source snapshot remains b485c18cd86b77bbf28e87b16960d98aad2c609d3868def74bd46412b982fa6a. Independent quality/security PASS and final convergence clean; completion-metadata edits only. T023 and feature status remain awaiting explicit human acceptance, not Complete.
