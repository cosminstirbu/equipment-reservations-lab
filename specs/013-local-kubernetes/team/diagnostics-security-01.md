# Diagnostics implementation security review

**Verdict: changes_requested.** The confirmed cleanup-policy gap below blocks this batch. No new credential-disclosure vulnerability was confirmed by static inspection.

**Reviewed snapshot:** `team/diagnostics-snapshot-01.json`, baseline `623bfaf8b6439d9d9bad94bdaf5d492432d557c1`. All recorded file hashes matched during review. Scope included changed scripts, surrounding provider boundaries, FR-019–FR-021, tooling standards and both implementation records.

## Confirmed finding

**DQC001 — Medium, blocking; shared with quality review: cleanup failures remain hidden or replace primary evidence.**

Evidence:

- `scripts/admin-console-browser.mjs:160–179`: Rabbit queue/exchange cleanup records `cleanupFailed` inside `finally`, but reports it only afterward. If primary browser work throws, execution never reaches that assertion. Both deletion requests are attempted, but their failures disappear.
- `scripts/deployment-ci.mjs:155–156`: unguarded `rmSync` in `buildImages` can replace the primary process failure.
- `scripts/promote-images.mjs:114–116`: sequential unguarded temporary-file removals can replace the primary failure and prevent later cleanup attempts.

**Scenario and preconditions:** browser work or build/promotion work fails, and cleanup independently fails. Operators receive incomplete or misleading evidence; Rabbit fixtures or temporary files can remain without a distinct cleanup diagnostic. This is a confirmed FR-021/tooling violation, not a demonstrated authentication or credential-exposure exploit.

**Remediation:** retain the primary failure, attempt every exact owned cleanup and separately report fixed safe resource/operation diagnostics. Cleanup failure must also fail otherwise successful work.

**Verification:** regressions through the public workflows must cover primary success plus cleanup failure and simultaneous primary/cleanup failure, continued cleanup after one removal fails, and absence of private payloads in displayed errors.

## Security properties retained

- `process.mjs` defaults to private capture and overrides caller `stdio`, preventing an accidental inheritance bypass. Private process failures expose validated category/status/signal/duration without original error causes, args, environment or input.
- Explicit public build/load/push streaming is supported by constrained project inputs, pinned Dockerfiles, Dockerfile-specific secret exclusions and absence of credential build arguments. This classification does not authorize streaming authenticated provider exec or private manifest application.
- Private TLS, Secret, authenticated HTTP and provider-response operations retain capture and safe projections. Existing bounded Job identity/status/failure-type allowlists remain.
- Forwarding output stays private; fixed lifecycle messages and normalized process metadata replace raw child errors.
- Promotion transport failures no longer echo request paths or provider payloads. Main-only publication, promotion CAS and ownership protections remain.

## Evidence and limitations

Read-only source, artifact and fingerprint inspection only; no files changed or intrusive probes performed. Author regression evidence was reviewed but is not substituted for coordinator checks. The coordinator reports three remaining Linux suite failures; required runtime/provider evidence and final revision-matched checks remain pending.

DQC002/DQC003 and DQP001 are owned by quality review and are not separately duplicated here. No residual risk, feature acceptance, publication or external action is approved by this verdict.
