# Live release provenance reader authority proposal

Status: proposed targeted access clarification, independent quality/security review
required before any role/workflow permission change. No grant or credential added by
this document. Preserve exact release-data validation and full code/authority closure.

Select direct actual registry/provenance reads, avoiding a new publisher-trust service.
Environment root assigns AcrPull role7f951dda-4ed3-4680-a7ca-43fe172d538d to exact existing
backup and restore workflow principals at ONLY the actual current environment ACR
resource ID. Kubelet AcrPull is not their authority. AcrPull permits pull/get across
that registry (not repository-only); application code requests only exact seven reviewed
repository/digest pairs. Do not claim Azure RBAC enforces per-repository scope in this
non-ABAC model. No push/delete/import/admin-user/listCredentials/task/config/role-write
rights, no subscription/RG grant. Preserve current registry authorization mode; if ABAC
mode is adopted later, reject unsupported AcrPull assumptions and redesign explicitly.

Protected backup/restore jobs declare only needed repository GITHUB_TOKEN reads:
contents:read, actions:read, packages:read, plus already-approved id-token:write for
Azure OIDC. No package write/admin/delete, PAT, new client secret or cross-repository
credential. Token is short-lived and private, sent only to fixed trusted GitHub/GHCR
origins over verified TLS; sanitized isolated registry-auth environment and temporary
credential directory cleaned in finally. No token args/logs/persistent Docker login.
The producer workflow/run/repository/main SHA/attempt are independently verified with
actual GitHub API responses; foreign repository/run/ref and insufficient access fail.

Static validation of all28 literal data files may occur before authorized config load.
Actual ACR/GHCR OCI index/config digest+source/revision-label and GitHub run provenance
checks happen afterward, with registry ID/loginServer from verified environment output.
Record claims or kubelet success never substitute. Actual same artifact digest in both
registries remains required. Public GHCR may use anonymous pull; private packages must
have actual linked repository Actions read access. packages:read alone is not proof of
that linkage: verify actual token GET before readiness. If package permissions do not
permit the repository, block and report exact package access prerequisite rather than
requesting a broad PAT or changing visibility silently.

Native tests cover exact-role/principal/scope and permission blocks, private error and
auth cleanup, foreign host/registry/run/digest, denied package access, same-digest positive,
static-before-config and live-after-config ordering. Actual hosted identities must GET
the expected manifests/configs and fail push/delete/admin operations before recovery
acceptance. Azure registry transaction/network usage is covered by existing usage reserve;
no extra paid managed service is introduced. No actual access or pricing quote inferred.

Primary sources: [AcrPull exact action](https://learn.microsoft.com/en-us/azure/role-based-access-control/built-in-roles/containers#acrpull),
[GitHub package access/Actions linkage](https://docs.github.com/en/packages/learn-github-packages/about-permissions-for-github-packages),
[workflow permission controls](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#permissions).
Official package docs distinguish anonymous public GHCR access and private granular
package Actions access. Source research establishes possible permissions, not actual
current package visibility or successful workflow access.
