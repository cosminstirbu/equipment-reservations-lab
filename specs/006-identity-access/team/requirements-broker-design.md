Verdict: **technical design amendment; no additional product decision or spec correction required.**

006 FR-011 defines required broker permissions and outcomes, not the provisioning transport. FR-015 preserves existing administration boundaries. Core definitions import is compatible with 005 FR-005/006 and SC-004 if management consoles/endpoints remain local-development-only, loopback-bound and excluded from deployment output.

Required artifact amendments:

- **T020:** replace management-HTTP provisioning mechanics with definitions generation/import while preserving exact vhost, users, ACLs and topology.
- **T021:** adjust bootstrap/readiness wiring; preserve separate worker credentials, routing, confirms, acknowledgements and recovery.
- **T035:** instrument actual remaining HTTP calls. Definitions import requires safe startup/readiness/failure diagnostics rather than invented HTTP spans; correlated broker/worker traces, logs and bounded metrics remain required by FR-015.
- Update affected plan, research and contracts; retain task IDs and historical review evidence.

Revised evidence must demonstrate required/denied broker operations, ordinary restart preservation, secret-safe diagnostics and effective console/deployment boundaries. Independent reviewers retain approval responsibility.

Read-only assessment completed; no files changed, no commands beyond artifact reads, no unresolved product questions.
