**Q-BROKER014-001 mechanism review: pass for the frozen proxy/provider-test delta; overall closure remains pending adapter integration.**

Verified:

- `nginx.conf`: `87C2E31A6531A2C076CB76288B0F61B7B9892078FE89AD8DB49DCA6984D6F2E2`
- `azure-broker.test.mjs`: `19215CE37F9BB1E372DD76E9A0E480A28BD0D27C006DF39C422056700D8F4F01`

The proxy injects the fixed direct-totals query while preserving the strict external GET-only route, TLS verification, credential isolation, and restricted authority.

The native regression meaningfully reproduces the defect: it suspends the asynchronous collector, confirms publication, observes cached zero through the ordinary API, and requires the monitor to report current ready/unacknowledged totals through acknowledgement. It explicitly establishes the classic queue type.

Reported red→green provider evidence was inspected, not rerun. Independent retrieval of the cited immutable upstream source failed, so source provenance remains author-supplied.

Final closure requires adapter enforcement of the qualified response/type contract and publisher-quiescence preconditions. A current queue observation cannot prevent later publication. Q-BROKER014-002 remains separate and open. No files changed or full repair-round approval issued.
