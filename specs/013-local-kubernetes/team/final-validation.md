# Reviewable implementation and remaining acceptance

Branch: `013-local-kubernetes`.

Renumbered from 012 after rebasing onto local main `d168646` (which contains fetched origin/main `4dd685c`). Historical review snapshots below retain their original identifiers and refer to the pre-rebase revision. Post-rebase checks and hosted PR validation are recorded in `pr-validation.md`. Owner authorized commit, push and PR creation for validation testing; merge and publication remain separate.
Worktree: `/private/tmp/equipment-reservations-local-kubernetes`.
Main baseline: `4dd685c4e34288f94e932dcd49beb22eea965075`.
Frozen snapshot: `implementation-012-02a`, 117 files, SHA256
`e95304733cc8b247af38ec077a72f7a9b8d9bcf496b5e1f277af2dd12098f29a`.
Both independent reviewers verified all hashes and passed the implemented-code scope.

| Final check | Result |
|---|---|
| `npm run format-check` | PASS |
| `npm run lint` | PASS; audited build with zero warnings/errors, style and ESLint gates |
| `npm run check` | PASS; 541 backend, 64 frontend, 24 tooling tests; zero skips; uninstrumented |
| `npm run test:deployment` | PASS; 12 serial files, 77 tests; zero failures, cancellations or skips |
| `git diff --check` and snapshot verification | PASS; 117 of 117 hashes match |

Actual deployment probes include durable RabbitMQ state after replacement with a changed
hostname; pinned Dashboard authentication/transport; real Traefik TLS, trust/name rejection
and public-path denial; native ConfigMap rollout with changed responses and retained PVC
data; and production nginx routing. Seven native ARM64 images were built. The final broker
image passed repeat, unsafe file-type/mode and wrong-owner cases.

The isolated Aspire browser run passed 27 of 27 checks. Correlated export and recovery
evidence remains in [implementation evidence](implementation-evidence.md). Detailed metrics
and complete local Kubernetes acceptance remain pending. Focused, native and Aspire proof
does not establish hosted CI, AMD64 execution or full deployed-demo acceptance.

See the [quality review](implementation-quality-review-02a.md),
[security review](implementation-security-review-02a.md),
[convergence assessment](convergence-02a.md),
[test setup diagnosis](test-infrastructure-diagnosis.md) and
[quickstart](../quickstart.md). Earlier failures and reviews remain historical evidence.
The reviewed setup-admission repairs passed the exact scheduler and final normal run.
Temporary diagnostics were removed. [EX-012-001](exceptions.json) records the owner's
one-time historical test-first exception; it grants no correctness, security or acceptance waiver.

Available tools: kind 0.33.0, mkcert 1.4.4 and Homebrew kubectl 1.37.1. The selected node is
1.35.8, so checks use compatible kubectl 1.35.8 at
`/private/tmp/equipment-k8s-tools/kubectl`, including its bundled Kustomize. Helm and
standalone Kustomize are unnecessary. The hosted CI entrypoint requires Docker/AMD64 and
runner DNS changes; it was not run on the Mac by spoofing CI context.

Owned temporary kind and provider fixtures were cleaned. Read-only verification found no
kind clusters or owned test-container prefixes. Original checkout changes remain separate.
No push, merge, publication, host trust/DNS installation or VM changes were performed.

Overall feature acceptance still needs genuine images, hosted CI and reviewed release;
complete local lifecycle, resource and telemetry evidence; owner actions; and explicit
human acceptance. Ten existing tasks remain unchecked. The source is ready for review;
the full feature completion contract has not yet been satisfied.
