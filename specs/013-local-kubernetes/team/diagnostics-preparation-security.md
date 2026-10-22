# Diagnostics preparation security review

**Verdict: pass for preparation.** No blocking design findings. Implementation, runtime privacy verification and human acceptance remain pending.

**Scope:** feature `specs/013-local-kubernetes`, HEAD `623bfaf8b6439d9d9bad94bdaf5d492432d557c1` plus the frozen diagnostics artifact amendments. Reviewed FR-019–FR-021, AC-4.4–AC-4.6, T042–T050, plan amendment, diagnostics requirements/design, tooling guide/index and existing provider boundaries.

## Trust boundaries and decisions

Protected assets include credential bundles, authenticated HTTP payloads/tokens, TLS keys, Secret manifests, provider logs and private process inputs. Operators and CI consume console/error output; external executables, HTTP providers and child-process failures can supply arbitrary text. The principal attack path is disclosure through inherited streams, exception serialization, diagnostic artifacts or cleanup failures.

The design addresses these boundaries appropriately:

- Output classification belongs to each operation; tool names alone do not establish safety.
- Sensitive and unclassified operations default to private capture. Public errors contain validated metadata and allowlisted projections, without raw errors, causes, arguments, environment or input.
- Audited public operations stream both streams. Machine responses remain captured; public failure tails have independent 4000-character bounds and truncation markers.
- Private HTTP responses and forwarding failures retain safe phase/status/lifecycle information.
- Cleanup preserves primary evidence, attempts remaining owned resources and separately reports safe cleanup failures.
- Raw diagnostic artifacts and privacy-bypassing debug modes are prohibited.

Evidence: `docs/engineering/tooling.md`; `team/diagnostics-design.md`, “Decisions and boundaries,” inventory and verification sections; `tasks.md:T043–T049`.

## Implementation verification required

These are verification obligations, not confirmed vulnerabilities or preparation blockers:

- **SEC-DIAG-001 — Classification fidelity:** inspect every actual call site, including failure output. Docker image publication may stream only after validating build inputs and supported authentication flow. Existing Dockerfile-specific ignore files exclude local state and common secret files; do not treat this as proof that arbitrary provider output is safe.
- **SEC-DIAG-002 — Private failure containment:** exercise real subprocess and outer CLI boundaries with distinct private markers in arguments, environment, stdin, stdout, stderr and error paths. Verify console, serialized/thrown errors and retained diagnostics remain free of markers while safe metadata survives.
- **SEC-DIAG-003 — Cleanup and forwarding:** verify spawn/exit/timeout/shutdown paths and combined primary/cleanup failures without raw child errors. Preserve bounded startup/shutdown and ownership checks.
- **SEC-DIAG-004 — Existing projections:** retain bounded Job condition/reason/exit-code projections in `deployment-ci.mjs:510–587`; do not replace them with raw logs.

T043–T049 explicitly require these checks. POSIX signal behavior and changed live-provider contracts require compatible-host evidence; unavailable checks remain pending.

## Reviewed artifact fingerprints

SHA-256:

| Artifact | Hash |
| --- | --- |
| `spec.md` | `9d225abf5629af47ef6b03c7e3136aa00787df2e047e559c6ba3d8e57cab8040` |
| `plan.md` | `56ae05e187bffb7a2430591d69adf891272f9bbaf7bb52c79c65bdc8ad94ad5f` |
| `tasks.md` | `e7be66ef8de6efc4f45215604b8a705c43dde67efa1a6ec218dda8ed96da3c25` |
| `docs/engineering/tooling.md` | `9fa4cced733fe756bdb08724431c68e16057cecf0788250d41a9c0bacb810e70` |
| `docs/engineering/README.md` | `b090c2d85930e26fba46671b1e235568c496d6b8a72245e8d57011d54c22c6b1` |
| `team/diagnostics-design.md` | `bdd8bad705583b1f50fc9043b1f1f4333da034412290872bfa74fc54ef6cdb86` |
| `team/diagnostics-requirements.md` | `cb72c3251fea3c46aa10b08330fdab628e06bef48d8fddf2355be74e7e615647` |

Read-only inspection and fingerprint checks only; no files changed, intrusive probes or implementation tests run. No risk acceptance, feature acceptance or external action is granted by this verdict.
