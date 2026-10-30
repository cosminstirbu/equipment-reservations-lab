# Targeted preparation/analyze review

Reviewer: verifier_reviewer. Response preserved verbatim.

Targeted preparation/analyze verdict: **changes_requested** for one lock-order defect. This reviews artifacts only; no source implementation assessment was performed.

All eight supplied SHA256 fingerprints match disk. The prerequisite resolver selected feature 014 and found all required artifacts.

| ID | Severity | Evidence | Required correction |
| --- | --- | --- | --- |
| **Q-D014-003** | Medium, blocking | plan.md, “Foundation and vault network access”: DNS gate remains held until acquiring the Blob lease; cleanup reacquires DNS gate before releasing Blob lease. | Remove the lock-order cycle. Release DNS before waiting for Blob, or use nonblocking Blob acquisition followed by DNS release before retry. Define admission revalidation and test the two-owner interleaving under T057. |

The problematic interleaving is:

1. Operation A holds the Blob lease.
2. Operation B holds DNS gate and waits for Blob.
3. A needs DNS gate for cleanup before releasing Blob.

Bounded timeouts expose the deadlock but do not establish correct serialization.

The other changes are consistent:

- FR-025/SC-011 map to T040: one immutable artifact, remote registry parity, partial-failure promotion blocking, same-release retry, and ACR repopulation.
- T055–T056 distinguish applied infrastructure from reviewed runtime configuration and ready deployment.
- Default-deny Storage/Key Vault access, ARM-visible admission metadata, operational ownership of DNS gate content, and staged initial foundation binding are documented.
- Null recovery key version is limited to initial foundation bootstrap; recurring environment operations use existing principals and actual key versions.
- Premium managed OS disk pricing replaces the unsupported Standard SSD assumption. The approximately €95.03 estimate remains subject to budget clarification and refreshed provisioning gates.

Nonblocking: add FR-025/SC-011 to the explicit task traceability table; semantic coverage already exists in T040.

Coverage: **36 requirements/success criteria, 57 tasks, 100% semantic task coverage**. No new constitutional conflict or unmapped task identified. Preserve the previous nonblocking T022 acceptance-order clarification.

No files changed or runtime checks executed. Re-review Q-D014-003 before declaring the amended preparation gate passed.
