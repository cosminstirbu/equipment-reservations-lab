**Recommendation: pin the newly introduced pgAdmin image to 9.18 and revalidate. Security readiness for retaining 9.15: changes_requested.**

**SEC-005-D1 — Known vulnerable console dependency**  
**Severity:** high, blocking pending remediation or evidence disproving applicability.  
**Owner:** architect/coder.

**Evidence:** pgAdmin’s official 9.16 notes identify CVE-2026-12048: database error/Explain content could execute script in the administrator’s browser, exposing connection credentials and enabling SQL execution. Thus 9.15 predates that fix. The same release removes the administrator bypass from connection-access checks. [Official 9.16 notes](https://www.pgadmin.org/docs/pgadmin4/9.18/release_notes_9_16.html)

**Attack scenario and preconditions:** an attacker must influence database content that reaches an affected error or Explain rendering path; the developer must then encounter it in pgAdmin. Loopback binding prevents direct remote console access but does not stop this database-to-browser path. Ordinary application data may supply such content, although I have **not demonstrated an exploitable path through this application**.

The administrator-role bypass adds little risk in the approved single-user desktop configuration: there is no separation between different pgAdmin users’ connections to preserve.

**Remediation:** select 9.18 explicitly for this new container. It also fixes later credential-redirection flaws in backup/restore tooling. This changes the new console dependency without upgrading existing Aspire, PostgreSQL or RabbitMQ. [Official 9.18 notes](https://www.pgadmin.org/docs/pgadmin4/9.18/release_notes_9_18.html)

**Verification:** assert the selected image/tag, verify the running version, rerun no-login automatic connections, all three database workflows, recreation, first-start binding checks and publish exclusion. Update affected design/evidence hashes and repeat independent review.

Retaining 9.15 would need stronger applicability evidence or explicit owner risk acceptance; neither currently exists. No files changed or exploit probes performed.
