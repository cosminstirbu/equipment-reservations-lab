Verdict: **changes_requested — bounded batch11 diagnostic source review**.

**Q-NATIVE014-001 — blocking, medium, code: admission spawn failures lose actionable process metadata.**

At `scripts/azure-admission.test.mjs:110`, `assert.equal(result.error, undefined, nativeFixtureFailure(...).message)` converts a spawn/timeout failure into an `AssertionError` containing only the formatted message. The outer `finishNativeFixture` then reconstructs metadata from that assertion and discards the message. The result loses the original tool, category and duration.

A read-only Node reproduction of this exact wrapping sequence converted `kubectl / ETIMEDOUT / 123ms` into:

```text
Native fixture native-admission (fixture) failed: unknown; status=unavailable; signal=unavailable; duration=0ms
```

Required repair: throw/pass the safe `ProcessFailure` object on this path, as the positive apply assertion already does, rather than retaining only its message. Add a public regression covering the admission timeout/spawn wrapping boundary through final cleanup reporting.

The shared helper otherwise preserves real primary exit status, attempts all cleanups and suppresses private output. Tests use actual Node subprocesses for exit11, cleanup exit17 and later successful cleanup. Exact private kubeconfigs are supplied for cluster deletion; TLS, cluster/pod and directory cleanup remain separate.

Verified frozen hashes match the supplied report:

- helper `47A4673B78BD681B2070BCF48C854835633C52A1A3E9A1F9830E7F5B5869AD21`
- helper test `1319AA59C51C027DDA8935A18F2483DE061EBB5E85C3F1572E4363EF00FEEEF5`
- ACME `D447E82A65556C7BE6C26E275F791B26724364E5573BBD101595F7CD57FA7F1D`
- admission `BD1091D084FA9A709B41CD91205BF20C7F4AB9986648AF53814D1AB543A020D8`
- bundle native `A52BE67990209FFFD62B36C5ECA9BCD3DA41FB6721C3E5D525CA2349B552ABD0`
- observability `13CB976BA0CBC21433F6553FFA9B03071CD040CBC34A55241DB89797294DF942`

Narrow inventory verdict: **pass**. Manifest hash `6A114D316CBA15ED3B90FA71A4FB26FE2CAA9A182AB176EC7493CABED90E8646` matches; the helper appears as an immutable asset. Existing test-file exclusion remains unchanged.

Evidence inspected: author five-test PASS, scoped checks and source paths. No provider cluster rerun performed. Original native failures, the acknowledged body-read risk and the complete combined gate remain pending. No files changed.
