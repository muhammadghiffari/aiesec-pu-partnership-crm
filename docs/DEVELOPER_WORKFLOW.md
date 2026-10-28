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

## CI quality gates (M0-03)

The `ci` workflow (`.github/workflows/ci.yml`) runs one job with clearly named steps; a failing step fails the PR check with the original command's exit code. Steps in order:

| Step | Command | Validates |
|---|---|---|
| Install pinned pnpm | `pnpm/action-setup@v4` | Uses the `packageManager` field in `package.json` (pnpm@10.15.0); no override in CI |
| Set up Node.js | `actions/setup-node@v4` | Node 22 (`engines.node: ">=22"`), with pnpm store cache |
| Install dependencies | `pnpm install --frozen-lockfile` | Reproducible install from `pnpm-lock.yaml`; any lockfile/manifest mismatch fails here |
| Typecheck | `pnpm typecheck` | `tsc --noEmit` across the workspace |
| Lint and format check | `pnpm lint` | `biome check .` — lint rules and formatting in one pass |
| Unit tests | `pnpm test` | Vitest suite (`tests/**`, package sources) |
| Build web app | `pnpm --filter @crm/web build` | `next build` of `apps/web` |
| Handover and diagram validation | `python scripts/validate-handover.py` | Required doc pack, fixed 13-page diagram XML integrity; Python stdlib only |
| Dependency security audit | `pnpm audit --prod --audit-level high` | Blocks on **high or critical** vulnerabilities in production dependencies |

Prerequisites and notes:

- **Versions:** Node.js 22, pnpm 10.15.0 (pinned via `packageManager`; contributors should use Corepack: `corepack enable`), Python 3.10+ (3.12 in CI).
- **Lockfile required:** `pnpm-lock.yaml` must be committed; CI installs with `--frozen-lockfile`, so local dependency changes without an updated lockfile fail CI by design. Update it locally with `pnpm install` and commit the result.
- **Network access:** only the dependency install and the audit step need registry access; all other steps run offline.
- **Concurrency:** superseded PR runs are cancelled; runs on `main` are never cancelled.
- **Permissions:** `contents: read` only; no secrets are read or printed by any step.
- **Common failures:** lockfile mismatch → run `pnpm install` and commit the lockfile; lint failure → `pnpm format` locally (Biome `check --write`); audit failure → upgrade or get product-owner exception documented in `docs/DECISIONS.md` before merging; handover/diagram failure → see the script's listed missing files or XML errors.
- **Intentional validation exclusions:** Biome 2.6 handles JS/TS, JSON and YAML (verified: it formats `.github/workflows/ci.yml`) but not Markdown, Python or Bash. The M0-02 directory excludes (`docs`, `.github`, `.kiro`, `scripts`) were therefore narrowed to file-type-level so supported files anywhere in the repo are linted; `ignoreUnknown: true` skips the rest. Remaining explicit excludes: `**/*.md` (docs structure is covered by `scripts/validate-handover.py`), `data/` and `templates/` (byte-stable synthetic fixtures, no code).
