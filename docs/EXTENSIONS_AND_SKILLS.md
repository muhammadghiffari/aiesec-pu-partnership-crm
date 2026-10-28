# Extensions, Skills and Powers Policy

**Decision for initial bootstrap: do not install external extensions first.** The handover already contains project rules, epic specs and test/review prompts. Get the private repository created and pushed first, then add any shared extension in a small reviewed PR so it is versioned and reversible.

## Ponytail

Ponytail's upstream documents a Kiro-compatible, instruction-only adapter: `.kiro/steering/ponytail.md` (upstream: https://github.com/DietrichGebert/ponytail). It is not a full Kiro plugin with all of Ponytail's CLI commands/hooks; Kiro uses its steering rules. The rule emphasizes YAGNI, reuse, small diffs and testing logic.

Recommendation: optional, project-scoped only, after bootstrap. In a separate branch, fetch the file from the official repository, inspect it before copying, then compare it against `AGENTS.md`. Keep the project's stricter quality requirements in force: no cutting negative tests, authorization, security, accessibility, data-loss handling, or acceptance coverage. Do not install globally just for this project. Do not accept binaries or installers from mirror repositories. If the rule appears to weaken required tests, do not install it unmodified.

Official Kiro adapter reference: https://github.com/DietrichGebert/ponytail/blob/main/.kiro/steering/ponytail.md

## Superpowers

Superpowers is a development methodology/skills collection, but its upstream install steps are harness-specific. Kiro supports native project skills under `.kiro/skills/<name>/SKILL.md` and Powers; do not assume a Claude Code command or an unofficial community Kiro Power is interchangeable with a supported Kiro install.

Recommendation: do not install a third-party Superpowers Power globally before bootstrap. First create the repo; then inspect the current upstream and any Kiro adapter's origin, manifest, permissions, hooks, tools and license. If there is no verified compatible upstream install path, either skip the plugin or port only the specific skills the team chooses (brainstorming, writing plans, TDD, systematic debugging, review) into reviewed project-level `.kiro/skills/` files with Kiro tool names and team acceptance tests. Do not import unknown MCP servers or hooks as a prerequisite to coding.

References: https://github.com/obra/superpowers and Kiro Agent Skills documentation https://kiro.dev/docs/skills/ ; Kiro Powers https://kiro.dev/docs/powers/.

## Shared rules beat optional extensions

- `AGENTS.md`, the fixed diagram, PRD and issue acceptance criteria remain authoritative.
- Do not let a productivity skill replace product requirements, the test strategy, the security policy or human approval gates.
- Install one extension/skill at a time on a branch; inspect the diff; run handover validation and the test suite; keep a rollback path.
- No global install or agent-wide extra permissions unless the product owner explicitly approves them.
