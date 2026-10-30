**CHANGES REQUESTED — bounded partial guard-helper review.**

Matched SHA256:

- Helper: `6C3D83A2B09F8AB40206CC7B2BFF7CFB49CD84F872142716041AEE12B8B778BB`
- Tests: `557C636C375B4E93D03541BC73BF074986DC8D11CFEAD2CB4B289C500E9A3427`

**SEC-GUARD001 — Medium, blocking; alias of Q-GUARD014-001: valid requalification cannot replace a stale family pointer.**

Evidence: `publishGuardReference` validates the new family against current state, but then calls `validateFamilyPointer(ctx, selected.record)` on the previous pointer. That calls `validateVaultGuardEvidence`, requiring the old record’s source closure, guard and role tuple to match current state.

Scenario: a legitimate security-definition or guard change invalidates the old family. The human completes fresh qualification, but publication rejects the old pointer’s expected drift before replacing it. Operations remain blocked despite valid requalification.

Remediation: separate historical pointer integrity/producer/digest validation from current eligibility. Require the **new** target to satisfy every current-state check; retain lease, ETag, rollback protection and rejection of stale pointers during operational resolution.

Verification: publish an initial family, change the reviewed closure/guard tuple, qualify a fresh human family and successfully replace the pointer. The old family must remain unusable for operational resolution. Include tampered historical-record, rollback and ETag-race negatives.

Other bounded observations: canary targets/bodies are rederived, actual role semantics are checked, denial provenance is constrained, and the result explicitly establishes canary scopes only. Pointer container/producer separation, strict handles, referenced-record digests and cleanup remain appropriately constrained. Ordinary activation calls the existing actual validator rather than accepting a success callback; its positive configured composition remains unproved.

Independently ran ten focused canary/pointer tests: **10 passed, zero failures/skips**, exit 0. They do not cover the identified requalification transition.

Complete active-authority inspection/G3 composition, F0–F3 staging, live Azure semantics and positive ordinary activation remain pending. SEC-CACHE001 remains unresolved separately. No files changed or cloud actions performed; no full-feature approval.
