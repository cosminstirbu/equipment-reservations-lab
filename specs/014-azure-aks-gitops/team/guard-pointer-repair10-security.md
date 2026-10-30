**PASS — SEC-GUARD001 / Q-GUARD014-001 closed on repair10’s frozen snapshot.**

Matched SHA256:

- Helper: `E6D59A8C7D714E6D5B19576F21DF78976A07A9132CA79A71BE7F6028001585BC`
- Tests: `01436C9901765C2CDA6ACDDE9CCAEC0370D67D3528747EF9ADF3BADB7948CBB6`

Replacement now validates the previous pointer as historical producer-owned, digest-bound evidence without requiring its obsolete tuple to remain current. The new family still passes current authority, source and guard checks. Operational resolution retains full current-eligibility validation, so stale evidence does not become usable.

Lease/ETag handling, monotonic issuance checks and historical tamper/foreign-context rejection remain enforced.

Independently ran **10 focused tests**, all passed with zero failures/skips: source/policy requalification replacement, stale-evidence denial, historical integrity cases, rollback and ETag handling. Author reports the complete **52-test** suite passed; I did not rerun it.

The positive fixtures explicitly model prior probe-tombstone expiry. They establish replacement **once valid fresh qualification exists**, not immediate Azure requalification, purge or recovery capability. The existing collision/human-review limitation remains.

No files changed or provider/cloud actions performed. Complete G3, staging, positive ordinary activation and live acceptance remain pending. No full-feature approval.
