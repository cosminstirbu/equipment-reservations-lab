# Native prerequisite follow-up: proposal only

No executable source change is authorized or made. Implementation budget12/12 is
exhausted. This proposal precedes any request for a further process-budget decision.
Actual causal repair, original full-gate success and independent review remain pending.

## Actual narrowed result

Coordinator's latest verified-profile four-file concurrent command produced
3 PASS,1 FAIL,0 skipped in357.826s:

- ACME PASS231.499s; admission PASS356.965s; Loki HTTPS PASS31.948s.
- Bundle FAIL179.776s: phase prerequisites-install, tool kubectl, category exit,
  status1, individual operation duration1747ms. No cleanup failure reported.

This now locates a real kubectl unsuccessful exit after kind returned successfully,
before TLS generation, account seeding, bundle capture/restore or private Key Vault
interaction. It is not the original180s kind subprocess timeout, and it is not a
1747ms subprocess timeout. It does not prove schema invalidity, authentication failure,
API readiness failure, overload, network failure or OOM. Root owns exact cleanup checks.
Earlier pressure/engine-stall evidence remains relevant but is not a causal verdict.

## Exact current prerequisite pipeline

One shared prerequisites-install label covers nine sequential kubectl invocations:

1. apply Namespace equipment;
2. apply Namespace equipment-recovery;
3. apply Namespace cert-manager;
4. apply Namespace argocd;
5. apply only clusterissuers.cert-manager.io CRD selected from the pinned vendor YAML;
6. wait Established on that exact CRD, existing60s bound;
7. apply reviewed roles.json List (10 Role/ClusterRole objects);
8. apply generated recovery bindings List (4 RoleBindings);
9. apply generated installer continuity bindings List (6 RoleBinding/ClusterRoleBinding objects).

The source uses exact private kubeconfig AND unique context. Kind uses the pinned node
image and its existing readiness/bootstrap bounds. Offline source inspection generated
the current immutable projection without running providers: all namespaced role/binding
objects target exactly the four namespaces created above; no omitted namespace was found.
The role and binding kinds are core RBAC, requiring no Argo CRD. Successful native
admission uses the same reviewed role inventory and pinned ClusterIssuer CRD, reducing
(but not eliminating) the likelihood of a shared static manifest defect. No speculative
--validate=false, broader RBAC, namespace recreation, schema suppression or retry is proposed.

## Updated ranked falsifiable hypotheses

1. Transient API discovery/connection/readiness failure during overlapping bootstrap.
   Predicts a specific failed invocation plus connection-refused/reset/EOF, discovery
   unavailable, server timeout or503 category. Earlier stall evidence supports testing it.
2. A deterministic apply/CRD validation or metadata error. Predicts the same invocation
   and invalid/unknown-kind/entity-too-large category independent of concurrent pressure.
3. CRD establishment/read-after-install race. Predicts the CRD apply/wait invocation,
   not-found/no-match/condition-not-met or transient API category, not later bundle logic.
4. Private kubeconfig/authentication/context failure. Predicts unauthorized/forbidden,
   x509 verification or context-not-found category, distinguished from readiness.

1747ms duration fits fast rejection/transport failure as well as several static failures;
it alone cannot rank those decisively. All nine invocations remain possible today.

## Concrete next diagnostic delta, not a causal workaround

Assign nine fixed source-owned invocation labels matching the list above (for example
prereq-namespace-equipment, prereq-clusterissuer-crd-apply, prereq-clusterissuer-established,
prereq-role-definitions, prereq-recovery-bindings, prereq-continuity-bindings). Preserve
List grouping, order, assertions, timeouts, provider profile and parallelism. Do not
introduce per-object retries or split/reorder requests while diagnosing.

runPrivateProcess currently counts stderr bytes but discards them by default. Setting
captureStderr=true alone is NOT sufficient: on nonzero exit finish() rejects a safe
ProcessFailure without delivering either captured stream. On success that option only
changes the return shape. It must not be used as a claim that failure details are retained.

Recommended assessed extraction for review: a narrowly named opt-in
nativeKubectlPrerequisiteDiagnostics enum/mode at the existing runPrivateProcess private
failure boundary, enabled only for these nine fixture invocations. Classify the already
bounded in-memory stderr before discard; never return/persist raw stderr, URLs, argv,
stdin, environment, provider messages or response bodies. No raw-log artifacts or wrapper
redirection. Shared helper owner must explicitly own any such change; no generic arbitrary
raw-output callback is proposed. Native fixture projection must preserve only the new
assessed enum, otherwise it would discard it again like the repaired metadata bug.

Initial whitelist proposal: connection-refused, connection-reset-or-eof, request-timeout,
api-unavailable, discovery-unavailable, unauthorized, forbidden, certificate-verification,
resource-not-found, resource-invalid, unknown-kind, metadata-too-large, condition-not-met,
unclassified. Each pattern must be tested against pinned kubectl/provider wording before
inclusion; this list is a proposal, not established provider fidelity. Prefer structured
Kubernetes reason/status if actually available; do not parse arbitrary substrings as an
HTTP status. Unknown/ambiguous wording stays unclassified. A category is diagnostic only;
it never authorizes retries, privilege expansion, weaker TLS or a success verdict.

The safe event must retain fixed invocation label, tool, validated category, status/signal
and duration plus at most the allowlisted providerCategory. Existing raw ProcessFailure
tails/causes remain excluded. A future category field must survive primary/cleanup
normalization; both failure paths require explicit privacy regression.

## Proposed ownership and verification before another native run

- GitOps owner: exact bundle prerequisite labels; small native diagnostic helper/test
  projection changes; this proposal/evidence. No other fixture or scheduling changes.
- Primary owner, only after explicit release/review: narrowly opt-in private process
  failure classifier and its existing public process-boundary tests. No blanket helper
  behavior change for Terraform/Azure or other callers.
- Coordinator/reviewers: approve precise enum/pattern contracts and ownership; preserve
  current original findings/history. No owner silently approves their own change.

Test first with actual child processes exiting nonzero and printing assessed synthetic
kubectl diagnostics surrounded by private sentinels. Assert exact fixed stage/category,
exit/status/duration, unknown/ambiguous fallback, no raw text in error/report/serialization,
primary plus secondary cleanup preservation, bounded output/cancellation behavior and no
changed successful return shape. Synthetic wording tests prove classification mechanics;
they do not substitute for pinned provider failure fidelity. Then one actual pinned kubectl
request against a deliberately unavailable exact local endpoint can qualify a transport
category without a new cluster, if separately authorized. Avoid repeated costly suites
before these fast contracts pass.

After source freeze/review, coordinator runs the same actual four-file concurrent command
once to identify the precise failed request/category. Only then select a causal repair:
transient readiness might justify a bounded supported readiness condition within an
explicit approved overall budget; static/auth/TLS defects require fixing their actual
source. No timeout inflation, blanket serialization, skipped profile or optimistic retry.
The original complete CI command remains mandatory after any selected repair.

Separate telemetry HTTPS body-read/deadline risk remains pending from repair11; this
prerequisite proposal neither fixes it nor asserts it caused the current failure.
No cluster/provider run, user kubeconfig change, Azure action or source edit occurred
while preparing this document. The only written artifact is this proposal.

## Additional offline CRD sanity (no provider run)

The exact selected clusterissuers.cert-manager.io object is cluster-scoped, has no
metadata.namespace, serves/stores v1 only, and has no conversion webhook strategy
(default None). Compact serialized object size is146637bytes. This makes an obvious
missing-namespace or enormous selected-CRD input less likely; it is not an actual
kubectl apply/annotation-size or API compatibility verdict. No source was rewritten
or controller/CRD installed for this inspection. Coordinator separately records
exact run/unchanged frozen hashes/cleanup in native-reproduction-repair12.md.
