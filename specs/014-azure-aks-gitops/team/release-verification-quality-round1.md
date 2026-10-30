Bounded release-verifier quality verdict: **changes_requested**.

Verified hashes:

- Verifier: `C9B9B4B7364B9183244733F2FCF4B0087E6A1084FA091A4E5603F8BE20EF478A`
- Tests: `8CEA0EB52A707EF466A3D5C30C35914C1CA7FE33B1B0B73F44FC2BC0388AEF79`
- Shared pipeline validator: `BD40D651EC63AD6F4F3AF55735ACF41268FE719DEBDA5C2840AE907B4CC5F57E`

**Q-REL014-001 — Outer verifier discards safe operational evidence**  
Category: code; severity: medium; blocking: yes; owner: release-verifier implementation.

The unconditional catch replaces every failure with one generic `OperationalFailure`. It discards available safe registry process metadata—operation, tool, category, exit status/signal, and duration—and safe GitHub HTTP failure evidence. The existing real-child fixture exits 17, but its assertion checks only privacy.

Preserve assessed safe metadata and verification phase, retaining generic suppression for unclassified details. Add actual child/HTTP-boundary assertions and preserve simultaneous cleanup failures.

Otherwise the inspected flow is sound: seven wrappers validate before authenticated operations; actual repository/main/run/attempt/job/ancestry checks precede immutable GHCR/ACR verification; successful component publication remains valid within a completed failed parent; no Actions artifact is required. Owned credential copies are isolated and cleaned without deleting caller credentials.

The extracted shared validator retains artifact checks in the existing artifact-based consumer. Reported **16 verifier and 76 existing regression passes** were inspected, not rerun.

No files changed. Credential-producing callers and static 28-file launcher integration remain outside this approval; actual hosted registry/package authorization and full-feature acceptance remain pending.
