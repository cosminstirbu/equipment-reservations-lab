**PASS — SEC-BUNDLE001 closed on the supplied repair snapshot.**

Independently matched all six hashes:

| File | SHA256 |
|---|---|
| azure-recovery.mjs | `12827B25DD1DEC3D42193687C94F6F79726B05B0E5937FAB41C1579D7738AE06` |
| azure-recovery.test.mjs | `7EBD9090E94EC0E2FC89857D08E4C4A8855B07CB8CB7FEDDC8E43FCF00891F68` |
| azure-recovery-identity.mjs | `7DFC698F5F68B17267F79316087C32BA20936C15FBFF909DABA2240ECD0958E6` |
| azure-recovery-bundle.mjs | `009DC16B39EF31F20C1D75059094804DE63CF03AFDA96C2C62629024ACF5739C` |
| azure-recovery-bundle.test.mjs | `F7A63997AE77E1FBAC0C82520A836F57BD325A88B799E81ABA089A18235503F5` |
| azure-recovery-bundle.native.test.mjs | `53EFCAEC3869314E3CC93AD952361C3D686031484EFDDAB0DEE25C2A6584DE55` |

Restore now requires independently supplied source identity. Backup encrypts its source context and exact six-object version/hash inventory into metadata. The engine compares selected context, authenticated metadata and credential bundle before invoking provider mutations. Bundle restore independently repeats the source/inventory checks before Key Vault or Kubernetes writes. The original self-derived expected-vault comparison is removed.

Independently ran the recovery, identity and bundle test files with pinned kubectl: **15 passed, zero failures/skips**, exit 0, approximately 9.7 seconds.

Author reports the current native repair test **1/1 passed**, zero skips: six invalid-source cases produced zero Key Vault PUTs and unchanged versions for all five Kubernetes Secrets. I inspected that test but did not rerun its cluster fixture.

Closure applies to these engine/helper boundaries. The full CLI must still obtain `settings.sourceIdentity` from independently validated selected-point context; deriving it from bundle content would reintroduce the defect. That selection integration remains unbuilt and is not approved here.

No new confirmed finding, source changes or cloud actions. Native seeded issuer status and Key Vault doubles establish neither controller convergence nor Azure authorization. No full-feature approval.
