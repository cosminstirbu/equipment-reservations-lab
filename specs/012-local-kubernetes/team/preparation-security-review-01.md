# Security preparation review 01

Reviewer: /root/security (security_reviewer)

## Reviewer response (verbatim)

Reviewed `prep-design-012-01`, baseline `4dd685c`.

Requirements: **pass**. Proposed narrow testing/OpenAPI amendments: **pass for scope**; authoritative edits still require review.

Design preparation: **needs_information**.

- **SEC-PREP-001 — medium, blocking dependent deployment work.** `research.md:104–109` leaves host ingress and pod issuer TLS proof pending despite required preimplementation compatibility research. Host-only success can conceal broken workload discovery/JWKS access. Provide temporary-CA host/pod evidence through selected ingress using the canonical hostname, including rejection of wrong CA/name. No TLS bypass or system trust mutation.
- No confirmed vulnerabilities found. Exact remaining image/action locks and Dashboard configuration keys must be resolved before dependent implementation.

Threat model covers browser/untrusted origins, external ingress, frontend-to-API forwarding, issuer/admin separation, runtime/bootstrap credentials, Git/CI publication boundaries, private local state, durable volumes and authenticated telemetry. Planned controls address these boundaries.

Reviewed SHA256:

- Plan: `8463a43d695158ebe38fae13e961863faa4b2d4864f67dfacb652f0015916bbb`
- Research: `4c78b247de6905fe756f9da6c002ccbe6d049b7de4e61771169a74c29e35da55`
- Runtime contract: `eefb55c85a2ee83d65ae098d3f0eed17a50a5658c3a0759724cb772d5c1fd852`

Read-only review; no changed files, probes or runtime verification. Implementation security review remains separate.
