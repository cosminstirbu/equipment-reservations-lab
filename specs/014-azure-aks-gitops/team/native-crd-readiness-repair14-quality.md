Verdict: **pass — bounded repair14 quality review; Q-NATIVE014-002 closed for the confirmed null-condition wait defect**.

Verified frozen SHA256:

| File | SHA256 |
| --- | --- |
| azure-native-fixture.mjs | `7B8BA3266106C29A7DAD66835FED675B35EAB0CC6344CB05E00D77C166CCE6B1` |
| azure-native-fixture.test.mjs | `40F6FC125E0E73404D983818E9334C36A160E9834B708F8244982CA56814DFA3` |
| azure-recovery-bundle.native.test.mjs | `F59C9EEA348778BFEA4B568A96E6A23B11464630E39F478349095FC38C9C9A06` |
| azure-acme.test.mjs | `7CF71E577B713309B8CC15314619B5BC9310AA9A28B95D470BB8B88BB285B6FA` |

Paths are under `scripts/`.

The replacement polls one literal CRD endpoint and requires the exact API version, kind, name, group, scope and resource names before accepting `Established=True`. Missing/null/unpopulated conditions remain not ready; malformed identity/conditions, invalid JSON and failed GETs fail without retry.

The original 60-second overall budget includes CLI requests, parsing and polling delays. Each request receives only remaining time, and success is checked against the deadline again. Cancellation reaches the active process and delay. Existing process teardown and fixture cleanup remain in place. No mutation retry, TLS weakening, scheduling change or timeout inflation was introduced.

The test boundary is faithful: actual pinned kubectl against a controlled local API reproduces the legacy null-condition accessor failure, then exercises the new polling path. Coverage includes state transitions, permanent failures, deadline exhaustion, partial responses and cancellation. ACME’s replacement addresses the same source exposure without claiming that its prior run exhibited the defect.

Evidence inspected: causal legacy reproduction, author **18 PASS, zero skips**, scoped checks, source and tests. I did not rerun tests or clusters. The helper remains an existing literal immutable asset; no new source path or classification exception was introduced.

Changed files: none. This closure addresses the confirmed CRD-wait mechanism only. Intermittent kind-create failures, the separate HTTPS lifecycle issue and minimized/original full provider gates remain pending.
