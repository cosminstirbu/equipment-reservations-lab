Qualification v2 preparation verdict: **changes_requested**.

Verified proposal SHA256: `9450E68D778E931FB82DF1AC1F1C9CF093536C1E53BC4C9A7697FB5CE4563141`.

**Q-D014-004 — Incomplete executed-code closure**  
Category: design; severity: medium; blocking: yes; owner: operations/architect.

The proposed fixed manifest includes `azure-provisioning.mjs` but omits its existing static imports `azure-runtime.mjs` and `argocd-installation.mjs`, and their transitive dependencies. Imported modules execute during loading. Their bytes could therefore change actual producer execution without changing the proposed definition manifest.

Define a genuinely transitive loaded-code closure, including relevant pinned dependency/runtime inputs, or establish explicit audited exclusions with an enforceable execution boundary. Add a regression changing a presently omitted imported module while the listed files remain unchanged; qualification must fail.

The remaining semantics are sound: explicit v2 migration and v1 rejection; separate infrastructure anchor, reviewed source, and actual executed checkout; clean HEAD/GitHub SHA checks; comparison against Git objects; actor-owned proof transport; current activation bindings; and app-only SHA independence conditioned on identical complete code inputs.

No files changed or implementation approved. This verdict does not permit silently relabeling existing v1 evidence.
