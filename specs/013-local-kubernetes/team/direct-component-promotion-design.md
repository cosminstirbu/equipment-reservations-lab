# Direct component promotion design

Owner approval: 2026-10-22 conversation requests component-owned image files,
direct commits/pushes to main instead of promotion PRs, removal of existing
promotion PRs/branches, and implementation PR validation followed by rebase merge
and main workflow verification. Stop on authorization failures. Feature acceptance
remains separate. This amendment supersedes earlier proposal/merge-only promotion
requirements in feature 013; historical evidence is retained.

Use seven predeclared strategic-merge image patches under
`deploy/environments/local/images/NAME.yaml`. Root Kustomization references are
static. Unreleased patches retain the component alias; published patches contain
an immutable image reference matching the component record. Bootstrap Job suffixes
remain component-owned. Validate exact patch shapes and rendered resource policy.

Keep existing quality prerequisite, trusted main/manual branch contexts, original
run intent, immutable artifact/index verification, per-component source provenance,
no-op/freshness guards and global queued promotion mutations. Capture only target
records, not automation branches. Derive each commit from a fresh exact main tree;
validate candidate formatting, committed state and pinned Kustomize/static policy
before atomic expected-head main update. Preserve unrelated files. Never force push.
If main moves, fail safely and rerun from fresh state; changed same-component target
requires fresh dispatch. Exact already-applied results are idempotent. Branch rules
are not bypassed or altered. GITHUB_TOKEN updates do not trigger recursive push
workflows; candidate validation is consequently part of the promoting job itself.

Test design: public promotion generation/entry points with real parser, validators,
formatting and temporary Git trees. Controlled GitHub boundary responses follow
Git trees/blobs and GraphQL updateRefs contracts, checking expected main OID,
non-force update, safe errors and no PR endpoints. These are narrow transport/policy
tests, not claims of live GitHub permission qualification. Add independent-component
file ownership/commutation, stale/no-op and candidate-failure cases before changing
implementation. Retain real pinned Kustomize rendering for all seven image slots,
including RabbitMQ init container and suffixed Jobs. Keep full applicable tooling,
format and lint checks. Hosted PR/main runs establish actual workflow integration.

Operation handling: authenticated GitHub responses remain private capture with
safe phase/status only; public committed manifest candidates and formatter/render
failures use existing bounded public capture. Temporary candidate resources are
owned, bounded and cleaned with primary/cleanup failure preservation. No new
credentials, private artifacts or raw provider logging are introduced.


## Local verification before implementation PR

Original four regressions failed before implementation: shared image-file overlap,
PR creation instead of main update, missing candidate gate and wrong target ref.
The full-quality pinned-renderer workflow regression also failed before its repair;
authorization-category regression failed before its safe diagnostic change.
Eight direct-promotion regressions now pass with zero skips, including real Git
updates in both orders and actual pinned Kustomize candidate validation. The
repository's partial deployment renders and passes static policy (25 resources).
Pinned Windows kubectl v1.35.8 / Kustomize v5.7.1 was checksum verified.

Root tooling suite passed 97 cases with two existing Windows platform skips before
the final authorization diagnostic case. Affected combined regressions passed 142
cases with two Windows skips, except the existing symlink test could not create a
Windows symlink (EPERM); it is unchanged and remains required in Linux CI. No owner
privilege or runtime configuration was altered. The broader final tooling run is
recorded in the PR evidence when complete. Local real-provider check is unavailable
because the existing Podman endpoint is inaccessible; hosted PR/main qualification
remains required. Formatting and lint/build pass, zero build warnings/errors.

Author inspection: component commits use only their allowed patch/record and own
bootstrap suffix, rooted in exact main snapshots. Canonical patch validation rejects
extra mutations; actual render/static policy covers all seven slots. GitHub payloads
remain privately handled; candidate temporary files are cleaned with primary failure
preservation. Permissions are narrowed, main update is non-force with expected OID,
and failed policy/authorization does not fall back to an elevated token or PR.
This record is author evidence, not independent reviewer or human feature acceptance.


## Access recovery and final local qualification

After owner intervention, read-only Podman inspection and a temporary symlink probe
both succeed outside the sandbox. No further owner action is required for those
access issues. A Windows affected-suite retry passed 172 cases with two platform
skips; its remaining Unix mode 0600 assertion is not established on Windows.
A disposable Linux arm64 Node 24.15.0 container, with read-only source and a separate
writable temporary formatter cache, ran the eight affected promotion/deployment/
selection/workflow/manifest/lifecycle modules: **209 passed, zero failed/skipped**.
This includes real Git promotions in both orders, exact public candidate validation,
actual pinned kubectl v1.35.8/Kustomize v5.7.1 rendering, symlink and Unix mode checks.
Initial container-only missing Python/read-only-cache prerequisites were corrected;
no source assertions were weakened. Formatting and lint pass again, zero build
warnings/errors. The earlier broad unconfigured Windows deployment sweep is not
passing qualification; hosted full application and main publication checks remain
required. Current patch changes no application behavior or backend test scheduling.
