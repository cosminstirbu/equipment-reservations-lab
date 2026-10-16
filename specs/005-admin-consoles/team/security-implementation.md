# SEC-005 Independent Implementation Security Review

**Date:** 2026-10-16, Europe/Bucharest  
**Verdict:** **pass**  
**Feature:** `specs/005-admin-consoles`  
**HEAD:** `4ff571c6ccdf19f010994035815d2b9e443c7883`  
**Source snapshot:** `d5077147322621335dc4af6d24063f84b7fd88a697f2d66f118d2c8ca8577947`  
**Artifact snapshot:** `d0ea0a2eed62b268806bda4287d505fe38d0e74750633a892e0e2b70648fc03a`

## Scope and evidence integrity

Reviewed the AppHost configuration, administration tests, broker contract adjustment, browser verification script, developer documentation, approved requirements/design and final implementation evidence.

Independently recomputed and matched all five source-file hashes and all twelve artifact hashes against the supplied manifests. Source reviewed during preliminary review remains unchanged.

## Security assessment

The implemented controls satisfy the approved local administration boundary:

- Both integrations are conditional on Development **and** run execution mode.
- RabbitMQ retains normal authentication; recorded runtime tests reject anonymous management requests with HTTP401 and accept existing development credentials with HTTP200.
- pgAdmin’s password-free administrator access matches the owner-approved scope.
- Actual runtime checks inspect Aspire proxy listeners, all backing OS listeners and Podman publications. They reject wildcard/non-loopback bindings and probe active non-loopback IPv4/IPv6 addresses before administration.
- The pgAdmin recreation scenario repeats image and binding verification before reopening administration.
- Application service credentials and database role restrictions remain unchanged; administrator credentials are not propagated to application services.
- Existing persistent volume and secret identities remain intact; pgAdmin settings are disposable.
- Administrative endpoints are excluded from service references.
- Credentials are absent from committed URLs/documentation and retained authentication traces. Browser credentials pass through subprocess environment and normal login; raw secret-bearing container inspection and generated registration files are not retained.
- Verification uses isolated infrastructure and disposable objects rather than owner data.

The evidence includes real RabbitMQ workflows and actual pgAdmin browsing/query/mutation workflows across all three databases, repeated after true console recreation. Focused browser tests passed **6/6**.

## SEC-005-D1 closure

**Disposition: closed — remediated.**

The AppHost explicitly pins the new console to `dpage/pgadmin4:9.18.0`, replacing the vulnerable integration default. Tests assert the configured tag before startup and the exact running image `docker.io/dpage/pgadmin4:9.18.0` before initial use and after recreation.

Affected model, publish-exclusion, binding, browser, recreation and state-preservation evidence was regenerated on the repaired image. Historical 9.15 evidence remains identified as historical.

This is remediation, not residual-risk acceptance. The upstream basis remains the [official pgAdmin 9.16 security fixes](https://www.pgadmin.org/docs/pgadmin4/9.18/release_notes_9_16.html) and [9.18 security fixes](https://www.pgadmin.org/docs/pgadmin4/9.18/release_notes_9_18.html).

## Required checks

The current-source full check completed on October 16 with exit0:

- Tooling: **4/4**
- Frontend: **33/33**
- Backend: **216/216**
- Real Podman smoke: **50/50**
- Failed/skipped: **0**
- Build warnings/errors: **0**

The full suite includes retained state/messages, database-role restrictions, booking/recovery and telemetry/privacy coverage. Format-check and lint also passed.

## Publication limitation

Complete application manifest emission encounters a pre-existing `OwnDatabase` callback that awaits a runtime endpoint during publication.

Console exclusion is sufficiently established by assertions against the **full, unmodified publish graph**, followed by actual infrastructure-manifest emission after removing only explicitly identified application workloads. Infrastructure is preserved; unexpected console resources are not hidden by a whitelist. This validates the feature’s exclusion boundary without claiming complete application publication works.

## Findings and remaining gates

**New findings:** none.  
**Unresolved blocking security findings:** none.  
**SEC-005-D1:** closed as remediated.

This verdict does not supply convergence or human acceptance and does not authorize deployment, publication or merge.

**Reviewer actions:** read-only inspection and hash verification; no intrusive probes or file changes. Coordinator must persist this report because the security role prohibits file modifications.
