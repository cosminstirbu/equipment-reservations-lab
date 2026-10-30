# Azure toolchain preflight

Date: 2026-10-26. Source baseline: `d1c7238345136340ddbf3a9454807cefffc43c32`.
Scope: preparation only; no infrastructure, application configuration or source changed.

## Verified Windows tools

Archives were downloaded from official release HTTPS URLs, checked against the corresponding official SHA256 manifest before extraction, and executed for version verification. Downloads and extracted tools remain under `.cache/azure-toolchain`. Existing kubectl remains under `.cache/promotion-tools`.

| Tool | Version result | Archive SHA256 |
| --- | --- | --- |
| Terraform | `Terraform v1.17.0`, windows_amd64 | `2948dd7f77dec0f562ec29000103e0441d915be5e5f1a02c1ce23681951cfb19` |
| TFLint | `TFLint version 0.65.0` | `292e760adf0e9c7e0f10ddeb0f6add67fd6d2c68b5449fdf766ff6ffddce465c` |
| AzureRM TFLint plugin | `ruleset.azurerm (0.33.0)` | `367ead184ec4ea6cdf4c401607c03301a3824a514815def94d1b378aae357630` |
| Trivy | `Version: 0.76.1` | `1051f49cb22d5284f43425f72aad9cda63ca12ceb92e7caa06903490c82dc9bf` |
| kubectl | `v1.35.8`, embedded Kustomize `v5.7.1` | Executable: `f675d70224b42b84e0442e8d7644efbe440e4451a4b02bdc5d95823a96316ba8` |

TFLint also reports bundled Terraform ruleset 0.15.0. AzureRM plugin loading was verified with a temporary cache-only configuration and `TFLINT_PLUGIN_DIR` pointing inside the workspace cache; no user-profile installation or persistent PATH modification was performed.

## Official sources

- Terraform archive: https://releases.hashicorp.com/terraform/1.17.0/terraform_1.17.0_windows_amd64.zip
- Terraform checksums: https://releases.hashicorp.com/terraform/1.17.0/terraform_1.17.0_SHA256SUMS
- TFLint archive: https://github.com/terraform-linters/tflint/releases/download/v0.65.0/tflint_windows_amd64.zip
- TFLint checksums: https://github.com/terraform-linters/tflint/releases/download/v0.65.0/checksums.txt
- AzureRM plugin archive: https://github.com/terraform-linters/tflint-ruleset-azurerm/releases/download/v0.33.0/tflint-ruleset-azurerm_windows_amd64.zip
- AzureRM plugin checksums: https://github.com/terraform-linters/tflint-ruleset-azurerm/releases/download/v0.33.0/checksums.txt
- Trivy archive: https://github.com/aquasecurity/trivy/releases/download/v0.76.1/trivy_0.76.1_windows-64bit.zip
- Trivy checksums: https://github.com/aquasecurity/trivy/releases/download/v0.76.1/trivy_0.76.1_checksums.txt
- kubectl checksum: https://dl.k8s.io/release/v1.35.8/bin/windows/amd64/kubectl.exe.sha256

## Commands and outcomes

- `Get-Command terraform,tflint,trivy,az,kubectl,helm,gh,node -ErrorAction SilentlyContinue`: Azure CLI, GitHub CLI and Node available; other tools initially absent from PATH.
- Initial sandbox `Invoke-WebRequest` failed to connect. Approved elevated network downloads then succeeded into the workspace cache.
- `Get-FileHash -Algorithm SHA256` compared with exactly one matching manifest entry: all four archives PASS. Existing kubectl compared with official executable checksum: PASS.
- `.cache/azure-toolchain/terraform/terraform.exe version`: exit 0.
- `.cache/azure-toolchain/tflint/tflint.exe --version`: exit 0.
- `.cache/azure-toolchain/trivy/trivy.exe --version`: exit 0.
- `.cache/promotion-tools/kubectl.exe version --client -o json`: exit 0.
- Cache-only `TFLINT_PLUGIN_DIR` and `.cache/azure-toolchain/tflint/tflint.exe --config .cache/azure-toolchain/preflight.tflint.hcl --version`: exit 0; AzureRM 0.33.0 loaded.

## Limits and pending checks

Checksums establish agreement with manifests served by the official release endpoints; separate release-signature verification was not performed. Helm was not installed because its version has not been assigned. No Terraform configuration exists yet, so fmt, init, validate, lint, scanner policy behavior, provider downloads and lockfiles remain pending. Trivy version execution does not establish cached policy bundle availability or reproducibility. No Azure account output, credentials, GitHub settings or infrastructure were read or changed. This report records a Windows preflight; Linux workflow tools need their own official checksums. Formatting/lint checks are not applicable to cache binaries or this Markdown evidence file; link, consistency and readability inspection performed.

## Linux AMD64 release pins

Read from the same official checksum manifests downloaded above (archives not downloaded or executed on this Windows host):

| Archive | SHA256 |
| --- | --- |
| `terraform_1.17.0_linux_amd64.zip` | `c168cab7c637a8769fdb90089ddd19de701bc6ff8aca64dc2e2185fe46f59f67` |
| `tflint_linux_amd64.zip` | `d4c545ed2e29d6338604b586f34f544f380f70f243aa72f7b484713835eaec61` |
| `tflint-ruleset-azurerm_linux_amd64.zip` | `cd372389bd9ef17096ed7a9fbd856c0122521df141301685e974b269322819a8` |
| `trivy_0.76.1_Linux-64bit.tar.gz` | `c7cbe3137fb8a48a17574bede3dd6beb16742d1e9772929940fc90082c39d9c0` |

Archive URLs use the release directories listed above and these exact archive names. Linux execution remains a workflow qualification check.

## Immutable Trivy policy probe

Actual `trivy config --help` confirms `--checks-bundle-repository`, `--skip-check-update`, `--disable-telemetry` and `--skip-version-check` flags. Default repository is mutable `mirror.gcr.io/aquasec/trivy-checks:2`; do not use that default in the implementation.

Resolved the official default repository tag through its OCI manifest endpoint to:

`mirror.gcr.io/aquasec/trivy-checks@sha256:b591e9190cff4aa4e385b1a25bccfd9ecf178d3c77fd194e1410b7ce7e1df058`

Source endpoint: `https://mirror.gcr.io/v2/aquasec/trivy-checks/manifests/2`; response `Docker-Content-Digest` matched the pin above. Manifest annotations report checks version 2.3.0, revision `6ceb33758a0f28d6e37e6cd571dc6816beeadbcc`, created 2026-10-14. Layer digest is `sha256:4bf8ba41d342b378e63707561806d7784373ddd6cc04fdaf085ec7f38a19ec9d`.

Cache-only negative fixture defines an insecure Azure Storage account. Invocation with explicit immutable repository, fresh `.cache/azure-toolchain/trivy-pinned-cache`, JSON output and `--exit-code 7` downloaded that exact bundle and exited 7 on findings. Cache `policy/metadata.json` records the exact pinned digest and major version 2. Subsequent invocation with the same cache and `--skip-check-update` succeeded offline and again exited 7 on findings, without an ERROR log.

Implementation should initialize a cache tied to this digest, verify metadata digest before scans, prevent stale/shared cache adoption, then scan offline. Failed downloads/cache verification must fail rather than silently fall back to embedded checks. Cache content integrity needs verification if reusing across trust boundaries; metadata alone cannot establish untampered content.

A separate initial empty-cache `--skip-check-update` probe demonstrated built-in checks detect insecure Terraform, but Trivy logs ERROR while falling back to embedded checks. Prefer the verified immutable OCI bundle to keep expected startup distinct from actual scanner errors. Negative fixture reported findings including `AZU-0011` for minimum TLS. Raw scan output was retained only in workspace cache; no application secrets were involved.
