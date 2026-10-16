# Requirements Quality Checklist: Aspire-independent application tests

**Purpose**: Independent reviewer assessment of migration scope, preservation, and acceptance requirements.
**Created**: 2026-10-16
**Feature**: [spec.md](../spec.md)
**Depth / audience**: Standard, independent preparation reviewer.

**Review Ownership**: Items were proposed by verifier_reviewer and materialized by the coordinator using speckit-checklist. Only explicit reviewer evaluations authorize checked markers.
**Marker Semantics**: `[x]` means requirements quality is satisfied; it is not implementation evidence.

## Scope and traceability

- [x] CHK001 Is automated Aspire/AppHost exclusion explicit for model/startup/admin-console/publish checks while retaining local runtime behavior? [Clarity, Spec FR-001, FR-008, FR-010]
- [x] CHK002 Are distinct application/provider guarantees enumerated independently of their old harness? [Completeness, Spec FR-003–FR-005a]
- [x] CHK003 Does required migration traceability cover every old Fact/Theory and parameterized fault class, splitting mixed tests into retained assertions and approved wiring-only removals? [Traceability, Spec FR-002, SC-001]
- [x] CHK004 Are fresh-host/database/container durability and replay guarantees specified with observable retained identities/data/envelopes? [Coverage, Spec FR-005, FR-005a]

## Provider and security coverage

- [x] CHK005 Are RabbitMQ least privilege, routing, confirms, poison handling, durable messages, credential characters, protected files/import failures scoped explicitly? [Coverage, Spec FR-003, FR-004, FR-005a]
- [x] CHK006 Are real Keycloak human/service grants, authority, id-token rejection, subject/password continuity and diagnostic privacy explicitly retained? [Coverage, Spec FR-002, FR-004, FR-005a]
- [x] CHK007 Are canonical gate outcomes/prerequisites defined, including no skip on absent runtime and failure propagation? [Measurability, Spec FR-007, SC-003]

## Consistency and acceptance

- [x] CHK008 Are Smoke project/dependency removal and Backend fixture boundaries defined without parallelization redesign? [Consistency, Spec FR-006, FR-011]
- [x] CHK009 Are agreement amendments prospective and historical review/acceptance evidence preserved? [Consistency, Spec FR-009, SC-005]
- [x] CHK010 Are no production runtime changes and accepted process/network-listener coverage limits explicit? [Scope, Spec FR-005, FR-010]
- [x] CHK011 Is manual Aspire verification scope defined without introducing an automated Aspire acceptance gate? [Clarity, Spec FR-008, Story 3]
- [x] CHK012 Are bounded cleanup, secret-safe diagnostics, deterministic isolation and failure evidence requirements specified? [Non-functional, Spec FR-004, FR-005, FR-007, Edge Cases]

## Notes

- Verifier reviewer explicitly approved CHK001–CHK011 against spec on 2026-10-16; CHK012 and preparation verdict explicitly approved after plan review at snapshot80c04f3afd6a9a06e80c1105b940676d18a8fddb59dddef76e4de9115ed4201a.
- speckit-implement reads these markers and does not modify them.
- Built-in requirements.md remains owned by specify/clarify.
