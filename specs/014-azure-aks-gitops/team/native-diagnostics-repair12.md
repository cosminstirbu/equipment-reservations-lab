# Q-NATIVE014-001 diagnostic repair12

Author evidence only; original verifier owns closure. Coordinator released exact
admission/nativehelper/test after blocking medium Q-NATIVE014-001. Other fixtures,
shared/global source and source permissions remain frozen. No native/provider runs.
Required testing/tooling/privacy/per-edit formatting standards and diagnosis record
from repair11 remain applicable and current.

## Finding and narrow repair

Admission previously passed nativeFixtureFailure(...).message to assert.equal for
spawn errors. Node constructed an AssertionError; final fixture cleanup projected
that assertion and lost tool/category/duration. Passing the safe ProcessFailure
object directly preserves its metadata and excludes original raw process output.

The existing exact assertion was extracted into assertNativeProcessStarted in the
existing narrow helper, used by admission and its regression. Initial extraction
retained the same message-only behavior, allowing the real external failures to
exercise the bug before repair. This is not a fabricated exception from owned
logic or a mock of process/cleanup collaborators. No generic framework/new asset
was added; only one assertion boundary moved to a shared public function.

## Tests and privacy

New cases use actual spawnSync: nonexistent random exact path produces ENOENT;
a real Node child printing an environment sentinel then remaining active produces
ETIMEDOUT under a200ms test-only budget. The same admission assertion wrapper feeds
finishNativeFixture, whose separate real Node cleanup exits17. Assertions verify
kubectl tool, native-admission phase, actual spawn/timeout category, exact rounded
measured duration, secondary cleanup phase/status17, and no private sentinel in
rendered/serialized errors or reports. Child args contain environment variable
names, not private values. All process and cleanup logic remains real.

Intended RED:
node --test --test-name-pattern='admission .* boundary' scripts/azure-native-fixture.test.mjs
FAIL2/2,626ms: expected kubectl tool became fixture (and corresponding metadata was
lost), matching the original verifier's finding. Changed only the wrapper assertion
message from string to safe Error object and replaced admission's inline assertion
with this same public helper.

GREEN:
node --test scripts/azure-native-fixture.test.mjs
PASS7/7, zero skips,1.75s. Previous primary11/cleanup17, primary-only/cleanup-only,
attempt-all marker, arbitrary/private captured-tail projection cases remain green.
Scoped format-check and ESLint max-warnings0 pass; per-edit formatter/re-read done.

No native assertions, provider timeouts/profiles, parallelism, readiness, response
body handling or scheduling changed. No other fixture source changed. The separate
HTTPS body-read risk stays pending. No Podman/kind/Azure run or resource mutation
occurred. Actual minimized/original full gates remain coordinator work after review;
passing these subprocess regressions does not close the original provider failures.

Frozen SHA256:
- azure-native-fixture.mjs: A69F203290421FBBE37912A4B09692A45F408BFBD5518D7E9FC10FFE787DECE2
- azure-native-fixture.test.mjs: 3BD1EBA2BB908BEBA376CDE4BBD82AE2A24E3D6AA1269E46F1E0C1148C4B5BA5
- azure-admission.test.mjs: 3CC57351154582405B2759604A29152FE8D81210DE12460BAF2C2C18E96553AC

Primary receives exact changed hashes for manual immutable-asset closure update;
no authority definition/shared-source update was performed by this owner. Round12/12
source budget is exhausted after revalidation; no implicit reset or further repair
permission is inferred.
