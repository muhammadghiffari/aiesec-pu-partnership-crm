# Developer Workflow — Three-Person Team

## Team and ownership

| Developer | Environment | Primary ownership | Must review |
|---|---|---|---|
| Muhammad Ghiffari (`@muhammadghiffari`) | Product owner; Kiro CLI (see AI_MODEL_ROUTING.md) | Product decisions; lifecycle/domain core; role policy; DB/schema lock; merge/release; ESSM UAT | Any auth/RBAC, lifecycle, data migration, Rate Card/financial calculation changes |
| Catalna (confirm actual GitHub username) | Existing developer environment | Web UI flows, accessible components, dashboard and Playwright coverage (assign issue by issue) | Worker/API integration and ESSM user flows |
| `hicesse` | Hermes; model inventory in `docs/AI_MODEL_ROUTING.md` | Worker/AI adapter, research jobs, import/export tooling or Companion tasks as assigned; operational docs/CI | UI/domain boundary, model safety and provider integration |

The ownership table is an initial coordination plan, not a substitute for issue assignment. If team availability/skills require a change, update this file and issue owners. `packages/db` and shared contracts are schema-locked: only one database-schema PR at a time.

## Repository bootstrap

1. Unzip the handover package.
2. Review `.gitignore`; do not add the national workbook or real data.
3. Ensure `gh auth status` shows the correct account `muhammadghiffari` with repository creation and collaborator-management permission.
4. Run `bash scripts/bootstrap-github.sh`. It creates the private target repository, pushes the initial commit and invites `hicesse` with write permission. The invitation must be accepted.
5. Confirm Catalna's actual GitHub handle and invite her separately; do not guess a username.
6. Create milestones/labels and issues from `docs/IMPLEMENTATION_PLAN.md` in the remote repo.
7. The first implementation issue creates the pnpm workspace, typed code scaffold and full CI checks. Until then, the initial CI runs diagram and handover checks only.

## Branches and reviews

- `main` is protected by team convention: do not push directly. Use `feat/FR-xxx-short-name`, `fix/...`, `docs/...` branches.
- Small PRs should target one requirement cluster and one deployable increment.
- PR must state: FR IDs, acceptance criteria, tests run, database/migration impact, security/privacy impact, screenshots for UI work (synthetic data only), and any open decision.
- A change author cannot be the sole reviewer of that change. Auth/RBAC, schema, pricing/revenue and lifecycle gates require independent developer review.
- Use squash merge. Delete branch after merge. Keep schema changes serial.
- Use Conventional Commits, e.g. `feat(core): add ESSM lifecycle guard`.

## Local data and secrets

- Real ESSM workbook belongs outside repo, e.g. `$HOME/secure/essm/`, never inside tracked directories.
- `.env.local`, `.env.*`, local SQLite/Postgres dumps, exports, transcripts and downloaded source docs must not be committed.
- Use synthetic companies and `example.invalid` emails for automated tests.
- If real data or secrets are accidentally staged, stop, remove from the index, rotate secret if applicable, and report it; deleting in a later commit is insufficient.

## Quality gate

Initially: `python scripts/validate-handover.py`. After M0 scaffold, replace/extend the checks with `pnpm check`, unit/integration tests, migrations validation, authz matrix and Playwright. Never use the existence of a command or successful build alone as proof of the requirement.
