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

Post-rebase formatting, lint, application and deployment checks are being rerun.
Hosted validation will run on the requested PR. Full published-image, GitOps runtime
and human acceptance gates remain pending as recorded in tasks.md.
