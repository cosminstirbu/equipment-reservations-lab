## SEC-005 preparation security review

**Verdict: pass**

**Reviewed snapshot:** `05ff34664501fbc8667ff9e177f5f4e350f594c253d48c9663c279bdb1d141f4`  
**Plan SHA-256:** `8d25514f6ffe785ccdc9b117dca58030c81a3b81a6224fd5ae5531b96dfc4ebe`  
**Scope:** `spec.md`, `plan.md`, `research.md`, `data-model.md`, `quickstart.md`, and `contracts/admin-consoles.md` under `specs/005-admin-consoles`.

The requirements and design adequately address the feature’s principal security risks. There are no blocking preparation findings. This verdict approves the security design for implementation; it does not establish runtime isolation or approve the eventual implementation.

### Threat model

**Assets:** existing PostgreSQL data and schemas; broker messages and topology; persistent volumes; development administrator credentials; application account restrictions.

**Actors:** the trusted developer, trusted local operating-system users/processes and local Aspire-network containers, and an untrusted peer on another computer.

**Boundaries:** browser-to-console HTTP endpoints; Aspire proxy-to-container forwarding; container-runtime host publications; console-to-database/broker administration; generated secret configuration; run versus publish execution.

**Principal attack scenario:** a LAN peer reaches password-free pgAdmin through a wildcard-bound backing port despite an apparently local dashboard URL, obtaining database administrator access. The plan explicitly addresses this with inspection of both proxy listeners and container publications, IPv4/IPv6 coverage, non-loopback connection attempts, and a mandatory blocking outcome if isolation cannot be achieved.

### Design controls assessed

- Run-mode **and** Development guards cover both console creation and RabbitMQ management image mutation.
- Actual publish-model inspection verifies that neither management endpoint nor management-image mutation escapes the guard.
- RabbitMQ retains normal credential authentication with explicit unauthenticated-request rejection checks.
- pgAdmin administrator access matches the owner-approved scope; application roles and credentials remain unchanged.
- Administrative endpoints are excluded from application service references.
- Secret-bearing generated registration files, raw container environments, authentication traces and credential-bearing screenshots are excluded from retained evidence.
- Dynamic ports, preserved volume/secret identities and disposable pgAdmin settings are consistent across requirements and design.
- Real browser administration checks complement model assertions and direct service tests.
- Verification mutations use isolated objects/infrastructure and bounded operations without automatic mutation retries.

### Findings

No confirmed security vulnerabilities or preparation-blocking design defects identified.

### Implementation evidence still required

1. Actual proxy and Podman host bindings for every console port, with IPv4/IPv6 inspection and failed non-loopback access attempts.
2. RabbitMQ authentication rejection/success and real management workflows.
3. Password-free pgAdmin access, automatic administrator connection to all three databases, and recreation behavior.
4. Publish and non-Development exclusion, including RabbitMQ image selection.
5. Preservation of volumes, secrets, service-role isolation and existing application behavior.
6. Credential-free documentation, logs and retained verification artifacts.

These are implementation gates already required by the plan, not missing preparation evidence.

**Changed files:** none.  
**Checks performed:** read-only requirements/design consistency and threat-boundary review against repository protocol, constitution and Aspire guidance.  
**Unresolved product questions:** none.  
**Next security review:** generated tasks for adequate coverage, followed by the frozen implementation and its runtime evidence.
