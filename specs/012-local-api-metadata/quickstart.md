# Validation: API metadata locality

Prerequisites: pinned .NET and Node dependencies installed; running Podman and repository Testcontainers environment configured using [README verification](../../readme.md#verification). Use the documented Docker-compatible socket and Ryuk setting only where required by the runtime.

1. Before prose implementation, extend the existing generated-document HTTP assertions and run `npm run check:openapi`. Record failures showing missing descriptions rather than fixture/prerequisite errors.
2. After implementation, run `npm run check:openapi`. All three documents must pass Spectral with zero warnings/errors and retain existing contract assertions. Inspect coverage against [matrix](contracts/coverage.md) and [models](data-model.md).
3. Run `npm run format-check`, `npm run lint`, and `npm run check`. Record commands, environment, results and tested revision in team evidence; unavailable prerequisites remain pending.
4. Review sources to confirm attribute-owned model/property prose, endpoint-owned metadata and absence of reservation global operation-ID dispatch. Review documented remaining inference gaps in [plan](plan.md).
5. If inspecting Scalar in the already documented local development flow, confirm the same generated field/operation descriptions are visible. Do not claim a new login/browser smoke run without performing it; there is no UI/auth behavior change here.

Acceptance requires independent quality/security reviews, convergence with no gaps and explicit human acceptance, in addition to checks. No CI workflow or exported baseline document is added.
