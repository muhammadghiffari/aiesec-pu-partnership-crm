import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";
import { MigrationError, migrateDown, migrateUp, validateMigrationList } from "./migrate";
import { MIGRATIONS, type Migration } from "./migrations/index";

async function snapshot(db: PGlite): Promise<string> {
  const cols = await db.query<{ t: string; c: string; ty: string; n: string; d: string | null }>(
    `SELECT table_name t, column_name c, data_type ty, is_nullable n, column_default d
       FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name <> 'schema_migrations'
      ORDER BY 1, 2`,
  );
  const cons = await db.query<{ t: string; c: string; def: string }>(
    `SELECT conrelid::regclass::text t, conname c, pg_get_constraintdef(oid) def
       FROM pg_constraint WHERE connamespace = 'public'::regnamespace ORDER BY 1, 2`,
  );
  const idx = await db.query<{ i: string }>(
    "SELECT indexdef i FROM pg_indexes WHERE schemaname = 'public' AND tablename <> 'schema_migrations' ORDER BY 1",
  );
  const trg = await db.query<{ t: string }>(
    "SELECT tgname t FROM pg_trigger WHERE NOT tgisinternal ORDER BY 1",
  );
  const fn = await db.query<{ f: string }>(
    "SELECT proname f FROM pg_proc WHERE pronamespace = 'public'::regnamespace ORDER BY 1",
  );
  return JSON.stringify([cols.rows, cons.rows, idx.rows, trg.rows, fn.rows]);
}

describe("migration runner", () => {
  it("ships a valid, contiguous, reversible migration list", () => {
    expect(() => validateMigrationList(MIGRATIONS)).not.toThrow();
    expect(MIGRATIONS.map((m) => m.version)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    for (const m of MIGRATIONS) {
      expect(m.down.trim().length).toBeGreaterThan(0);
    }
  });

  it("applies everything, is idempotent, and records version/name/checksum", async () => {
    const db = new PGlite();
    expect(await migrateUp(db, MIGRATIONS)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(await migrateUp(db, MIGRATIONS)).toEqual([]);
    const { rows } = await db.query<{ version: number; name: string; checksum: string }>(
      "SELECT version, name, checksum FROM schema_migrations ORDER BY version",
    );
    expect(rows.map((r) => r.name)).toEqual(MIGRATIONS.map((m) => m.name));
    for (const r of rows) expect(r.checksum).toMatch(/^[0-9a-f]{64}$/);
  });

  it("rolls back to empty and up/down/up yields an identical schema (reversibility)", async () => {
    const db = new PGlite();
    await migrateUp(db, MIGRATIONS);
    const first = await snapshot(db);

    expect(await migrateDown(db, MIGRATIONS)).toEqual([8, 7, 6, 5, 4, 3, 2, 1]);
    const tables = await db.query<{ table_name: string }>(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'",
    );
    expect(tables.rows.map((r) => r.table_name)).toEqual(["schema_migrations"]);
    const fns = await db.query("SELECT 1 FROM pg_proc WHERE pronamespace = 'public'::regnamespace");
    expect(fns.rows).toHaveLength(0); // no orphaned functions

    await migrateUp(db, MIGRATIONS);
    expect(await snapshot(db)).toBe(first);
  });

  it("supports stepwise targets in both directions", async () => {
    const db = new PGlite();
    expect(await migrateUp(db, MIGRATIONS, 2)).toEqual([1, 2]);
    expect(await migrateUp(db, MIGRATIONS, 3)).toEqual([3]);
    expect(await migrateDown(db, MIGRATIONS, 1)).toEqual([3, 2]);
    const { rows } = await db.query<{ version: number }>("SELECT version FROM schema_migrations");
    expect(rows.map((r) => r.version)).toEqual([1]);
  });

  it("rejects invalid targets", async () => {
    const db = new PGlite();
    await expect(migrateUp(db, MIGRATIONS, 99)).rejects.toMatchObject({ code: "INVALID_TARGET" });
    await expect(migrateUp(db, MIGRATIONS, -1)).rejects.toMatchObject({ code: "INVALID_TARGET" });
    await expect(migrateDown(db, MIGRATIONS, 1)).rejects.toMatchObject({ code: "INVALID_TARGET" });
  });

  it("rolls a failing migration back completely and leaves earlier ones applied", async () => {
    const db = new PGlite();
    const broken: Migration = {
      version: 2,
      name: "broken",
      up: "CREATE TABLE half_done (id int); SELECT 1/0;",
      down: "DROP TABLE half_done;",
    };
    const list = [MIGRATIONS[0] as Migration, broken];
    const error = await migrateUp(db, list).then(
      () => null,
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(MigrationError);
    expect((error as MigrationError).code).toBe("MIGRATION_FAILED");
    const half = await db.query("SELECT to_regclass('public.half_done') AS t");
    expect((half.rows[0] as { t: unknown }).t).toBeNull();
    const { rows } = await db.query<{ version: number }>("SELECT version FROM schema_migrations");
    expect(rows.map((r) => r.version)).toEqual([1]);
  });

  it("detects a modified, already-applied migration (checksum)", async () => {
    const db = new PGlite();
    await migrateUp(db, MIGRATIONS, 2);
    const tampered = MIGRATIONS.map((m) =>
      m.version === 1 ? { ...m, up: `${m.up}\n-- edited after apply` } : m,
    );
    await expect(migrateUp(db, tampered)).rejects.toMatchObject({ code: "CHECKSUM_MISMATCH" });
    await expect(migrateDown(db, tampered)).rejects.toMatchObject({ code: "CHECKSUM_MISMATCH" });
  });

  it("refuses to run against a database ahead of this build", async () => {
    const db = new PGlite();
    await migrateUp(db, MIGRATIONS);
    await expect(migrateUp(db, MIGRATIONS.slice(0, 3))).rejects.toMatchObject({
      code: "UNKNOWN_APPLIED_VERSION",
    });
  });

  it.each([
    ["gap", [{ version: 1 }, { version: 3 }]],
    ["duplicate", [{ version: 1 }, { version: 1 }]],
    ["not starting at 1", [{ version: 2 }]],
  ])("rejects a migration list with a %s", (_label, versions) => {
    const list = versions.map((v) => ({ ...v, name: "x", up: "SELECT 1", down: "SELECT 1" }));
    expect(() => validateMigrationList(list)).toThrow(MigrationError);
  });

  it("rejects empty down SQL and bad names", () => {
    expect(() =>
      validateMigrationList([{ version: 1, name: "ok", up: "SELECT 1", down: "  " }]),
    ).toThrow(/non-empty up and down/);
    expect(() =>
      validateMigrationList([{ version: 1, name: "Bad Name", up: "SELECT 1", down: "SELECT 1" }]),
    ).toThrow(/invalid migration name/);
  });
});
