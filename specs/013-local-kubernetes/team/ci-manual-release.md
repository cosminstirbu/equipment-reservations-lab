# Manual image release

Owner requested a workflow_dispatch trigger after a test-only merge correctly skipped
publication. Manual dispatch is an explicit request to publish the selected main
revision, so it sets classify.publish=true before accessing the push-only before SHA.
Push events retain normal application/build change classification. The classify job
admits only refs/heads/main, keeping publication and promotion on the main trust boundary.
All committed deployment validation, quality checks, release tests and publication
permissions remain unchanged.

Applicable standards: constitution test-first/public-contract rules and engineering
formatting/static-analysis and testing guides. Test design extends existing workflow
contracts, parses actual YAML and executes the actual changes-step Bash in an isolated
temporary directory, with manual event and empty BEFORE. Its observable result is
publish=true without any repository diff. No doubles or live publication are used;
existing real classification cases retain no-change and promotion-loop coverage.

RED: focused manual-release test exited1 because workflow_dispatch was absent.
GREEN: all37 deployment validation/promotion/CI contracts passed, zero skipped.
Repository format-check passed. Lint passed with zero build warnings/errors and style verification.
No application code changed; full provider suite was not rerun for this configuration
change. The publishing job itself retains the full quality gate before image writes.

Once merged to main, invoke with gh workflow run release.yaml --ref main or Actions
→ Release application images → Run workflow → main. Dispatching another branch
skips classification and therefore publication. The workflow must first exist on the
default branch for GitHub manual dispatch discovery.
