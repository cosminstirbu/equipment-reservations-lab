# Targeted security preparation review — design delta

Reviewer: security_reviewer. Report preserved verbatim.

**Verdict: pass for the reviewed security preparation delta.** No new blocking security findings. SEC-D001 remains closed at the design level.

Verified snapshots:

| Artifact | SHA-256 |
| --- | --- |
| `spec.md` | `7111C75A62292B97ABDD9B00F6670C9376A065983289825D315583D26A9F7B34` |
| `decisions.md` | `78A87E8E6B10027C642CFBD6409E91613A767F7CA97B28DE2C7AD6C8486A72DF` |
| `plan.md` | `1EBA80B68D87CED0943D03DF17DD4AC5D80DE16671118924CF3A7AEC5E405A5F` |
| `research.md` | `22F79368E4005CF7EA67ED55DCFAF4C2146F64421F0639CEE08AF51F729AC3E6` |
| `tasks.md` | `10F9887DFAFD40A6128C79469F87314C5B774C1599FB7A4B0AF25F56DA8650EF` |
| `contracts/operations.md` | `C41DB919760CD6A4DC3B60AECC6BD8DB6DEFDB53A0AFC04E3BB04A87A7BAEB00` |
| `data-model.md` | `13E038599AF679F6328FDFEF43830C708DABE14A68B233DC4E58C8C5AF00A2A7` |
| `quickstart.md` | `69D5493DFC064AFE019F3C13B73FDC2304C8B562503E43FF5584DFBAD018E743` |

The delta retains appropriate controls:

- **Dual registry publication:** one source-proven artifact, remote digest parity, partial-publication failure, and no promotion before verification. Existing publication does not authorize divergent rebuilding.
- **Runtime configuration:** allowlisted non-secret projections enter reviewed Git configuration; generation/hash mismatch, placeholders, and temporary overrides cannot reach bootstrap. Infrastructure success is distinguished from environment readiness.
- **Default-deny data endpoints:** the narrowly scoped ARM admission prelude resolves backend reachability before Blob locking without granting data-plane authority. Workload mutation still requires the global operation lease.
- **Network coordination:** explicit operational ownership of the reserved DNS record, ETag acquisition, lost-owner and uncertain-write refusal, bounded takeover settling, active-rule preservation, and independent expiry reconciliation are specified.
- **Permissions:** exact-resource scopes and conditioned DNS role grants avoid unrestricted role assignment. Initial human bootstrap authority is distinguished from recurring workflow rights.
- **Verification tasks:** T055–T057 retain projection rejection, protected bootstrap, admission concurrency, lost-gate behavior, and actual-version requirements.

Implementation review must establish that the DNS gate genuinely coordinates every admission writer/reaper and that uncertain asynchronous writes cannot overwrite another owner’s rules. Static artifact review does not establish those runtime properties.

The revised cost estimate and pending budget interpretation remain coordinator/owner gates; this security verdict does not authorize spending or resolve that decision.

No source implementation inspected, no files changed, no intrusive probes, and no risk acceptance recorded.
