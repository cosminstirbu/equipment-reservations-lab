**Q-D014-004: closed; preparation pass.** Verified proposal hash `A9D5A72D9DBC8C029F729D322060C0649C02877864955269059955625299F1D8`.

The revised proposal covers transitive imports, interpreted assets, package/runtime/tool inputs, and launch configuration. It requires protection before npm/Node starts and a real preload-marker regression. Version 1 evidence remains rejected; actual executed SHA and reviewed definition identity stay distinct.

**Q-CI014-001 and Q-CI014-002: source-closed; bounded CI quality pass.**

Verified repair hashes:

| File | SHA256 |
|---|---|
| PR workflow | `7741E4308071869C8BB4355E08855F1C20ADFED3780532FCE642EFCDE1529B60` |
| Main workflow | `406A8575712700FDBDBB1CCA22F4012EA9C60B7CDAEAE22493B6ADD34F5CB829` |
| Deployment summary | `72E0048743F88D64C56F657563342C1B96A7515E0D143F89821AFA323A0BB92F` |
| Manifest gate | `BFA46C9117FE364D9E30C3F9B3B7FB8F57734452087E732B0C820A6C3B6E748B` |
| Manifest tests | `483FF717ECD525F30AE4E5658F06906132AACAE0C6B157676D83DD1275E12AB2` |
| Workflow tests | `205C2A09F1A2005B3FB319FEB8886C919185F67E3623F2E3FB3D10D15CE2D6F7` |

Azure gates now run cumulatively for full and infrastructure modes. Mixed Azure/local metadata selects full validation, retaining committed release checks. The regression exercises the actual selection CLI and committed-validation CLI against malformed releases and divergent image patches.

The central gate also validates installer-only binding schemas separately and rejects their inclusion in ordinary Kustomizations.

Reported combined tests passed **34 with three existing skips**; I inspected the regression and author evidence without rerunning it. Hosted execution, qualification-v2 implementation, and full-feature acceptance remain pending. No files changed.
