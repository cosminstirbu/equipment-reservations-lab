The supported three-scope lifecycle can cover SC-001/002/008/011/012 and T039. Those obligations require actual process restarts with retained durable state; they do not require Aspire’s failing per-project Restart command.

Preserve these evidence points:

- **SC-001:** each new AppHost runs real bootstrap/migrations; repeated startup preserves the modified seed and creates no duplicate seed/ledger records.
- **SC-002/008:** retain at least one Confirmed and one Cancelled reservation, with unchanged IDs, UTC intervals, statuses and event IDs across scopes.
- **SC-011:** prove the event is committed and Pending before scope-1 disposal, then still Pending in scope 2 before enabling its publisher.
- **SC-012:** in scope 2, wait for confirmed publication and durable Published metadata while the consumer remains withheld. Record the queued message before disposal.
- In **scope 3**, inspect the retained queue **before enabling either publisher or consumer**. Otherwise outbox replay could imitate broker-volume persistence. Then consume and assert exactly one matching inbox entry alongside unchanged prior entries/state.
- Reuse precisely the same test-owned PostgreSQL/RabbitMQ volumes and stable secrets; do not reseed/reset or recreate records through APIs between scopes. Record actual process IDs/resource lifecycle evidence.

Existing focused outage, duplicate-consumption and crash-window tests remain necessary; the orchestration test complements them.

No additional obligation is inherently uncovered by replacing unsupported project restart with full AppHost disposal/recreation. This is an evidence-design assessment, not approval of unexecuted checks or current WIP.
