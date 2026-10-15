**SEC-001 targeted design verdict: pass.** Independently verified all three supplied artifact checksums.

The amendment addresses the confirmed browser attack:

- Every Reservations POST is checked before parsing or side effects, including booking, bodyless cancellation and legacy hello.
- Canonical loopback Host and Origin validation rejects foreign, opaque/null, malformed and duplicate origins without trusting forwarded headers.
- Originless browser-like requests reject; documented originless local clients remain supported.
- JSON media-type enforcement separately prevents booking from accepting simple `text/plain` submissions.
- Safe errors reveal neither supplied headers nor cancellation-record existence.

Accepting all ports on canonical loopback hosts is consistent with the documented trusted-workstation scope. This protects against foreign browser content without claiming authentication or isolation from local software. The policy accommodates different frontend/backend ports and retains the actual proxy’s Origin/Fetch Metadata.

The required matrix appropriately covers malformed authority/origin/media inputs, zero durable effects and legitimate local clients. Real browser evidence must establish accepted SPA/proxy book/cancel/hello and rejected hostile fetch/form submissions with browser-generated headers. A CORS response error or browser network restriction alone cannot establish application rejection.

**SEC-001 remains open** pending regression-first implementation, revision-matched HTTP and actual browser evidence, and original reviewer re-review. This verdict does not approve current US3 work.

No files changed or probes executed.
