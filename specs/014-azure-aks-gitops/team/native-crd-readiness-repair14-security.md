**PASS — bounded repair14 security review. No new confirmed finding.**

Matched SHA256:

| File | SHA256 |
|---|---|
| azure-native-fixture.mjs | `7B8BA3266106C29A7DAD66835FED675B35EAB0CC6344CB05E00D77C166CCE6B1` |
| azure-native-fixture.test.mjs | `40F6FC125E0E73404D983818E9334C36A160E9834B708F8244982CA56814DFA3` |
| azure-recovery-bundle.native.test.mjs | `F59C9EEA348778BFEA4B568A96E6A23B11464630E39F478349095FC38C9C9A06` |
| azure-acme.test.mjs | `7CF71E577B713309B8CC15314619B5BC9310AA9A28B95D470BB8B88BB285B6FA` |

The replacement performs only the exact ClusterIssuer CRD GET using explicit kubeconfig/context. It validates resource identity and requires `Established=True`; malformed responses, foreign identity and failed CLI requests reject without retry. Only successful not-ready observations are polled.

The original 60-second ceiling remains. CLI/request budgets and polling delays use remaining time, with deadline checks before success and cancellation propagated through execution/delay. Output remains private and bounded; safe process metadata survives failures.

Both fixture integrations replace only the corresponding condition wait. No mutation retry, authority expansion, TLS weakening, scheduling change or timeout inflation was identified.

Author reports **18 tests passed, zero skips**, including real pinned-kubectl null-condition reproduction, transition, permanent failures, deadline and cancellation cases. I inspected source/tests without rerunning them or any provider fixtures.

This approves the bounded repair, not minimized/full native-gate closure or all previously observed failures. The separate HTTPS response-body defect remains deferred to repair15 and is not treated as repair14’s cause.

No files changed, clusters created or cloud actions performed. No full-feature approval.
