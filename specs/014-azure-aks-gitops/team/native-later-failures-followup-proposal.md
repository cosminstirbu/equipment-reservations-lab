# Next native repair proposal

This proposal does not approve or start another implementation repair. Round15 is
the last currently approved round. The original full gate remains failed.

## Concrete evidence

See native-reproduction-repair14.md: ordinary concurrent execution passed ACME/Loki,
failed admission and bundle, skipped none. The bundle completed repaired CRD readiness
and later failed issuer-seed with kubectl exit1 in12229ms. Admission failed inside the
coarse native-admission phase; its outer diagnostic lost the assertion checkpoint.
These outcomes do not establish resource pressure, schema, policy or transport causes.

The independent read-only proposal native-later-failures-observer-proposal.md identifies
the actual source ambiguity: issuer apply/status patch and five Secret applies share
one label, while many distinct admission assertions share another. Private provider
output must remain private. A broader retry or timeout change has no causal evidence.

## Proposed bounded sequence

1. Obtain one bounded temporary observation at those exact boundaries, preserving the
   normal four-file command, concurrency, inputs, deadlines and failure outcome. Emit
   only fixed source checkpoint IDs and assessed category booleans. Unknown output
   remains unclassified; do not emit arbitrary assertion messages, stacks, arguments,
   Secret data or provider stderr. Actual matches are observations, not causal proof.
2. If persistent source diagnostics are needed, first add real-process/API regressions
   then change only the corresponding admission/bundle failure boundaries and existing
   native diagnostic helper/tests. Preserve original process metadata and cleanup;
   fail rather than conceal malformed or unsupported observations.
3. Choose a causal fix only after the exact failing operation and evidence distinguish
   the hypotheses. Require its intended-red regression, independent quality/security
   reviews, affected native execution and the original full gate at normal concurrency.

An extension from15 to18 would authorize three process rounds for this sequence only.
It would not authorize spending, fixture provisioning in Azure, broader permissions,
new exceptions, skipped assertions, timeout inflation or blanket serialization. The
existing no-progress stopping rule remains binding. Further product/design choices or
policy exceptions would still require their own decisions.
