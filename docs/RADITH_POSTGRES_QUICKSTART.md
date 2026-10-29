# Radith — Run the CRM demo with local PostgreSQL

This overlay targets the **already shared `demo/postgres-live` branch**. That branch contains the actual PostgreSQL migrations, seed/setup script, login session wiring, and LIVE DB mode for partner/contact flows. This bundle adds Docker Compose setup for a reproducible local database plus a reconciliation update for the Class Diagram.

## 1. Get the branch

From a CRM checkout, preserve the in-progress `demo/postgres-integration` worktree and create a separate worktree based on the already shared, database-backed demo branch:

```bash
git status --short
git fetch origin
git worktree list
git worktree add ../radith-postgres-ready -b docs/schema-postgres-alignment origin/demo/postgres-live
cd ../radith-postgres-ready
```

If that worktree directory or branch already exists, inspect `git worktree list` and its Git status, then reuse the correct worktree instead of creating another one. Never run `git reset --hard`, `git clean`, or overwrite a teammate's branch. This keeps the user's interrupted/in-progress integration work intact.

## 2. Apply this overlay

Extract the contents of this ZIP into the repository root, preserving the `compose.yaml`, `scripts/`, and `docs/` paths. The updated Draw.io file replaces the existing file at the same path. Then update the conformance test using checked, one-time replacements:

```bash
python3 scripts/update-schema-decisions.py
python3 scripts/update-data-model-reconciliation.py
python3 scripts/update-diagram-conformance.py
python3 scripts/update-audit-migration-note.py
```

Review the diff before staging. The bundle must be applied from the repository root. If the updater reports an unexpected anchor count, stop and compare your branch rather than forcing the edit. It does not touch source secrets, user credentials, or existing database data.

After tests pass, commit only the intended source/docs files, then push your feature branch so Radith can fetch it. Do not commit `.env`, `apps/web/.env.local`, or database data:

```bash
git diff --check
git status --short
# Stage the intended files after reviewing them in your editor or `git diff`.
git add compose.yaml scripts/init-radith-postgres.sh scripts/update-schema-decisions.py scripts/update-data-model-reconciliation.py scripts/update-diagram-conformance.py scripts/update-audit-migration-note.py scripts/check-live-schema.sql docs/RADITH_POSTGRES_QUICKSTART.md docs/DATABASE_DIAGRAM_RECONCILIATION.md docs/DATA_MODEL.md docs/DECISIONS.md docs/diagrams/Partnership_CRM_Diagrams_FINAL_EDGE_ANCHORED.drawio.xml packages/db/src/diagram-conformance.test.ts packages/db/src/migrations/0004_audit_log.ts
git diff --cached --check
git diff --cached --stat
git commit -m "docs(db): align class diagram with PostgreSQL schema"
git push -u origin docs/schema-postgres-alignment
```

Tell Radith to run `git fetch origin && git switch docs/schema-postgres-alignment && git pull --ff-only`, then follow this guide on his own laptop.

## 3. Requirements

- Docker Desktop installed and running, with WSL integration enabled if running inside WSL.
- Node.js 22+ and pnpm 10.x (`corepack enable` if needed).
- pgAdmin 4 installed on Radith's laptop.

Check Docker first:

```bash
docker version
docker compose version
```

## 4. Create local environment and start PostgreSQL

Run once from the repository root:

```bash
bash scripts/init-radith-postgres.sh
```

The script creates git-ignored `.env` and `apps/web/.env.local` using a random local-only password. It refuses to overwrite either file if one already exists. For an existing environment, merge the required variables manually; do not delete your existing environment files.

Then:

```bash
set -a
source .env
set +a
docker compose up -d --wait postgres
DATABASE_URL="$DATABASE_URL" pnpm tsx apps/web/scripts/dev-db-setup.mts
```

The setup script applies migrations `0001`–`0005` and idempotent synthetic seeds. It does not use production data. Re-running migrations/seeds should not wipe or overwrite existing records.

## 5. Verify, run tests, start the web app

```bash
pnpm check
pnpm test -- packages/db/src/diagram-conformance.test.ts
pnpm dev
```

Open **http://localhost:3000/demo**. With the local DB and `CRM_DEMO_MODE=1` configured, use the demo sign-in with one of these seeded synthetic allowlisted identities:

- `crm.lead.demo@example.invalid`
- `bd.staff.demo@example.invalid`

They are fictional accounts only. The dev verifier works only outside production and does not bypass allowlist, active-user, session, RBAC, or audit checks. Do not set `CRM_DEMO_MODE=1` in production.

## 6. Connect pgAdmin 4

Do not replace or edit Radith's current server registration. Register a **second connection profile** for Docker PostgreSQL:

- **Name:** AIESEC CRM — Docker Local
- **Host:** `127.0.0.1`
- **Port:** `5433`
- **Maintenance database:** `crm_dev`
- **Username:** `crm_app`
- **Password:** the `CRM_DB_PASSWORD` from the git-ignored root `.env`
- **SSL:** disabled for this localhost-only development service

The native PostgreSQL profile on port `5432` remains untouched. The Docker database is exposed only on `127.0.0.1`, so other devices cannot reach it over the LAN.

After connecting: **Servers → AIESEC CRM — Docker Local → Databases → crm_dev → Schemas → public → Tables**. In Query Tool, run `scripts/check-live-schema.sql` (open the file in pgAdmin or paste its statements separately) to inspect table/column types, keys, and FK delete behavior. The expected count is **34 public tables (33 application/support + 1 technical `schema_migrations` table), 283 columns, and 52 foreign-key constraints**. The updated Draw.io ERD has 34 table-backed classes, 283 attributes, and 51 relationship lines (the `User`–`LoA` line represents two user roles).

## 7. Stop and preserve data

```bash
docker compose stop postgres
# start it again later:
docker compose up -d --wait postgres
```

Never run `docker compose down -v` for this demo: `-v` deletes the named database volume.

## Known limitations

- The configured Docker DB is local to Radith's laptop; it is not a shared network database.
- `/demo` LIVE DB mode connects partner/contact operations to the database; other feature screens are still synthetic unless documented as wired to a persisted API.
- If the host port `5433` is occupied, stop and investigate first. Do not stop the existing Windows PostgreSQL service on `5432`; choose a new port only after updating both Compose and both local `DATABASE_URL` settings consistently.
