# Q-GUARD014-001 / SEC-GUARD001 repair10

Approved scope: family-pointer replacement only. Implement under the existing
Spec Kit T086 contract and current constitution/testing/tooling/formatting guides.
No checklist verdict, authority grant, native fixture, source-closure manifest or
other worker's source is owned here.

Test design: exercise public qualification, publication and resolution through the
existing actual local ARM/Blob HTTP server. Retain real serialization, digest checks,
producer/container inspection, current qualification checks, lease and ETag transport.
The server replaces external ARM/Blob only; no Azure enforcement claim. New behavior
is A publication, source/policy tuple drift, fresh B qualification, stale A operational
rejection, then successful conditional replacement/resolution of B. Historical integrity
does not mean current eligibility. Tampered and foreign historical records and rollback
remain rejected, with no conditional pointer mutation and owned lease cleanup.

Provider payloads/tokens remain private. Safe phase/status diagnostics and independent
cleanup are retained. Per-request timeout/retry behavior is unchanged. Tests and evidence
below are author checks; original reviewers own closure.

## Repair and scope

The previous pointer now uses a private historical-integrity reader exclusively for
conditional replacement. It requires the current actual isolated human evidence
container/writer, strict pointer and handle, exact referenced-object SHA256 and tuple
hash, historical record schema, environment/tenant/subscription, declared actual human
producer, qualification ID/path, source digest/revision shape and bounded issued time.
Foreign, tampered and future-dated historical references fail before pointer mutation.
It does not claim that an older source/guard tuple is current authority.

The proposed new family still passes the unchanged complete current evidence validator,
including actual current guard/role/source checks. Operational resolution still uses
that same current validator. The old record's issuance ordering protects against rollback;
lease acquisition, reread/ETag comparison, conditional update and independent bounded
cleanup are unchanged. No public historical-validation bypass or new caller flag exists.

## Test-first evidence

Baseline helper SHA256:
6C3D83A2B09F8AB40206CC7B2BFF7CFB49CD84F872142716041AEE12B8B778BB.

`node --test --test-name-pattern="fresh family qualification" scripts/azure-vault-guard.test.mjs`
initially failed during setup at the expected fixed-probe tombstone collision. That
result is not counted as the intended red. After explicitly modelling provider expiry
of the exact owned tombstone, both source and policy variants failed at replacement's
old-current validation: human family evidence binding / current family tuple drift.
After the repair both passed; stale A continued to fail operational resolution.

Five additional boundary cases reject tampered object digest, foreign environment,
foreign producer, foreign handle prefix and future issuance while preserving pointer
bytes and releasing the owned lease. A separate A/B same-current-tuple test publishes B
then proves older A cannot replace it. Existing ETag conflict, simultaneous primary /
cleanup failure, writer isolation and private token/provider diagnostics remain covered.

Final commands on the frozen owned files:

- `node --test scripts/azure-vault-guard.test.mjs`: exit0,52pass,0fail,0skip,35.75s.
- `npx.cmd eslint scripts/azure-vault-guard.mjs scripts/azure-vault-guard.test.mjs --max-warnings 0`:
  exit0, no diagnostics.
- `npx.cmd prettier --check scripts/azure-vault-guard.mjs scripts/azure-vault-guard.test.mjs`:
  exit0, all matched files formatted. Exact formatter ran after each edit and source
  readability was inspected.
- `npm.cmd run format-check`: exit0. Workspace-loading warning was emitted; all matched
  files were formatted.
- `npm.cmd run lint`: exit1 after graceful interruption of the known failing restore;
  the sandbox denies api.nuget.org socket access (NU1301).
  Scoped JavaScript lint passed. No global lint pass is inferred from this failure;
  coordinator owns the network-enabled rerun after concurrent source freezes.

Frozen hashes:

- scripts/azure-vault-guard.mjs:
  E6D59A8C7D714E6D5B19576F21DF78976A07A9132CA79A71BE7F6028001585BC
- scripts/azure-vault-guard.test.mjs:
  01436C9901765C2CDA6ACDDE9CCAEC0370D67D3528747EF9ADF3BADB7948CBB6

## Provider availability limitation

Source creates the fixed G1 probe with `softDeleteRetentionInDays: 90`, purge protection
enabled. Immediate requalification collides with its retained name. The approved
operation contract's Fixed initial human workload probe section already requires
explicit human review on that collision, with no random name, implicit recovery or purge;
it permits a separately reviewed naming configuration change. It does not promise
immediate repeated qualification or an automatic short wait.

The regression explicitly removes only this fixture's prior deleted-probe response to
model provider expiration/name reusability, then runs real qualification code through
the HTTP boundary. It does not advance actual Azure time or prove a normal immediate
Azure A-to-B qualification cycle. The repair establishes pointer replacement once valid
fresh qualification exists. No production probe behavior changed; no purge/recover call,
Azure action, native fixture, source-closure manifest or other author's file was edited.
Live qualification scheduling/availability remains a separate feasibility gate.

No task or reviewer finding is self-closed. Active authority/G3 composition and positive
actual ordinary-activation composition remain outside this bounded repair.
