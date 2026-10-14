Security reviewer:

**Targeted ENV-001 design security verdict: pass.**

Updated planning artifacts consistently specify durable queue metadata with transient messages, no persistent volume, and an ephemeral broker container. Queue TTL/capacity/overflow limits, acknowledgements, publisher confirmations, and zero retries remain intact. The change introduces no new authentication or persistence capability and avoids enabling the deprecated queue feature.

Documentation distinguishes queue metadata survival within the same container from promised recovery and AppHost container recreation.

Live broker contract/smoke tests must verify the corrected topology and retained limits before ENV-001 execution closure. No implementation approval supplied; no files changed.

Quality reviewer:

Targeted compatibility design review PASS on updated artifacts: plan dependency topology, research ENV-001 decision, contracts/hello, data-model and T013 consistently durable nonexclusive queue metadata + nondurable exchange + transient messages, TTL/cap/reject-publish, no volume/replay/retry. data-model explicitly distinguishes same-container broker process restart from AppHost ephemeral-container recreation, so no false universal broker reset guarantee. Product FR008 in-memory Notifications reset remains intact; queue durability was technical plan detail, not user-required persistence capability. CHK007/008/011 remain satisfied. Require coder regression evidence old declaration rejected→new works and full live smoke/current-broker contract before closing ENV-001. No files modified.
