/**
 * Minimal typed migration runner (M1-01). Driver-agnostic: callers pass a `SqlClient`
 * (PGlite in tests, a pooled single connection in production). No ORM, no second schema
 * definition. One migration = one transaction; applied versions are recorded together with
 * a checksum of the `up` SQL so an edited, already-applied migration is detected.
 *
 * Contract: the client MUST run all statements of one `migrateUp`/`migrateDown` call on a
 * single session (BEGIN/COMMIT and the advisory lock are session-scoped).
 */

import type { Migration } from "./migrations/types";

export interface SqlClient {
  exec(sql: string): Promise<unknown>;
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
}

export class MigrationError extends Error {
  constructor(
    readonly code:
      | "INVALID_MIGRATION_LIST"
      | "CHECKSUM_MISMATCH"
      | "UNKNOWN_APPLIED_VERSION"
      | "MIGRATION_FAILED"
      | "INVALID_TARGET",
    message: string,
  ) {
    super(message);
    this.name = "MigrationError";
  }
}

/** Arbitrary constant; serialises concurrent migrators via a transaction-scoped advisory lock. */
const LOCK_KEY = 727_274_001;

export async function checksum(sql: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(sql));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

export function validateMigrationList(migrations: readonly Migration[]): void {
  let expected = 1;
  for (const m of migrations) {
    if (m.version !== expected) {
      throw new MigrationError(
        "INVALID_MIGRATION_LIST",
        `migration versions must be contiguous from 1; expected ${expected}, got ${m.version}`,
      );
    }
    if (!/^[a-z][a-z0-9_]*$/.test(m.name)) {
      throw new MigrationError("INVALID_MIGRATION_LIST", `invalid migration name: ${m.name}`);
    }
    if (!m.up.trim() || !m.down.trim()) {
      throw new MigrationError(
        "INVALID_MIGRATION_LIST",
        `migration ${m.version} must define non-empty up and down SQL`,
      );
    }
    expected++;
  }
}

const BOOTSTRAP_SQL = `
CREATE TABLE IF NOT EXISTS schema_migrations (
  version     integer     PRIMARY KEY CHECK (version > 0),
  name        text        NOT NULL,
  checksum    char(64)    NOT NULL,
  applied_at  timestamptz NOT NULL DEFAULT now()
);`;

interface AppliedRow {
  version: number;
  name: string;
  checksum: string;
}

async function loadApplied(client: SqlClient): Promise<AppliedRow[]> {
  await client.exec(BOOTSTRAP_SQL);
  const { rows } = await client.query<AppliedRow>(
    "SELECT version, name, checksum FROM schema_migrations ORDER BY version",
  );
  return rows.map((r) => ({ version: Number(r.version), name: r.name, checksum: r.checksum }));
}

async function verifyApplied(applied: AppliedRow[], migrations: readonly Migration[]) {
  for (const row of applied) {
    const known = migrations.find((m) => m.version === row.version);
    if (!known) {
      throw new MigrationError(
        "UNKNOWN_APPLIED_VERSION",
        `database has migration ${row.version} (${row.name}) which this build does not know`,
      );
    }
    if (known.name !== row.name || (await checksum(known.up)) !== row.checksum) {
      throw new MigrationError(
        "CHECKSUM_MISMATCH",
        `applied migration ${row.version} (${row.name}) was modified after being applied; add a new migration instead`,
      );
    }
  }
}

async function inTransaction(client: SqlClient, migration: Migration, body: () => Promise<void>) {
  await client.exec("BEGIN");
  try {
    await client.query("SELECT pg_advisory_xact_lock($1)", [LOCK_KEY]);
    await body();
    await client.exec("COMMIT");
  } catch (error) {
    await client.exec("ROLLBACK");
    throw new MigrationError(
      "MIGRATION_FAILED",
      `migration ${migration.version} (${migration.name}) failed and was rolled back: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

/** Apply pending migrations up to `target` (default: latest). Returns versions applied. */
export async function migrateUp(
  client: SqlClient,
  migrations: readonly Migration[],
  target: number = migrations.length,
): Promise<number[]> {
  validateMigrationList(migrations);
  if (!Number.isInteger(target) || target < 0 || target > migrations.length) {
    throw new MigrationError("INVALID_TARGET", `target must be between 0 and ${migrations.length}`);
  }
  const applied = await loadApplied(client);
  await verifyApplied(applied, migrations);
  const current = applied.at(-1)?.version ?? 0;

  const done: number[] = [];
  for (const migration of migrations) {
    if (migration.version <= current || migration.version > target) continue;
    await inTransaction(client, migration, async () => {
      await client.exec(migration.up);
      await client.query(
        "INSERT INTO schema_migrations (version, name, checksum) VALUES ($1, $2, $3)",
        [migration.version, migration.name, await checksum(migration.up)],
      );
    });
    done.push(migration.version);
  }
  return done;
}

/**
 * Roll back to `target` (default: 0 = everything). DESTRUCTIVE: `down` drops objects and
 * their data. Production use requires a verified backup (docs/RUNBOOK.md).
 */
export async function migrateDown(
  client: SqlClient,
  migrations: readonly Migration[],
  target = 0,
): Promise<number[]> {
  validateMigrationList(migrations);
  const applied = await loadApplied(client);
  await verifyApplied(applied, migrations);
  const current = applied.at(-1)?.version ?? 0;
  if (!Number.isInteger(target) || target < 0 || target > current) {
    throw new MigrationError("INVALID_TARGET", `target must be between 0 and ${current}`);
  }

  const done: number[] = [];
  for (const migration of [...migrations].reverse()) {
    if (migration.version > current || migration.version <= target) continue;
    await inTransaction(client, migration, async () => {
      await client.exec(migration.down);
      await client.query("DELETE FROM schema_migrations WHERE version = $1", [migration.version]);
    });
    done.push(migration.version);
  }
  return done;
}
