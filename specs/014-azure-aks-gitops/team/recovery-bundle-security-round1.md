**CHANGES REQUESTED — bounded recovery-bundle source review.**

Matched SHA256:

| File | SHA256 |
|---|---|
| azure-recovery-bundle.mjs | `68D37C868838AFD96D30E7032415DF3690E8C8FA16C7F728B3CC5FC39E4B3F00` |
| azure-recovery-bundle.test.mjs | `D85136B898DD4AA84FFBF71EB09DE020EA17D5F2789162963D00244109AD9839` |
| azure-recovery-bundle.native.test.mjs | `5A70B15E4CD83670221F9C208681EEBCAA7E0153C9E4CA185DE2A89F16D45654` |

**SEC-BUNDLE001 — Medium, blocking: source-vault compatibility is self-asserted.**

Evidence: bundle restore constructs `expectedIdentity.vaultUri` from `bundle.identity.source.vaultUri`. The identity adapter subsequently validates consistency against this same supplied value. The existing selected-point restore call supplies only independently obtained `sourceGeneration`. No independent original-vault anchor is established.

Requirement: operations.md:312 requires source vault/tenant/generation and per-object version/hash metadata to bind compatibility.

Scenario/preconditions: an inconsistent or incorrectly assembled authenticated recovery artifact identifies an unintended source vault while retaining matching environment/generation context. Internal consistency passes, allowing its six credential values to reach destination writes. This is a provenance-boundary failure; no SSRF, unauthorized foreign-vault read or AES authentication bypass is claimed.

Remediation: bind the original canonical workload-vault identity in trusted selected-point metadata, pass that expected context independently to bundle restore, and reject mismatches before any mutation. Preserve per-object version/hash binding.

Verification: change only the bundle’s source-vault context while retaining the independently selected point context; require rejection with **zero Key Vault PUTs and zero Kubernetes Secret writes**. Missing/malformed source context must also fail.

Other reviewed controls are appropriately bounded: exact inventories, existing Secret PUTs with resourceVersion/conflict handling, preservation of destination metadata, account URI/key-checksum checks, verified TLS/SNI and exact served leaf comparison, safe errors and socket cleanup.

Independently ran the base transport test with the pinned local kubectl: **1 passed, zero skips**, exit 0, approximately 14.7 seconds. An earlier invocation without its required environment skipped and was not counted as passing evidence.

Author reports additional focused tests and native bundle **1/1 passed**. Native issuer status is explicitly seeded; this does **not** establish controller convergence. Key Vault HTTP doubles do not establish Azure authorization. Actual controller, Azure and complete restore-order qualification remain pending.

No files changed or cloud actions performed. No full-feature approval.
