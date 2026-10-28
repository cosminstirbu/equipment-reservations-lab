# Security design review — preparation round 2

Reviewer: security_reviewer. Response preserved verbatim below.

**Verdict: pass for design preparation.** SEC-D001 is closed at the design level. No unresolved blocking security findings or risk acceptance.

Verified frozen snapshots:

| Artifact | SHA-256 |
| --- | --- |
| `plan.md` | `EFB6A44FA3FA5855436FCE50D4A6D63A0CBBE8FF2DB2960FD9CB2A0672A01455` |
| `research.md` | `FE68690FA31EBB1D764F68BDD7ECF7CC2349275B8E357CFF094FF53CA8803160` |
| `data-model.md` | `91CAE493C8621965DED9C82700DF792A657A7365E60C0F074DE1E4E6FDB659DA` |
| `contracts/operations.md` | `858CF38D34D06C237F3B09AB458A29F2E44B7E5868B8D205438605C9F3185B9E` |
| `quickstart.md` | `CB383AF4F348B7B2CEEB18D3291CB850F6B4BEA5A0F13777C477EEBF17983D8C` |

## SEC-D001 closure

The repaired design specifies an independent five-minute expired-admission reaper, separate trusted identity, maximum admission lease, failure diagnostics, authenticated manual cleanup, and fail-closed reconciliation before subsequent mutations. It explicitly acknowledges that Azure ranges lack native expiry and that scheduler/provider outages can extend residual access.

The rehearsal now requires abrupt-owner-loss and failed-reaper tests. These changes address the identified design gap without claiming guaranteed wall-clock revocation.

Implementation must demonstrate preservation of active admissions and persistent operator ranges, including concurrent reaper activity and abandoned-operation lease recovery.

## Recovery and identity consistency

The artifacts consistently select AES-256-GCM object encryption with version-pinned RSA-OAEP-256 key wrapping in a retained, purge-protected recovery vault. Wrap and unwrap authorities are separate, and RSA private keys remain in the vault. Obsolete operator-held private-key instructions have been removed.

The design preserves recovery-key versions, compatible application/identity credentials, and ACME material outside workload destruction. It requires working unwrap access before destruction and an actual isolated restore before backup completion.

The separate unattended stop identity and reaper identity have distinct capabilities. Terraform owns the persistent API-range baseline; temporary admission occurs after Terraform operations, avoiding overlapping reconciliation of that property.

## Remaining evidence

This is a preparation verdict, not implementation approval. Tasks must retain the defined negative authorization, privilege separation, corrupted-recovery-input, private-output, abrupt-owner-loss, protected destruction, and live recovery checks. Actual Azure RBAC, Entra assignments, source restrictions, secret rotation, encryption behavior, and workflow protection remain unverified until implementation review.

No files changed. Checks: read-only artifact review, consistency inspection, and matching SHA-256 verification.
