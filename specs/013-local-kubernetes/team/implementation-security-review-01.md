# Independent implementation security review 01

Reviewer: /root/security (security_reviewer)

## Reviewer response (verbatim)

Security verdict: **changes_requested** for `implementation-012-01`.

Reviewed baseline `4dd685c4e34288f94e932dcd49beb22eea965075`, snapshot digest `a66f1edbb52a98e060bf5ffccb191b1abdc14d52b331a3df9329633985cfaaa3`. Independently recomputed all 106 listed file hashes: no mismatches. Review was read-only; no files changed or runtime probes performed.

**SEC-IMPL-001 — medium, blocking — Ingress does not activate TLS and admits cleartext routing**

- **Category/owner:** security; deployment/platform coder.
- **Evidence:** `deploy/platform/traefik.yaml:96–108` defines HTTP entrypoints without enabling TLS on `websecure` or redirecting/denying `web`. `deploy/environments/local/ingress.yaml:9–17` selects certificates through `spec.tls` but has no TLS-router or entrypoint annotations. `deploy/platform/kind.yaml` publishes HTTP port 80. The frontend proxy also asserts `X-Forwarded-Proto https` regardless of ingress transport.
- **Scenario/preconditions:** With these manifests deployed, application and identity routes are configured as HTTP routers. A client following an HTTP application URL can receive executable application content or send authenticated requests without the promised TLS protection. Intended HTTPS application routing is also missing.
- **Source confirmation:** Traefik explicitly documents that `spec.tls` selects certificates but does not enable TLS for the underlying router. [Official routing documentation](https://doc.traefik.io/traefik/reference/routing-configuration/kubernetes/ingress/#certificates-management).
- **Required remediation:** Explicitly enable TLS and constrain application/identity routers to `websecure`. Deny HTTP or redirect it to the canonical HTTPS endpoint without serving application/login/API content over HTTP.
- **Verification:** Add a failing regression using the selected real controller and production manifests. Verify trusted HTTPS routing, wrong-CA/name rejection, and HTTP denial or canonical redirect for both application and identity hosts. Preserve administrative-path denial.

**SEC-IMPL-002 — medium, blocking — Promotion can overwrite concurrent main-branch changes**

- **Category/owner:** security/design correctness; CI/promotion coder.
- **Evidence:** `scripts/promote-images.mjs:123–134` builds full replacement files from supplied checkout contents, then parents the commit to `state.head ?? state.base`. `readState():168–171` obtains the current remote main SHA independently. CLI lines 271–276 supply local checkout overlay/Job inputs. Only the promotion branch head receives compare-and-swap protection.
- **Scenario/preconditions:** No promotion branch exists; a maintainer merges a configuration or security change after the workflow checkout. The promoter reads the newer remote main SHA, then creates its child using stale checkout versions of the entire overlay/wrapper files. The resulting PR silently reverses concurrent human edits beyond the permitted digest/suffix fields.
- **Required remediation:** Bind every source input to the exact verified parent revision. Either read and transform parent-version blobs or fail when the checkout/input revision differs from the intended parent. Preserve existing promotion-branch protection and reject human changes rather than reconstructing their files from stale inputs.
- **Verification:** Add deterministic tests where main advances after checkout and where an existing promotion parent has unrelated edits. Assert that nonallowlisted fields remain unchanged or promotion aborts before ref mutation. Retain existing changed-head, human-edit and CAS tests.

Other reviewed controls include canonical issuer/callback/origin validation, default production documentation denial, retained API authorization, private create-once credentials, scoped bootstrap/runtime authority, atomic broker definitions, image build exclusions/nonroot users, Argo ownership/deletion safeguards, authenticated diagnostic endpoints and fork-safe CI permissions. No additional confirmed vulnerabilities were identified.

**Remaining evidence is pending, not approved:** integrated Kubernetes authentication/routing and issuer trust, actual GHCR/GitOps release, hosted CI execution, VM-restart durability, full metric/detail inspection and explicit human acceptance. Recorded Aspire/browser and Dashboard sampling evidence establishes only its exercised environment. Coordinator’s running lint/full/deployment checks were not available for this verdict. Fixes require revision-matched re-review.
