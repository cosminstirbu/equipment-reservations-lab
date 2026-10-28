**PASS — SEC-NATIVE014-003 closed on repair15’s frozen snapshot.**

Matched SHA256:

- Helper: `6CFBE9EE7E17F8EA8F28B79AFB24BAD8155747A6D82D8421DE14A51353D7990C`
- Tests: `2994B4ACCDC3EFB9346F18935CF0DEB4086B5E2A8669DAC89D5BB8596D671B12`
- Observability fixture: `6FF8425EECEC071F24DFCC563E785E330506420D372C950A76D2841FBA136E28`

The helper now bounds connection-through-body completion with an absolute default/maximum 3000ms deadline. A monotonic check prevents delayed completion callbacks from accepting success after expiry. Response abort/error/premature close reject through one guarded settlement path that clears the timer, removes cancellation subscription and destroys owned transports.

Verified TLS, explicit CA trust and authentication status assertions remain intact. Errors expose fixed safe metadata rather than URLs, tokens or response bodies. No retry, authority expansion or timeout inflation was introduced.

Independently ran the real HTTPS lifecycle suite: **5 passed, zero failures/skips**. Continuous body dribble timed out around 3.04 seconds; truncated response rejected around 50ms. Complete authentication statuses and untrusted-certificate rejection remained correct, with transport cleanup verified.

Author reports the broader 23-test suite passed; root’s final rerun remains separate evidence. This closure does not resolve or explain outstanding native setup failures or establish the full original gate.

No files changed, provider clusters run or cloud actions performed. No full-feature approval.
