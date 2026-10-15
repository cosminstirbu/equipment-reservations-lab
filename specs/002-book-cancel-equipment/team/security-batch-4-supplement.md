**Supplemental B4 verdict: changes_requested; Q-B4-002 independently confirmed.**

**Category/severity:** code/contract, medium, blocking. Deduplicated under the verifier’s ID.

**Scenario:** A malformed event timestamp passes consumption validation and creates an inbox entry despite violating the approved explicit-offset, maximum-six-fractional-digit contract.

**Preconditions:** A publisher can submit an otherwise valid envelope with matching broker metadata. Offset-free acceptance additionally depends on the consumer’s local timezone.

**Evidence:** `ReservationEventValidation.TryRead` deserializes directly through generated metadata into `DateTimeOffset` fields. `FiniteUtc` checks only the resulting offset, sentinel exclusion and tick alignment. It never validates timestamp strings before conversion.

Consequently, `.1234560Z` has seven fractional digits but converts to microsecond-aligned ticks and passes. Additional digits can be truncated during conversion, likewise concealing excessive precision. An offset-free timestamp can become offset zero on a UTC host. The existing `.1234567Z` poison case detects tick misalignment, not raw grammar.

**Remediation:** Validate the event timestamp wire representation before conversion, or use a generated-metadata-compatible strict converter. Require explicit timezone, approved UTC semantics and at most six fractional digits without rounding/truncation. Preserve envelope size bounds and safe poison rejection.

**Verification:** Regression-first real-consumer tests for seven aligned digits, longer fractions that truncate to aligned ticks, missing offsets under controlled UTC conditions, and valid six-digit UTC timestamps. Invalid events must create zero inbox rows, reject without requeue and allow a following valid event to progress.

No additional finding ID, source changes or probes. B4 remains unapproved pending Q-B4-001 and Q-B4-002 repairs and revision-matched re-review. SEC-001 actual browser closure remains pending.
