# Native fixture diagnostics, implementation repair11

Author implementation; independent review and actual provider reruns remain pending.
Coordinator released exactly the new helper/test, four affected native fixture files,
and this evidence after batch10 reviewer closure. Source does not alter provider
profiles, native test assertions, timeouts, parallelism, readiness or scheduling.

## Boundary and standards

Required constitution, testing/tooling/formatting guides and diagnosing-bugs skill
apply. Phase1 RED is the original combined CI command (258 cases,4 failures), followed
by the actual minimized four-file concurrent reproduction (3 pass,1 failure).
team/combined-provider-failure-diagnosis.md records resource observations, cleanup and
limits. Resource pressure is not silently promoted to a proved root cause or OOM.

New finishNativeFixture retains the existing processFailure, cleanupAll and
runPrivateProcess boundaries. Fixed source-owned phase/tool labels identify bootstrap,
prerequisites, account/secret operations, TLS health/authentication and each cleanup.
Process metadata is reprojected without original messages, captured tails, args,
URLs, environment, stdin or causes. Arbitrary primary/cleanup exceptions become
bounded safe metadata. Primary failures are preserved while every cleanup is attempted;
secondary failures are reported separately. Existing process/global modules unchanged.

The four native fixtures now catch primary errors before finally cleanup. Admission's
positive apply assertion uses the safe ProcessFailure as its assertion message/error,
preserving status/duration without raw spawn output. The reviewed negative verdicts
remain booleans; no native assertions or admitted/denied templates changed. Bundle
cluster cleanup now explicitly uses its exact private kubeconfig, avoiding default
user kubeconfig. TLS close, cluster/pod removal and private directory cleanup are
separate operations so one failure cannot prevent later cleanup.

## Regression design and RED/GREEN

Public helper tests retain real node subprocesses and production process/cleanup
collaborators. No process/cleanup mock replaces owned behavior. Primary exit11,
cleanup exit17 and a later successful marker subprocess verify both safe outcomes,
primary precedence and cleanup attempt-all. Children print a private environment
sentinel to both streams; assertions check its absence using booleans, so a failing
privacy assertion itself does not print secret text. Primary-only and cleanup-only
cases are included. Pure metadata projection cases justify narrow isolated tests:
arbitrary exception bodies and preexisting ProcessFailure captured tails/foreign
labels must never be forwarded.

Initial missing-module RED preceded helper implementation. A minimal legacy-style
cleanup-only forwarding helper then ran actual subprocesses: FAIL4/4,1.05s, showing
primary status/phase missing or replaced by cleanup and generic labels. No production
source was mutated to manufacture that RED. After primary/cleanup safe projection:
node --test scripts/azure-native-fixture.test.mjs
PASS5/5, zero skips,1.07s. Per-edit formatter/re-read completed; an intermediate ACME
nested-finally edit syntax error was caught by Prettier, corrected and re-read before
handoff. Scoped format-check and ESLint max-warnings0 PASS for all six source files.

## Separate pending body-read risk

Telemetry HTTPS resumes the response and handles end but lacks an absolute exchange
deadline and explicit response aborted/error handlers. A dribbling/nonending body can
outlive socket idle timeout. This is a distinct pending issue, not repaired or claimed
as the observed Loki root cause in this diagnostics-only batch. Other production body
read paths likewise require their own assessed scope before modification.

## Frozen files and qualification

- azure-native-fixture.mjs: 47A4673B78BD681B2070BCF48C854835633C52A1A3E9A1F9830E7F5B5869AD21
- azure-native-fixture.test.mjs: 1319AA59C51C027DDA8935A18F2483DE061EBB5E85C3F1572E4363EF00FEEEF5
- azure-acme.test.mjs: D447E82A65556C7BE6C26E275F791B26724364E5573BBD101595F7CD57FA7F1D
- azure-admission.test.mjs: BD1091D084FA9A709B41CD91205BF20C7F4AB9986648AF53814D1AB543A020D8
- azure-recovery-bundle.native.test.mjs: A52BE67990209FFFD62B36C5ECA9BCD3DA41FB6721C3E5D525CA2349B552ABD0
- azure-observability.test.mjs: 13CB976BA0CBC21433F6553FFA9B03071CD040CBC34A55241DB89797294DF942

Primary owner was explicitly notified of the two new literal helper/test asset paths
for manual authority inventory work after freeze. No definition/shared-source automatic
update was made. No Podman/kind/native cluster run occurred in this batch. Coordinator
will first review frozen diagnostics, then run the minimized four-file reproduction.
Only actual phase evidence can select a causal repair. The original complete CI command
must ultimately pass; narrowed or isolated success is insufficient. No Azure, spending,
permission expansion, scheduling workaround, timeout inflation or skip was introduced.
