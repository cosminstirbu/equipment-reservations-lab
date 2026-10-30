# Targeted security preparation review — drain and ownership delta

**Verdict: pass for this design delta.** No new blocking finding or risk-acceptance request.

Verified snapshots:

- `plan.md`: `C42A81B0B7147E3667C067CB3B10C1B6F3FE025F903CAD9DB219AE2833BDACEC`
- `contracts/operations.md`: `07EA06DFDDC9184C3776E85C7F743A1A20A4A29E2FD7A2C4690B729A252D8FD6`
- `research.md`: `7958B1685D863EB170E54A2ACD8A3EA53F534877717FAE6215B5BDE4829DF78F`
- `tasks.md`: `F179534D018F3B0DC7F9181CF9E7B6629E832EECFDDA874F54B2ADF3035FE1F0`

The drain design preserves appropriate boundaries:

- Dedicated monitoring credentials have no message or topology permissions. RabbitMQ documents monitoring-only access using the monitoring tag and empty resource permissions. [RabbitMQ guidance](https://www.rabbitmq.com/docs/management#monitoring-only-read-only-access)
- Backup forwards only the exact fixed monitor Pod; it receives no wildcard broker-Pod access or monitor exec permission.
- The proxy permits only the exact queue-statistics GET, verifies upstream TLS, and retains no credentials or request logs.
- Ready/unacknowledged counters and outbox evidence must all establish zero. Missing, stale or invalid evidence fails.
- Credential handling remains private, without Terraform values, CLI arguments, broader vault reads or broker-admin credentials.

Qualification-binding ownership is now explicit: installer-owned bindings remain outside Kustomize reconciliation. Reviewed removal of fixture references, exact-commit platform synchronization, ownership/UID checks and absence verification precede real-client activation.

Restore’s exact five Deployment/scale GET permissions support maintenance verification without scale mutation. Tests must distinguish permitted reads from denied patch/update, other-resource reads and other-client execution.

Implementation review must verify encoded/alternate-path and method rejection, safe upstream errors, actual RabbitMQ permission denials, bounded responses, exact forward cleanup, and convincing evidence that writers have stopped before taking the recovery point. Configuration alone establishes none of those runtime outcomes.

SEC-TF003 remains unresolved and held for the required repair-budget decision. This verdict does not approve source implementation or bypass that hold.

No files changed, intrusive probes, paid actions or new risk acceptance.
