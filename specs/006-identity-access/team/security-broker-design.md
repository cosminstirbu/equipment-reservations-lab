SEC-006 targeted broker design security review

Feature: `specs/006-identity-access`  
Snapshot: `183ff764d6cbc017c8f683b4c46781dc0ab994172656f8e495dfd4ddcafce4a0`  
Manifest: `team/broker-design-manifest.json`  
Finding: `DESIGN-006-001`

**Verdict: PASS for the amended broker design and affected tasks. Security closure of DESIGN-006-001 is verified at design level.** The amended design removes the requirement for an administrative HTTP listener outside Development. Implementation verification remains pending; this does not approve current source or feature completion.

Reviewed the frozen plan, research, messaging contract, quickstart, affected tasks, original finding, feature 005 FR-005/006/007 and requirements compatibility assessments. Independently computed hashes match all eleven manifest entries.

Finding assessment:

- **Severity/blocking:** original high/blocking design conflict.
- **Attack scenario:** provisioning through an unconditional management listener would introduce an administrative API/UI outside the approved Development boundary.
- **Precondition:** enabling the RabbitMQ management plugin/listener in other run environments to satisfy startup provisioning.
- **Repair evidence:** amended plan’s Provisioning and Broker section, messaging contract’s Boot definitions and lifecycle section, and T019–T022 replace management HTTP provisioning with core boot definitions and run-mode file injection. Development-only management gating and publish exclusion remain explicit.
- **Security closure:** design repair sufficient. Runtime confirmation of environment gating, publish exclusion and worker isolation remains required through T019–T022; failure would require a corresponding implementation finding.
- **Owner:** architecture for design; coder for implementation; independent reviewers for implementation verdicts.

The technical mechanism is supported: installed Aspire 13.6.1 XML exposes asynchronous `WithContainerFiles` and explicit ownership/mode properties. RabbitMQ supports core local-file definitions import without its management plugin; its pinned schema contains the selected configuration keys. [RabbitMQ definitions documentation](https://www.rabbitmq.com/docs/definitions), [pinned 4.3.6 schema](https://raw.githubusercontent.com/rabbitmq/rabbitmq-server/v4.3.6/deps/rabbit/priv/schema/rabbit.schema).

The selected salted SHA-256 format matches RabbitMQ’s documented algorithm. Independent persisted salt material produces stable definitions without exposing plaintext passwords; generated high-entropy passwords remain necessary, and hashes remain sensitive. [RabbitMQ password algorithm](https://www.rabbitmq.com/docs/passwords).

The design correctly distinguishes imported user hash/tag/permission updates from existing topology preservation. Stable content avoids unnecessary reapplication; unrelated state is not globally scrubbed. [Pinned importer](https://raw.githubusercontent.com/rabbitmq/rabbitmq-server/v4.3.6/deps/rabbit/src/rabbit_definitions.erl), [pinned user backend](https://raw.githubusercontent.com/rabbitmq/rabbitmq-server/v4.3.6/deps/rabbit/src/rabbit_auth_backend_internal.erl).

The staging boundary is adequately specified: broker-owned 0600 files, protected new directories, no application-created host secret files, and explicit verification of framework staging rather than an unsupported secure-erasure claim. Aspire supports ownership and permission controls. [Aspire container files](https://aspire.dev/app-host/container-files/).

T019–T022 and T035 cover the necessary remaining evidence: actual pinned-image UID/readability and staging privacy; administrator login continuity; exact workload allow/deny operations; failed import blocking workers; restart preservation; secret-free diagnostics/artifacts; and no callback secret resolution or generated hashes in publish/model output. Replacing nonexistent admin-HTTP spans with observable local preparation/readiness and native AMQP evidence is appropriate.

No additional security findings or missing product decisions identified. Checks were read-only artifact inspection, installed API documentation inspection, primary-source browsing and manifest hashing. No files changed, .NET commands or intrusive probes run, or risks accepted. Historical reports remain valid for their recorded snapshots.
