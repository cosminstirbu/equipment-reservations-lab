Preparation batch 7 quality verdict: **pass**.

Verified hash: `B8B2E68ED1C1D34538B3193A7E187D17E3DF84DF738A1618FCFB22F484F2ED7D`.

The proposal defines callable, bounded contracts without claiming pending provider behavior:

- Canary requests prove denial only at canary scopes. Active guard protection separately requires current effective-authority and complete inherited-assignment/definition inspection; ambiguity blocks.
- Proposed inspection reads, IDs, API versions, actor observations, and optional recovery Application access are explicit.
- Producer-owned pointers use fixed locations, conditional writes, leases, and validated referenced records. Qualification/consumption alone cannot publish completed activation.
- Recurring validation uses the actor’s own authority and fresh probes, rather than requiring installer/global reads or renewed peer approval.
- Version 2 selected-point markers establish source context before decryption through authenticated fixed-container selection. Old markers and bundle-derived expected context fail closed.

The trusted-backup-producer boundary is appropriate to the existing backup model and is stated honestly: it does not resist a malicious authorized backup producer forging both marker and bundle. No independent signer or WORM guarantee is implied.

Required evidence remains actual scope/API authorization, inherited-writer isolation, composite G3 checks, pointer concurrency/replay handling, current activation binding, and zero-write rejection of substituted restore context.

No files changed or implementation approved. The separately reported four native failures remain unresolved execution evidence; this preparation pass does not override them or establish feature acceptance.
