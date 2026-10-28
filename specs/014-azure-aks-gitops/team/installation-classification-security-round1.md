## T075 preparation — changes_requested

Reviewed proposal SHA256 `CE72B82028EA6EE4EFA5C5D4939CFE48993BDC591D9AB63957279764C9643811`.

The bounded integrity mechanism is acceptable:14literal generated paths, complete real-generator byte comparison, immutable validators/templates, one exact fixture-reference transition, and a separate consumed canonical activation record. Binding complete source/target maps before proofs addresses both transition invalidation and self-reference cycles. No new security finding in that mechanism.

**Preparation blocker: stale authoritative-status statements.** Coordinate this with quality’s existing concern rather than creating a duplicate security finding.

The document incorrectly describes:

- The28release-data classification as proposed/non-authoritative. Current plan/contracts already integrate approved addendum2881… and T079.
- CandidateA authority as pending owner decision. Current authority records approve it, with mandatory qualification and hosted ordering refined by8D9A….

Correct these to **approved but outside this bounded implementation batch**, retaining their actual implementation/runtime gates. Do not request another human decision or silently implement their exclusions. Explicitly explain that this T075 batch may remain conservative until T079 integration, without contradicting the authoritative classification.

Implementation conditions remain:

- Every path belongs to exactly one reviewed category; unknown paths/imports fail closed.
- Prelaunch candidate hashing is not authorization. Complete generator validation must precede probes or proof writes.
- Strict parsing/canonicalization must reject duplicate/unknown fields and adjacent transition edits.
- Actor proofs independently verify reviewed/executed Git objects, authorized projection and both bound maps.
- Consumption/replay protection and recurring target-state validation remain mandatory; activation-file presence grants nothing.
- Private projection values/errors must not enter public diagnostics.

No implementation/cloud acceptance. No files changed or providers/tests run.
