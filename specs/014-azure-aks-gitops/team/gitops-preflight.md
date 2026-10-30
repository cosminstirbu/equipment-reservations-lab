# GitOps implementation preflight

Feature: specs/014-azure-aks-gitops. Baseline: d1c7238345136340ddbf3a9454807cefffc43c32.
Scope: T014-T020, T035, manifest portions T037-T039. Source edits remain held
until coordinator releases T007 shared configuration contract. No Azure writes,
paid resources, external messages or installation performed.

## Standards and intended verification

Read repository instructions, constitution 1.1.1, protocol, speckit-implement,
engineering index, formatting, testing, tooling, observability and resilience.
Test design will render actual Kustomize through the selected kubectl binary,
parse Kubernetes objects and assert externally enforced deployment contracts.
Retain base manifests and real rendering; no double replaces rendering. Schema
qualification uses official selected-version schemas. Provider-container tests
must exercise chosen vendor configs/auth/query endpoints; static structure alone
cannot establish supported configuration or runtime security.

Required RED precedes manifests. Tests will verify four hosts/TLS/path restrictions,
per-workload secret access, distinct probes/resources/security, Azure Retain storage,
unchanged local rendering, operator role/source restrictions and bounded authenticated
three-signal telemetry. Live Azure/browser/login/network/retention/rotation tests
remain acceptance gates and cannot be replaced by source assertions.

## Reuse and cross-owner contract

Base provides non-root security/probes, immutable infrastructure images, workload
resource budgets and protected PVCs. Azure must remove local trust and local PV
bindings without altering base/local overlays. Jobs reuse deploy/base/jobs/database
and identity. RabbitMQ definitions remain its init container, preserving ordering.

Need generated non-secret runtime projection: tenant, workload vault URI/name,
per-workload managed identity client IDs, DNS zone resource-group, ingress public
IP/resource group, Entra client IDs/issuer/operator role, source CIDRs and promoted
ACR digest map. Missing values fail closed. Source manifests must not contain
permissive fallback identifiers or duplicate a committed generated inventory.

Shared secret inventory derived from base (key names retained in separately scoped
synced Secrets): postgresAdmin; inventoryDb; reservationsDb; notificationsDb;
keycloakDb; identityAdmin; alice; bob; manager; staff; reservationsClient;
rabbitAdmin; rabbitPublisher; rabbitConsumer; brokerAdminSalt;
brokerPublisherSalt; brokerConsumerSalt; dashboardApi; dashboardOtlp.
Dashboard browser token is replaced by Entra confidential OIDC. Collector adds
per-client bearer credentials and TLS trust; exact canonical names require T007
owner agreement. Argo OIDC private value must also use shared inventory.

## Official provider references checked

- https://aspire.dev/dashboard/configuration/ documents OpenIdConnect AuthMode,
  Authentication:Schemes:OpenIdConnect settings and RequiredClaimType/Value.
- https://cert-manager.io/docs/configuration/acme/dns01/azuredns/ documents
  Azure DNS Workload Identity and webhook pod/ServiceAccount labels.
- https://argo-cd.readthedocs.io/en/latest/operator-manual/user-management/
  documents OIDC claims/scopes and auth callback; pinned-version qualification pending.
- Existing immutable Argo upstream source and checksum remain in
  deploy/argocd/source.json; bootstrap owner should reuse verified installer.

Current evidence is reading/preparation only. No source implementation, rendered
schema check, security pass or runtime acceptance is claimed.
