Security final preparation review — `specs/004-remove-hello`

**Verdict: pass.** No blocking security findings, confirmed vulnerabilities, unresolved security questions, or policy exceptions.

**Scope:** specification, plan, research, data model, retirement contract, quickstart, and final tasks against unchanged source baseline `5cfd6233e9d466e9a525f2fe18a30d1aa90015f7`, constitution 1.1.0, protocol, and applicable engineering guides.

The artifacts consistently preserve booking security and durability boundaries while retiring hello:

- Browser-write admission, local-only exposure, bounded input handling, equipment validation, and safe errors remain intact.
- Reservation wire contracts, validated message envelopes/trace headers, durable topology, confirms, manual acknowledgements, retries, and inbox/outbox repeat safety remain unchanged.
- Production instrumentation, database/HTTP/log privacy, bounded metrics, and useful health/failure signals retain concrete validation paths.
- Local data, credentials, secret-store identity, and obsolete broker resources remain untouched. Legacy-resource checks use isolated fixtures.
- Clarified SC-005 permits negative-test and isolated-fixture references without allowing production compatibility behavior or live hello instructions.

Tasks adequately operationalize these controls. T005–T006 require baseline failing removal tests; T010–T015 preserve security, message validation, durability, privacy, and telemetry coverage; T019 audits preservation; T020–T022 require current-snapshot checks/browser/runtime evidence; T023 requires independent reviews and convergence; T024 records actual human acceptance before metadata completion.

**Evidence:** read-only artifact and baseline-source inspection. No files changed, tests run, intrusive probes, external messages, or deployments.

**Implementation review conditions:** freeze the candidate snapshot and supply revision-matched results, concern-to-test mapping, historical/state preservation evidence, browser security coverage, and representative privacy-safe success/failure/recovery traces. This preparation pass does not approve unimplemented code or completed-feature acceptance.
