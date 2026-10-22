# Component pipelines implementation security review

**Verdict: changes_requested.** One confirmed blocking freshness finding.

**Snapshot:** `team/component-pipelines-snapshot-01.json`, baseline `424a6701ac97206ecc0067e7ea41763fb3abc950`. All recorded file hashes matched during review. Scope covers T061–T069 implementation and the approved design/addenda.

## CP-S002 — Medium, blocking: branch names bypass ancestry freshness protection

**Evidence:** `scripts/promote-images.mjs:382–386` checks `previous.sourceRef === release.sourceRef` before testing whether the candidate SHA is an ancestor of an existing deployed/proposed SHA.

**Scenario and preconditions:** an authorized manual run publishes an older ancestor commit under a different branch name. Its original intent captures the current target successfully. Promotion then skips the ancestry safeguard solely because the branch name differs, permitting an obsolete candidate proposal. The coordinator confirmed that approved “same lineage” means Git ancestry, irrespective of ref spelling; no deliberate ancestor-rollback mechanism was authorized.

**Remediation:** reject obsolete ancestor candidates regardless of source-ref equality. Preserve fresh-intent manual proposals from genuinely divergent histories, identical-digest no-op behavior and existing CAS protections.

**Verification:** retain public promotion regressions for cross-ref ancestor candidates against both deployed and managed-proposal records, asserting zero mutation; retain a divergent manual-source positive case.

## Other inspected controls

- PR calls use the read-only common core; trusted wrappers separately narrow build and promotion authority. Quality precedes selection/component work.
- Original intent binds repository, run, exact source/ref, selection and captured target/proposal state. Later selection reuses original intent.
- Publication evidence checks successful component jobs independently of parent conclusion, with component/run/attempt/artifact identity and bounded ZIP/JSON handling.
- Verified-never-started recovery requires complete prior-attempt history, failed/canceled parent state and original selected-component intent. Unverifiable evidence fails closed.
- Promotion reconstructs narrow component patches from fresh target snapshots, checks managed/human-edit scope and rereads refs before non-force CAS.
- All seven promotion jobs use `queue: max` with cancellation disabled; required summary treats selected failures/cancellations/missing results as failures.
- Partial component records remain explicitly incomplete; setup/smoke require complete records before mutation.
- Private HTTP/process errors and artifacts exclude raw credentials, provider payloads and causes.

The earlier question about job `run_attempt` is **not a finding**: the coordinator verified that field through a current live attempt-job API probe.

## Evidence limits

Read-only source, fingerprints and implementation evidence inspection; no files changed or intrusive probes performed. Coordinator-owned checks remain pending until matched to this snapshot. Filtered actionlint output is not full semantic validation because its schema lacks the queue property. Full runtime qualification and human feature acceptance remain separate gates.

No risk acceptance, publication authorization or feature acceptance is granted.
