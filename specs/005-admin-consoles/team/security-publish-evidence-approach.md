**Verdict: pass for the proposed T012 evidence approach**, subject to checking the exact implementation later.

Combining assertions against the complete, unmodified publish-mode graph with actual emitted infrastructure output can establish console exclusion without waiving the security requirement, provided:

- Full-graph assertions run before pruning and reject pgAdmin, management endpoints and management-image mutation while confirming ordinary infrastructure remains.
- Pruning removes only explicitly identified project/JavaScript workloads responsible for the pre-existing publication failure.
- Every infrastructure resource remains, including unexpected resources; no whitelist can conceal a console.
- Infrastructure resource identities, images and endpoints are unchanged after pruning, and the emitted manifest is checked independently.
- Evidence records the original failure and clearly limits the successful publication check to infrastructure output.

This proves the targeted administrative-exposure exclusion; it does not establish that the complete application can publish successfully. Keep that existing publication limitation visible in final evidence.

No security waiver or unrelated `OwnDatabase` refactor is necessary for this approach. No files changed.
