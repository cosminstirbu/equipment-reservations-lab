# Azure operations requirements checklist

**Purpose**: Independent preparation review of infrastructure, delivery, security and recovery requirements.
**Created**: 2026-10-26
**Feature**: [Specification](../spec.md), [approved decisions](../decisions.md)

Generated through speckit-checklist from the verifier's proposed questions. Review ownership belongs to the verifier. A checked item approves requirements quality only, never implementation or runtime evidence.

## Scope and ownership

- [x] CHK001 Are workload, bootstrap, recovery, DNS, and certificate ownership/teardown boundaries explicitly enumerated? [Completeness, Gap]
- [x] CHK002 Are the EUR 100/month target, 40 running hours, stopped-resource charges, and response to an exceeded estimate defined? [Clarity, Decisions Q2]
- [x] CHK003 Are Terraform/Argo CD/Kustomize/optional Helm ownership boundaries consistent and free of dual management? [Consistency, Decisions Q8/Q17]
- [x] CHK004 Are public application/identity and restricted operator hostnames, authentication, IP rules, and internal-only endpoints exhaustively specified? [Completeness, Decisions Q7/Q9/Q32]
- [x] CHK005 Are operator identity assignments, initial enrollment, lockout recovery, and emergency access requirements defined independently of Keycloak? [Coverage, Decisions Q10, Gap]

## Delivery and recovery

- [x] CHK006 Are GitHub runner access requirements compatible with restricted AKS API and operator endpoints? [Consistency, Decisions Q9/Q13, Gap]
- [x] CHK007 Are PR trust boundaries, approval authority, reviewed revision/plan binding, stale-plan handling, and state-operation serialization defined? [Coverage, Decisions Q13]
- [x] CHK008 Are local bootstrap, state migration, federated identity creation, and pipeline handoff prerequisites explicit? [Dependencies, Decisions Q14]
- [x] CHK009 Are destroy authorization, exact scope confirmation, partial-failure behavior, and protected resources specified? [Coverage, Decisions Q15]
- [x] CHK010 Are clean recreation and explicit recovery acceptance separately measurable, without conflating a successful apply with application readiness? [Acceptance quality, Decisions Q16]
- [x] CHK011 Are recovery data, identity, credentials, encryption-key and certificate-account retention requirements mutually consistent? [Consistency, Decisions Q16/Q31, Gap]
- [x] CHK012 Are messaging-drain completion, backup consistency, failed-backup handling, and restore ordering defined? [Recovery coverage, Decisions Q16/Q27]
- [x] CHK013 Are seven successful recovery points and the recovery-point/time objectives defined for stopped and intermittently running periods? [Clarity, Decisions Q5/Q27]

## Operations and evidence

- [x] CHK014 Are stop/start postconditions, certificate renewal after extended stops, and retained state requirements explicit? [Edge coverage, Decisions Q6/Q18/Q31]
- [x] CHK015 Are the 23:00 Europe/Bucharest safety stop, DST semantics, time-limited override and missed-run behavior defined? [Clarity, Decisions Q26]
- [x] CHK016 Are bounded three-day telemetry retention, privacy, Dashboard UI versus ingestion access, and full-teardown loss expectations explicit? [Nonfunctional completeness, Decisions Q11/Q25]
- [x] CHK017 Are deterministic tool/provider/module/policy pins, local-CI command parity, failure thresholds, and exception authority specified? [Completeness, Decisions Q19/Q20]
- [x] CHK018 Are immutable image promotion, review/merge requirements, drift correction, and destructive GitOps changes consistent with data protection? [Consistency, Decisions Q23/Q24]
- [x] CHK019 Are production-style learning goals distinguished from excluded HA guarantees, with node/replica/resource sizing decisions assigned to planning? [Scope clarity, Decisions Q1]
- [x] CHK020 Are required local, real-Azure, hosted-workflow, recovery, security, and human acceptance evidence categories identified with unavailable checks remaining pending? [Traceability, Constitution quality gates]

## Notes

Reviewer evaluated requirements on 2026-10-26; all 20 items satisfy preparation-quality criteria after reviewer repair verification. See ../team/requirements-quality.md. Missing design detail may be resolved in the plan without inventing a human decision. The implementer must not change reviewer markers. The built-in requirements checklist has its own specify/clarify lifecycle.
