# Branch release preparation addenda — 2026-10-22

## Quality reviewer

**Pass for the bounded design follow-up.** Inspected amended plan, branch-release-design and T059. Retiring only temporary diagnostic job/mode while retaining normal output/cleanup contracts is consistent with the owner follow-up; task ordering keeps intended absence/rejection reds before removal and final combined verification.

Exact lowercase main promotion through a case-sensitive Bash-derived controlled flag resolves the expression-comparison ambiguity without broadening publication authority. Real Bash Main/MAIN/main coverage, promotion dependencies on classify plus publish, and retained CLI negative refs/events are sufficient planned evidence. No new requirement conflict or checklist gap found. Coder may add and run intended new flag tests before flag implementation. This is preparation approval only; final source review/checks and existing feature gates remain required.

## Security reviewer

**Verdict: pass for the proposed design amendment, subject to test-first implementation and frozen-source review.**

GitHub confirms that expression string comparisons ignore case, so `github.ref == 'refs/heads/main'` cannot enforce exact lowercase main. [GitHub expression operators](https://docs.github.com/en/actions/reference/workflows-and-actions/expressions#operators)

Computing `promote=true/false` in Bash using quoted, case-sensitive `GITHUB_REF` comparison addresses this boundary. Promotion should depend on both classify and publish and require the controlled literal flag. Preserve existing event validation, source SHA, permissions and global concurrency.

Before implementation, regressions must demonstrate that manual `Main`, `MAIN` and feature branches publish without promotion; exact `main` permits promotion; unsupported events and nonbranch refs remain rejected. Exercise the actual Bash step rather than relying solely on YAML assertions.

Retiring the temporary diagnostic job and dedicated mode introduces no security concern if normal release/quality checks, safe process diagnostics and build cleanup coverage remain. Capture removal/rejection regressions first and review the combined snapshot.

No source edits or external execution performed. Prior exceptions do not waive new test-first obligations.
