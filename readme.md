# Codex + Spec Kit: six-agent feature team

A repository starter kit for a coordinated requirements → design → implementation → independent quality/security review loop. Includes six role definitions, coordinator policy, prompts and state/report templates. The primary Codex session coordinates five specialist subagents.

This is a prompt-driven starter, not an executable autonomous workflow engine. JSON records and completion gates are maintained by the coordinator; no scheduler or validation runner is bundled. Spec Kit itself is installed separately. Models and reasoning effort inherit your Codex settings.

## Prerequisites
- A current Codex installation with project custom agents/subagents support, signed in and able to run in your repository.
- uv and the Specify CLI, plus the repository's own build/test dependencies.
- A repository where you can edit project configuration. These files should be installed in your actual code repository, not a read-only synced reference directory.

## Bootstrap a new project
```bash
uv tool install specify-cli
specify init my-project --integration codex
cd my-project
```
Then copy this package's `.codex/agents/` and `docs/agent-team/` into that repository. Hidden `.codex` files must be included.

Merge the supplied AGENTS.md into your existing repository instructions. Merge the `[agents]` section of `.codex/config.toml` into your existing configuration; do not create duplicate sections or overwrite unrelated settings. The supplied setting allows five concurrent spawned threads, excluding the primary coordinator. Close completed agent threads to free capacity.

## Bootstrap an existing project
First follow Spec Kit's existing-project guide linked below. From your repository, initialize if Spec Kit is absent:
```bash
specify init . --integration codex
```
If Spec Kit is already initialized with another integration:
```bash
specify integration install codex
specify integration use codex
```
Inspect existing configuration and integration state first. Install and merge this package as described above. Preserve existing AGENTS.md, agent definitions and configuration; resolve name conflicts intentionally.

## First run
1. Customize protocol defaults: security blocking thresholds, repair budget, required checks and human acceptance. Record project principles using `$speckit-constitution` with your intended principles. This is a Codex chat skill invocation, not a terminal command.
2. Open/restart Codex in the repository after adding configuration. Confirm the installed Spec Kit skills and six custom role definitions are recognized. If not, check your Codex version and the official documentation; older releases may use different configuration formats. Do not assume these files are portable across all historical releases.
3. Paste `docs/agent-team/start-feature-prompt.md` into the primary session and fill its placeholders. This explicitly authorizes specialist delegation. The coordinator definition is also supplied as a reusable role, but the normal flow reads its instructions in the primary session instead of adding a sixth subagent.
4. The coordinator creates feature-local `team/` state only after Spec Kit creates/resolves the feature directory. Keep review records with that feature; never edit the template copies as live state.
5. Answer product questions as needed. On interruption use `resume-feature-prompt.md` with the exact feature directory.

## Roles and command ownership
| Role | Responsibility |
|---|---|
| coordinator | State, routing, validation runs and convergence |
| requirements_analyst | specify and clarify |
| architect_planner | plan and tasks |
| coder | implement and code repairs |
| verifier_reviewer | analyze, proposed checklists, acceptance and code review |
| security_reviewer | Threat/design review and implementation security review |

Read-only reviewers return reports; the coordinator writes them. The verifier cannot execute checklist generation or convergence directly because those can write artifacts. The coordinator materializes custom checklists and records only the verifier's explicit evaluations. The coordinator runs converge after implementation. The built-in requirements checklist remains maintained by specify/clarify.

Constitution is a project-policy operation; taskstoissues is optional external tracking and requires separate authorization. Neither runs automatically each repair round.

## Completion and intervention
Done requires passing required checks, acceptance evidence, complete tasks, no blocking quality/security findings, clean convergence and consistent artifacts on the reviewed revision. An agent's confidence or checked task list alone is insufficient.

Three preparation repairs and three implementation repairs are allowed by default. Two recurrences without progress trigger intervention. Missing business decisions and unavailable required checks also prevent completion. The final report must distinguish done from needs_intervention and include accepted residual risks.

## Permissions and concurrency
Planning/coding agents have workspace-write defaults; reviewers have read-only defaults. These settings do not enforce per-file ownership, and parent runtime permission overrides can affect spawned agents. Keep the parent permission configuration appropriate and verify reviewer behavior. Check execution requiring generated files is performed by the coordinator/coder, with results sent to reviewers.

Freeze code while reviewers inspect a revision. Run independent reviews in parallel; keep dependent phases sequential. Use separate worktrees and explicit ownership if you later parallelize code edits. Verify active feature state rather than inferring it from a Git branch. No merges, deployments, external messages or issue creation are authorized by the starter prompt.

## Contents
- `.codex/agents/*.toml`: six custom agents
- `.codex/config.toml`: configuration section to merge
- `AGENTS.md`: repository instructions to merge
- `docs/agent-team/protocol.md`: loops, ownership, gates and stop conditions
- `docs/agent-team/*-feature-prompt.md`: start/resume prompts
- `docs/agent-team/templates/`: empty state, finding example and report template

## References and compatibility
Configuration checked against official docs on 2026-10-13. The coordination protocol is a proposed team policy, not built-in Spec Kit behavior.
- [Codex custom agents and settings](https://learn.chatgpt.com/docs/agent-configuration/subagents)
- [Spec Kit integrations and Codex skill invocation](https://github.github.io/spec-kit/reference/integrations.html)
- [Spec Kit command behavior](https://github.github.io/spec-kit/reference/agentic-sdd.html)
- [Existing-project adoption](https://github.github.io/spec-kit/guides/existing-projects.html)
- [Spec Kit workflows for future automation](https://github.github.io/spec-kit/reference/workflows.html)

The package was checked for TOML/JSON syntax and ZIP integrity. End-to-end execution against your Codex installation and application is still required.
