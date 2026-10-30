# Repair13 private kubectl prerequisite diagnostics

Scope: one fixed opt-in `failurePolicy: 'kubectl-prerequisite'`, tool kubectl only.
The existing private process boundary captures bounded stderr and emits only assessed
`ProcessFailure.providerCategory` plus the same fixed enum in its safe message.
Initial enum is connection-refused or unclassified. Default behavior, successful return
shapes, timeout, cancellation and combined output limits must remain unchanged.

Test design: real child processes establish classification/privacy and bounded lifecycle
mechanics, preserving actual ProcessFailure and cleanup collaborators. Exact synthetic
Windows kubectl wording tests mechanics only. A verified pinned kubectl request with an
explicit private empty kubeconfig, private cache and deliberately closed loopback endpoint
establishes provider fidelity without a cluster or Azure. Actual preliminary probe returned
status1 and matched the Windows `dial tcp ... connectex` refusal form; neither classic nor
Unix forms matched. Only that observed form is initially recognized. No raw provider text,
endpoint, argv, input, credentials or cause is retained in evidence.

Unknown, multiline, ambiguous or altered diagnostics remain unclassified. Classification
does not authorize retries or turn an operation successful. No new generic callback,
framework or process.mjs change is required. GitOps owns native projection and invocation
labels. Original reviewers own independent approval; no causal native fix is claimed.

## RED/GREEN and frozen checks

- Intended RED: `node --test --test-name-pattern='opt-in kubectl|pinned kubectl closed' scripts/azure-infrastructure.test.mjs`
  failed2/2 because the assessed property was absent from actual ProcessFailures.
  The second case invoked the verified pinned kubectl binary, not a subprocess mock.
- The small classifier runs only for the fixed opt-in policy and kubectl tool. Only
  nonzero exit inspects the bounded captured stderr; spawn/timeout/output-limit/
  cancellation remain unclassified. Full trimmed single-line observed Windows loopback
  refusal wording is the sole accepted pattern. Classic and Unix wording were not
  established by the local probe and are deliberately not guessed. This diagnostic
  has limited platform coverage; a future actual-provider contract may extend it.
- Unknown/multiline/ambiguous private strings become unclassified. Real child tests
  assert no private sentinels, endpoint, raw message or cause in public failure/message/
  JSON, and preserve primary17/refusal alongside cleanup23/unclassified independently.
  Successful string and explicit captureStderr object shapes remain unchanged.
- An initial oversized-output test exceeded Windows argv bounds before generating its
  stderr. It truthfully failed as unknown rather than output-limit. The fixture was
  corrected to generate bounded-argument large stderr inside the actual child; it now
  proves the existing combined maxBuffer behavior. No production spawn/output policy
  was relaxed to make the test pass.
- Final `node --test scripts/azure-infrastructure.test.mjs scripts/azure-handoff.test.mjs scripts/azure-terraform.test.mjs`
  passed31/31,0skips,exit0 in11.68s. This includes native local executable preparation,
  actual pinned kubectl loopback refusal, safe failures, saved plans and cache regressions;
  it creates no Kubernetes cluster or Azure resource.
- `npx.cmd eslint scripts/azure-infrastructure.mjs scripts/azure-infrastructure.test.mjs --max-warnings 0`
  passed exit0. Exact-file formatting passed after each edit.
- `node --test --test-name-pattern='actual Git definition accepts' scripts/azure-qualification-launch.test.mjs`
  passed1/1,0skips,exit0 in6.40s, retaining exact literal source inventory and transitive
  source/package hash behavior. No new source module or inventory update was needed.

Frozen owned source SHA256:

| File | SHA256 |
|---|---|
| scripts/azure-infrastructure.mjs | 03A9AF3830EA7073BDFCF31B680675C4CB79EBDA54F8CE1C87D01A02A9B46BED |
| scripts/azure-infrastructure.test.mjs | C5A4BCDAAC3D18D169206D209BA7B99D964F4E6F1CF8A883A1063D001B76C889 |

Coordinator owns current full checks and same-profile native reproduction after review.
The native helper's separate enum reprojection and nine exact invocation labels have
their own owner/evidence. No native-gate pass, causal repair, production readiness,
permission change, Azure operation, spending or independent verdict is claimed here.
