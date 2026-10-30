# Broker diagnostic repair round7 — author evidence

Date: 2026-10-26. Feature: specs/014-azure-aks-gitops. Finding: Q-BROKER014-002. Worktree: original Azure checkout. Discovery sibling remains frozen and untouched. This record does not approve an independent verdict, Azure deployment/spend or feature acceptance.

## Current-source inspection and provenance

The assigned broker and transport tests already contain changes newer than team/broker-quality-round6.md. Current broker SHA256 is ECEEED6AB0D71848346E9D8709A3CA40EF49A3255CE4C2C6809314610F8EFD42; transport tests 8EBFD6D6DC537E98AF9D290A784ACE6DF8E677F4D78C991D7CF685E44F593C2F. The round6 report reviewed older 7F17426D/E5FE0728 snapshots. Existing current code supplies forwarding context/original start to readiness's bounded wait, identifies the private HTTP local timeout separately, and preserves originating ProcessFailure on post-ready output exhaustion. Existing final three transport regressions exercise those exact cases.

No source rollback, redundant repair or fabricated intended RED is authorized or needed merely to reconstruct chronology. The scoped team/cache filename search found no retained round7 RED/result record; that limited absence is not a universal machine-history claim. Original implementation attribution/RED chronology remains unverified. Current-source qualification will be recorded honestly. Extensive existing Azure WIP is preserved; author ownership is restricted to broker/related tests if an actual remaining defect requires change, plus this new record. No root state/findings/reviewer reports are edited.

## Test design and output classification before qualification

Stable public boundary: drainRecoveryMessaging/withBrokerMonitorForward with real internal diagnostic, HTTP, timing and cleanup collaborators. Existing transport fixture substitutes only the external kubectl port-forward process with a real owned Node child and loopback HTTP server. It validates fixed method/path/authentication and real process stdout/stderr/exit handling. This proves the selected local transport/failure boundary; it does not prove AKS/SPDY/RBAC or live Azure behavior. Existing pinned native kubectl invalid-local-config control remains separate; no cloud credential or paid operation is involved. RabbitMQ/provider source is unchanged.

Required current cases: independent forward readiness timeout retains kubectl/forward/timeout and actual >=30s elapsed; local HTTP request timeout retains http/queue-observation/timeout and >=10s elapsed; output overflow after readiness retains kubectl/forward/output-limit rather than cancellation. Private synthetic markers/passwords/child stderr must not escape thrown/public diagnostics. Owned child/listener cleanup is required and remains bounded by production cleanup. No deadline, security policy, native provider or service permission change is planned.

Applicable standards: constitution test-first/public-interface/privacy/bounded-resilience; engineering testing design record, tooling output/primary+cleanup obligations, formatting/linting exact-file workflow and resilience/observability. First qualify the already-present real-process regressions; any new actual defect must obtain intended RED before dependent repair. Passing current code alone does not reconstruct historical RED or close the quality finding; original reviewer owns closure.

## Checks and results

Current-source qualification completed below; independent closure remains pending.
Current-source first selection: node --test --test-name-pattern='local forward readiness timeout|local HTTP timeout|output exhaustion after readiness' scripts/azure-broker-transport.test.mjs passed 3/3, zero skipped/cancelled, 49.396s (readiness 31.957s / HTTP 12.952s / output-limit 2.206s). Syntax checks passed under Node 24.15.0. This establishes existing behavior, not historical RED chronology. Before the final qualification, strengthen only those three existing tests with the same actual closed-loopback-listener assertion already used elsewhere in this file. This is coverage of preexisting cleanup behavior, not a new production repair or claimed RED. Do not change fixture launch/security/budgets or other source.

## Final frozen qualification

The current adapter already contained the three repairs when this assignment began. This round changed only the existing transport test's three target cases: each now also checks that the actual loopback listener refuses a request after the public failure returns. The fixture, launch command, production bounds, security policy and broker implementation were not changed. A guarded insertion attempt stopped before any test write; the corrected exact edit was formatted immediately with npm run format -- scripts/azure-broker-transport.test.mjs and reread. No synthetic rollback or historical RED claim was made.

Commands/results on the frozen revision:

- node --check scripts/azure-broker.mjs and node --check scripts/azure-broker-transport.test.mjs: PASS.
- node node_modules/prettier/bin/prettier.cjs --check scripts/azure-broker.mjs scripts/azure-broker-transport.test.mjs: PASS.
- node node_modules/eslint/bin/eslint.js scripts/azure-broker.mjs scripts/azure-broker-transport.test.mjs --max-warnings 0: PASS.
- node --test scripts/azure-broker-transport.test.mjs: exit 0, 10 passed/0 failed/0 cancelled/0 skipped, 79.527s.

The final three real child/HTTP tests passed with explicit listener-absence assertions: readiness 31.797s, local HTTP 12.159s, post-ready output-limit 2.109s. These are test wall times including cleanup, not invented exact failure-duration metadata. The actual public error assertions require respectively kubectl/forward/timeout and duration>=30000ms; http/queue-observation/timeout and duration>=10000ms; kubectl/forward/output-limit and positive elapsed duration. Marker exclusion remains asserted. Existing full-file controls also passed: authenticated HTTP/fixed child arguments, sequential fresh outbox-before-queue observation, invalid/denied/stale/redirect/type refusal, cancellation, simultaneous primary+cleanup failure, actual owned-listener cleanup and pinned native kubectl invalid-local-config diagnostics before any database observation.

Child fixture stdout/stderr and authenticated HTTP inputs are private, with fixed public failure projections; the test reporter exposes only assessed names/counts/timings. No Azure credentials/deployment/spend, hosted workflow, AKS transport or RabbitMQ provider execution occurred in this round. The unchanged native-provider test/source and retained earlier provider qualification remain supporting evidence only; they were not rerun or relabeled as current live-cloud acceptance.

Final hashes:

| File | SHA256 | Author action |
| --- | --- | --- |
| scripts/azure-broker.mjs | ECEEED6AB0D71848346E9D8709A3CA40EF49A3255CE4C2C6809314610F8EFD42 | Preserved preexisting repair; no edit |
| scripts/azure-broker-transport.test.mjs | 6E152DC2207084BA0FB6EBF4ED50C8208F2C1FB9997C033E6151509EB8527235 | Added only 3 listener-cleanup assertions |
| scripts/azure-broker.test.mjs | 7FD6FF19BAA3AE36F78E32969477A395061BBA792FB4ADDE14772BD88386F189 | Unchanged/not rerun |

Coordinator-owned whole format/lint gates are recorded separately: the author does not claim their final result here. Root reported format-check passed on the pre-cleanup-assertion snapshot; final exact-file Prettier covers the only subsequent source delta. Root's first lint attempt failed on sandbox NuGet access; root subsequently reported elevated full lint PASS, exit0, build0warnings/errors. This coordinator result is distinguished from the author's scoped checks. Full npm check and live AKS/hosted identity acceptance remain outside this bounded qualification. Q-BROKER014-002 closure belongs to the original reviewer, not this author. Current source is frozen for that targeted review; shared state/findings/reports and all unrelated WIP/Discovery files remain untouched.
