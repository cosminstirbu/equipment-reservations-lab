Verdict: **pass — bounded partial T087 source quality**. No blocking findings in the four frozen files. This does not establish production-qualified recovery or T087 completion.

Verified SHA256:

| File | SHA256 |
| --- | --- |
| scripts/azure-recovery.mjs | `2B3811211B746DEA3AEA79DA16F03026D25F29B696FFD08621555B261EFCC472` |
| scripts/azure-recovery.test.mjs | `482926A6E5CA6331A34F48E2B918688E459F06D17696863F7CE882DDB5475D41` |
| scripts/azure-recovery-activation.mjs | `7DA180BBEC2D8BD82026CBB00617D213909BFCA410727FFC5EFDC6DCFD8020A9` |
| scripts/azure-recovery-activation.test.mjs | `281057F791801D32689DDB425D92E9EBF98E3367B3970108DD25E6892CB6E0FD` |

The v2 selector reads the requested fixed completion marker through authenticated storage, requires native Blob version properties, validates its exact schema and freezes selected context before decrypting payloads. It rejects v1 and unknown fields. Producer, tenant, subscription/environment source scope, compatibility, pinned key, six-secret inventory and six encrypted-object hashes are checked. Caller source context cannot replace the selected marker.

Restore checks both stored envelope bytes and reconstructed envelope hashes against the marker. Decrypted metadata and credential inventory must then match the independently selected source facts before credential or database writes. Backup compares captured credentials with separately collected source facts and publishes completion only after successful verification and owned cleanup/replica restoration.

Source collection performs actual SelfSubjectReview, exact own five Role/Binding pairs, ARM vault context validation and six Key Vault reads through existing clients. These establish concrete process/HTTP boundaries; they do not establish complete effective authority or current container-writer isolation.

Evidence reviewed: recorded intended RED failures, source and surrounding call paths, HTTP/process negatives, and author **19 focused PASS, zero skips**, with scoped lint/format passes. Tests cover substituted source facts, point/marker/envelope hashes, missing/v1 markers and failed selection without protected target writes. I did not rerun tests.

Pending gates remain explicit: actual inherited-writer audit, G3 qualification, recurring Application UID proof, guard locators, protected workflow/run selection evidence and full provider/public CLI composition. The separate `SEC-CACHE001` and `Q-GUARD014-001` findings remain open; neither is closed or bypassed by these library results. Global checks and known native failures remain coordinator-owned.

Changed files: none. No cloud authorization, live recovery acceptance or feature-completion approval.
