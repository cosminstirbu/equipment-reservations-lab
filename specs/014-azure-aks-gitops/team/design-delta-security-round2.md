# Security preparation repaired delta

Reviewer: security_reviewer. Response preserved verbatim.

**Security preparation verdict: pass for this repaired delta.** No new blocking findings; SEC-D001 remains closed at the design level.

Verified hashes:

- `plan.md`: `E010145C2F20BBA916E698F4759C0B712500A177FFB49BCD81759F590299B98A`
- `tasks.md`: `4AB5E7B3F6CDAEEB41A54982ABBF5656B10EEC24CE5EFE55ABF32DC641DF2347`
- `contracts/operations.md`: `D133F914521EF491A8EEFFCFCD8C1F3C6AF9E167A7E03AF6720417495B5A74CE`
- `data-model.md`: `4BD3B1B591BDDD5FEA6368ADCF4622DFBC3C48AFAD24299F1AAA99D49B3A8761`

The repaired lock ordering releases DNS before waiting for Blob, revalidates admission afterward, and explicitly covers cleanup, renewal, and reaper interleavings. Canonical metadata schemas, bounded admission counts, preservation of unrelated entries, and refusal on malformed ownership make adapter behavior sufficiently specified for implementation.

Recovery-key expiry now has an explicit reviewed timestamp, initial 365-day lifetime, pre-expiry checks, historical-version preservation, and verified rewrap or reviewed extension. Rotation must preserve restoration of retained points; disabling or expiring their sole unwrap key is expressly prohibited.

T057 retains the required negative and concurrency tests. Actual adapter correctness, Azure permissions, and historical unwrap behavior remain implementation/provider verification obligations.

No implementation sources inspected, files changed, intrusive probes, or risk acceptance.
