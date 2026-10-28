# Native HTTPS body lifecycle repair15

Scope: confirmed defect in `native-https-body-assessment.md`; implementation round15/15. Existing Spec Kit implementation workflow, constitution, team protocol, testing, tooling/private-process and formatting standards apply. No requirements, acceptance verdicts, provider setup, scheduling or process-core changes.

## Test design and causal evidence

The public `nativeHttpsStatus` helper is exercised against a real local HTTPS server and a privately generated self-signed CA trusted explicitly by the client. Tests observe returned statuses, elapsed time, transport closure and safe diagnostics. They do not inspect an owned implementation loop. Independent watchdogs abort the intended-red exchanges and bound test cleanup. The body contains a private sentinel; serialized failures must exclude it, tokens and endpoint URLs.

First, extracted the existing idle-timeout implementation without repairing its body lifecycle. Command:

`node --test --test-name-pattern='real HTTPS status lifecycle' scripts/azure-native-fixture.test.mjs`

Intended RED: 5 reported tests,2 PASS,3 FAIL,zero skips,7.55s (parent aggregate is the third failure). Both causal body cases failed: continuous50ms body dribble survived until the independent4.5s watchdog despite the default3s idle timeout; truncated body remained unsettled until its1.2s watchdog. Complete401/401/200 auth results and untrusted-CA rejection already passed. Cleanup completed; no raw private diagnostics were emitted.

## Repair

Existing helper now owns one absolute timer spanning connection through body completion, default and maximum3000ms. One guarded settlement path clears timer/abort subscription and destroys owned request/response transports. Response abort,error and premature close reject; only a complete response resolves its original status. Guarded error listeners remain attached during destruction. Errors project fixed process metadata rather than Node messages, URLs, headers or bodies. TLS verification is explicit and the same CA is retained.

Only the observability HTTPS wrapper/import now delegates to that helper. Existing provider profile, concurrency, setup, health loop, assertions and other time budgets remain unchanged. No feature013 edits.

## GREEN and checks

`node --test scripts/azure-native-fixture.test.mjs`:23/23 PASS,zero skips,25.374s. Existing18 process/readiness regressions pass. HTTPS default3s dribble settles3.043s before watchdog; truncated response settles82ms; complete missing/wrong/valid auth gives401/401/200; untrusted CA still rejects. Failure cases close tracked transport and permit a subsequent completed request.

`npm.cmd run format-check -- scripts/azure-native-fixture.mjs scripts/azure-native-fixture.test.mjs scripts/azure-observability.test.mjs`:PASS.

`npx.cmd eslint scripts/azure-native-fixture.mjs scripts/azure-native-fixture.test.mjs scripts/azure-observability.test.mjs --max-warnings 0`:PASS.

Per-edit formatter and reread completed. Author inspection confirms no private error forwarding, timeout inflation, TLS bypass, new dependency, retry or provider skip. Independent reviews remain required. No kind/Podman/provider/cloud run was performed for this repair. Earlier repair14 minimized native result remains2 PASS/2 FAIL; this unrelated HTTPS fix does not resolve or explain its later setup failures. Full original native gate remains pending.

## Frozen SHA256

- `scripts/azure-native-fixture.mjs`: `6CFBE9EE7E17F8EA8F28B79AFB24BAD8155747A6D82D8421DE14A51353D7990C`
- `scripts/azure-native-fixture.test.mjs`: `2994B4ACCDC3EFB9346F18935CF0DEB4086B5E2A8669DAC89D5BB8596D671B12`
- `scripts/azure-observability.test.mjs`: `6FF8425EECEC071F24DFCC563E785E330506420D372C950A76D2841FBA136E28`

Final author check added a monotonic deadline check before success, preventing a queued end callback from accepting completion after an expired budget when timers are delayed. Targeted real HTTPS suite rerun:5/5 PASS,zero skips,4.736s; dribble3.027s,truncation49ms. Scoped formatting and ESLint passed again. Existing18 regressions were unchanged by this success-only deadline guard.
