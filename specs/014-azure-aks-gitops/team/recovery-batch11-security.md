**PASS — bounded partial T087 source security review. No new confirmed finding.**

Matched SHA256:

| File | SHA256 |
|---|---|
| azure-recovery.mjs | `2B3811211B746DEA3AEA79DA16F03026D25F29B696FFD08621555B261EFCC472` |
| azure-recovery.test.mjs | `482926A6E5CA6331A34F48E2B918688E459F06D17696863F7CE882DDB5475D41` |
| azure-recovery-activation.mjs | `7DA180BBEC2D8BD82026CBB00617D213909BFCA410727FFC5EFDC6DCFD8020A9` |
| azure-recovery-activation.test.mjs | `281057F791801D32689DDB425D92E9EBF98E3367B3970108DD25E6892CB6E0FD` |

The v2 marker binds the requested point, expected backup producer, original vault context, six-secret version/hash inventory, compatibility, retained key and exact encrypted-object hashes. Selection requires Blob ETag/version properties and freezes catalog context before payload decoding. Restore compares selected marker, encrypted metadata and credential inventory before target writes; caller source context cannot replace selection.

Source collection obtains actual SelfSubjectReview identity, checks only the actor’s ten named RBAC objects, verifies the ARM vault context and reads the six exact continuity objects. It returns metadata/hashes rather than secret values.

These components **do not establish current recovery-container writer isolation**. That audit, G3, fresh recurring proof/UID checks, durable locator discovery, protected workflow/run evidence and complete CLI/provider composition remain explicit unbuilt gates. Library selection success must not be presented as trusted production selection or T087 completion.

Independently ran the four focused recovery/activation/identity/bundle suites with pinned kubectl: **19 passed, zero failures/skips**, exit 0, approximately 10.2 seconds. HTTP/process fixtures do not prove actual Azure or Entra authorization.

SEC-CACHE001 and Q-GUARD014-001/SEC-GUARD001 remain unresolved separately. No files changed, heavy provider tests or cloud actions performed. No full-feature approval.
