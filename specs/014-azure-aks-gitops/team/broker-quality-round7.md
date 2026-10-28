# Broker round7 quality revalidation

**Verdict: scoped PASS. Q-BROKER014-002 is closed.**

The frozen implementation resolves all three diagnostic defects retained by round6:

- **Forward readiness timeout:** `azure-broker.mjs:268–275` supplies the original start time, forwarding phase and `kubectl` identity to the independent readiness wait. Its timeout retains `forward / kubectl / timeout` and actual elapsed duration.
- **Private HTTP timeout:** `:307–345` separately identifies the local ten-second request timeout, preserving `queue observation / http / timeout` rather than misclassifying it as transport failure.
- **Post-readiness output exhaustion:** `:122–133` aborts with the originating `ProcessFailure`; cancellation and outer handling preserve `forward / kubectl / output-limit`.

The corresponding regressions at `azure-broker-transport.test.mjs:346`, `:381` and `:416` exercise real owned Node processes and loopback HTTP. They assert the originating metadata, elapsed thresholds and private-marker exclusion, then check that the listener is unavailable after return.

Cleanup waits for the owned child’s `close` event, escalating from SIGTERM to SIGKILL with bounded waits. `cleanupAll` preserves the primary diagnostic and separately reports cleanup failures. The existing simultaneous primary/cleanup regression verifies both safe outcomes and independently reaps its deliberately obstructed child.

No additional blocking finding arose within this scope. Q-BROKER014-001 remains closed.

## Revision and evidence

Independently verified:

| Artifact | SHA256 |
|---|---|
| `scripts/azure-broker.mjs` | `ECEEED6AB0D71848346E9D8709A3CA40EF49A3255CE4C2C6809314610F8EFD42` |
| `scripts/azure-broker-transport.test.mjs` | `6E152DC2207084BA0FB6EBF4ED50C8208F2C1FB9997C033E6151509EB8527235` |
| `team/broker-repair-round7-evidence.md` | `72A451ED0BA34658B48482CD54DEAFE550240F545814C876516C47AAF2D55159` |

Inspected author evidence records the final transport suite **10/10 PASS**, exit 0, 79.527s, with no skips or cancellations. The three diagnostic regressions passed in 31.797s, 12.159s and 2.109s. Syntax, exact-file Prettier and zero-warning ESLint passed. The coordinator separately reports final full lint PASS.

## Limits

Historical intended-RED chronology remains unverified; this review does not reconstruct it. The owner’s standing approval for similar test-first deviations does not convert missing history into evidence.

This closes the current diagnostic finding only. It establishes no live AKS/SPDY/RBAC, RabbitMQ-provider, hosted-workflow or full-feature acceptance. No files changed and no tests, providers or cloud operations were executed by this reviewer.
