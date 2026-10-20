# Broker executable targeted design review

Scope: planned T012/FR-006 bootstrap executable; requirements unchanged.

## Quality reviewer /root/quality (verbatim)

Broker executable adaptation design/standards verdict PASS within T012/FR006 (not implementation approval). Inspected BrokerBootstrap.csproj (library) and BrokerProvisioning.Build (production single topology owner). Constraints: minimal public executable/config boundary invokes existing Build unchanged; validate required inputs/output location, secrets through scoped env/files rather than command args; create private complete temporary file with restrictive mode at creation, atomic replacement and cleanup on failure; no raw exceptions/definitions/hashes/passwords in stdout/stderr; nonzero diagnosable sanitized failure and no partial success artifact. Shared emptyDir UID/GID/mode contract must demonstrably let nonroot RabbitMQ read final file while retaining restrictive permissions and read-only consumer mount. Retain Build's existing source-generated JSON and provider contracts; no duplicated topology. Test-first public executable outcomes incl mode/readability, missing/invalid config, failure cleanup, no leakage and successful real RabbitMQ import; keep existing contract tests, document real collaborators/doubles in plan per testing guide. No AppHost construction/testing added. Exact source diff/checks and rerun import behavior still require independent implementation review.

## Security reviewer /root/security (verbatim)

**Pass for the proposed design adaptation.** Reusing `BrokerProvisioning.Build` preserves existing scoped topology and hashing logic; adding an executable fits planned bootstrap scope.

Implementation constraints:

- Treat generated password hashes as sensitive; never print definitions or configuration values.
- Require an explicit private output path; create with restrictive permissions initially, avoiding a world-readable creation window.
- Share the volume only with RabbitMQ; match nonroot ownership and give RabbitMQ read-only access where practical.
- Fail closed on missing configuration or write failure; return sanitized diagnostics and nonzero status.
- Publish the complete file atomically so RabbitMQ cannot consume partial definitions.

Test observable executable behavior, output permissions and secret-free success/failure output before implementation. Actual source/image/manifests still require security review.
