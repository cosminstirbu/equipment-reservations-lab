# CI repair validation

Snapshot: `ci-repair-013-01`, baseline `6d79ef755218bbd08317ae7177a273b65f8a0f45`.
All ten source/test SHA256 values match the frozen manifest. The active original
checkout is `/Users/cosmin.stirbu/Desktop/codex-speckit-team`, branch
`013-local-kubernetes`; the old Kubernetes worktree has been removed.

The owner requested all three hosted failures fixed and previously authorized push
and PR validation. These repairs do not authorize merge, GHCR publication, local
trust/DNS/VM changes or overall feature acceptance.

## Local checks

- `npm run format-check`: exit 0.
- `npm run lint`: exit 0; warnings-as-errors build reports zero warnings/errors,
  ESLint and suggestion-level style verification passed.
- `npm run check`: exit 0, 541 backend, 64 frontend and 24 tooling tests; zero
  failures/skips. Backend duration 3m21.002s. Real Podman runtime supplied through
  DOCKER_HOST; resource reaper disabled for the existing Podman environment.
- `npm run test:deployment`: exit 0, 12 serialized files / 77 tests, zero failures,
  cancellations or skips. Container runtime Podman and pinned kubectl1.35.8 first
  on PATH; actual complete-platform CoreDNS/HTTPS/configuration/PVC checks passed.

Provider fixtures remain real and native module/method scheduling is unchanged.
Existing application request/retry budgets and the outbox one-second requirement
are unchanged. Focused RED/GREEN and restart contract evidence is in
`ci-coredns-repair.md`, `ci-outbox-repair.md`, and `ci-restart-repair.md`.
Independent repair-code verdicts pass in `ci-quality-review-01.md` and
`ci-security-review-01.md`; each explicitly distinguishes code review from runtime
acceptance.

## Hosted validation

The previous Docker28.0.4 run failed with 66 backend failures and the CoreDNS rollout
parser failure. Actual Docker execution of the repaired frozen source is still
required. The [PR checks](https://github.com/cosminstirbu/equipment-reservations-lab/pull/1/checks)
are the authoritative external record for each pushed commit; local Podman cannot
substitute for Docker restart evidence. No hosted pass is claimed here before the
new run completes. Final results will also be summarized in the PR description.

## Remaining feature gates

This closes no published-image, integrated Argo/local-demo, VM-restart or human
acceptance gate by inference. Existing tasks remain 31/41 checked and ten pending;
`ci-convergence-01.md` records no additional build task in the repair scope.
