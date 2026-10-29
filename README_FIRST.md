# Radith PostgreSQL + Diagram Reconciliation Handover

This ZIP is a **reviewable overlay**, not a commit already pushed to GitHub. It targets the shared `demo/postgres-live` branch. It contains a local-only Docker Compose PostgreSQL setup for Radith, an updated editable Draw.io XML, an evidence-based table/column/relationship comparison, and safe scripts to update the repo's existing schema-conformance test and decision/data-model docs.

## Start here

1. Open `docs/RADITH_POSTGRES_QUICKSTART.md`.
2. Preserve Ghiffari/Catalna/Hicesse worktrees and uncommitted changes. Create a separate worktree from `origin/demo/postgres-live` as the guide says; do not reset the in-progress `demo/postgres-integration` merge.
3. Apply this overlay into the fresh worktree, run the four `scripts/update-*.py` helpers from the repository root, inspect the diff, then run checks before committing/pushing the new branch.
4. On Radith's own laptop, initialize the generated ignored `.env`, start Docker Compose, apply migrations/seeds and use a **second pgAdmin connection** on port 5433. The local PostgreSQL data is not shared from Ghiffari's machine.

## Main finding

Original Class Diagram: **30 classes, 239 attributes, 37 associations**. Migration schema: **34 public tables, 283 columns, 52 FK constraints** (33 app/support tables + technical `schema_migrations`). Updated Class Diagram: **34 table-backed classes, 283 attributes, 51 association lines**. The four new classes comprise `ProjectSupportType`, `BenefitCategory`, `UserSession`, and a clearly labelled technical `SchemaMigration`. The one-line difference between 51 associations and 52 FK constraints is intentional: the `User`–`LoA` association represents both submitter and approver roles. Additional details and caveats are in `docs/DATABASE_DIAGRAM_RECONCILIATION.md`.

## Scope caveat

The shared `demo/postgres-live` branch has LIVE DB wiring for partner/contact workflows in `/demo`; other dashboard/research/outreach/LoA/project modules remain synthetic unless separately connected to persisted APIs. The schema comparison is based on the published migrations. Radith must verify the actual running local database using the provided SQL and conformance test before telling the lecturer it fully matches.
