# Preparation security review

**Feature:** `specs/007-aspire-independent-tests`  
**Code baseline:** `e1952952e82aa1a32e79285923db68f26f995aed`  
**Verdict:** `pass`  
**Findings:** none  
**Scope:** requirements and design preparation only; implementation security review remains pending.

## Reviewed artifact SHA-256 hashes

| Artifact | SHA-256 |
| --- | --- |
| spec.md | `347b6f2eef317513929b7fc70dc16a7c6a14e20d08c1f8bc466754d6400da807` |
| plan.md | `60ab5f02699ac3c074b886ba6def251c86f04c182be77a74caf35583da82e2e0` |
| research.md | `0f8da197765baf8090057b95d9870fe6910ac9e2db940e97618214fb34c35e4f` |
| data-model.md | `e7a7df7f64c68bfd27e0f557daafa4b06b8f51b3c3a7ec9bfc0510ab4bd7bec3` |
| quickstart.md | `ea41d1a7ef44218bad125f0088dfee99ad4799c29e261bd2d732b8b27875cca1` |

## Assessment

The design preserves the relevant security assets and trust boundaries: user ownership, scoped service/provider credentials, durable messages and business effects, and private diagnostic material. Browser/service-to-Keycloak, application-to-PostgreSQL, publisher/consumer-to-RabbitMQ, and telemetry-export boundaries remain represented by real-provider and public-entry-point tests.

FR-004 and FR-005a, the plan’s Architecture and Trust Boundaries section, and the mixed-guarantee matrix adequately address the concrete migration risks:

- Replacing production grants or provisioning with permissive fixture substitutes.
- Losing broker reverse-operation, unrelated/default-exchange, other-vhost and management denials.
- Losing database cross-service isolation and privilege restrictions.
- Granting service identities human authority or weakening provider callback/token rejection.
- Losing private-value exclusions in successful and failed provider workflows.
- Mistaking new empty storage for successful recovery or dropping cross-user ownership checks.
- Treating timeout as proof of rejected broker import.
- Losing file protection or failure-log secrecy when deleting tests that also inspect AppHost state.

The design explicitly requires production provisioning APIs, exact provider denial outcomes, protected files, safe failed-import diagnostics, stable durable state, and snapshot-matched replacement evidence. Cleanup is ordered and bounded, including partial startup failure and explicit resource disposal when Ryuk is disabled.

Removing automated Aspire model, startup, endpoint/listener, console and publishing checks matches the owner-approved scope. No security exception or additional acceptance of residual risk is inferred. Local manual checks preserve the documented observation boundary without inventing automated orchestration requirements.

The requirements and plan remain compatible with constitutional public-interface, real-database, diagnostic-privacy, repeat-safety and independent-review requirements. No runtime or authority changes are authorized.

## Required implementation-review evidence

1. Final method/theory-case and mixed-guarantee disposition mapping, including exact executable replacements.
2. Actual scoped provider denials, identity separation, private diagnostic exclusions and rejected-import observations.
3. Recovery assertions using preserved stores, stable event data and other-user empty results.
4. Confirmation that production provisioning remains authoritative and privileged setup credentials remain fixture-owned.
5. Current-source validation and audit showing no automated Aspire testing dependency or invocation; unchanged concurrency policy and production runtime sources.

**Checks performed:** read-only artifact and baseline test/provisioning inspection; artifact hashes calculated. No runtime probes, file modifications or test executions.

**Unresolved questions:** none at this preparation stage.
