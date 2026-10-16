SEC-006 targeted transport design security review

Feature: `specs/006-identity-access`  
Reviewed snapshot: `fe9a31ced53e73ebb5587f5f8745e8f500cc156056c873879d17aaa929682a63`  
Manifest: `team/transport-design-manifest.json`

**Verdict: PASS for the transport design correction and affected task coverage.** No security findings or unresolved security questions. This does not approve B3 or the complete implementation.

Reviewed the revised plan, research, identity contract and quickstart, together with affected task descriptions and the `KC_HOSTNAME` wiring. Independently computed SHA-256 values match all eleven manifest entries.

The correction retains the intended security boundaries:

- Provider hostname, browser configuration, provisioning and API authority use the same exact allocated host-network scheme, loopback host and port.
- Explicit localhost-network resolution prevents container-context substitution of an internal hostname.
- Aspire-managed HTTPS retains certificate validation. Development HTTP metadata permission applies only to an actual validated loopback HTTP authority; it is not an HTTPS certificate bypass.
- The complete issuer and transport configuration remain stable across ordinary restarts. A changed issuer represents a distinct identity environment, without accepting alternate issuers or reassigning ownership.

The relevant attack scenarios remain controlled: hostname substitution cannot redirect browser credentials to an internal or unintended authority; certificate failures cannot trigger an insecure fallback; and scheme/host changes cannot silently broaden token acceptance or transfer ownership.

T007/T009 cover real-provider configuration and issuer integration; T011/T012 cover browser authority use; T036 covers persistence across restarts; T037 covers operator instructions. Their security intent remains compatible with the corrected design, so no additional security task is required.

Runtime verification remains pending: exact discovery/token issuer and login form targets, successful trusted-certificate browser/API communication, fail-closed certificate/issuer rejection, and unchanged complete issuer and ownership across ordinary restart. Reported model/runtime evidence was contextual input, not independently reproduced during this review.

Checks performed: read-only document/source inspection and manifest hash verification. No tests, .NET commands, intrusive probes or writes. No risks accepted or historical verdicts overwritten.
