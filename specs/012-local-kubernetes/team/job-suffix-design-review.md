# Immutable Job suffix targeted design review

## Quality reviewer /root/quality (verbatim)

Job suffix/promotion adaptation design verdict PASS, consistent narrow digest/provenance scope. Plan already requires immutable release/config-hash Job names and promotion provenance; derived two-field suffix update implements that contract rather than arbitrary deployment config promotion. Inspected /private/tmp/equipment-job-name-proof input files: suffix isolated to Job child Kustomization while postgres Service remains outside it. Proposed real wrapper files not yet present, so this is design approval only. Constraints: exact allowlist only database/identity wrapper nameSuffix scalars plus existing release/image fields; derive from fixed canonical ordered inputs (exclude secrets), deterministic 16 lowercase hex; independent validator recomputes and rejects stale/tampered suffixes. Validate entire proposed change before atomic write/CAS and preserve unrelated wrapper contents/human edits. Include behavior tests: same inputs same suffix, relevant release/config/job changes change suffix, no Service/DNS renaming, no arbitrary files/fields modified, stale hash rejected, existing PR concurrent edits preserved/fail safely. Config-only edits must require suffix refresh too, through explicit validation/tooling, without spuriously publishing images. Bound cleanup of old successful Jobs, preserve failures and ensure completed bootstrap prerequisite assessed by current suffix. Record exact derivation/allowed fields in plan/runtime contract before dependent implementation.

## Security reviewer /root/security (verbatim)

**Pass for this narrow design integration.**

Hashing only public release/configuration manifests avoids secret disclosure. Restrict promotion writes to the two exact `nameSuffix` fields and existing digest/provenance fields; reject unexpected paths, symlinks, fields and concurrent edits.

Tests should verify deterministic hashes, sensitivity to each approved input, stale-suffix rejection, unchanged Service DNS names, and preservation of unrelated human changes. Treat hashes as rollout identifiers, not integrity or authorization controls. Actual implementation remains subject to review.
