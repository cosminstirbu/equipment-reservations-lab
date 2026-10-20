# CI CoreDNS repair

Scope: deploy/platform/coredns.yaml and existing real ingress provider test. No application or unrelated worker files owned.

Test design: extend the existing disposable Kind integration fixture to apply the complete production platform, rather than Traefik alone. Restart the real cluster CoreDNS deployment after applying its ConfigMap and require rollout readiness before testing trusted ingress. This exercises the actual CoreDNS parser, Kubernetes plugin, readiness and service discovery against the pinned Kubernetes node; no parser double or YAML text assertion. The explicit restart prevents a formerly healthy Pod from hiding an invalid replacement Corefile while ConfigMap reload is pending. Existing live upstream/TLS/config rollout assertions remain intact. A syntax failure must fail the deployment readiness assertion. Existing private kubeconfig/CA, refusal of unknown existing cluster and owned cluster cleanup remain unchanged.

Coordinator reserved exclusive provider capacity for the red/green pair. Full repository checks remain coordinator-owned. This worker did not commit/push or change trust/DNS/VM settings; branch publication remains coordinator-owned under the owner's existing authorization.

## Regression and repair

RED command: `PATH=/opt/homebrew/bin:/opt/podman/bin:$PATH CONTAINER_RUNTIME=podman KIND_EXPERIMENTAL_PROVIDER=podman node --test scripts/deployment-ingress.test.mjs` before changing the Corefile. Exit1, 0/1 passed, 129440ms; the new `deployment/coredns` rollout readiness assertion timed out at its90s budget. Logs from both replacement Pods reported `plugin/health: /etc/coredns/Corefile:3 - Error during parsing: Wrong argument count or unexpected line ending after '}'`. One old healthy Pod remained, demonstrating why checking only existing readiness would miss this regression. The exact pinned Kind node ships CoreDNS1.13.1 on Linux/arm64 (observed provider logs); the coordinator independently reproduced the same parser failure with1.12.1. This is an actual provider/configuration failure, not a fixture prerequisite failure.

Only production change: expand `health { lameduck 5s }` into a multiline Caddyfile block. Preserve the5s lameduck behavior and all other DNS configuration.

The RED run deleted its owned equipment-compat-012 cluster successfully. GREEN used a fresh owned cluster and the same command: exit0, 2/2 passed, total101083ms (outer100975ms, nested41673ms). Both replacement CoreDNS Pods became Ready; existing trusted HTTPS, denied operational paths, forwarded routing, live ConfigMap rollout and retained fixture PVC assertions passed. Its owned cluster and private files were cleaned before command completion; provider slot handed back immediately. Focused ESLint (zero warnings), exact-file format-check and git diff --check all exit0. Full repository checks remain coordinator-owned; this worker has not claimed them passing.


## Revision and environment limits

SHA256 deploy/platform/coredns.yaml: `1d4f90e2b13ccb401f4e893c7692844af8c8b52ff1ee4bf303306ec7f31d25be`.
SHA256 scripts/deployment-ingress.test.mjs: `37379978591f941f3b50f126a5a47b0bb0ae061ed0c43b3d48da9330ec01d353`.

Both focused local provider commands resolved Homebrew kubectl v1.37.1, newer than the pinned Kubernetes1.35.8 server's supported client skew. This limitation does not change the observed parser error or readiness outcomes, but these runs do not establish supported-client acceptance. Coordinator will run the whole deployment suite using `PATH=/private/tmp/equipment-k8s-tools:/opt/homebrew/bin:/opt/podman/bin:$PATH` with pinned kubectl1.35.8; that final check subsequently passed all 77 tests in 12 files, including this complete-platform fixture. No additional rerun performed, per coordinator's explicit scheduling decision. No missing tools, publication, unrelated resource cleanup or host configuration changes. Independent review remains pending.
