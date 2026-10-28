Verdict: **pass — bounded repair15 HTTPS lifecycle quality review**. The confirmed streaming/truncated-body defect is repaired in the frozen source.

Verified SHA256:

- Helper: `6CFBE9EE7E17F8EA8F28B79AFB24BAD8155747A6D82D8421DE14A51353D7990C`
- Helper tests: `2994B4ACCDC3EFB9346F18935CF0DEB4086B5E2A8669DAC89D5BB8596D671B12`
- Observability fixture: `6FF8425EECEC071F24DFCC563E785E330506420D372C950A76D2841FBA136E28`

One absolute timer now spans connection through complete response consumption, with the existing three-second default and maximum. A monotonic check also rejects late success when timer callbacks are delayed. Response errors, aborts and premature closure reject through one guarded settlement path that clears timer/subscription and destroys owned transports.

TLS verification remains explicit. Complete responses preserve their original status codes; private bodies, tokens, endpoints and arbitrary errors are excluded from diagnostics. The observability wrapper delegates to this helper without changing surrounding provider setup, health-loop budgets, authentication assertions or concurrency.

Real HTTPS tests reproduce both causal failures and cover continuous body dribbling, truncation, trusted authentication statuses, untrusted CA rejection, transport release and subsequent successful requests. Recorded evidence is **23 PASS before the final monotonic guard, then five targeted PASS afterward**, with scoped checks. Root’s final full 23-test rerun was pending at assignment; I did not rerun tests.

Changed files: none. Existing repair14 behavior remains in scope as preserved code, not newly executed evidence. This pass does not explain intermittent setup failures or clear minimized/original provider gates. No full-feature approval.
