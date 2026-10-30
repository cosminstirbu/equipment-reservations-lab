Verdict: **pass — Q-NATIVE014-001 closed on repair12**.

Verified SHA256:

- Helper: `A69F203290421FBBE37912A4B09692A45F408BFBD5518D7E9FC10FFE787DECE2`
- Helper tests: `3BD1EBA2BB908BEBA376CDE4BBD82AE2A24E3D6AA1269E46F1E0C1148C4B5BA5`
- Admission fixture: `3CC57351154582405B2759604A29152FE8D81210DE12460BAF2C2C18E96553AC`

The admission call site now uses `assertNativeProcessStarted`, which passes a safe `ProcessFailure` object through the assertion instead of its message. Final cleanup projection therefore retains tool, category and measured duration.

New regressions exercise actual missing-executable and timed-out Node processes through that same public helper and `finishNativeFixture`, followed by real cleanup exit17. They verify primary metadata, separate cleanup diagnostics and private-output suppression. This directly covers the original failure without mocking process or cleanup behavior.

Evidence inspected: intended two-case RED, reported **seven PASS, zero skips**, scoped formatting/ESLint, frozen source and tests. I did not rerun tests or provider clusters.

Changed files: none. Provider assertions, profiles, timeouts and parallelism remain unchanged in this repair. Original native failures, the separate body-read risk and minimized/full provider gates remain pending; this diagnostic closure does not clear them.
