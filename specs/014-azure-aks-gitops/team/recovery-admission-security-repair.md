**PASS — SEC-GO001 and SEC-GO003 closed on the supplied repair snapshot.**

Independently matched SHA256:

| File | SHA256 |
|---|---|
| admission.json | `037480D6263FCD6A92249388E51BFF937BE092BEF6531ADF6A7C6570ABC1F3AF` |
| roles.json | `71D9830E46296190A1887B0F031C987F5159D3B1382A27B4F9835A4B6D405574` |
| azure-admission.test.mjs | `E978A80EC7558B64F3FD3C92AC78D518AB1350D4615C3DCCFC8CA556A9739AFA` |

SEC-GO001: admission now bounds resource maps to the two reviewed keys, excludes CSI secret references/fsType/additional attributes and custom DNS, and permits only absent or Kubernetes-default termination-message settings. Tests independently mutate all eight repaired fields. Unsafe Jobs are seeded before policy binding under a zero-Pod quota, allowing no-op UPDATE denial to exercise admission rather than Job immutability.

SEC-GO003: restore now receives GET on exactly the five named Deployments and their scale subresources. Tests exercise actual impersonated GET positives, unrelated-resource negatives and mutation authorization denials.

Coordinator reports native admission **1/1 passed without skips**, zero CEL warnings, successful cleanup, and provider checks **36/36 passed**. I inspected the test boundaries but did not rerun them.

SEC-GO002 remains retracted. No files changed. This closes these findings only; hosted Entra/AKS authorization, live CSI behavior and the separate termination/credential-continuity design remain outside this verdict.
