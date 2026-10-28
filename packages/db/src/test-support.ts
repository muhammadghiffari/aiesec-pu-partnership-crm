/**
 * Test-only helpers: a migrated in-process PostgreSQL (PGlite) and synthetic fixtures.
 * Synthetic data only (`example.invalid`). Not exported from the package index.
 */

import { PGlite } from "@electric-sql/pglite";
import { expect } from "vitest";
import { migrateUp } from "./migrate";
import { MIGRATIONS } from "./migrations/index";

export async function freshDb(): Promise<PGlite> {
  const db = new PGlite();
  await migrateUp(db, MIGRATIONS);
  return db;
}

export type Row = Record<string, unknown>;

/** INSERT ... RETURNING * from a snake_case object. Values are always bound parameters. */
export async function insert(db: PGlite, table: string, row: Row): Promise<Row> {
  const keys = Object.keys(row);
  const sql = keys.length
    ? `INSERT INTO ${table} (${keys.join(", ")}) VALUES (${keys.map((_, i) => `$${i + 1}`).join(", ")}) RETURNING *`
    : `INSERT INTO ${table} DEFAULT VALUES RETURNING *`;
  const { rows } = await db.query<Row>(
    sql,
    keys.map((k) => row[k]),
  );
  return rows[0] as Row;
}

export async function update(db: PGlite, table: string, idCol: string, id: unknown, set: Row) {
  const keys = Object.keys(set);
  const { rows } = await db.query<Row>(
    `UPDATE ${table} SET ${keys.map((k, i) => `${k} = $${i + 1}`).join(", ")} WHERE ${idCol} = $${keys.length + 1} RETURNING *`,
    [...keys.map((k) => set[k]), id],
  );
  return rows[0] as Row;
}

/** Asserts the statement fails with a PostgreSQL error whose message matches. */
export async function expectDbError(promise: Promise<unknown>, pattern: RegExp | string) {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error, "expected the statement to be rejected by the database").not.toBeNull();
  const message = (error as Error).message;
  if (typeof pattern === "string") expect(message).toContain(pattern);
  else expect(message).toMatch(pattern);
}

export const id = () => crypto.randomUUID();

export interface Fixture {
  db: PGlite;
  leadA: Row;
  leadB: Row;
  staff: Row;
  viewer: Row;
  category: Row;
  partner: Row;
  contact: Row;
  cycle: Row;
  card: Row;
  item: Row;
  proposal: Row;
}

let seq = 0;
export const uniq = (p: string) => `${p}-${++seq}`;

export async function newUser(
  db: PGlite,
  role: "CRM_LEAD" | "BD_STAFF" | "VIEWER",
  extra: Row = {},
) {
  return insert(db, "users", {
    email: `${uniq("user")}@example.invalid`,
    name: "Synthetic User",
    access_role: role,
    ...extra,
  });
}

export async function newPartner(db: PGlite, categoryId: unknown, extra: Row = {}) {
  return insert(db, "partners", {
    name: uniq("Synthetic Partner"),
    industry_category_id: categoryId,
    source: "synthetic fixture",
    ...extra,
  });
}

export async function newContact(db: PGlite, partnerId: unknown, extra: Row = {}) {
  return insert(db, "contacts", {
    partner_id: partnerId,
    name: "Synthetic Contact",
    email: `${uniq("contact")}@example.invalid`,
    lawful_basis_note: "synthetic fixture",
    ...extra,
  });
}

export async function newCycle(db: PGlite, partnerId: unknown, extra: Row = {}) {
  return insert(db, "partnership_cycles", {
    partner_id: partnerId,
    cycle_number: 1,
    sales_type: "NEW",
    sales_status: "ACTIVE",
    approach_method: "ACTIVE",
    essm_stage: "PROSPECTING",
    project_support: "OTHERS",
    ...extra,
  });
}

export async function buildFixture(): Promise<Fixture> {
  const db = await freshDb();
  const leadA = await newUser(db, "CRM_LEAD", { organizational_title: "TL BD" });
  const leadB = await newUser(db, "CRM_LEAD", { organizational_title: "LCVP PD" });
  const staff = await newUser(db, "BD_STAFF");
  const viewer = await newUser(db, "VIEWER");
  const category = await insert(db, "industry_categories", {
    code: "OTHERS",
    name: "Others",
  });
  await insert(db, "project_support_types", { code: "OTHERS", label: "Others" });
  await insert(db, "benefit_categories", { code: "BRANDING", label: "Branding" });
  const partner = await newPartner(db, category.category_id);
  const contact = await newContact(db, partner.partner_id, {
    verification_status: "VERIFIED",
    verified_at: "2026-10-29T03:00:00Z",
    verified_by: staff.user_id,
  });
  const cycle = await newCycle(db, partner.partner_id);
  const card = await insert(db, "rate_cards", {
    name: "Synthetic Rate Card",
    version: 1,
    status: "ACTIVE",
    effective_from: "2026-01-01",
    owner_id: leadA.user_id,
  });
  const item = await insert(db, "rate_card_items", {
    rate_card_id: card.rate_card_id,
    category: "BRANDING",
    benefit_name: "Logo placement",
    monetized_unit_value: 500000,
    unit: "slot",
  });
  const proposal = await insert(db, "proposals", {
    cycle_id: cycle.cycle_id,
    pricing_mode: "CUSTOM",
    calculated_value: 500000,
  });
  return {
    db,
    leadA,
    leadB,
    staff,
    viewer,
    category,
    partner,
    contact,
    cycle,
    card,
    item,
    proposal,
  };
}
