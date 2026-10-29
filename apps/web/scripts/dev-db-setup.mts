/**
 * Local development database setup (M1-01/D-016 scope).
 *
 * Applies the typed migrations 0001..000N from @crm/db and then an idempotent
 * synthetic demo seed (`seeds/dev-seed.sql`). Everything is fictional
 * (`example.invalid` domains) — no real partner data, contacts or workbook
 * content is used in seeds.
 *
 * Usage (Node 22, repo root):
 *   DATABASE_URL="postgresql://crm_app:<role-password>@127.0.0.1:5432/crm_dev?sslmode=disable" \
 *     pnpm tsx apps/web/scripts/dev-db-setup.ts
 *
 * The script is manually-run developer tooling, not an app/runtime dependency:
 * `pg` and `@crm/db` resolve through apps/web's own dependencies.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MIGRATIONS, migrateUp, type SqlClient } from "@crm/db";
import { Client } from "pg";

const here = path.dirname(fileURLToPath(import.meta.url));

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error(
    "DATABASE_URL is required, e.g. postgresql://crm_app:<role-password>@127.0.0.1:5432/crm_dev?sslmode=disable",
  );
  process.exit(1);
}

// One session: migrateUp's advisory lock is session-scoped by contract.
const client = new Client({ connectionString });
await client.connect();

const sql: SqlClient = {
  exec: (statement) => client.query(statement),
  query: (statement, params) => client.query(statement, params),
};

/** Count-only verification printout for the handover notes. */
const REPORT_TABLES = [
  "schema_migrations",
  "users",
  "industry_categories",
  "project_support_types",
  "partners",
  "contacts",
  "partnership_cycles",
  "market_research",
  "rate_cards",
  "rate_card_items",
  "rate_card_packages",
  "merchandise_items",
] as const;

try {
  const applied = await migrateUp(sql, MIGRATIONS);
  console.log(
    applied.length > 0
      ? `migrations applied: ${applied.join(", ")}`
      : "migrations: nothing pending (schema already up to date)",
  );

  const seed = readFileSync(path.join(here, "seeds", "dev-seed.sql"), "utf8");
  await client.query("BEGIN");
  await client.query(seed);
  await client.query("COMMIT");
  console.log("demo seed applied (idempotent)");

  for (const table of REPORT_TABLES) {
    const { rows } = await client.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM ${table}`,
    );
    console.log(`${table.padEnd(24)} ${rows[0]?.count ?? "0"}`);
  }
  console.log("setup complete");
} catch (error) {
  console.error("setup failed:", error);
  process.exitCode = 1;
} finally {
  await client.end();
}
