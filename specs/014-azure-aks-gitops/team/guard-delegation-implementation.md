# T089 bounded pure delegation validation

Scope is the independently approved delegation descriptor/evaluator contract, integrated
under plan/contracts after preparation9. Own only existing guard helper/tests plus this
author record. Existing G3 barrier, Terraform/cache schemas and native fixture snapshot
are untouched. No provider runs, grants or live authority assertions are in this batch.

Public pure APIs require both descriptor and an independent expectedDescriptor argument.
That expected value must eventually be supplied by clean-source/authorized-output
reconstruction; merely supplying it does not prove provenance. No fallback takes the
untrusted descriptor's allowedRules as authority. Publisher/source authorization and
actual provider reconstruction remain UNBUILT separate integration gates.

Test design: deterministic public parser/validator/evaluator algorithm tests are
appropriately solitary under Principle III: the behavior is structural equivalence of
a bounded grammar and decision semantics. There are no mocked internal collaborators.
Fixture condition text is rendered from the actual current Terraform heredoc using
explicit synthetic source-value substitutions, independently of the production AST
builder. The test fails if unsupported source template expressions remain. Synthetic
GUIDs do not establish actual Azure identities/roles. Exact byte hashes, complete
descriptor hashes, source-rule structural equivalence, ANY ServicePrincipal semantics,
scope containment and @Request/write versus @Resource/delete outcomes are observable
contract assertions. Invalid grammar/inputs throw fixed safe failures, never return
an allowed/denied authority decision.

All algorithm input is private and failures expose fixed phases only. This layer does
not execute commands or HTTP calls, retry, persist payloads or log descriptors. Existing
operational output/timeout/cleanup behavior remains unchanged.

## Implemented public boundary

- validateWorkloadDelegation(descriptor,{expectedDescriptor}) validates exact nested
  schema and complete role, assignment/raw UTF8 condition and descriptor hash closure.
  Both apply/destroy ASTs must structurally equal the independently rebuilt expected
  rule AST. Successful output is {valid:true,semanticSha256}.
- evaluateWorkloadDelegation(descriptor,options) requires expectedDescriptor, actor
  apply/destroy, action and targetScope. Write requires requestedRoleDefinitionId,
  requestedPrincipalId and requestedPrincipalType. Delete instead requires actual
  resource {id,scope,roleDefinitionId,principalId,principalType}; its ID and parent
  scope must match. Supplying request fields on delete, or resource fields on write,
  is invalid. Successful output is exactly {valid:true,allowed}.

The expectedDescriptor argument is mandatory with no self-derived fallback. This pure
algorithm cannot authenticate its caller's claim that the supplied expectation came
from an independent trusted source; that provenance remains an explicit integration
precondition, not something established by object equality or passing tests.

The scanner accepts only supported literal tokens. The parser uses explicit NOT,
parentheses, AND/OR AST operations and rejects mixed Boolean operators without grouping,
unknown syntax, duplicate GUIDs/rules, escapes, comments and trailing tokens. Commutative
AND/OR and GUID/rule ordering are normalized structurally; no eval, regex permission
inference or sample-based equivalence exists. Limits are 64KiB UTF8 condition text,
8192 tokens,32 nested parser levels,64 rules and128 values per supported set/array.
Unknown action/input/type/scope is invalid; known User/Group types, unknown valid role
GUID and disallowed principal tuples yield a valid denied condition decision. Base
principalIds=null preserves ANY ServicePrincipal, including a nonrepository GUID.

Action/GUID matching and ARM scope segments are case-insensitive. Scope containment
uses segments, so RG siblings, traversal/encoded delimiters and foreign parents cannot
match a raw prefix. Decisions are only for the supported conditioned assignment; no
permission union, NotActions universal deny, current actor identity or provider
enforcement result is inferred.

## Test-first and final checks

Before implementation:
`node --test --test-name-pattern="pure workload delegation" scripts/azure-vault-guard.test.mjs`
returned exit1,4fail,0skip at the missing public APIs. The actual Terraform heredoc
fixture rendered successfully, so this was the intended missing-behavior RED rather
than setup failure.

Final eight pure cases cover every concrete source allow rule for apply/destroy with
write and actual-resource delete, base ANY ServicePrincipal, cross-principal/installer/
User/Group/unknown-role denies, missing expectations, byte and descriptor hash drift,
source principal mismatch, strict scope/tuple keys, unsupported grammar, commutative
normalization with byte pins retained, malformed descriptor/duplicate/depth/size cases,
actual resource-only delete and each individual Boolean/NOT source mutation. Private
condition marker rejection is checked without exposing its value in failures.

One initial additional assertion incorrectly expected a caller-fabricated independent
expectation to prove source provenance. It was corrected to compare the changed actor
principal against the original independent expectation; no production restriction was
weakened to make that assertion pass. Full source authorization is expressly unbuilt.

Frozen checks:

- `node --test scripts/azure-vault-guard.test.mjs`: exit0,60pass,0fail,0skip,20.99s.
- `npx.cmd eslint scripts/azure-vault-guard.mjs scripts/azure-vault-guard.test.mjs --max-warnings 0`:
  exit0, no diagnostics.
- `npx.cmd prettier --check scripts/azure-vault-guard.mjs scripts/azure-vault-guard.test.mjs`:
  exit0, all matched files formatted. Exact formatter ran after every edit; authored
  code was reread and inspected for readability.

Frozen hashes:

- scripts/azure-vault-guard.mjs:
  12CAD87C67A29794374FBF2D853C3C72EC5F6965CF829452C27700D06D3546C5
- scripts/azure-vault-guard.test.mjs:
  B0A250F0BEC2BD0EE68200131724157C1D4C4ECB4C2E8B9360B384F7D0044BBD

Root owns global/native gates after all source freezes. This batch ran no global build,
native provider/runtime, Azure or GitHub operations. No operational caller invokes the
new APIs yet; current-authority audit, source-authenticated expected reconstruction,
Terraform/cache migration and G3 barrier integration remain pending. No task checkbox,
review verdict or feature completion changed. Original reviewers own assessment.
