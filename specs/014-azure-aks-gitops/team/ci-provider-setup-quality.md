Bounded CI provider-setup verdict: **pass**.

Verified hashes:

- PR workflow: `D8FC3770CA174397B3E193751D413FF632A4165CB7142E52C5191EE82DEFF8C6`
- Main workflow: `9780714017BBA466B6C045D4E1E195737185B52BE9A5C9151519012144600B7A`
- Workflow tests: `5B8A4522DF7181DFB0AD0DB745B9CBDD1DD3D2EE2698AD2D9F1648C0BA32F7D6`

Both workflows prepare .NET and functional rootful Podman before provider contracts, supply the checksum-verified kind path, and set `AZURE_PROVIDER_CONTRACTS=1`. Missing runtime setup fails rather than selecting provider skips. The wrapper uses a fixed executable, preserves argument boundaries, and runs only on the isolated hosted runner.

Cumulative full/infrastructure gates remain intact. The regression checks prerequisite ordering, matching guards, runtime wrapper, and required provider environment.

No new findings, files changed, or tests rerun. Hosted provider execution remains pending; local provider passes do not establish GitHub-hosted qualification. Q-BROKER014-001/002 remain separate unresolved findings.
