# Exact CRD readiness causal repair14

Author implementation; independent review and actual minimized/original gates pending.
Coordinator released native helper/test and bundle, then exact same ACME wait call site.
No feature013/local-kubernetes, other fixture operation, process core, classification,
scheduling or HTTPS body lifecycle change is included.

## Observed cause versus separate exposure

Root's temporary observer probe3:3PASS/1bundleFAIL,0skip,227.882s. The bundle
ClusterIssuer Established wait exited1 in581ms. Bounded private classification matched
exact null-condition accessor prefix/suffix, single-line=true,overflow=false. All three
kind-create subprocesses exited0 with all assessed failure flags false in that probe.
This confirms the brittle kubectl condition-wait mechanism for that observed bundle
failure, not resolution of separate intermittent kind-create or the whole original gate.
No raw stderr was retained here.

ACME source applies a larger prerequisites List then invokes the same pinned kubectl
condition wait on the same ClusterIssuer CRD with60s bound. It has identical vulnerable
source exposure, but no observed ACME null-condition failure was claimed. Root released
only that call site to the same helper; surrounding operations/groups/phase restoration
remain unchanged. Feature013's separate Argo CRD waits were inspected read-only and
left untouched.

## Faithful causal RED and replacement behavior

The tests use real checksum-verified pinned kubectl, explicit private kubeconfig/context,
and a faithful loopback Kubernetes API discovery/CRD endpoint. The external API alone
controls CRD status. Process execution, JSON/identity validation, readiness algorithm,
deadline and cleanup are real. Local HTTP represents the external API test boundary;
actual fixtures retain their existing verified TLS kubeconfig without any insecure flag.
All fake API/kubeconfig resources use private ACL and exact finally cleanup.

A direct legacy pinned-kubectl invocation against actual null conditions exits1 and
matches the same exact accessor signature in memory (boolean assertion; no raw text).
This intentionally failing CLI outcome is asserted by a passing regression test. It
is the precise causal legacy RED, separate from broad helper safety coverage.

The extracted legacy helper also gave intended RED4/8 cases in13.85s: the state
transition case exited1 on the accessor, invalid/wrong identity cases made repeated
requests, and null not-ready returned exit rather than a bounded readiness timeout.
Those are not all assigned the same cause; exact legacy null signature above is the
causal evidence. No owned collaborator was mocked to manufacture these failures.

waitForNativeClusterIssuer now performs only a literal exact-CRD successful-status GET.
It requires apiVersion/kind/metadata.name and reviewed CRD group/scope/plural/kind, with
exact Established=True. Absent status, null status, missing/null/empty conditions,
NamesAccepted=True alone and Established=False are NOT ready. Invalid identity,
malformed JSON/conditions or any failed CLI GET is rejected without retry; no mutation
or failed-auth retry occurs.

## Bounded resilience and privacy

The original60s overall establishment budget is unchanged; timeoutMs cannot exceed60s.
Each CLI process and request receives only the remaining budget. Child teardown/close
is awaited, with deadline checked again after parsing/validation before success.
Successful-but-not-ready GET observations use50ms exponential delay capped250ms plus
0–24ms jitter, clipped to remaining time. Cancellation propagates to active CLI and
delay. No hedging/circuit breaker is warranted for this single finite bootstrap wait;
there is no persistent traffic pipeline. No overall/per-attempt timeout inflation.

Response capture is private and capped2MiB, sufficient for the pinned CRD. Malformed
or oversized output fails closed. Safe phase/process metadata is retained; original
response/error bodies, credentials, endpoint URLs and raw stderr never enter diagnostics.
The one legacy proof privately captures at most2MiB to evaluate its exact fixed signature;
its process error is never thrown/serialized or persisted.

## Verification and safe outcomes

Final exact command:
node --test scripts/azure-native-fixture.test.mjs
PASS18/18, zero skips,19.56s. Includes prior diagnostics and:

- direct legacy null-condition signature confirmed with actual kubectl;
- missing/null status and missing/null/empty conditions, NamesAccepted-only and False
  progress to actual Established=True after the controlled API transition;
- forbidden, malformed JSON, wrong identity and malformed conditions reject after one
  request without private output;
- not-ready500ms total budget fails timeout; a pending partial response is killed under
  the same budget, with actual request teardown included (measured under1500ms tolerance,
  not a changed production deadline);
- caller cancellation triggered by the real pending API response aborts its CLI request,
  makes no second request, remains private and cleans up.

Scoped format-check and ESLint max-warnings0 PASS for four source files. Per-edit
formatter/re-read done. No kind/Podman cluster or global check was run by this owner.
Root owns post-review minimized run and full original gate. No rerun-until-pass or
flakiness acceptance is claimed. Separate HTTPS lifecycle defect is reserved repair15.

Frozen SHA256:
- azure-native-fixture.mjs: 7B8BA3266106C29A7DAD66835FED675B35EAB0CC6344CB05E00D77C166CCE6B1
- azure-native-fixture.test.mjs: 40F6FC125E0E73404D983818E9334C36A160E9834B708F8244982CA56814DFA3
- azure-recovery-bundle.native.test.mjs: F59C9EEA348778BFEA4B568A96E6A23B11464630E39F478349095FC38C9C9A06
- azure-acme.test.mjs: 7CF71E577B713309B8CC15314619B5BC9310AA9A28B95D470BB8B88BB285B6FA

Primary receives changed hashes for manual immutable closure; no authority source was
automatically updated. No Azure spending, grants, weakening, policy or scanner exception.
