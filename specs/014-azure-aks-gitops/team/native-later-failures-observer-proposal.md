The missing diagnostics are separate from the provider failures.

- **Admission:** `native-admission` covers seeding, policy/type-checking, Job/Service CREATE/UPDATE checks and named Deployment authorization checks. `nativeFixtureFailure` discards the original assertion location, so the report cannot distinguish them.
- **Bundle:** `issuer-seed` includes production/staging issuer apply and status patch, then five Secret applies. Its calls do not use the prerequisite stderr categorizer. Exit status and duration establish no cause.

Use one temporary private preload observer outside tracked source, retaining the same four-file command, concurrency and timeouts:

1. Observe assertion failures only in `azure-admission.test.mjs`. Record fixed source callsite ID and assertion method. For labeled checks, accept only the source-defined mutation labels, verbs and resource names. Never emit assertion values, arbitrary messages or stacks.
2. Observe child-process completion without changing arguments, input, return values or exceptions. Classify bundle invocation as production/staging issuer apply, issuer status patch, or one of the five fixed Secret applies. Inspect input only transiently; never retain keys, certificates, patch contents or paths.
3. Record only status/signal, duration and bounded predicate booleans: existing connection-refused signature, missing ClusterIssuer mapping, resource-not-found, schema-invalid, authorization-denied, webhook failure, transport timeout/reset, or unclassified. Predicate matches are diagnostic categories, not causal findings.

Store only allowlisted JSON in a private `.local` file. Treat the run as instrumented diagnostic evidence, not an ordinary native-gate pass. No retries, provider queries or scheduling changes.

A subsequent source repair should be limited to the identified assertion or invocation and its diagnostic boundary. First require the exact failed checkpoint, provider category and preserved original failure outcome; broader fixes cannot be justified yet.

No files changed, tests run or providers invoked.
