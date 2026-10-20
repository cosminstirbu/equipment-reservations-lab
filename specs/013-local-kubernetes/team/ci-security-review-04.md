**Security verdict: pass for the six-source round-4 change. SEC-CI-004 is closed.**

The private-log query now requires namespace `equipment` and the exact database Job-name pattern. The regression proves that a matching name in another namespace causes zero log queries; recorded evidence shows intended red followed by 13/13 green. No unresolved security findings remain within this code scope.

Verified final hashes:

- CI orchestrator: `afbfcd6ff574381c9b54b4ad8fa6a64a7064a4d49b7cce62188d1367fdaf0ccc`
- CI tests: `6bac0a49057f46423e184c7d4b2db4f2f9ce1ecb1bd8a955ace3024283623d16`
- Database image test: `ba0b9bae109a8d4450c7b486bafa84b273469b9482fa856961f217c24318f0cd`
- Startup helper: `3509d2382feb16dcfef9f00204ef28b0df3bdecf5015c781f7c2f7388caf2f3f`
- Startup tests: `cdfc394e00ba9cf23a597ab8afe0143ea4ac770212e4d83a423ea9f473289bb0`
- Validation workflow: `be080a96f1262ac7aeece65b0b019dbcc7fe778d475b3396d2e006d3c174bd8d`

Diagnostic evidence hash: `311e253ed3a2ec041644a1e7a1f8ed7dc6850aceb1d624228234c6864d4fab63`.

Bounded retry, private image-test handling, sanitized diagnostic projection and workflow permissions retain their previously reviewed controls. Coordinator reports 564 application tests passing; full deployment verification is still running. Actual hosted Docker validation and the hosted database-bootstrap failure’s root cause remain outstanding. This is not feature-completion approval.

Read-only review; no edits, builds or provider commands performed.
