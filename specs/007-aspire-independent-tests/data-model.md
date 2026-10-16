# Data Model: Coverage and Evidence Records

This feature adds no runtime entity, database table, schema, migration or wire contract.

## Coverage disposition

- Baseline revision, file, class/method, theory arguments and distinct contractual assertions.
- Disposition: retained/replaced, redundant with named equivalent, Aspire-only removed, or explicitly owner-approved removal.
- Failure detected, rationale, target executable test names, command/result and tested snapshot.
- Relation: one former method may require several guarantee records; several redundant cases may point to one replacement only with an explicit equivalence rationale.
- Validation: every baseline case and every retained mixed guarantee must resolve; unresolved/pending evidence cannot be marked passed. No new provider guarantee removal without owner decision.

## Recovery scenario state

These are test observations of existing state, not new product schemas:

1. Provisioned stores and migration-ledger snapshot.
2. Persisted reservation/history/inbox baseline and equipment edit.
3. Broker unavailable; committed changes with stable unpublished outbox envelopes.
4. Hosts disposed/recreated against same durable stores; pending rows inspected before replay.
5. Broker restored; publisher delivers while consumer absent; queue retained across broker restart.
6. Recreated consumer commits one inbox effect per stable event; exact history/inbox/owner/ledger assertions.

Provider privileged credentials are fixture-only. Service credentials remain scoped. Durable storage identity must remain stable across host phases; resource cleanup follows host then provider ownership.

## Supersession record

Prior artifact/requirement, original obligation, replacement policy, current feature link and historical-record preservation. Original acceptance dates, hashes, verdicts and completed-task evidence remain intact. New checks cannot be represented as validated by old reports.

## Manual local-development observation

Prerequisites, action, expected observation, actual pass/failure, lifecycle ownership, cleanup and tested revision. Startup/dashboard/admin-console/access/persistence observations remain manual and separate from automated provider evidence. Manifest publication is unsupported and has no manual acceptance step.

## Completion evidence

Command/environment/snapshot/result, independent quality/security verdicts, latest convergence and separate final human acceptance. State progresses through implementation, validation, review, convergence and acceptance; pre-work scope approval never substitutes for final acceptance.
