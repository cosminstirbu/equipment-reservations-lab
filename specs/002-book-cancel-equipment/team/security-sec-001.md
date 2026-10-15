**Confirmed finding SEC-001 — cross-origin reservation mutation**

**Severity:** medium. **Blocking:** yes, violates FR-019 and D1’s browser trust boundary. This corrects an omission in the earlier scoped security reviews.

**Evidence:** Inspected current, unfrozen source; the relevant handlers match reviewed B3 behavior. `ReservationEndpoints.cs:10–18` accepts booking through a manual body reader. `ReservationValidation.cs:46–56` deserializes JSON without checking Content-Type. `ReservationEndpoints.cs:35–44` accepts cancellation without checking Origin. No Origin, Fetch-Metadata or equivalent browser-write protection exists in Reservations/shared defaults. The frontend proxy forwards requests to fixed targets but supplies no such protection.

**Attack scenario:** A malicious page sends a cross-origin `text/plain` POST containing valid booking JSON to the running loopback application. The handler can commit a reservation and event although the attacker cannot read the response. A cancellation POST can similarly mutate a future reservation if its UUID is known. CORS response restrictions alone do not prevent these writes.

**Preconditions:** Application running; browser permits the request to reach loopback; attacker knows or discovers the target port. Booking requires only predictable seeded equipment and valid dates. Cancellation additionally requires a valid reservation UUID. Browser private-network restrictions are not an application security control.

**Remediation:** Add server-side protection for unsafe browser requests that rejects unauthorized cross-origin and opaque/null-origin requests while preserving the intended SPA/proxy flow and documented direct local clients. Require JSON content type for booking, and protect cancellation independently of content type. Do not introduce authentication or claim user isolation.

**Verification requested through coordinator:** Regression-first HTTP tests for hostile Origin plus simple `text/plain` booking and cancellation; assert rejection with zero state/outbox effects. Cover null-origin and originless browser-like requests, legitimate SPA/proxy writes and authorized originless local-client requests. Validate the implemented policy during the real browser journey.

No files changed or probes executed. Full WIP implementation remains unreviewed.
