# Repair14 ordinary native execution

Source: native-crd-checkpoint14.json, independently matched by both bounded reviewers.
Required format-check and lint passed sequentially before this run; the solution built
with zero warnings/errors. No source edits or other provider checks ran concurrently.

The exact uninstrumented four-file command and verified tool/profile configuration
from native-reproduction-repair12.md were retained, with no concurrency override or
changed timeout. Local Podman access required escalation; no Azure action occurred.

Result: exit1, four tests, two passed, two failed, zero skipped/cancelled,138.366s.

| Fixture | Outcome | Duration | Safe failure evidence |
| --- | --- | --- | --- |
| ACME | Pass |138.120s|Exact reused CRD readiness helper completed.|
| Admission | Fail |132.521s|native-admission, fixture, category unknown, no process status; outer assertion detail unavailable.|
| Loki | Pass |27.477s|Existing authenticated TLS query assertions passed.|
| Bundle | Fail |132.669s|issuer-seed, kubectl exit1, individual process12229ms.|

The bundle completed CRD establishment and proceeded through prerequisite installation
and TLS generation. This run supports progression beyond the repaired wait; it does not
prove the cause of the later issuer-seed failure or close the overall native gate.
Admission's coarse safe assertion projection does not establish which assertion failed.
Earlier kind failures remain unclosed; no rerun-until-pass claim is made.

No cleanup failure was reported. A subsequent private read-only Podman inspection
reported one preexisting container and zero owned fixture candidates. No container
identity or provider stderr was retained. Original full-gate execution remains failed.

The separately reviewed HTTPS response-body lifecycle defect is the next bounded
repair15. It is not assigned as the cause of these setup failures. Further causal
diagnosis of these new failure sites must preserve private output and normal scheduling.
