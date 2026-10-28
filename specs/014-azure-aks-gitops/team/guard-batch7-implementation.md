# Batch7 guard helper implementation

Scope: T085/T086 guard-helper contracts only, approved proposal
B8B2E68ED1C1D34538B3193A7E187D17E3DF84DF738A1618FCFB22F484F2ED7D.
Other authors own Terraform, activation/cache and recovery. No live Azure writes,
fixture provisioning, authority changes or native-fixture repairs are authorized here.

## Test design and operational handling

Tests retain real helper serialization, identity binding, bounded HTTP transport,
semantic comparisons and response validation. A local HTTP server replaces ARM;
responses model pinned Policy/Authorization REST endpoints. This does not prove
actual Azure scope/API support. Deterministic literal-descriptor tests isolate the
public safe-fixture builder because target derivation is a security-sensitive pure
algorithm. Failure assertions concern observable denied/accepted requests and absence
of active guard mutations, not private methods.

ARM bodies, identity tokens, IDs and service errors remain private. Safe failures
identify fixed phase/status; no raw response/error logging. Calls retain 30-second
per-request deadlines and bounded overall cancellation. No mutation retries or circuit
breaker: this bounded qualification is fail-closed and uncertain writes require human
inspection, rather than retry. Canary denial establishes only its exact fixture scope;
active authority audit is a separate requirement and cannot be inferred from it.

## Frozen partial checkpoint

Baseline HEAD remains d1c7238345136340ddbf3a9454807cefffc43c32. Owned source hashes:

- scripts/azure-vault-guard.mjs:
  6C3D83A2B09F8AB40206CC7B2BFF7CFB49CD84F872142716041AEE12B8B778BB
- scripts/azure-vault-guard.test.mjs:
  557C636C375B4E93D03541BC73BF074986DC8D11CFEAD2CB4B289C500E9A3427

New public APIs:

- createVaultGuardCanaryDescriptors({config,guard,principalIds}) derives fixed inert
  policy fixtures, UUIDv5 redundant-read role and per-actor assignment tuples.
- verifyVaultGuardCanaryDenials(options plus actor) binds the actual ARM app-token
  identity, rederives every descriptor, reads the actual read-only role, then observes
  GET / exact PUT / GET. Only exact AuthorizationFailed403 with action and provider
  correlation provenance is accepted; changed state and uncertain/accepted requests
  fail. Returned boundary is explicitly canary-scopes-only. No active guard is mutated.
- resolveVaultGuardFamily(options) returns {familyHandle} only after fixed producer
  pointer, container writer isolation, referenced immutable evidence and current
  policy/role tuple validation.
- publishVaultGuardReference(options plus mode=family and familyHandle) requires the
  human producer, validates the complete family record, creates conditionally or
  updates with a newly acquired exact pointer lease and actual ETag. Owned lease release
  is attempted independently and simultaneous primary/cleanup failures are preserved.
- resolveVaultGuardActivation(options) returns the five existing handles only after
  fixed current-generation pointer, current family, generation tuple, actual receipt/
  plan binding and completed ordinary-activation validation. The activation object's
  digest and handle bindings are read before/after the actual validator.
- publishVaultGuardReference(options plus mode=ordinary-activation and all five handles)
  additionally requires actual apply identity and common operation lease, completed
  current-target validation, conditional ETag publication and postwrite lease check.

Pointer discovery uses no Blob list/newest timestamp. Pointers remain mutable producer
transport, not WORM. Existing actual validator is retained; no caller success boolean,
generic success callback or consumption-only activation shortcut is introduced.

## Evidence

Spec Kit prerequisites:
`SPECIFY_FEATURE_DIRECTORY=specs/014-azure-aks-gitops` with Git Bash
`.specify/scripts/bash/check-prerequisites.sh --json --require-tasks --include-tasks`
exited0 and resolved the exact feature. Checklist scan: operations20/20 and
requirements16/16 checked, no marker changes. No extension hooks file exists.

Intended red evidence before production behavior:

- `node --test --test-name-pattern="G3 canary" scripts/azure-vault-guard.test.mjs`:
  six failures for missing builder/verification API. Follow-up actual unsafe-role case
  failed for missing rejection, then actual role semantics were implemented.
- `node --test --test-name-pattern="family pointer|pointer ETag" scripts/azure-vault-guard.test.mjs`:
  two failures for missing pointer API, after correcting fixture qualification purpose
  and disposable-probe setup (those earlier setup failures were not intended-red proof).
- `node --test --test-name-pattern="ordinary activation pointer" scripts/azure-vault-guard.test.mjs`:
  missing resolver API failed, then completed-record rejection was implemented.
- Accepted-canary plus failed postread regressed with lost HTTP200; the new check now
  preserves primary acceptance and verification500 separately.
- Arbitrary token-provider error test failed with private marker visible, then public
  async boundaries were normalized to fixed safe phases.

Final frozen commands:

- `node --test scripts/azure-vault-guard.test.mjs`: exit0,44pass,0fail,0skip,17.22s.
- `npx.cmd eslint scripts/azure-vault-guard.mjs scripts/azure-vault-guard.test.mjs --max-warnings 0`:
  exit0, no diagnostics.
- `npx.cmd prettier --check scripts/azure-vault-guard.mjs scripts/azure-vault-guard.test.mjs`:
  exit0, all matched files formatted. Exact-file formatter ran after every edit.

No native/provider fixture or Azure operation was run. Root coordinates required global
format-check/lint after concurrent authors freeze; previous global passes do not approve
this source snapshot. No task is marked complete and no reviewer verdict is supplied here.

## Remaining gates and interface gap

Active-object five-inspection-role observation, complete inherited/effective authority
inspection and exact conditioned delegation interpretation are UNBUILT. Current output
does not describe the exact immutable actual delegation condition/role semantics; the
coordinator is routing a narrow design proposal. There is deliberately no exported
qualifyVaultGuardActor composite success or fabricated actor evidence. Existing G3
prerequisite barriers must remain until this work and actual provider qualification pass.

Ordinary-activation pointer success through actual configured provider/CLI composition
is UNPROVED. The new negative proves that missing completed records cannot publish a
pointer; it does not prove actual installation/readiness or recurring recovery's own-only
observation boundary. Primary owns actual activation/cache/CLI integration and operations
owns recurring observation. Current installed-target validator still requires its real
projection/Kubernetes/readiness prerequisites; none was replaced in these tests.

Literal builder/schema closure must be checked against current Terraform output and its
new staged-canary design. No fixtures or exact canary-object grants were provisioned.
Actual API/scope support, denial enforcement, principal identity, lease expiry under
Azure, proof transport and full recovery acceptance remain pending.
