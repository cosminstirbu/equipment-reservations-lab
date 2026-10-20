# PR validation after rebase and renumbering

Owner explicitly authorized committing, rebasing, renumbering to 013, pushing and
opening a PR to exercise hosted validation on 2026-10-20. Merge, release publication
and host trust/DNS/VM changes are outside this authorization.

Fetched origin/main is `4dd685c`. Local main is `d168646` and contains two additional
API contract/endpoint organization commits. Rebased implementation commit is
`560d273`; rebase completed without conflicts. The PR includes these local main
commits because they are not yet on origin/main.

Current feature path is `specs/013-local-kubernetes`; branch is
`013-local-kubernetes`. Historical snapshots and exception EX-012-001 retain their
original identifiers, paths and hashes as evidence of the original reviewed source.
They do not certify the rebased revision. Relative links remain within the relocated
feature directory. The endpoint mapping refactor from main remains intact; deployment
portability changes are in shared documentation/configuration and the browser guard.

Post-rebase format-check and lint passed. `npm run check` exited 0 with
541 backend, 64 frontend and 24 tooling tests, zero failures/skips. The separate
`npm run test:deployment` exited 0: 12 serialized files, 77 tests, zero failures,
cancellations or skips. Temporary provider resources were cleaned by their fixtures.

Independent delta quality review of `3fad694` found no endpoint/OpenAPI integration
regression. Its sole low finding Q-R001 was a stale live fixture documentation path;
that comment was corrected, formatted, and independently rechecked (file SHA256
`60d75163ea5f1a29e65ba51259ae28159fd28ae2e6d0ada7cc5f320c6a5b9eda`).
No runtime behavior changed in this follow-up. Historical reviews are preserved.

[PR #1](https://github.com/cosminstirbu/equipment-reservations-lab/pull/1) is open.
The first [Validate run](https://github.com/cosminstirbu/equipment-reservations-lab/actions/runs/39411857797)
started both quality and deployment jobs; committed release validation, formatting,
lint and real-provider regressions passed. Application tests and ephemeral application
deployment were still running when this record was written; final hosted status is pending.
The comment/evidence follow-up push triggers a new run for the final branch head. Full published-image, GitOps runtime
and human acceptance gates remain pending as recorded in tasks.md.
